/**
 * Discrete daily step of the published Hall adult model.
 *
 * Hall KD et al. Lancet. 2011;378:826–837. Supplementary webappendix,
 * “Dynamic Mathematical Model of Body Weight Change in Adults.”
 *
 * Implemented, with the paper’s symbols:
 *   (3) fat and lean partition, with glycogen flux set to 0 (see below)
 *   (4) Jackson et al. 2002 initial fat mass when no fat mass was entered
 *   (5) energy expenditure
 *   (6) thermic effect of feeding, TEF = βTEF · ΔEI
 *   (7) adaptive thermogenesis, τAT · dAT/dt = βAT · ΔEI − AT
 *   (8) δ from PAL, with RMR from Mifflin–St Jeor 1990
 *   (9) closed-form EE after substituting (3) into (5)
 *   Forbes partition p = C / (C + F), C = 10.4 kg · ρL / ρF
 *   (12) effective energy density, used only by the separate retrospective sketch
 *
 * Equations (1) and (2) (glycogen and extracellular fluid) are not integrated.
 * They need dietary carbohydrate and sodium, which this product does not collect.
 * The webappendix states that glycogen and ECF stabilize and their flux terms
 * become negligible after the early phase. With those fluxes at zero, the
 * constant glycogen, its water, and ECF are absorbed into the lean term.
 * K is then fixed by the initial energy-balance condition, which is the
 * webappendix’s definition of K, so a constant fluid mass does not change
 * the weight trajectory.
 *
 * The one-day step is forward Euler on the published differential equations.
 * The step size is the plan’s local day. It is not an additional physiological constant.
 *
 * Sex enters only as the published men or women form of equation (4) and of
 * Mifflin–St Jeor. It is a model input. An unspecified value is not guessed.
 */

import { ageOn } from "./dates";
import { HALL, KJ_PER_KCAL, LIMITS } from "./parameters";
import type { DayPlanInput, ProfileInput, ResolvedDay } from "./types";

const RHO_F = HALL.rhoF_MJ_per_kg * 1000;
const RHO_L = HALL.rhoL_MJ_per_kg * 1000;
/** Energy-partition constant in equation (3): C = 10.4 kg × ρL / ρF. */
const FORBES_ENERGY_C = HALL.forbesKg * (RHO_L / RHO_F);

export type SexEquation = "men" | "women";

export function sexEquation(profile: ProfileInput): SexEquation | null {
  if (profile.sexParameter === "parameter-a") return "men";
  if (profile.sexParameter === "parameter-b") return "women";
  return null;
}

export function sexEquationLabel(sex: SexEquation): string {
  return sex === "men" ? "men’s equations (Jackson 2002; Mifflin–St Jeor 1990)" : "women’s equations (Jackson 2002; Mifflin–St Jeor 1990)";
}

/** Mifflin MD et al. Am J Clin Nutr. 1990;51:241–247. kcal/day. */
export function mifflinRmrKcal(sex: SexEquation, weightKg: number, heightCm: number, ageYears: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === "men" ? base + 5 : base - 161;
}

/**
 * Jackson et al. Int J Obes. 2002;26:789–796, as copied in webappendix equation (4).
 * Returns percent body fat, not fat mass.
 */
export function jacksonFatPercent(sex: SexEquation, ageYears: number, weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const lnBmi = Math.log(bmi);
  if (sex === "men") return 0.14 * ageYears + 37.31 * lnBmi - 103.94;
  return 0.14 * ageYears + 39.96 * lnBmi - 102.01;
}

export function jacksonSeePct(sex: SexEquation): number {
  return sex === "men" ? HALL.jacksonSeeMenPct : HALL.jacksonSeeWomenPct;
}

/** Webappendix equation (8). δ in kJ/kg/day. RMR in kJ/day. */
export function deltaFromPal(pal: number, rmrKjPerDay: number, weightKg: number): number {
  return ((1 - HALL.betaTEF) * pal - 1) * (rmrKjPerDay / weightKg);
}

export interface Composition {
  fatKg: number;
  leanKg: number;
  fatPercent: number;
  source: "jackson" | "entered-fat-percent" | "entered-lean-mass";
  seePct: number | null;
  sex: SexEquation;
  ageYears: number;
}

export function initialComposition(profile: ProfileInput, onDate: string): Composition | { code: string; message: string } {
  const sex = sexEquation(profile);
  if (!sex) {
    return {
      code: "sex-parameter",
      message:
        "The Hall model needs the published men’s or women’s form of the Jackson fat equation and the Mifflin–St Jeor resting-expenditure equation. The sex-related parameter was left unspecified, and nothing was guessed. Choose a parameter set. It is a model input, not a statement of identity. No forecast was created.",
    };
  }
  const ageYears = ageOn(profile.birthDate, onDate);
  const weight = profile.referenceWeightKg;
  let fatPercent: number;
  let source: Composition["source"];
  let seePct: number | null;
  if (profile.bodyFatPct != null) {
    fatPercent = profile.bodyFatPct;
    source = "entered-fat-percent";
    seePct = jacksonSeePct(sex);
  } else if (profile.leanMassKg != null) {
    fatPercent = ((weight - profile.leanMassKg) / weight) * 100;
    source = "entered-lean-mass";
    seePct = jacksonSeePct(sex);
  } else {
    fatPercent = jacksonFatPercent(sex, ageYears, weight, profile.heightCm);
    source = "jackson";
    seePct = jacksonSeePct(sex);
  }
  const fatKg = (weight * fatPercent) / 100;
  const leanKg = weight - fatKg;
  if (!(fatKg > 0) || !(leanKg > 0)) {
    return {
      code: "body-composition",
      message:
        "Initial fat and lean mass have to both be positive before the Forbes partition can be evaluated. The result was not clamped, and no forecast was created. Check height, reference weight, age, and any body-fat number you entered.",
    };
  }
  return { fatKg, leanKg, fatPercent, source, seePct, sex, ageYears };
}

export function referencePal(profile: ProfileInput): number | null {
  const entered = profile.referenceActivity.pal;
  if (Number.isFinite(entered) && entered > 0) return entered;
  if (profile.referenceActivity.category === "sedentary") return HALL.sedentaryPAL;
  return null;
}

/** PAL × Mifflin RMR. The webappendix defines PAL as EE / RMR and uses Mifflin in equation (8). */
export function modelEstimatedExpenditureKcal(profile: ProfileInput): number | { code: string; message: string } {
  const sex = sexEquation(profile);
  const pal = referencePal(profile);
  if (!sex || pal == null) {
    return {
      code: "maintenance",
      message: "A model-estimated baseline needs the men’s or women’s parameter set and a reference PAL. Nothing was filled in.",
    };
  }
  const age = ageOn(profile.birthDate, profile.referenceDate);
  const rmr = mifflinRmrKcal(sex, profile.referenceWeightKg, profile.heightCm, age);
  return pal * rmr;
}

export interface EnergyClosure {
  kcal: number;
  kind: "user-estimate" | "model-estimated" | "accepted-retrospective-sketch";
}

export function centralEnergyClosure(profile: ProfileInput): EnergyClosure | { code: string; message: string } {
  if (profile.energyBasis === "model-estimated") {
    const modeled = modelEstimatedExpenditureKcal(profile);
    if (typeof modeled !== "number") return modeled;
    return { kcal: modeled, kind: "model-estimated" };
  }
  if (profile.maintenanceKcal == null || !Number.isFinite(profile.maintenanceKcal)) {
    return {
      code: "maintenance",
      message: "Enter a baseline energy expenditure, or choose the model estimate (reference PAL × Mifflin–St Jeor RMR). The field was not filled in.",
    };
  }
  return {
    kcal: profile.maintenanceKcal,
    kind: profile.energyBasis === "accepted-retrospective-sketch" ? "accepted-retrospective-sketch" : "user-estimate",
  };
}

/** The other published closure, used only as a sensitivity arm. */
export function alternateEnergyClosureKcal(profile: ProfileInput, central: EnergyClosure): number | null {
  const modeled = modelEstimatedExpenditureKcal(profile);
  if (typeof modeled !== "number") return null;
  if (central.kind === "model-estimated") {
    if (profile.maintenanceKcal == null || !Number.isFinite(profile.maintenanceKcal)) return null;
    return profile.maintenanceKcal;
  }
  return modeled;
}

export interface ActivityTerm {
  kilojoules: number;
  pal: number | null;
  ignoredExercise: boolean;
  stepsNotConverted: boolean;
  categoryUnmapped: boolean;
}

export function activityTerm(day: Pick<DayPlanInput, "activityMode" | "activityCategory" | "steps" | "explicitActivityKcal" | "exerciseMinutes" | "pal">, profile: ProfileInput, currentWeightKg: number): ActivityTerm | { code: string; message: string } {
  const ignoredExercise = day.exerciseMinutes > 0;
  if (day.activityMode === "explicit-kcal") {
    return {
      kilojoules: day.explicitActivityKcal * KJ_PER_KCAL,
      pal: null,
      ignoredExercise,
      stepsNotConverted: day.steps > 0,
      categoryUnmapped: false,
    };
  }
  let pal = day.pal;
  let categoryUnmapped = false;
  if (pal == null || !Number.isFinite(pal)) {
    pal = referencePal(profile);
    categoryUnmapped = day.activityMode === "category" && day.activityCategory !== "sedentary";
  }
  if (pal == null || !Number.isFinite(pal)) {
    return {
      code: "activity",
      message: "Enter a physical activity level (PAL) or an explicit activity energy. The Hall webappendix does not publish a steps-to-energy coefficient, and only sedentary PAL 1.5 is stated. Nothing was invented, and the plan was not changed.",
    };
  }
  if (pal < LIMITS.pal[0] || pal > LIMITS.pal[1]) {
    return {
      code: "activity",
      message: `PAL ${pal} is outside ${LIMITS.pal[0]}–${LIMITS.pal[1]}. That is a software bound so equation (8) stays defined, not a clinical activity range. The value was not changed.`,
    };
  }
  const sex = sexEquation(profile);
  if (!sex) {
    return { code: "sex-parameter", message: "PAL cannot be converted to δ without the Mifflin–St Jeor equation, which is published separately for men and women." };
  }
  const age = ageOn(profile.birthDate, profile.referenceDate);
  const rmrKj = mifflinRmrKcal(sex, profile.referenceWeightKg, profile.heightCm, age) * KJ_PER_KCAL;
  const delta = deltaFromPal(pal, rmrKj, profile.referenceWeightKg);
  return {
    kilojoules: delta * currentWeightKg,
    pal,
    ignoredExercise,
    stepsNotConverted: day.activityMode === "steps",
    categoryUnmapped,
  };
}

/** Activity term in kcal at the reference weight, for plan diffs. Not a second model. */
export function activityTermKcal(day: Pick<DayPlanInput, "activityMode" | "activityCategory" | "steps" | "explicitActivityKcal" | "exerciseMinutes" | "pal">, profile: ProfileInput): { kcal: number; ignoredExercise: boolean } {
  const term = activityTerm(day, profile, profile.referenceWeightKg);
  if ("code" in term) return { kcal: Number.NaN, ignoredExercise: day.exerciseMinutes > 0 };
  return { kcal: term.kilojoules / KJ_PER_KCAL, ignoredExercise: term.ignoredExercise };
}

export interface HallPoint {
  startKg: number;
  endKg: number;
  fatKg: number;
  leanKg: number;
  expenditureKcal: number;
  intakeKcal: number;
  /** ρF·ΔF + ρL·ΔL − (EI − EE). Zero when equation (9) is applied with dG/dt = 0. */
  balanceResidualKj: number;
}

export interface HallTrajectory {
  points: HallPoint[];
  fat0Kg: number;
  lean0Kg: number;
  kKjPerDay: number;
  warnings: string[];
}

/**
 * Integrate equations (3), (6), (7), and (9) one local day at a time.
 * `expenditureKcal` is the initial balanced expenditure EI0 = EE0 used to set K and ΔEI.
 */
export function simulateHall(days: ResolvedDay[], profile: ProfileInput, expenditureKcal: number, fatKg: number, leanKg: number): HallTrajectory | { code: string; message: string } {
  const sex = sexEquation(profile);
  if (!sex) {
    return { code: "sex-parameter", message: "The parameter set is missing, so the run was not started." };
  }
  if (!(fatKg > 0) || !(leanKg > 0)) {
    return { code: "body-composition", message: "Fat and lean mass must both stay positive. No value was clamped." };
  }
  const weight0 = fatKg + leanKg;
  const age = ageOn(profile.birthDate, profile.referenceDate);
  const rmrKj = mifflinRmrKcal(sex, profile.referenceWeightKg, profile.heightCm, age) * KJ_PER_KCAL;
  const pal0 = referencePal(profile);
  if (pal0 == null) {
    return {
      code: "activity",
      message: "The reference PAL is missing, so δ cannot be estimated from equation (8). Set PAL. Sedentary in the webappendix is 1.5.",
    };
  }
  const delta0 = deltaFromPal(pal0, rmrKj, profile.referenceWeightKg);
  const ei0 = expenditureKcal * KJ_PER_KCAL;
  // K from the initial energy-balance condition: EE0 = K + γF F + γL L + δ BW, with TEF = AT = 0.
  const k = ei0 - HALL.gammaF_kJ_per_kg_day * fatKg - HALL.gammaL_kJ_per_kg_day * leanKg - delta0 * weight0;
  let fat = fatKg;
  let lean = leanKg;
  let at = 0;
  const points: HallPoint[] = [];
  const warnings: string[] = [];
  for (const day of days) {
    const start = fat + lean;
    const term = activityTerm(day, profile, start);
    if ("code" in term) return term;
    const intakeKj = day.intakeKcal * KJ_PER_KCAL;
    const deltaEi = intakeKj - ei0;
    const tef = HALL.betaTEF * deltaEi;
    const p = FORBES_ENERGY_C / (FORBES_ENERGY_C + fat);
    const phi = (p * HALL.etaL_kJ_per_kg) / RHO_L + ((1 - p) * HALL.etaF_kJ_per_kg) / RHO_F;
    const numerator =
      k +
      HALL.gammaF_kJ_per_kg_day * fat +
      HALL.gammaL_kJ_per_kg_day * lean +
      term.kilojoules +
      tef +
      at +
      phi * intakeKj;
    const ee = numerator / (1 + phi);
    const imbalance = intakeKj - ee;
    const dFat = ((1 - p) * imbalance) / RHO_F;
    const dLean = (p * imbalance) / RHO_L;
    const dAt = (HALL.betaAT * deltaEi - at) / HALL.tauAT_days;
    const residual = RHO_F * dFat + RHO_L * dLean - imbalance;
    fat += dFat;
    lean += dLean;
    at += dAt;
    const end = fat + lean;
    if (!Number.isFinite(end) || fat <= 0 || lean <= 0 || end < LIMITS.numericMassKg[0] || end > LIMITS.numericMassKg[1]) {
      return {
        code: "numeric-domain",
        message: `The Hall integration stopped because a day would leave fat, lean, or body mass outside a defined positive range (${LIMITS.numericMassKg[0]}–${LIMITS.numericMassKg[1]} kg for body mass). Nothing was clamped, and the plan was not changed.`,
      };
    }
    points.push({
      startKg: start,
      endKg: end,
      fatKg: fat,
      leanKg: lean,
      expenditureKcal: ee / KJ_PER_KCAL,
      intakeKcal: day.intakeKcal,
      balanceResidualKj: residual,
    });
  }
  return { points, fat0Kg: fatKg, lean0Kg: leanKg, kKjPerDay: k, warnings };
}

/**
 * Linearized effective energy density, webappendix equation (12).
 * α = C / F0 with C = 10.4 kg, the Forbes parameter as stated for the linearized model.
 * β = βAT + βTEF. Returned in kcal/kg for the retrospective sketch only.
 */
export function linearizedDensityKcalPerKg(fatKg: number): number {
  const alpha = HALL.forbesKg / fatKg;
  const beta = HALL.betaAT + HALL.betaTEF;
  const rhoKj =
    (HALL.etaF_kJ_per_kg + RHO_F + alpha * (HALL.etaL_kJ_per_kg + RHO_L)) / ((1 - beta) * (1 + alpha));
  return rhoKj / KJ_PER_KCAL;
}
