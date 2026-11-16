import { LIMITS } from "./parameters";
import { formatKg } from "./units";

/** One set of software bounds for onboarding, the simulator, and progress. Not clinical ranges. */

export function weightBoundMessage(kg: number, unit: "kg" | "lb" = "kg") {
  if (!Number.isFinite(kg) || kg < LIMITS.weightKg[0] || kg > LIMITS.weightKg[1]) {
    return `Weight must be between ${formatKg(LIMITS.weightKg[0], unit)} and ${formatKg(LIMITS.weightKg[1], unit)}. The value was not changed. This is a software bound, not a clinical limit.`;
  }
  return null;
}

export function bodyFatBoundMessage(pct: number) {
  if (!Number.isFinite(pct) || pct < LIMITS.bodyFatPct[0] || pct > LIMITS.bodyFatPct[1]) {
    return `Body fat must be between ${LIMITS.bodyFatPct[0]} and ${LIMITS.bodyFatPct[1]} percent, or left blank. The value was not changed.`;
  }
  return null;
}

export function leanBoundMessage(lean: number, weightKg: number, unit: "kg" | "lb" = "kg") {
  if (!Number.isFinite(lean) || lean < LIMITS.leanMassKg[0] || lean > LIMITS.leanMassKg[1] || !(lean < weightKg)) {
    return `Lean mass must be between ${formatKg(LIMITS.leanMassKg[0], unit)} and ${formatKg(LIMITS.leanMassKg[1], unit)} and below the reference weight, or left blank. The value was not changed.`;
  }
  return null;
}

export function waistBoundMessage(cm: number) {
  if (!Number.isFinite(cm) || cm < LIMITS.waistCm[0] || cm > LIMITS.waistCm[1]) {
    return `Waist must be between ${LIMITS.waistCm[0]} and ${LIMITS.waistCm[1]} cm to be stored. The value was not changed. This is a software bound, not a clinical measure.`;
  }
  return null;
}

export function horizonBoundMessage(days: number) {
  if (!Number.isInteger(days) || days < LIMITS.horizonMin || days > LIMITS.horizonMax) {
    return `Horizon must be a whole number from ${LIMITS.horizonMin} to ${LIMITS.horizonMax} days. It was not changed.`;
  }
  return null;
}

export function intakeBoundMessage(kcal: number): { error: string | null; warning: string | null } {
  if (!Number.isFinite(kcal) || kcal < LIMITS.intakeKcal[0] || kcal > LIMITS.intakeKcal[1]) {
    return {
      error: `Intake must be between ${LIMITS.intakeKcal[0]} and ${LIMITS.intakeKcal[1]} kcal. It was not changed.`,
      warning: null,
    };
  }
  if (kcal < LIMITS.intakeWarnKcal[0] || kcal > LIMITS.intakeWarnKcal[1]) {
    return {
      error: null,
      warning: `${kcal} kcal is outside ${LIMITS.intakeWarnKcal[0]}–${LIMITS.intakeWarnKcal[1]} kcal/day. It can still be saved. This is a software warning, not a recommendation.`,
    };
  }
  return { error: null, warning: null };
}
