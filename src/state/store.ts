import { useSyncExternalStore } from "react";
import { ageOn, isIsoDate, todayIso } from "../model/dates";
import { applyRangeOverride, clearOverrides, stableString } from "../model/engine";
import { sha256 } from "../model/hash";
import { bodyFatBoundMessage, horizonBoundMessage, leanBoundMessage, waistBoundMessage, weightBoundMessage } from "../model/bounds";
import { LIMITS, MODEL } from "../model/parameters";
import type { DayPlanInput, ProfileInput, ScenarioInputs } from "../model/types";
import { ftInToCm, kgToLb, lbToKg } from "../model/units";
import { blankOnboarding, createDemoAccount, createSeedDatabase, defaultConnections, defaultNotifications, defaultPreferences } from "./seed";
import type {
  Account,
  ActionResult,
  AuditEvent,
  CompositionLog,
  ConnectionRecord,
  ConsentRecord,
  CycleLog,
  Database,
  Draft,
  OnboardingDraft,
  OtherMeasurement,
  Preferences,
  Profile,
  Scenario,
  ScenarioVersion,
  WeightObservation,
} from "./types";
import { buildVersion } from "./version";

type Memory = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY = "trajectory.v1";
const BACKUP = "trajectory.v1.backup";
const RECEIPT = "trajectory.deletion-receipt";

let memory: Memory | null = null;
let state: Database = {
  schema: 2,
  hydrated: false,
  recoveryAvailable: false,
  viewer: { birthDate: null, adultOk: false, consents: [] },
  sessionAccountId: null,
  accounts: [],
  onboarding: null,
  deletionReceipt: null,
};
const listeners = new Set<() => void>();

export function setStorageForTests(next: Memory | null) {
  memory = next;
}

function storage(): Memory {
  if (memory) return memory;
  return localStorage;
}

function emit() {
  listeners.forEach((listener) => listener());
}

const SNAPSHOT = "trajectory.v1.snapshot";

function persist() {
  const previous = storage().getItem(KEY);
  const { hydrated, ...rest } = state;
  const next = JSON.stringify({ ...rest, hydrated: true });
  if (previous && previous !== next) storage().setItem(SNAPSHOT, previous);
  storage().setItem(KEY, next);
}

export function restoreSnapshot(): ActionResult {
  const raw = storage().getItem(SNAPSHOT);
  if (!raw) return fail("No previous local snapshot is stored yet. Nothing was restored.");
  let parsed: Database;
  try {
    parsed = JSON.parse(raw) as Database;
  } catch {
    return fail("The previous snapshot could not be read. Nothing was restored.");
  }
  if (parsed.schema !== 2 || !Array.isArray(parsed.accounts)) return fail("The previous snapshot is not this storage version. Nothing was restored.");
  state = { ...parsed, hydrated: true };
  persist();
  emit();
  return { ok: true };
}

export function importLocalAccount(payload: unknown): ActionResult {
  if (!payload || typeof payload !== "object") return fail("That file is not a Trajectory export. Nothing was imported.");
  const record = payload as { meta?: { format?: string }; account?: Account };
  const account = record.account;
  if (record.meta?.format !== "trajectory-local-1" || !account || typeof account.id !== "string" || !Array.isArray(account.profiles)) {
    return fail("That file is not a Trajectory local export. Nothing was imported.");
  }
  const copy = structuredClone(account);
  copy.passphraseHash = null;
  copy.passphraseSalt = null;
  copy.isDemo = false;
  if (state.accounts.some((item) => item.id === copy.id)) copy.id = uid("acct");
  commit({ ...state, accounts: [...state.accounts, copy], sessionAccountId: copy.id, onboarding: null });
  return { ok: true, id: copy.id };
}

function commit(next: Database) {
  state = next;
  if (next.hydrated) persist();
  emit();
}

function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function fail(message: string): { ok: false; message: string; errorId: string } {
  return { ok: false, message, errorId: `err_${crypto.randomUUID().slice(0, 8)}` };
}

function audit(account: Account, action: string, subject: string, reason?: string): Account {
  const event: AuditEvent = { id: uid("aud"), at: nowIso(), action, subject, reason };
  return { ...account, audits: [...account.audits, event].slice(-200) };
}

function mapAccount(accountId: string, updater: (account: Account) => Account) {
  commit({
    ...state,
    accounts: state.accounts.map((account) => (account.id === accountId ? updater(account) : account)),
  });
}

export function getState() {
  return state;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDb() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useSession() {
  const db = useDb();
  const account = db.accounts.find((item) => item.id === db.sessionAccountId) ?? null;
  const profile = account?.profiles.find((item) => item.id === account.activeProfileId) ?? account?.profiles[0] ?? null;
  return { db, account, profile };
}

let hydratePromise: Promise<void> | null = null;

export function hydrate() {
  if (state.hydrated) return Promise.resolve();
  hydratePromise ??= hydrateFromStorage();
  return hydratePromise;
}

async function hydrateFromStorage() {
  if (state.hydrated) return;
  try {
    const raw = storage().getItem(KEY);
    if (!raw) {
      state = await createSeedDatabase();
    } else {
      const parsed = JSON.parse(raw) as Database;
      if (parsed.schema !== 2 || !Array.isArray(parsed.accounts)) throw new Error("schema");
      state = { ...parsed, hydrated: true };
      state = replaceLoneDemo(state);
    }
    const receipt = storage().getItem(RECEIPT);
    if (receipt && !state.deletionReceipt) state.deletionReceipt = JSON.parse(receipt);
  } catch {
    const raw = storage().getItem(KEY);
    if (raw) storage().setItem(BACKUP, raw);
    state = await createSeedDatabase();
    state.recoveryAvailable = Boolean(raw);
  }
  state.hydrated = true;
  persist();
  emit();
}

export function accountById(id: string | null) {
  return state.accounts.find((account) => account.id === id) ?? null;
}

export function sessionAccount() {
  return accountById(state.sessionAccountId);
}

export function toProfileInput(profile: Profile): ProfileInput {
  const { id, label, createdAt, updatedAt, ...input } = profile;
  void id;
  void label;
  void createdAt;
  void updatedAt;
  return input;
}

export function profileStale(profile: Profile, snapshot: ProfileInput) {
  return stableString(toProfileInput(profile)) !== stableString(snapshot);
}

function consent(type: ConsentRecord["consentType"], granted: boolean): ConsentRecord {
  const at = nowIso();
  return {
    id: uid("con"),
    consentType: type,
    policyVersion: MODEL.policyVersion,
    grantedAt: granted ? at : null,
    revokedAt: granted ? null : at,
    channel: "local-browser",
  };
}

const PERSONAL_SESSION_NAME = "Your session";

function personalSession(birthDate: string | null): { accounts: Account[]; account: Account; onboarding: OnboardingDraft | null } {
  const existing = state.accounts.find((account) => !account.isDemo);
  if (existing) {
    const onboarding = existing.profiles.length === 0 ? profileDraft(existing, birthDate) : state.onboarding;
    return { accounts: state.accounts, account: existing, onboarding };
  }
  const created = freshAccount(PERSONAL_SESSION_NAME, null);
  const account = audit(created, "account.create", created.id);
  return {
    accounts: [...state.accounts.filter((item) => !item.isDemo), account],
    account,
    onboarding: profileDraft(account, birthDate),
  };
}

function replaceLoneDemo(db: Database): Database {
  if (db.accounts.some((account) => !account.isDemo)) return db;
  if (!db.viewer.adultOk) return { ...db, accounts: [], sessionAccountId: null };
  const opened = personalSession(db.viewer.birthDate);
  return { ...db, accounts: opened.accounts, sessionAccountId: opened.account.id, onboarding: opened.onboarding };
}

function profileDraft(account: Account, birthDate: string | null): OnboardingDraft | null {
  const draft = blankOnboarding(todayIso(account.preferences.timeZone));
  if (!draft) return null;
  draft.birthDate = birthDate && isIsoDate(birthDate) ? birthDate : "";
  draft.separateAccount = false;
  return draft;
}

export function acceptGate(birthDate: string): ActionResult {
  if (!isIsoDate(birthDate)) return fail("Enter a valid date of birth. It is used only to check the 18+ limit.");
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const age = ageOn(birthDate, todayIso(zone));
  if (age < LIMITS.ageMin) {
    commit({ ...state, viewer: { birthDate, adultOk: false, consents: [] }, sessionAccountId: null });
    return fail("Trajectory is for adults 18 and older. The studio stays closed.");
  }
  if (age > LIMITS.ageMax) return fail("Check the date of birth. It is outside the range this build can store.");
  const opened = personalSession(birthDate);
  commit({
    ...state,
    accounts: opened.accounts,
    viewer: { birthDate, adultOk: true, consents: [consent("terms", true), consent("privacy", true)] },
    sessionAccountId: opened.account.id,
    onboarding: opened.onboarding,
  });
  return { ok: true };
}

export function withdrawUse() {
  commit({
    ...state,
    viewer: {
      ...state.viewer,
      adultOk: false,
      consents: state.viewer.consents.map((item) => ({ ...item, revokedAt: item.revokedAt ?? nowIso() })),
    },
    sessionAccountId: null,
  });
}

export function signOut() {
  commit({ ...state, sessionAccountId: null });
}

export async function signIn(accountId: string, passphrase: string): Promise<ActionResult> {
  const account = accountById(accountId);
  if (!account) return fail("That local session was not found on this device.");
  if (!state.viewer.adultOk) return fail("Confirm that you are 18 or older before opening a session.");
  if (account.passphraseHash) {
    const hash = await sha256(`${account.passphraseSalt}:${passphrase}`);
    if (hash !== account.passphraseHash) return fail("The passphrase does not match. This device has no email reset.");
  }
  commit({ ...state, sessionAccountId: account.id });
  return { ok: true };
}

export async function setPassphrase(accountId: string, nextPassphrase: string, current: string): Promise<ActionResult> {
  const account = accountById(accountId);
  if (!account) return fail("Session not found.");
  if (nextPassphrase.length < 4) return fail("Use at least 4 characters. This lock is only a local gate, not a hosted account.");
  if (account.passphraseHash) {
    const hash = await sha256(`${account.passphraseSalt}:${current}`);
    if (hash !== account.passphraseHash) return fail("The current passphrase does not match.");
  }
  const salt = uid("salt");
  const passphraseHash = await sha256(`${salt}:${nextPassphrase}`);
  mapAccount(accountId, (item) => audit({ ...item, passphraseSalt: salt, passphraseHash }, "account.lock", item.id));
  return { ok: true };
}

function freshAccount(displayName: string, hash: { salt: string; passphraseHash: string } | null): Account {
  const id = uid("acct");
  return {
    id,
    displayName,
    isDemo: false,
    passphraseSalt: hash?.salt ?? null,
    passphraseHash: hash?.passphraseHash ?? null,
    createdAt: nowIso(),
    preferences: defaultPreferences(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    notifications: defaultNotifications(),
    connections: defaultConnections(),
    consents: [],
    profiles: [],
    activeProfileId: "",
    scenarios: [],
    observations: [],
    otherMeasurements: [],
    compositionLogs: [],
    cycleLogs: [],
    importBatches: [],
    drafts: {},
    audits: [],
    reminderDismissedOn: null,
    phasePromptDismissedOn: null,
    featureFlags: { advancedMath: false },
  };
}

export function saveOnboarding(draft: OnboardingDraft | null) {
  commit({ ...state, onboarding: draft });
}

export function startOnboarding(separateAccount: boolean) {
  const zone = sessionAccount()?.preferences.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const draft = blankOnboarding(todayIso(zone));
  if (!draft) return;
  draft.separateAccount = separateAccount;
  if (state.viewer.birthDate && isIsoDate(state.viewer.birthDate)) draft.birthDate = state.viewer.birthDate;
  commit({ ...state, onboarding: draft });
}

export async function finishOnboarding(draft: OnboardingDraft, passphrase: string): Promise<ActionResult> {
  const profileResult = profileFromDraft(draft);
  if (!profileResult.ok) return profileResult;
  const { profile, inputs } = profileResult;
  let account = sessionAccount();
  if (account && account.displayName === PERSONAL_SESSION_NAME) account = { ...account, displayName: profile.label };
  if (draft.separateAccount || !account) {
    if (passphrase.length < 4) return fail("A separate local session needs a passphrase of at least 4 characters.");
    const salt = uid("salt");
    const passphraseHash = await sha256(`${salt}:${passphrase}`);
    const created = freshAccount(draft.accountName || profile.label, { salt, passphraseHash });
    account = audit(created, "account.create", created.id);
  }
  if (!account) return fail("Open a local session before adding a profile.");
  account = {
    ...account,
    profiles: [...account.profiles, profile],
    activeProfileId: profile.id,
  };
  const scenarioId = uid("scn");
  const built = await buildVersion({
    scenarioId,
    versionNumber: 1,
    parent: null,
    inputs,
    idempotencyKey: uid("idem"),
    editKind: "initial",
  });
  if (built.ok) {
    const scenario: Scenario = {
      id: scenarioId,
      profileId: profile.id,
      name: inputs.name,
      description: inputs.description,
      labels: inputs.labels,
      createdAt: built.version.createdAt,
      archivedAt: null,
      activeVersionId: built.version.id,
      versions: [built.version],
    };
    account = audit({ ...account, scenarios: [...account.scenarios, scenario] }, "scenario.create", scenarioId);
  } else {
    account = audit(account, "profile.create", profile.id, "forecast-refused");
  }
  const accounts = state.accounts.some((item) => item.id === account.id)
    ? state.accounts.map((item) => (item.id === account.id ? account : item))
    : [...state.accounts, account];
  commit({ ...state, accounts, sessionAccountId: account.id, onboarding: null });
  if (!built.ok) {
    return { ok: false, message: `${built.message} The profile was saved. No forecast was created, and no plan was invented.`, errorId: built.errorId };
  }
  return { ok: true, id: scenarioId };
}

function profileFromDraft(draft: OnboardingDraft): { ok: true; profile: Profile; inputs: ScenarioInputs } | { ok: false; message: string; errorId: string } {
  if (!draft.label.trim()) return fail("Give the profile a name. It stays on this device.");
  if (!isIsoDate(draft.birthDate)) return fail("Enter a valid date of birth for this profile.");
  const zone = sessionAccount()?.preferences.timeZone || "UTC";
  if (ageOn(draft.birthDate, todayIso(zone)) < 18) return fail("A profile under 18 cannot be saved. The date was not changed to make it fit.");
  const weightRaw = Number(draft.weightKg);
  const weight = draft.unit === "lb" ? lbToKg(weightRaw) : weightRaw;
  const height = draft.lengthUnit === "ft" ? ftInToCm(Number(draft.heightFeet), Number(draft.heightInches) || 0) : Number(draft.heightCm);
  const maintenance = draft.maintenanceKcal.trim() === "" ? null : Number(draft.maintenanceKcal);
  const steps = Number(draft.steps);
  const horizon = Number(draft.horizonDays);
  const intake = Number(draft.intakeKcal);
  if (!Number.isFinite(height) || !Number.isFinite(weight)) return fail("Height and reference weight need numeric values. They were not guessed.");
  if (height < LIMITS.heightCm[0] || height > LIMITS.heightCm[1]) {
    return fail(`Height must be between ${LIMITS.heightCm[0]} and ${LIMITS.heightCm[1]} cm to be stored. The value was not changed.`);
  }
  const weightProblem = weightBoundMessage(weight);
  if (weightProblem) return fail(weightProblem);
  if (draft.energyBasis !== "model-estimated" && (maintenance == null || !Number.isFinite(maintenance))) {
    return fail("Enter a baseline expenditure, or choose the model estimate (PAL × Mifflin–St Jeor). The field was left as you typed it.");
  }
  const pal = Number(draft.referencePal);
  if (!isIsoDate(draft.startDate)) return fail("Choose a valid scenario start date.");
  if (!Number.isFinite(horizon)) return fail("Horizon needs a whole number of days.");
  if (!Number.isFinite(intake)) return fail("Enter a baseline intake. It was not filled in for you.");
  const bodyFat = draft.bodyFatPct.trim() === "" ? null : Number(draft.bodyFatPct);
  const lean = draft.leanMassKg.trim() === "" ? null : Number(draft.leanMassKg);
  if (bodyFat != null) {
    const fatProblem = bodyFatBoundMessage(bodyFat);
    if (fatProblem) return fail(fatProblem);
  }
  if (lean != null) {
    const leanProblem = leanBoundMessage(lean, weight);
    if (leanProblem) return fail(leanProblem);
  }
  const horizonProblem = horizonBoundMessage(horizon);
  if (horizonProblem) return fail(horizonProblem);
  const weekendIntake = draft.weekendIntakeKcal.trim() === "" ? intake : Number(draft.weekendIntakeKcal);
  const weekendSteps = Number(draft.weekendSteps);
  if (draft.template === "weekday-weekend" && (!Number.isFinite(weekendIntake) || !Number.isFinite(weekendSteps))) {
    return fail("The weekday/weekend template needs weekend intake and steps. Nothing was substituted.");
  }
  const created = nowIso();
  const profile: Profile = {
    id: uid("prof"),
    label: draft.label.trim(),
    createdAt: created,
    updatedAt: created,
    birthDate: draft.birthDate,
    heightCm: height,
    referenceWeightKg: weight,
    referenceDate: draft.startDate,
    sexParameter: draft.sexParameter,
    bodyFatPct: bodyFat,
    bodyFatSource: draft.bodyFatSource.trim(),
    bodyFatConfidence: bodyFat == null ? "unspecified" : "low",
    leanMassKg: lean,
    energyBasis: draft.energyBasis,
    maintenanceKcal: maintenance,
    calibrationNote: null,
    referenceActivity: { category: draft.activityCategory, steps, pal: Number.isFinite(pal) ? pal : 1.5 },
    excludedContext: draft.excludedContext,
    excludedDetail: "",
  };
  const baseline: DayPlanInput = {
    intakeKcal: intake,
    activityMode: "category",
    activityCategory: draft.activityCategory,
    steps,
    pal: Number.isFinite(pal) ? pal : null,
    explicitActivityKcal: 0,
    exerciseMinutes: 0,
    note: "",
  };
  const inputs: ScenarioInputs = {
    name: draft.scenarioName.trim() || "First scenario",
    description: draft.template === "same" ? "Same assumptions each day." : "Weekday baseline with a weekend pattern.",
    labels: [draft.template === "same" ? "baseline" : "routine"],
    startDate: draft.startDate,
    horizonDays: horizon,
    timeZone: zone,
    baseline,
    weekly:
      draft.template === "weekday-weekend"
        ? { enabled: true, days: { 0: { intakeKcal: weekendIntake, steps: weekendSteps }, 6: { intakeKcal: weekendIntake, steps: weekendSteps } } }
        : { enabled: false, days: {} },
    phases: [],
    overrides: [],
    goal: null,
    milestones: [],
    profile: toProfileInput(profile),
  };
  return { ok: true, profile, inputs };
}

export function updatePreferences(accountId: string, patch: Partial<Preferences>) {
  mapAccount(accountId, (account) => ({ ...account, preferences: { ...account.preferences, ...patch } }));
}

export function updateProfile(accountId: string, profileId: string, patch: Partial<Profile>): ActionResult {
  const account = accountById(accountId);
  const current = account?.profiles.find((profile) => profile.id === profileId);
  if (!account || !current) return fail("Profile not found.");
  const next = { ...current, ...patch, updatedAt: nowIso() };
  if (!isIsoDate(next.birthDate)) return fail("Date of birth needs a valid calendar date.");
  if (ageOn(next.birthDate, todayIso(account.preferences.timeZone)) < 18) {
    return fail("This product cannot store a profile under 18. The previous date of birth is unchanged.");
  }
  if (next.heightCm < LIMITS.heightCm[0] || next.heightCm > LIMITS.heightCm[1]) {
    return fail(`Height must stay between ${LIMITS.heightCm[0]} and ${LIMITS.heightCm[1]} cm to be stored. The previous value is unchanged.`);
  }
  if (next.referenceWeightKg < LIMITS.weightKg[0] || next.referenceWeightKg > LIMITS.weightKg[1]) {
    return fail(`Reference weight must stay between ${LIMITS.weightKg[0]} and ${LIMITS.weightKg[1]} kg to be stored. The previous value is unchanged.`);
  }
  mapAccount(accountId, (item) =>
    audit(
      { ...item, profiles: item.profiles.map((profile) => (profile.id === profileId ? next : profile)) },
      "profile.update",
      profileId,
      "scenarios-not-rewritten",
    ),
  );
  return { ok: true };
}

export function setActiveProfile(accountId: string, profileId: string) {
  mapAccount(accountId, (account) => ({ ...account, activeProfileId: profileId }));
}

export function deleteProfile(accountId: string, profileId: string): ActionResult {
  const account = accountById(accountId);
  if (!account) return fail("Session not found.");
  if (account.profiles.length < 2) return fail("Keep at least one profile, or delete the local session from Settings.");
  mapAccount(accountId, (item) => {
    const profiles = item.profiles.filter((profile) => profile.id !== profileId);
    return audit(
      {
        ...item,
        profiles,
        activeProfileId: item.activeProfileId === profileId ? profiles[0].id : item.activeProfileId,
        scenarios: item.scenarios.filter((scenario) => scenario.profileId !== profileId),
        observations: item.observations.filter((obs) => obs.profileId !== profileId),
        otherMeasurements: item.otherMeasurements.filter((row) => row.profileId !== profileId),
        compositionLogs: item.compositionLogs.filter((row) => row.profileId !== profileId),
        cycleLogs: item.cycleLogs.filter((row) => row.profileId !== profileId),
      },
      "profile.delete",
      profileId,
    );
  });
  return { ok: true };
}

function scenarioOf(account: Account, scenarioId: string) {
  return account.scenarios.find((scenario) => scenario.id === scenarioId) ?? null;
}

export function touchDraft(accountId: string, scenarioId: string, baseVersionId: string, producer: (inputs: ScenarioInputs) => ScenarioInputs) {
  mapAccount(accountId, (account) => {
    const scenario = scenarioOf(account, scenarioId);
    const existing = account.drafts[scenarioId];
    const base = scenario?.versions.find((version) => version.id === (existing?.baseVersionId ?? baseVersionId));
    const current = existing?.inputs ?? base?.inputSnapshot;
    if (!current) return account;
    const draft: Draft = {
      scenarioId,
      baseVersionId: existing?.baseVersionId ?? baseVersionId,
      inputs: producer(structuredClone(current)),
      past: existing ? [...existing.past, structuredClone(existing.inputs)].slice(-30) : [],
      future: [],
      updatedAt: nowIso(),
    };
    return { ...account, drafts: { ...account.drafts, [scenarioId]: draft } };
  });
}

export function undoDraft(accountId: string, scenarioId: string) {
  mapAccount(accountId, (account) => {
    const draft = account.drafts[scenarioId];
    if (!draft?.past.length) return account;
    const inputs = draft.past[draft.past.length - 1];
    return {
      ...account,
      drafts: {
        ...account.drafts,
        [scenarioId]: { ...draft, inputs, past: draft.past.slice(0, -1), future: [draft.inputs, ...draft.future], updatedAt: nowIso() },
      },
    };
  });
}

export function redoDraft(accountId: string, scenarioId: string) {
  mapAccount(accountId, (account) => {
    const draft = account.drafts[scenarioId];
    if (!draft?.future.length) return account;
    const [inputs, ...future] = draft.future;
    return {
      ...account,
      drafts: {
        ...account.drafts,
        [scenarioId]: { ...draft, inputs, past: [...draft.past, draft.inputs], future, updatedAt: nowIso() },
      },
    };
  });
}

export function discardDraft(accountId: string, scenarioId: string) {
  mapAccount(accountId, (account) => {
    const drafts = { ...account.drafts };
    delete drafts[scenarioId];
    return { ...account, drafts };
  });
}

export async function commitDraft(accountId: string, scenarioId: string, idempotencyKey: string, editKind: ScenarioVersion["editKind"] = "edit"): Promise<ActionResult> {
  const account = accountById(accountId);
  const scenario = account ? scenarioOf(account, scenarioId) : null;
  const draft = account?.drafts[scenarioId];
  if (!account || !scenario || !draft) return fail("There is no draft to save.");
  const existing = scenario.versions.find((version) => version.idempotencyKey === idempotencyKey);
  if (existing) return { ok: true, id: existing.id };
  const parent = scenario.versions.find((version) => version.id === draft.baseVersionId) ?? null;
  const built = await buildVersion({
    scenarioId,
    versionNumber: Math.max(...scenario.versions.map((version) => version.versionNumber)) + 1,
    parent,
    inputs: draft.inputs,
    idempotencyKey,
    editKind,
  });
  if (!built.ok) return built;
  mapAccount(accountId, (item) => {
    const drafts = { ...item.drafts };
    delete drafts[scenarioId];
    return audit(
      {
        ...item,
        drafts,
        scenarios: item.scenarios.map((current) =>
          current.id === scenarioId
            ? {
                ...current,
                name: draft.inputs.name || current.name,
                description: draft.inputs.description,
                activeVersionId: built.version.id,
                versions: [...current.versions, built.version],
              }
            : current,
        ),
      },
      "version.create",
      scenarioId,
      editKind,
    );
  });
  return { ok: true, id: built.version.id };
}

export function applyDayEdit(accountId: string, scenarioId: string, baseVersionId: string, start: string, end: string, patch: Partial<DayPlanInput>, note?: string) {
  touchDraft(accountId, scenarioId, baseVersionId, (inputs) => applyRangeOverride(inputs, start, end, patch, note));
}

export function clearDayOverrides(accountId: string, scenarioId: string, baseVersionId: string, start: string, end: string) {
  touchDraft(accountId, scenarioId, baseVersionId, (inputs) => clearOverrides(inputs, start, end));
}

export function replaceInputs(accountId: string, scenarioId: string, baseVersionId: string, inputs: ScenarioInputs) {
  touchDraft(accountId, scenarioId, baseVersionId, () => inputs);
}

export function renameScenario(accountId: string, scenarioId: string, name: string) {
  mapAccount(accountId, (account) => ({
    ...account,
    scenarios: account.scenarios.map((scenario) => (scenario.id === scenarioId ? { ...scenario, name } : scenario)),
  }));
}

export function setScenarioLabels(accountId: string, scenarioId: string, labels: string[]) {
  mapAccount(accountId, (account) => ({
    ...account,
    scenarios: account.scenarios.map((scenario) => (scenario.id === scenarioId ? { ...scenario, labels } : scenario)),
  }));
}

export function setArchived(accountId: string, scenarioId: string, archived: boolean) {
  mapAccount(accountId, (account) =>
    audit(
      {
        ...account,
        scenarios: account.scenarios.map((scenario) =>
          scenario.id === scenarioId ? { ...scenario, archivedAt: archived ? nowIso() : null } : scenario,
        ),
      },
      archived ? "scenario.archive" : "scenario.restore",
      scenarioId,
    ),
  );
}

export function deleteScenario(accountId: string, scenarioId: string) {
  mapAccount(accountId, (account) => {
    const drafts = { ...account.drafts };
    delete drafts[scenarioId];
    return audit(
      { ...account, drafts, scenarios: account.scenarios.filter((scenario) => scenario.id !== scenarioId) },
      "scenario.delete",
      scenarioId,
    );
  });
}

export function setActiveVersion(accountId: string, scenarioId: string, versionId: string) {
  mapAccount(accountId, (account) => ({
    ...account,
    scenarios: account.scenarios.map((scenario) => (scenario.id === scenarioId ? { ...scenario, activeVersionId: versionId } : scenario)),
  }));
  discardDraft(accountId, scenarioId);
}

export async function duplicateScenario(accountId: string, scenarioId: string, versionId: string): Promise<ActionResult> {
  const account = accountById(accountId);
  const scenario = account ? scenarioOf(account, scenarioId) : null;
  const version = scenario?.versions.find((item) => item.id === versionId);
  if (!account || !scenario || !version) return fail("Choose a saved version to duplicate.");
  const inputs = structuredClone(version.inputSnapshot);
  inputs.name = `${scenario.name} copy`;
  const id = uid("scn");
  const built = await buildVersion({
    scenarioId: id,
    versionNumber: 1,
    parent: null,
    inputs,
    idempotencyKey: uid("idem"),
    editKind: "duplicate",
    duplicatedFromVersionId: version.id,
  });
  if (!built.ok) return built;
  const copy: Scenario = {
    id,
    profileId: scenario.profileId,
    name: inputs.name,
    description: inputs.description,
    labels: [...scenario.labels],
    createdAt: built.version.createdAt,
    archivedAt: null,
    activeVersionId: built.version.id,
    versions: [built.version],
  };
  mapAccount(accountId, (item) => audit({ ...item, scenarios: [...item.scenarios, copy] }, "scenario.duplicate", id));
  return { ok: true, id };
}

export async function rerunLatest(accountId: string, scenarioId: string, versionId: string): Promise<ActionResult> {
  const account = accountById(accountId);
  const scenario = account ? scenarioOf(account, scenarioId) : null;
  const version = scenario?.versions.find((item) => item.id === versionId);
  if (!scenario || !version) return fail("Version not found.");
  const key = uid("idem");
  mapAccount(accountId, (item) => ({
    ...item,
    drafts: {
      ...item.drafts,
      [scenarioId]: {
        scenarioId,
        baseVersionId: versionId,
        inputs: structuredClone(version.inputSnapshot),
        past: [],
        future: [],
        updatedAt: nowIso(),
      },
    },
  }));
  return commitDraft(accountId, scenarioId, key, "model-rerun");
}

export async function rerunWithProfile(accountId: string, scenarioId: string, versionId: string, profile: Profile): Promise<ActionResult> {
  const account = accountById(accountId);
  const scenario = account ? scenarioOf(account, scenarioId) : null;
  const version = scenario?.versions.find((item) => item.id === versionId);
  if (!version) return fail("Version not found.");
  const inputs = structuredClone(version.inputSnapshot);
  inputs.profile = toProfileInput(profile);
  inputs.timeZone = account?.preferences.timeZone || inputs.timeZone;
  mapAccount(accountId, (item) => ({
    ...item,
    drafts: {
      ...item.drafts,
      [scenarioId]: { scenarioId, baseVersionId: versionId, inputs, past: [], future: [], updatedAt: nowIso() },
    },
  }));
  return commitDraft(accountId, scenarioId, uid("idem"), "profile-rerun");
}

export async function acceptCalibration(accountId: string, scenarioId: string): Promise<ActionResult> {
  const account = accountById(accountId);
  const scenario = account ? scenarioOf(account, scenarioId) : null;
  const profile = account?.profiles.find((item) => item.id === scenario?.profileId);
  const version = scenario?.versions.find((item) => item.id === scenario.activeVersionId);
  if (!account || !scenario || !profile || !version) return fail("Open a saved scenario before calibration.");
  const { proposeCalibration, calibrationAssumptions } = await import("../model/calibrate");
  const observations = account.observations.filter((obs) => obs.profileId === profile.id && !obs.deletedAt).map((obs) => ({ date: obs.localDate, kg: obs.valueKg }));
  const proposal = proposeCalibration(version.inputSnapshot, observations);
  if (!proposal.eligible || proposal.proposedMaintenanceKcal == null) return fail(proposal.reason);
  const note = calibrationAssumptions(proposal);
  const inputs = structuredClone(version.inputSnapshot);
  inputs.profile = {
    ...toProfileInput(profile),
    energyBasis: "accepted-retrospective-sketch",
    maintenanceKcal: proposal.proposedMaintenanceKcal,
    calibrationNote: note,
  };
  const nextProfile: Profile = { ...profile, ...inputs.profile, updatedAt: nowIso() };
  mapAccount(accountId, (item) => ({
    ...item,
    profiles: item.profiles.map((itemProfile) => (itemProfile.id === profile.id ? nextProfile : itemProfile)),
    drafts: {
      ...item.drafts,
      [scenarioId]: { scenarioId, baseVersionId: version.id, inputs, past: [], future: [], updatedAt: nowIso() },
    },
  }));
  const saved = await commitDraft(accountId, scenarioId, uid("idem"), "calibration");
  if (!saved.ok) return saved;
  mapAccount(accountId, (item) => audit(item, "calibration.accept", scenarioId, "plan-unchanged"));
  return { ok: true, id: saved.id, warning: "Planned intake and activity were not changed. Other scenarios still use their own snapshots until you re-run them." };
}

export function declineCalibration(accountId: string, scenarioId: string) {
  mapAccount(accountId, (account) => audit(account, "calibration.decline", scenarioId));
}

function weightError(kg: number): string | null {
  if (!Number.isFinite(kg)) return "Enter a numeric weight. It was not changed.";
  if (kg < LIMITS.weightKg[0] || kg > LIMITS.weightKg[1]) {
    return `This build stores weights between ${LIMITS.weightKg[0]} and ${LIMITS.weightKg[1]} kg. The reading was not clamped or saved.`;
  }
  return null;
}

export function addObservation(accountId: string, input: Omit<WeightObservation, "id" | "createdAt" | "deletedAt" | "corrections" | "syncStatus" | "valueKg"> & { valueKg: number }): ActionResult {
  const problem = weightError(input.valueKg);
  if (problem) return fail(problem);
  if (!isIsoDate(input.localDate)) return fail("Enter a valid date for the reading.");
  const account = accountById(accountId);
  const duplicate = account?.observations.some((obs) => obs.profileId === input.profileId && !obs.deletedAt && obs.localDate === input.localDate);
  const observation: WeightObservation = {
    ...input,
    id: uid("obs"),
    valueKg: input.valueKg,
    createdAt: nowIso(),
    deletedAt: null,
    corrections: [],
    syncStatus: "local-only",
  };
  mapAccount(accountId, (item) => audit({ ...item, observations: [...item.observations, observation] }, "observation.create", input.profileId, input.source));
  return { ok: true, id: observation.id, warning: duplicate ? "Another reading is already stored on this date. This one was added beside it. Nothing was overwritten." : undefined };
}

export function updateObservation(accountId: string, observationId: string, valueKg: number, note: string): ActionResult {
  const problem = weightError(valueKg);
  if (problem) return fail(problem);
  const account = accountById(accountId);
  const current = account?.observations.find((obs) => obs.id === observationId);
  if (!current || current.deletedAt) return fail("That reading is not active.");
  mapAccount(accountId, (item) =>
    audit(
      {
        ...item,
        observations: item.observations.map((obs) =>
          obs.id === observationId
            ? { ...obs, valueKg, note, corrections: [...obs.corrections, { at: nowIso(), previousKg: obs.valueKg, previousNote: obs.note }] }
            : obs,
        ),
      },
      "observation.edit",
      current.profileId,
    ),
  );
  return { ok: true };
}

export function deleteObservation(accountId: string, observationId: string) {
  mapAccount(accountId, (account) => ({
    ...account,
    observations: account.observations.map((obs) => (obs.id === observationId ? { ...obs, deletedAt: nowIso() } : obs)),
    audits: [...account.audits, { id: uid("aud"), at: nowIso(), action: "observation.delete", subject: observationId }].slice(-200),
  }));
}

export function restoreObservation(accountId: string, observationId: string): ActionResult {
  const current = accountById(accountId)?.observations.find((obs) => obs.id === observationId);
  if (!current?.deletedAt) return fail("That reading is not in the removed list.");
  mapAccount(accountId, (account) => ({
    ...account,
    observations: account.observations.map((obs) => (obs.id === observationId ? { ...obs, deletedAt: null } : obs)),
    audits: [...account.audits, { id: uid("aud"), at: nowIso(), action: "observation.restore", subject: observationId }].slice(-200),
  }));
  return { ok: true };
}

export async function commitImport(accountId: string, args: {
  profileId: string;
  timeZone: string;
  sourceLabel: string;
  fileText: string;
  rows: { localDate: string; localTime: string; value: number; unit: "kg" | "lb"; note: string; sourceRecordId: string }[];
}): Promise<ActionResult> {
  const account = accountById(accountId);
  if (!account) return fail("Session not found.");
  if (account.preferences.pauseTracking) return fail("Tracking is paused. Import stays off until you resume. History was not changed.");
  const batchId = uid("imp");
  const fileHash = await sha256(args.fileText);
  const existing = account.observations.filter((obs) => obs.profileId === args.profileId && !obs.deletedAt);
  const additions: WeightObservation[] = [];
  let skipped = 0;
  const errors: string[] = [];
  args.rows.forEach((row, index) => {
    if (!isIsoDate(row.localDate)) {
      errors.push(`Row ${index + 1}: date`);
      return;
    }
    const valueKg = row.unit === "lb" ? lbToKg(row.value) : row.value;
    if (weightError(valueKg)) {
      errors.push(`Row ${index + 1}: weight`);
      return;
    }
    const same = existing.some((obs) => obs.localDate === row.localDate && Math.abs(obs.valueKg - valueKg) < 0.05);
    if (same) {
      skipped += 1;
      return;
    }
    additions.push({
      id: uid("obs"),
      profileId: args.profileId,
      observedAt: `${row.localDate}T${row.localTime || "07:00"}:00`,
      localDate: row.localDate,
      localTime: row.localTime || "07:00",
      timeZone: args.timeZone,
      valueKg,
      sourceValue: row.value,
      sourceUnit: row.unit,
      source: "csv",
      sourceRecordId: row.sourceRecordId,
      importBatchId: batchId,
      note: row.note,
      createdAt: nowIso(),
      deletedAt: null,
      corrections: [],
      syncStatus: "local-only",
    });
  });
  mapAccount(accountId, (item) =>
    audit(
      {
        ...item,
        observations: [...item.observations, ...additions],
        importBatches: [
          ...item.importBatches,
          {
            id: batchId,
            profileId: args.profileId,
            sourceLabel: args.sourceLabel,
            fileHash,
            createdAt: nowIso(),
            timeZone: args.timeZone,
            status: "committed",
            rowCount: args.rows.length,
            importedCount: additions.length,
            skippedCount: skipped,
            errorSummary: errors.slice(0, 8).join("; "),
          },
        ],
      },
      "import.commit",
      args.profileId,
      `imported:${additions.length}`,
    ),
  );
  return { ok: true, id: batchId, warning: `Imported ${additions.length}. Skipped ${skipped} likely duplicate${skipped === 1 ? "" : "s"}. ${errors.length ? errors.length + " row(s) had errors and were not saved." : "Manual readings were not overwritten."}` };
}

export function addOtherMeasurement(accountId: string, row: Omit<OtherMeasurement, "id" | "createdAt">): ActionResult {
  const waist = row.valueCm;
  if (row.kind === "waist") {
    const waistProblem = waist == null ? waistBoundMessage(Number.NaN) : waistBoundMessage(waist);
    if (waistProblem) return fail(waistProblem);
  }
  if (!isIsoDate(row.date)) return fail("Enter a valid date. Nothing was saved.");
  const measurement: OtherMeasurement = { ...row, id: uid("mea"), createdAt: nowIso() };
  mapAccount(accountId, (account) => ({ ...account, otherMeasurements: [...account.otherMeasurements, measurement] }));
  return { ok: true };
}

export function addComposition(accountId: string, row: Omit<CompositionLog, "id" | "createdAt">): ActionResult {
  if (row.bodyFatPct != null) {
    const fatProblem = bodyFatBoundMessage(row.bodyFatPct);
    if (fatProblem) return fail(fatProblem);
  }
  const log: CompositionLog = { ...row, id: uid("com"), createdAt: nowIso() };
  mapAccount(accountId, (account) => ({ ...account, compositionLogs: [...account.compositionLogs, log] }));
  return { ok: true };
}

export function addCycleLog(accountId: string, row: Omit<CycleLog, "id" | "createdAt">): ActionResult {
  const account = accountById(accountId);
  const consentRow = account?.consents.find((item) => item.consentType === "cycle-context" && item.grantedAt && !item.revokedAt);
  if (!consentRow) return fail("Cycle context is off. Turn it on in Settings if you want to record it. It is optional.");
  const log: CycleLog = { ...row, id: uid("cyc"), createdAt: nowIso() };
  mapAccount(accountId, (account) => ({ ...account, cycleLogs: [...account.cycleLogs, log] }));
  return { ok: true };
}

export function deleteCycleLog(accountId: string, id: string) {
  mapAccount(accountId, (account) => ({ ...account, cycleLogs: account.cycleLogs.filter((log) => log.id !== id) }));
}

export function setOptionalConsent(accountId: string, type: ConsentRecord["consentType"], granted: boolean, deleteCycle = false) {
  mapAccount(accountId, (account) => {
    const consents = account.consents.map((item) => (item.consentType === type && !item.revokedAt ? { ...item, revokedAt: nowIso() } : item));
    consents.push(consent(type, granted));
    let next = { ...account, consents };
    if (type === "cycle-context" && !granted && deleteCycle) next = { ...next, cycleLogs: [] };
    if (type === "reminders") {
      next = {
        ...next,
        notifications: {
          ...next.notifications,
          reviewEnabled: granted ? next.notifications.reviewEnabled : false,
          phaseStartEnabled: granted ? next.notifications.phaseStartEnabled : false,
          browserNotifications: granted ? next.notifications.browserNotifications : false,
          enabledAt: granted ? next.notifications.enabledAt ?? nowIso() : null,
        },
      };
    }
    return audit(next, granted ? "consent.grant" : "consent.revoke", type);
  });
}

export function updateNotifications(accountId: string, patch: Partial<Account["notifications"]>) {
  mapAccount(accountId, (account) => ({ ...account, notifications: { ...account.notifications, ...patch, enabledAt: account.notifications.enabledAt ?? nowIso() } }));
}

export function dismissReminder(accountId: string, kind: "review" | "phase", day: string) {
  mapAccount(accountId, (account) =>
    kind === "review" ? { ...account, reminderDismissedOn: day } : { ...account, phasePromptDismissedOn: day },
  );
}

export function setConnection(accountId: string, provider: "appleHealth" | "healthConnect", status: ConnectionRecord["status"]) {
  mapAccount(accountId, (account) => {
    const current = account.connections[provider];
    const next: ConnectionRecord = {
      ...current,
      status,
      readWeight: false,
      readActivity: false,
      write: false,
      lastSyncAt: null,
      requestedAt: status === "unavailable" ? nowIso() : current.requestedAt,
      revokedAt: status === "revoked" ? nowIso() : status === "not-requested" ? null : current.revokedAt,
      note:
        status === "revoked"
          ? "Refusal stored on this device. No sync ran. This browser cannot read the health platform."
          : status === "unavailable"
            ? "A connection was requested in the browser and refused by this app. No permission dialog for the health platform was opened, and no data was read."
            : "Not available in this browser. No permission was requested and no data was read.",
    };
    return audit(
      { ...account, connections: { ...account.connections, [provider]: next } },
      status === "revoked" ? "connection.revoke" : "connection.update",
      provider,
    );
  });
}

export function setFlag(accountId: string, advancedMath: boolean) {
  mapAccount(accountId, (account) => ({ ...account, featureFlags: { advancedMath } }));
}

export function recordExport(accountId: string, kind: string) {
  mapAccount(accountId, (account) => audit(account, "export.create", kind));
}

export async function deleteAccount(accountId: string, confirmation: string): Promise<ActionResult> {
  const account = accountById(accountId);
  if (!account) return fail("Session not found.");
  if (account.passphraseHash) {
    const hash = await sha256(`${account.passphraseSalt}:${confirmation}`);
    if (hash !== account.passphraseHash) return fail("The passphrase does not match, so nothing was deleted.");
  } else if (confirmation !== "DELETE") {
    return fail('Type DELETE to remove this local session. Nothing was deleted.');
  }
  const receipt = { at: nowIso(), label: account.displayName };
  const accounts = state.accounts.filter((item) => item.id !== accountId);
  storage().setItem(RECEIPT, JSON.stringify(receipt));
  commit({
    ...state,
    accounts,
    sessionAccountId: state.sessionAccountId === accountId ? null : state.sessionAccountId,
    deletionReceipt: receipt,
  });
  return { ok: true };
}

export async function deleteDevice(): Promise<ActionResult> {
  const receipt = { at: nowIso(), label: "This device" };
  storage().removeItem(KEY);
  storage().setItem(RECEIPT, JSON.stringify(receipt));
  const fresh = await createSeedDatabase();
  fresh.deletionReceipt = receipt;
  fresh.viewer.adultOk = false;
  state = fresh;
  persist();
  emit();
  return { ok: true };
}

export async function restoreDemo(): Promise<ActionResult> {
  const demo = await createDemoAccount();
  const without = state.accounts.filter((account) => !account.isDemo);
  commit({ ...state, accounts: [...without, demo], sessionAccountId: demo.id });
  return { ok: true, id: demo.id };
}

export function downloadBackup() {
  return storage().getItem(BACKUP);
}

export function kgDisplay(kg: number, unit: "kg" | "lb") {
  return unit === "lb" ? kgToLb(kg) : kg;
}
