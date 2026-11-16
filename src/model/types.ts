import type { ActivityCategory } from "./parameters";

export type ActivityMode = "category" | "steps" | "explicit-kcal";

export type SexParameter = "unspecified" | "parameter-a" | "parameter-b";

export type EnergyBasis = "user-estimate" | "model-estimated" | "accepted-retrospective-sketch";

export type ExcludedContext =
  | "none"
  | "pregnancy"
  | "breastfeeding"
  | "medical-management"
  | "pediatric"
  | "other";

export interface DayPlanInput {
  intakeKcal: number;
  activityMode: ActivityMode;
  activityCategory: ActivityCategory;
  steps: number;
  /** Physical activity level. Null means “use the reference PAL, or sedentary PAL 1.5 when that category is selected.” */
  pal: number | null;
  explicitActivityKcal: number;
  exerciseMinutes: number;
  note: string;
}

export type DayField = keyof DayPlanInput;

export interface PhaseRule {
  id: string;
  name: string;
  start: string;
  end: string;
  inputs: Partial<DayPlanInput>;
  note: string;
}

export interface WeeklyTemplate {
  enabled: boolean;
  days: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, Partial<DayPlanInput>>>;
}

export interface DayOverride {
  date: string;
  inputs: Partial<DayPlanInput>;
  note: string;
}

export interface ProfileInput {
  birthDate: string;
  heightCm: number;
  referenceWeightKg: number;
  referenceDate: string;
  sexParameter: SexParameter;
  bodyFatPct: number | null;
  bodyFatSource: string;
  bodyFatConfidence: "low" | "moderate" | "unspecified";
  leanMassKg: number | null;
  energyBasis: EnergyBasis;
  maintenanceKcal: number | null;
  calibrationNote: string | null;
  referenceActivity: {
    category: ActivityCategory;
    steps: number;
    /** Physical activity level. Webappendix equation (8). Sedentary in that paper is 1.5. */
    pal: number;
  };
  excludedContext: ExcludedContext;
  excludedDetail: string;
}

export interface GoalMarker {
  weightKg: number | null;
  date: string | null;
  label: string;
}

export interface Milestone {
  id: string;
  date: string;
  label: string;
}

export interface ScenarioInputs {
  name: string;
  description: string;
  labels: string[];
  startDate: string;
  horizonDays: number;
  timeZone: string;
  baseline: DayPlanInput;
  weekly: WeeklyTemplate;
  phases: PhaseRule[];
  overrides: DayOverride[];
  goal: GoalMarker | null;
  milestones: Milestone[];
  profile: ProfileInput;
}

export type RuleSource = "override" | "phase" | "weekly" | "baseline";

export interface ResolvedDay {
  date: string;
  intakeKcal: number;
  activityMode: ActivityMode;
  activityCategory: ActivityCategory;
  steps: number;
  pal: number | null;
  explicitActivityKcal: number;
  exerciseMinutes: number;
  note: string;
  sources: Record<DayField, RuleSource>;
  phaseId: string | null;
  phaseName: string | null;
}

export interface ForecastPoint {
  date: string;
  centralKg: number;
  lowerKg: number;
  upperKg: number;
  boundType: "sensitivity-range";
  expenditureKcal: number;
  intakeKcal: number;
  massBeforeKg: number;
}

export interface ForecastResult {
  status: "complete" | "refused";
  points: ForecastPoint[];
  warnings: string[];
  assumptions: string[];
  refusal: { code: string; message: string } | null;
}

export interface PlanDiffSpan {
  start: string;
  end: string;
  lines: string[];
}
