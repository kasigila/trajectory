import type { ChangeExplanation } from "../model/explain";
import type { ForecastPoint, ProfileInput, ScenarioInputs } from "../model/types";

export interface ConsentRecord {
  id: string;
  consentType: "terms" | "privacy" | "health-sync" | "cycle-context" | "reminders";
  policyVersion: string;
  grantedAt: string | null;
  revokedAt: string | null;
  channel: "local-browser";
}

export interface Preferences {
  unit: "kg" | "lb";
  lengthUnit: "cm" | "ft";
  dateFormat: "iso" | "dmy" | "mdy" | "long";
  theme: "light" | "dark" | "system";
  timeZone: string;
  hideWeight: boolean;
  pauseTracking: boolean;
}

export interface NotificationPreference {
  reviewEnabled: boolean;
  reviewEveryDays: number;
  reviewHour: number;
  quietStartHour: number;
  quietEndHour: number;
  pauseAll: boolean;
  phaseStartEnabled: boolean;
  browserNotifications: boolean;
  enabledAt: string | null;
}

export interface ConnectionRecord {
  provider: "apple-health" | "health-connect";
  status: "not-requested" | "unavailable" | "revoked";
  readWeight: boolean;
  readActivity: boolean;
  write: false;
  requestedAt: string | null;
  revokedAt: string | null;
  lastSyncAt: null;
  note: string;
}

export interface Profile extends ProfileInput {
  id: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface ForecastRunRecord {
  id: string;
  scenarioVersionId: string;
  modelId: string;
  modelVersion: string;
  engineBuild: string;
  status: "complete" | "refused";
  inputHash: string;
  startedAt: string;
  completedAt: string;
  warnings: string[];
  assumptions: string[];
  refusal: { code: string; message: string } | null;
  points: ForecastPoint[];
  errorId: string | null;
}

export interface ScenarioVersion {
  id: string;
  scenarioId: string;
  versionNumber: number;
  parentVersionId: string | null;
  duplicatedFromVersionId: string | null;
  createdAt: string;
  modelId: string;
  modelVersion: string;
  engineBuild: string;
  inputSnapshot: ScenarioInputs;
  inputHash: string;
  assumptions: string[];
  forecast: ForecastRunRecord;
  idempotencyKey: string;
  editKind: "initial" | "edit" | "profile-rerun" | "model-rerun" | "calibration" | "duplicate" | "horizon";
  change: ChangeExplanation;
}

export interface Scenario {
  id: string;
  profileId: string;
  name: string;
  description: string;
  labels: string[];
  createdAt: string;
  archivedAt: string | null;
  activeVersionId: string;
  versions: ScenarioVersion[];
}

export interface Draft {
  scenarioId: string;
  baseVersionId: string;
  inputs: ScenarioInputs;
  past: ScenarioInputs[];
  future: ScenarioInputs[];
  updatedAt: string;
}

export interface WeightObservation {
  id: string;
  profileId: string;
  observedAt: string;
  localDate: string;
  localTime: string;
  timeZone: string;
  valueKg: number;
  sourceValue: number;
  sourceUnit: "kg" | "lb";
  source: "manual" | "csv";
  sourceRecordId: string | null;
  importBatchId: string | null;
  note: string;
  createdAt: string;
  deletedAt: string | null;
  /** Left out of the retrospective calibration sketch. The reading stays on the chart. */
  excludeFromCalibration?: boolean;
  corrections: { at: string; previousKg: number; previousNote: string }[];
  syncStatus: "local-only";
}

export interface OtherMeasurement {
  id: string;
  profileId: string;
  date: string;
  kind: "waist" | "other";
  label: string;
  valueCm: number | null;
  note: string;
  createdAt: string;
}

export interface CompositionLog {
  id: string;
  profileId: string;
  date: string;
  bodyFatPct: number | null;
  leanMassKg: number | null;
  source: string;
  method: string;
  note: string;
  createdAt: string;
}

export interface CycleLog {
  id: string;
  profileId: string;
  date: string;
  kind: "bleeding-started" | "note";
  note: string;
  createdAt: string;
}

export interface ImportBatch {
  id: string;
  profileId: string;
  sourceLabel: string;
  fileHash: string;
  createdAt: string;
  timeZone: string;
  status: "committed";
  rowCount: number;
  importedCount: number;
  skippedCount: number;
  errorSummary: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  subject: string;
  reason?: string;
}

export interface OnboardingDraft {
  step: number;
  label: string;
  accountName: string;
  separateAccount: boolean;
  unit: "kg" | "lb";
  lengthUnit: "cm" | "ft";
  birthDate: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weightKg: string;
  sexParameter: ProfileInput["sexParameter"];
  bodyFatPct: string;
  bodyFatSource: string;
  leanMassKg: string;
  energyBasis: ProfileInput["energyBasis"];
  maintenanceKcal: string;
  activityCategory: ProfileInput["referenceActivity"]["category"];
  steps: string;
  referencePal: string;
  excludedContext: ProfileInput["excludedContext"];
  scenarioName: string;
  template: "same" | "weekday-weekend";
  startDate: string;
  horizonDays: string;
  intakeKcal: string;
  weekendIntakeKcal: string;
  weekendSteps: string;
  purposeAccepted?: boolean;
  eligibilityAccepted?: boolean;
  unitsAccepted?: boolean;
}

export interface Account {
  id: string;
  displayName: string;
  isDemo: boolean;
  passphraseSalt: string | null;
  passphraseHash: string | null;
  createdAt: string;
  preferences: Preferences;
  notifications: NotificationPreference;
  connections: {
    appleHealth: ConnectionRecord;
    healthConnect: ConnectionRecord;
  };
  consents: ConsentRecord[];
  profiles: Profile[];
  activeProfileId: string;
  scenarios: Scenario[];
  observations: WeightObservation[];
  otherMeasurements: OtherMeasurement[];
  compositionLogs: CompositionLog[];
  cycleLogs: CycleLog[];
  importBatches: ImportBatch[];
  drafts: Record<string, Draft>;
  audits: AuditEvent[];
  reminderDismissedOn: string | null;
  phasePromptDismissedOn: string | null;
  featureFlags: { advancedMath: boolean };
}

export interface Database {
  schema: 2;
  hydrated: boolean;
  recoveryAvailable: boolean;
  viewer: {
    birthDate: string | null;
    adultOk: boolean;
    consents: ConsentRecord[];
  };
  sessionAccountId: string | null;
  accounts: Account[];
  onboarding: OnboardingDraft | null;
  deletionReceipt: { at: string; label: string } | null;
}

export type ActionResult = { ok: true; id?: string; warning?: string } | { ok: false; message: string; errorId: string };
