/**
 * Published Hall / NIDDK adult model constants.
 * Every physiological number below is taken from the cited paper.
 * Software bounds in LIMITS are input checks for this browser build, not clinical thresholds.
 *
 * Primary source: Hall KD, Sacks G, Chandramohan D, Chow CC, Wang YC, Gortmaker SL,
 * Swinburn BA. Quantification of the effect of energy imbalance on bodyweight.
 * Lancet. 2011;378:826–837. Supplementary webappendix, “Dynamic Mathematical Model
 * of Body Weight Change in Adults.” Equations (3)–(9) and (12).
 */

export const MODEL = {
  id: "hall-lancet-2011",
  version: "2011.webappendix",
  engineBuild: "trajectory-web-0.2.0",
  name: "Published Hall dynamic adult model",
  validationStatus: "published-equations-not-a-medical-device" as const,
  policyVersion: "2026-11-16",
  shortCitation: "Hall et al., Lancet 2011;378:826–837",
};

export const HALL_CITATION =
  "Hall KD, Sacks G, Chandramohan D, Chow CC, Wang YC, Gortmaker SL, Swinburn BA. Quantification of the effect of energy imbalance on bodyweight. Lancet. 2011;378:826–837, and the supplementary webappendix “Dynamic Mathematical Model of Body Weight Change in Adults.”";

/**
 * Thermochemical calorie. The webappendix states energies in kJ and MJ.
 * User-facing intake stays in kcal. This factor only converts those units.
 * It is not a body-composition constant.
 */
export const KJ_PER_KCAL = 4.184;

export const HALL = {
  /** ρF. Hall KD. Int J Obes. 2008;32:573–576. Webappendix equation (3). */
  rhoF_MJ_per_kg: 39.5,
  /** ρL. Same source as ρF. */
  rhoL_MJ_per_kg: 7.6,
  /** Forbes parameter, kg. Forbes GB. Nutr Rev. 1987;45:225–231. Used as stated in the webappendix. */
  forbesKg: 10.4,
  /** γF, kJ/kg/day. Nelson KM et al. Am J Clin Nutr. 1992;56:848–856. Webappendix equation (5). */
  gammaF_kJ_per_kg_day: 13,
  /** γL, kJ/kg/day. Nelson et al. 1992. */
  gammaL_kJ_per_kg_day: 92,
  /** ηF, kJ/kg. Hall KD. Br J Nutr. 2010;104:4–7. */
  etaF_kJ_per_kg: 750,
  /** ηL, kJ/kg. Hall, Br J Nutr. 2010. */
  etaL_kJ_per_kg: 960,
  /** βTEF. Blaxter K. Energy Metabolism in Animals and Man. Cambridge University Press; 1989. Webappendix equation (6). */
  betaTEF: 0.1,
  /** βAT. Hall KD, Jordan PN. Am J Clin Nutr. 2008;88:1495–1503. Webappendix equation (7). */
  betaAT: 0.14,
  /** τAT, days. Hall webappendix equation (7), citing Hall 2006 and Hall 2010. */
  tauAT_days: 14,
  /** Sedentary physical activity level used to estimate δ. Webappendix equation (8). */
  sedentaryPAL: 1.5,
  /**
   * Standard error of estimate, percentage points of body fat, for the age + ln(BMI)
   * equations that the webappendix copies as equation (4) (Jackson model II).
   * Jackson AS et al. Int J Obes. 2002;26:789–796.
   */
  jacksonSeeMenPct: 4.6,
  jacksonSeeWomenPct: 4.4,
};

export const LIMITS = {
  horizonMin: 1,
  horizonMax: 365,
  horizonWarnAfter: 90,
  heightCm: [100, 230] as const,
  weightKg: [25, 300] as const,
  intakeKcal: [0, 20000] as const,
  steps: [0, 200000] as const,
  exerciseMinutes: [0, 1440] as const,
  explicitActivityKcal: [-5000, 8000] as const,
  /** Software bound on a user-entered PAL. Not a published activity category. */
  pal: [0.5, 5] as const,
  bodyFatPct: [2, 70] as const,
  leanMassKg: [10, 200] as const,
  ageMin: 18,
  ageMax: 120,
  maintenanceKcal: [0, 20000] as const,
  numericMassKg: [20, 350] as const,
};

/** Product rules that are not Hall constants. */
export const PRODUCT = {
  trendAlpha: 0.2,
  calibrationMinReadings: 4,
  calibrationMinSpanDays: 21,
};

export const ACTIVITY_CATEGORIES = ["sedentary", "light", "moderate", "active", "very-active"] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  sedentary: "Sedentary (PAL 1.5 in the Hall webappendix)",
  light: "Light (no published PAL in this model)",
  moderate: "Moderate (no published PAL in this model)",
  active: "Active (no published PAL in this model)",
  "very-active": "Very active (no published PAL in this model)",
};
