import { lbToKg } from "../model/units";
import type { DayPlanInput, ScenarioInputs } from "../model/types";
import type { Account, Database, Preferences, Scenario, ScenarioVersion } from "./types";
import { buildVersion } from "./version";

const TZ = "America/Toronto";

export function defaultPreferences(timeZone = TZ): Preferences {
  return {
    unit: "kg",
    lengthUnit: "cm",
    dateFormat: "dmy",
    theme: "system",
    timeZone,
    hideWeight: false,
    pauseTracking: false,
  };
}

export function defaultNotifications() {
  return {
    reviewEnabled: false,
    reviewEveryDays: 14,
    reviewHour: 9,
    quietStartHour: 21,
    quietEndHour: 8,
    pauseAll: false,
    phaseStartEnabled: false,
    browserNotifications: false,
    enabledAt: null,
  };
}

export function defaultConnections(): Account["connections"] {
  const note = "Not available in this browser. No permission was requested and no data was read.";
  return {
    appleHealth: {
      provider: "apple-health" as const,
      status: "not-requested" as const,
      readWeight: false,
      readActivity: false,
      write: false as const,
      requestedAt: null,
      revokedAt: null,
      lastSyncAt: null,
      note,
    },
    healthConnect: {
      provider: "health-connect" as const,
      status: "not-requested" as const,
      readWeight: false,
      readActivity: false,
      write: false as const,
      requestedAt: null,
      revokedAt: null,
      lastSyncAt: null,
      note,
    },
  };
}

function day(partial: Partial<DayPlanInput> & Pick<DayPlanInput, "intakeKcal">): DayPlanInput {
  return {
    intakeKcal: partial.intakeKcal,
    activityMode: partial.activityMode ?? "category",
    activityCategory: partial.activityCategory ?? "sedentary",
    steps: partial.steps ?? 7000,
    pal: partial.pal ?? 1.5,
    explicitActivityKcal: partial.explicitActivityKcal ?? 0,
    exerciseMinutes: partial.exerciseMinutes ?? 0,
    note: partial.note ?? "",
  };
}

function alexProfile() {
  return {
    id: "prof_alex",
    label: "Alex Rivera",
    createdAt: "2026-10-06T14:00:00.000Z",
    updatedAt: "2026-10-06T14:00:00.000Z",
    birthDate: "1992-03-15",
    heightCm: 178,
    referenceWeightKg: 86.2,
    referenceDate: "2026-10-06",
    sexParameter: "parameter-a" as const,
    bodyFatPct: null,
    bodyFatSource: "",
    bodyFatConfidence: "unspecified" as const,
    leanMassKg: null,
    energyBasis: "user-estimate" as const,
    maintenanceKcal: 2700,
    calibrationNote: null,
    referenceActivity: { category: "sedentary" as const, steps: 7000, pal: 1.5 },
    excludedContext: "none" as const,
    excludedDetail: "",
  };
}

function baseInputs(profile: ReturnType<typeof alexProfile>, name: string, description: string, labels: string[]): ScenarioInputs {
  return {
    name,
    description,
    labels,
    startDate: "2026-10-06",
    horizonDays: 120,
    timeZone: TZ,
    baseline: day({ intakeKcal: 2700, steps: 7000 }),
    weekly: { enabled: false, days: {} },
    phases: [],
    overrides: [],
    goal: null,
    milestones: [],
    profile: (({ id, label, createdAt, updatedAt, ...input }) => input)(profile),
  };
}

async function version(scenarioId: string, number: number, parent: ScenarioVersion | null, inputs: ScenarioInputs, key: string, at: string, kind: ScenarioVersion["editKind"]): Promise<ScenarioVersion> {
  const built = await buildVersion({
    scenarioId,
    versionNumber: number,
    parent,
    inputs,
    idempotencyKey: key,
    editKind: kind,
    createdAt: at,
  });
  if (!built.ok) throw new Error(built.message);
  built.version.id = `${scenarioId}_v${number}`;
  built.version.forecast.id = `${scenarioId}_run${number}`;
  built.version.forecast.scenarioVersionId = built.version.id;
  return built.version;
}

export async function createDemoAccount(): Promise<Account> {
  const profile = alexProfile();
  const v1Inputs = baseInputs(profile, "Autumn routine", "Original forecast. Same intake each day, near the entered maintenance estimate. Activity is the published sedentary PAL 1.5.", ["baseline"]);
  const v1 = await version("scn_autumn", 1, null, v1Inputs, "seed_autumn_v1", "2026-10-06T15:00:00.000Z", "initial");

  const v2Inputs = structuredClone(v1Inputs);
  v2Inputs.description = "Weekday and weekend intake. Step counts are stored with the plan and are not converted to energy.";
  v2Inputs.labels = ["routine"];
  v2Inputs.baseline = day({ intakeKcal: 2550, steps: 8000 });
  v2Inputs.weekly = {
    enabled: true,
    days: {
      0: { intakeKcal: 2900, steps: 4500 },
      6: { intakeKcal: 2900, steps: 4500 },
    },
  };
  const v2 = await version("scn_autumn", 2, v1, v2Inputs, "seed_autumn_v2", "2026-10-20T15:00:00.000Z", "edit");

  const v3Inputs = structuredClone(v2Inputs);
  v3Inputs.description = "Weekday and weekend pattern, then a shifted routine, then a maintenance assumption.";
  v3Inputs.phases = [
    {
      id: "phase_shift",
      name: "Shifted routine",
      start: "2026-11-09",
      end: "2026-12-06",
      inputs: { intakeKcal: 2250, steps: 11000 },
      note: "A planned schedule change. This name is a label, not a recommendation.",
    },
    {
      id: "phase_maintain",
      name: "Maintenance assumption",
      start: "2026-12-07",
      end: "2027-02-02",
      inputs: { intakeKcal: 2680, steps: 8000 },
      note: "An assumption that intake sits near maintenance. Not a target the app will chase.",
    },
  ];
  v3Inputs.overrides = [
    {
      date: "2026-11-26",
      inputs: { intakeKcal: 3400 },
      note: "Travel day. The note is not a physiological adjustment. Only the intake number you entered is used.",
    },
  ];
  v3Inputs.goal = { weightKg: 84, date: null, label: "Personal reference" };
  v3Inputs.milestones = [{ id: "ms_maintain", date: "2026-12-07", label: "Maintenance assumption begins" }];
  const v3 = await version("scn_autumn", 3, v2, v3Inputs, "seed_autumn_v3", "2026-11-09T15:10:00.000Z", "edit");

  const holdInputs = baseInputs(profile, "Maintenance hold", "Same assumptions each day, held at the entered maintenance estimate.", ["maintenance"]);
  const hold = await version("scn_hold", 1, null, holdInputs, "seed_hold_v1", "2026-10-06T15:05:00.000Z", "initial");

  const autumn: Scenario = {
    id: "scn_autumn",
    profileId: profile.id,
    name: "Autumn routine",
    description: v3Inputs.description,
    labels: ["routine"],
    createdAt: "2026-10-06T15:00:00.000Z",
    archivedAt: null,
    activeVersionId: v3.id,
    versions: [v1, v2, v3],
  };
  const maintenance: Scenario = {
    id: "scn_hold",
    profileId: profile.id,
    name: "Maintenance hold",
    description: holdInputs.description,
    labels: ["maintenance"],
    createdAt: "2026-10-06T15:05:00.000Z",
    archivedAt: null,
    activeVersionId: hold.id,
    versions: [hold],
  };

  const readings: Array<[string, number, string]> = [
    ["2026-10-06", 86.2, "Morning, home scale"],
    ["2026-10-13", 86.0, "Morning, home scale"],
    ["2026-10-20", 85.9, "Morning, home scale"],
    ["2026-10-27", 86.1, "Morning, home scale"],
    ["2026-11-03", 85.7, "Morning, home scale"],
    ["2026-11-10", 85.4, "Morning, home scale"],
    ["2026-11-16", 85.3, "Morning, home scale"],
  ];

  return {
    id: "acct_demo",
    displayName: "Demo session",
    isDemo: true,
    passphraseSalt: null,
    passphraseHash: null,
    createdAt: "2026-10-06T14:00:00.000Z",
    preferences: defaultPreferences(),
    notifications: defaultNotifications(),
    connections: defaultConnections(),
    consents: [],
    profiles: [profile],
    activeProfileId: profile.id,
    scenarios: [autumn, maintenance],
    observations: readings.map(([date, kg, note], index) => ({
      id: `obs_${index + 1}`,
      profileId: profile.id,
      observedAt: `${date}T07:10:00`,
      localDate: date,
      localTime: "07:10",
      timeZone: TZ,
      valueKg: kg,
      sourceValue: kg,
      sourceUnit: "kg" as const,
      source: "manual" as const,
      sourceRecordId: null,
      importBatchId: null,
      note,
      createdAt: `${date}T12:00:00.000Z`,
      deletedAt: null,
      corrections: [],
      syncStatus: "local-only" as const,
    })),
    otherMeasurements: [],
    compositionLogs: [],
    cycleLogs: [],
    importBatches: [],
    drafts: {},
    audits: [
      { id: "aud_1", at: "2026-10-06T15:00:00.000Z", action: "scenario.create", subject: "scn_autumn" },
      { id: "aud_2", at: "2026-11-09T15:10:00.000Z", action: "version.create", subject: "scn_autumn" },
      { id: "aud_3", at: "2026-11-16T12:00:00.000Z", action: "observation.create", subject: "prof_alex" },
    ],
    reminderDismissedOn: null,
    phasePromptDismissedOn: null,
    featureFlags: { advancedMath: false },
  };
}

export async function createSeedDatabase(): Promise<Database> {
  return {
    schema: 2,
    hydrated: true,
    recoveryAvailable: false,
    viewer: { birthDate: null, adultOk: false, consents: [] },
    sessionAccountId: null,
    accounts: [await createDemoAccount()],
    onboarding: null,
    deletionReceipt: null,
  };
}

export function blankOnboarding(timeZoneToday: string): Database["onboarding"] {
  return {
    step: 0,
    label: "",
    accountName: "",
    separateAccount: false,
    unit: "kg",
    lengthUnit: "cm",
    birthDate: "",
    heightCm: "",
    heightFeet: "",
    heightInches: "",
    weightKg: "",
    sexParameter: "unspecified",
    bodyFatPct: "",
    bodyFatSource: "",
    leanMassKg: "",
    energyBasis: "user-estimate",
    maintenanceKcal: "",
    activityCategory: "sedentary",
    steps: "7000",
    referencePal: "1.5",
    excludedContext: "none",
    scenarioName: "First scenario",
    template: "same",
    startDate: timeZoneToday,
    horizonDays: "90",
    intakeKcal: "",
    weekendIntakeKcal: "",
    weekendSteps: "5000",
  };
}

export function kgFromEntry(value: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? lbToKg(value) : value;
}
