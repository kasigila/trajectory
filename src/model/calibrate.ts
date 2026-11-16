import { diffDays } from "./dates";
import { maintenanceBasis, resolvePlan } from "./engine";
import { initialComposition, linearizedDensityKcalPerKg } from "./hall";
import { PRODUCT } from "./parameters";
import { smoothObservations, type ObservationPoint } from "./trend";
import type { ScenarioInputs } from "./types";

export interface CalibrationProposal {
  eligible: boolean;
  reason: string;
  proposedMaintenanceKcal: number | null;
  meanIntakeKcal: number | null;
  trendChangeKg: number | null;
  spanDays: number;
  readingCount: number;
  windowStart: string | null;
  windowEnd: string | null;
}

/**
 * Retrospective expenditure sketch, separate from the forward Hall integration.
 * The coverage counts are a product rule, not a Hall constant and not a clinical cutoff.
 * The energy density is webappendix equation (12) at the initial fat mass.
 */
export function proposeCalibration(inputs: ScenarioInputs, observations: ObservationPoint[]): CalibrationProposal {
  const readings = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const base = {
    readingCount: readings.length,
    spanDays: readings.length >= 2 ? diffDays(readings[readings.length - 1].date, readings[0].date) : 0,
    windowStart: readings[0]?.date ?? null,
    windowEnd: readings.at(-1)?.date ?? null,
    proposedMaintenanceKcal: null,
    meanIntakeKcal: null,
    trendChangeKg: null,
  };
  const placeholder = `Personalized calibration stays off until there are at least ${PRODUCT.calibrationMinReadings} weigh-ins spanning ${PRODUCT.calibrationMinSpanDays} days. That coverage rule is a product limit, not a Hall constant and not a clinical criterion. The plan is left as you wrote it.`;
  if (readings.length < PRODUCT.calibrationMinReadings || base.spanDays < PRODUCT.calibrationMinSpanDays) {
    return { ...base, eligible: false, reason: `Not enough reliable data yet. ${placeholder}` };
  }
  const trend = smoothObservations(readings);
  if (trend.length < 2) {
    return { ...base, eligible: false, reason: `Not enough reliable data yet. ${placeholder}` };
  }
  if (!Number.isFinite(inputs.horizonDays) || inputs.horizonDays < 1) {
    return { ...base, eligible: false, reason: "A saved plan with intake assumptions is needed before an expenditure sketch can be described." };
  }
  let intakeSum = 0;
  let intakeDays = 0;
  const start = trend[0].date;
  const end = trend[trend.length - 1].date;
  const resolved = resolvePlan(inputs).filter((d) => d.date >= start && d.date <= end);
  for (const day of resolved) {
    intakeSum += day.intakeKcal;
    intakeDays += 1;
  }
  if (intakeDays === 0) {
    return {
      ...base,
      eligible: false,
      reason: "The weigh-ins fall outside this scenario's dates, so assumed intake cannot be lined up with them. Nothing was estimated.",
    };
  }
  const meanIntake = intakeSum / intakeDays;
  const trendChange = trend[trend.length - 1].kg - trend[0].kg;
  const span = Math.max(1, diffDays(end, start));
  const composition = initialComposition(inputs.profile, inputs.profile.referenceDate);
  if ("code" in composition) {
    return { ...base, eligible: false, reason: composition.message };
  }
  const density = linearizedDensityKcalPerKg(composition.fatKg);
  const implied = meanIntake - (trendChange * density) / span;
  if (!Number.isFinite(implied)) {
    return { ...base, eligible: false, reason: "The retrospective sketch could not be completed from these readings." };
  }
  return {
    ...base,
    eligible: true,
    meanIntakeKcal: meanIntake,
    trendChangeKg: trendChange,
    proposedMaintenanceKcal: implied,
    reason: "This sketch suggests a new baseline. Accepting it saves that baseline on a new version. The plan stays as it is until you edit it.",
  };
}

export function calibrationAssumptions(proposal: CalibrationProposal): string {
  const kcal = proposal.proposedMaintenanceKcal == null ? "unavailable" : `${Math.round(proposal.proposedMaintenanceKcal)} kcal/day`;
  return `Retrospective sketch using Hall equation (12): ${kcal}. Window ${proposal.windowStart ?? "—"} to ${proposal.windowEnd ?? "—"} (${proposal.readingCount} readings, ${proposal.spanDays} days). Coverage rule: ${PRODUCT.calibrationMinReadings} readings and ${PRODUCT.calibrationMinSpanDays} days. Not the forward integration. The forward plan was not edited automatically.`;
}

export function basisOrNull(inputs: ScenarioInputs): number | null {
  return maintenanceBasis(inputs.profile);
}
