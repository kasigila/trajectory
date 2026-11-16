import { ageOn, enumerateDates, isIsoDate, weekday } from "./dates";
import {
  activityTermKcal,
  alternateEnergyClosureKcal,
  centralEnergyClosure,
  initialComposition,
  referencePal,
  sexEquationLabel,
  simulateHall,
  type HallTrajectory,
} from "./hall";
import { HALL, HALL_CITATION, LIMITS, MODEL } from "./parameters";
import type {
  DayField,
  DayOverride,
  DayPlanInput,
  ForecastPoint,
  ForecastResult,
  PhaseRule,
  ProfileInput,
  ResolvedDay,
  RuleSource,
  ScenarioInputs,
} from "./types";

const FIELDS: DayField[] = [
  "intakeKcal",
  "activityMode",
  "activityCategory",
  "steps",
  "pal",
  "explicitActivityKcal",
  "exerciseMinutes",
  "note",
];

export function emptyDay(partial?: Partial<DayPlanInput>): DayPlanInput {
  return {
    intakeKcal: partial?.intakeKcal ?? 0,
    activityMode: partial?.activityMode ?? "category",
    activityCategory: partial?.activityCategory ?? "sedentary",
    steps: partial?.steps ?? 0,
    pal: partial?.pal ?? null,
    explicitActivityKcal: partial?.explicitActivityKcal ?? 0,
    exerciseMinutes: partial?.exerciseMinutes ?? 0,
    note: partial?.note ?? "",
  };
}

export function maintenanceBasis(profile: ProfileInput): number | null {
  const closure = centralEnergyClosure(profile);
  return "kcal" in closure ? closure.kcal : null;
}

export function activityAdjustmentKcal(
  day: Pick<DayPlanInput, "activityMode" | "activityCategory" | "steps" | "explicitActivityKcal" | "exerciseMinutes" | "pal">,
  profile: ProfileInput,
): { kcal: number; ignoredExercise: boolean; unused: string[] } {
  const term = activityTermKcal(day, profile);
  const unused: string[] = [];
  if (day.activityMode === "explicit-kcal") unused.push("pal", "steps", "category");
  else unused.push("explicit");
  if (day.activityMode === "steps") unused.push("steps-not-in-hall");
  if (term.ignoredExercise) unused.push("exercise");
  return { kcal: term.kcal, ignoredExercise: term.ignoredExercise, unused };
}

function inRange(n: number, [min, max]: readonly [number, number]): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

function activePhase(date: string, phases: PhaseRule[]): PhaseRule | null {
  const hits = phases.filter((p) => isIsoDate(p.start) && isIsoDate(p.end) && date >= p.start && date <= p.end);
  if (!hits.length) return null;
  hits.sort((a, b) => a.start.localeCompare(b.start) || phases.indexOf(a) - phases.indexOf(b));
  return hits[hits.length - 1];
}

export function resolveDay(inputs: ScenarioInputs, date: string): ResolvedDay {
  const weekly = inputs.weekly.enabled ? inputs.weekly.days[weekday(date)] : undefined;
  const phase = activePhase(date, inputs.phases);
  const override = inputs.overrides.find((o) => o.date === date);
  const sources = {} as Record<DayField, RuleSource>;
  const picked: Partial<DayPlanInput> = {};
  for (const field of FIELDS) {
    if (override && override.inputs[field] !== undefined) {
      picked[field] = override.inputs[field] as never;
      sources[field] = "override";
    } else if (phase && phase.inputs[field] !== undefined) {
      picked[field] = phase.inputs[field] as never;
      sources[field] = "phase";
    } else if (weekly && weekly[field] !== undefined) {
      picked[field] = weekly[field] as never;
      sources[field] = "weekly";
    } else {
      picked[field] = inputs.baseline[field] as never;
      sources[field] = "baseline";
    }
  }
  const day = emptyDay(picked);
  return {
    ...day,
    date,
    sources,
    phaseId: phase?.id ?? null,
    phaseName: phase?.name ?? null,
  };
}

export function resolvePlan(inputs: ScenarioInputs): ResolvedDay[] {
  return enumerateDates(inputs.startDate, inputs.horizonDays).map((date) => resolveDay(inputs, date));
}

function refuse(code: string, message: string, assumptions: string[] = []): ForecastResult {
  return { status: "refused", points: [], warnings: [], assumptions, refusal: { code, message } };
}

function validate(inputs: ScenarioInputs): { code: string; message: string } | null {
  const profile = inputs.profile;
  if (!isIsoDate(profile.birthDate)) return { code: "birth-date", message: "A valid date of birth is required before a forecast can run." };
  if (!isIsoDate(inputs.startDate)) return { code: "start-date", message: "The scenario start date is not a valid calendar date." };
  if (!Number.isInteger(inputs.horizonDays) || inputs.horizonDays < LIMITS.horizonMin || inputs.horizonDays > LIMITS.horizonMax) {
    return {
      code: "horizon",
      message: `This build runs ${LIMITS.horizonMin} to ${LIMITS.horizonMax} local days. That cap is a software limit, not a validated model horizon.`,
    };
  }
  const age = ageOn(profile.birthDate, inputs.startDate);
  const ageNow = ageOn(profile.birthDate, profile.referenceDate || inputs.startDate);
  if (age < LIMITS.ageMin || ageNow < LIMITS.ageMin) {
    return {
      code: "under-18",
      message: "This product is for adults 18 and older. It does not produce a personalized forecast when the profile is under 18 on the scenario start date.",
    };
  }
  if (age > LIMITS.ageMax) {
    return { code: "age", message: "Check the date of birth. The age on the start date is outside the range this build can store." };
  }
  if (profile.excludedContext !== "none") {
    const why: Record<string, string> = {
      pregnancy: "pregnancy",
      breastfeeding: "breastfeeding",
      "medical-management": "management of a medical condition",
      pediatric: "pediatric use",
      other: "an excluded context you recorded",
    };
    return {
      code: "excluded-context",
      message: `No personalized forecast is shown for ${why[profile.excludedContext] ?? "this context"}. The equations implemented here are the non-pregnant adult model in the Hall 2011 webappendix. This is not a medical assessment.`,
    };
  }
  if (!inRange(profile.heightCm, LIMITS.heightCm)) {
    return {
      code: "height",
      message: `Height must be between ${LIMITS.heightCm[0]} and ${LIMITS.heightCm[1]} cm for this build to store it. The value was not changed. This is an input check, not a clinical rule. Height is used in the Jackson equation and in Mifflin–St Jeor.`,
    };
  }
  if (!inRange(profile.referenceWeightKg, LIMITS.weightKg)) {
    return {
      code: "weight",
      message: `Reference weight must be between ${LIMITS.weightKg[0]} and ${LIMITS.weightKg[1]} kg to start. The value was not changed. This is a software bound, not a clinical rule.`,
    };
  }
  if (!isIsoDate(profile.referenceDate)) {
    return { code: "reference-date", message: "The reference weight needs a valid date." };
  }
  const closure = centralEnergyClosure(profile);
  if ("code" in closure) return closure;
  if (!inRange(closure.kcal, LIMITS.maintenanceKcal)) {
    return {
      code: "maintenance",
      message: "The baseline expenditure is outside the range this build can store. The value was not changed.",
    };
  }
  const pal = referencePal(profile);
  if (pal == null || !inRange(pal, LIMITS.pal)) {
    return {
      code: "activity",
      message: `Reference PAL must be between ${LIMITS.pal[0]} and ${LIMITS.pal[1]}, or the sedentary category (PAL ${HALL.sedentaryPAL} in the webappendix). The value was not changed.`,
    };
  }
  const days = resolvePlan(inputs);
  for (const day of days) {
    if (!inRange(day.intakeKcal, LIMITS.intakeKcal)) {
      return {
        code: "intake",
        message: `Intake on ${day.date} is outside 0–${LIMITS.intakeKcal[1].toLocaleString("en-US")} kcal/day. That software bound keeps the integration defined. It is not a recommendation, and the number was not changed.`,
      };
    }
    if (!inRange(day.steps, LIMITS.steps)) {
      return { code: "steps", message: `Steps on ${day.date} are outside the range this build can store. The value was not changed.` };
    }
    if (!inRange(day.exerciseMinutes, LIMITS.exerciseMinutes)) {
      return { code: "exercise", message: `Exercise minutes on ${day.date} are outside 0–1440. The value was not changed.` };
    }
    if (!inRange(day.explicitActivityKcal, LIMITS.explicitActivityKcal)) {
      return { code: "activity-kcal", message: `Activity energy on ${day.date} is outside the range this build can store. The value was not changed.` };
    }
    if (day.pal != null && !inRange(day.pal, LIMITS.pal)) {
      return {
        code: "activity",
        message: `PAL on ${day.date} is outside ${LIMITS.pal[0]}–${LIMITS.pal[1]}. That is a software bound, not a clinical range. The value was not changed.`,
      };
    }
  }
  return null;
}

function assumptionList(inputs: ScenarioInputs, closureKcal: number, compositionFat: number, compositionLean: number, source: string): string[] {
  const sex = inputs.profile.sexParameter === "parameter-a" ? "men" : inputs.profile.sexParameter === "parameter-b" ? "women" : null;
  const lines = [
    `${MODEL.name} (${MODEL.id} ${MODEL.version}, engine ${MODEL.engineBuild}). ${MODEL.validationStatus.replaceAll("-", " ")}.`,
    HALL_CITATION,
    "This is an implementation of those published equations. It is not a clinically validated medical device, and a point on the chart is not a prediction of a scale reading.",
    "Each point is end-of-day body mass from one forward-Euler day of webappendix equations (3), (6), (7), and (9). The day starts at the previous mass. The first day starts at the reference weight. Days are inclusive local dates. Clock time is not a model step.",
    `Initial fat ${compositionFat.toFixed(2)} kg and lean ${compositionLean.toFixed(2)} kg (${source}). Forbes partition p = C/(C+F) with C = 10.4 kg × ρL/ρF (Forbes 1987, as written in the webappendix). ρF = 39.5 MJ/kg and ρL = 7.6 MJ/kg (Hall, Int J Obes 2008).`,
    `Baseline expenditure used to set K and ΔEI: ${Math.round(closureKcal)} kcal/day. K is the constant fixed by the initial energy-balance condition in the webappendix. 1 kcal = ${4.184} kJ (thermochemical calorie), used only to convert entered kcal into the paper’s kilojoules.`,
    "Expenditure is equation (5)/(9): K + γF F + γL L + δ·BW + TEF + AT + synthesis costs. γF = 13 and γL = 92 kJ/kg/day (Nelson et al., Am J Clin Nutr 1992). ηF = 750 and ηL = 960 kJ/kg (Hall, Br J Nutr 2010). βTEF = 0.1 (Blaxter 1989). βAT = 0.14 and τAT = 14 days (Hall & Jordan, Am J Clin Nutr 2008; webappendix).",
    "δ comes from equation (8): [(1 − βTEF)·PAL − 1] · RMR / reference weight. RMR is the Mifflin–St Jeor equation (Am J Clin Nutr 1990). The only PAL the webappendix states is sedentary PAL 1.5. A different PAL is used only when you enter one. Step counts and exercise minutes have no published coefficient here, so they are stored and not added.",
    "Glycogen equation (1) and extracellular-fluid equation (2) are not integrated, because carbohydrate intake and dietary sodium are not collected. With those fluxes at zero, that constant mass is absorbed into K and does not move the weight trajectory.",
    "The shaded band is the envelope of the same equations under published input sensitivity: initial fat ± the Jackson et al. 2002 standard error of estimate when equation (4) supplied the fat mass (4.6 percentage points for men, 4.4 for women), and the other baseline-expenditure closure (the number you entered, or PAL × Mifflin–St Jeor RMR). It is a sensitivity range, not a confidence interval and not a prediction interval.",
    "Weigh-ins are not inputs to this run. Saving a weigh-in does not change the plan or this forecast.",
    "Notes on a day are context only. They do not change the arithmetic.",
    inputs.horizonDays > LIMITS.horizonWarnAfter
      ? `The webappendix does not state a validated personal horizon for this browser build. Days after day ${LIMITS.horizonWarnAfter} are shown as the same equations run further out. The band is sensitivity, not growing statistical confidence.`
      : "The band is input sensitivity, not a statistical prediction interval.",
  ];
  if (sex) lines.push(`Sex-related model input: ${sexEquationLabel(sex)}. This is the equation set, not a statement of identity.`);
  if (inputs.profile.bodyFatPct != null && inputs.profile.leanMassKg != null) {
    lines.push("Both a body-fat percent and a lean mass were stored. Initial fat uses the body-fat percent so the two are not mixed. The Jackson error is not applied to an entered fat mass.");
  }
  if (inputs.profile.referenceDate !== inputs.startDate) {
    lines.push("The reference weight date and the scenario start date differ. The integration still begins the first scenario day at the reference weight. It does not fill the gap.");
  }
  if (inputs.profile.calibrationNote) lines.push(inputs.profile.calibrationNote);
  return lines;
}

function fatForSee(profile: ProfileInput, composition: { fatPercent: number; seePct: number | null; sex: "men" | "women"; ageYears: number }, shift: number): { fatKg: number; leanKg: number } | null {
  if (composition.seePct == null || shift === 0) return null;
  const percent = composition.fatPercent + shift * composition.seePct;
  const fatKg = (profile.referenceWeightKg * percent) / 100;
  const leanKg = profile.referenceWeightKg - fatKg;
  if (!(fatKg > 0) || !(leanKg > 0)) return null;
  return { fatKg, leanKg };
}

export function runForecast(inputs: ScenarioInputs): ForecastResult {
  const problem = validate(inputs);
  if (problem) return refuse(problem.code, problem.message);
  const composition = initialComposition(inputs.profile, inputs.profile.referenceDate);
  if ("code" in composition) return refuse(composition.code, composition.message);
  const closure = centralEnergyClosure(inputs.profile);
  if ("code" in closure) return refuse(closure.code, closure.message);
  const days = resolvePlan(inputs);
  const source =
    composition.source === "jackson"
      ? `Jackson et al. 2002 equation (4), ${composition.sex}, ${composition.fatPercent.toFixed(1)}% fat, SEE ${composition.seePct} percentage points`
      : composition.source === "entered-fat-percent"
        ? `entered body fat ${composition.fatPercent.toFixed(1)}%`
        : `entered lean mass, implied fat ${composition.fatPercent.toFixed(1)}%`;
  const assumptions = assumptionList(inputs, closure.kcal, composition.fatKg, composition.leanKg, source);
  const central = simulateHall(days, inputs.profile, closure.kcal, composition.fatKg, composition.leanKg);
  if ("code" in central) return refuse(central.code, central.message, assumptions);

  const arms: HallTrajectory[] = [central];
  const warnings: string[] = [];
  const down = fatForSee(inputs.profile, composition, -1);
  const up = fatForSee(inputs.profile, composition, 1);
  for (const arm of [down, up]) {
    if (!arm) continue;
    const run = simulateHall(days, inputs.profile, closure.kcal, arm.fatKg, arm.leanKg);
    if ("code" in run) {
      warnings.push("One Jackson standard-error arm did not stay in the positive fat and lean domain, so it was left out of the range. The central path was not clamped.");
    } else arms.push(run);
  }
  if (composition.seePct != null) {
    warnings.push(
      `The range includes initial fat at the Jackson et al. 2002 regression ± ${composition.seePct} percentage points (the standard error of estimate for that equation). That is input sensitivity, not a confidence interval for a future scale weight.`,
    );
  }
  const alternate = alternateEnergyClosureKcal(inputs.profile, closure);
  if (alternate != null && Math.abs(alternate - closure.kcal) >= 1 && inRange(alternate, LIMITS.maintenanceKcal)) {
    const run = simulateHall(days, inputs.profile, alternate, composition.fatKg, composition.leanKg);
    if (!("code" in run)) {
      arms.push(run);
      warnings.push(
        `The range also includes the other baseline closure: ${Math.round(alternate)} kcal/day versus ${Math.round(closure.kcal)} kcal/day. One is the number on the profile. The other is reference PAL × Mifflin–St Jeor RMR, the expenditure implied by the webappendix’s definition of PAL.`,
      );
    }
  }
  if (inputs.horizonDays > LIMITS.horizonWarnAfter) {
    warnings.push(`The ${inputs.horizonDays}-day view past day ${LIMITS.horizonWarnAfter} continues the same equations. No personal prediction interval was added.`);
  }
  if (days.some((day) => day.activityMode === "steps")) {
    warnings.push("On steps mode, the step count is stored and is not converted to energy. Equation (8) uses PAL. The reference PAL was kept unless a PAL was entered.");
  }
  if (days.some((day) => day.exerciseMinutes > 0)) {
    warnings.push("Exercise minutes are stored and are not given a kcal-per-minute cost. The Hall webappendix does not state one. They are not added on top of PAL or explicit activity energy.");
  }
  if (days.some((day) => day.activityMode === "explicit-kcal" && day.exerciseMinutes > 0)) {
    warnings.push("Structured exercise minutes were ignored on days that use explicit activity energy, so the two are not double-counted.");
  }
  if (days.some((day) => day.activityMode === "category" && day.activityCategory !== "sedentary" && day.pal == null)) {
    warnings.push("A non-sedentary category has no PAL in the 2011 webappendix. Those days use the reference PAL. Enter a PAL if the category should change expenditure.");
  }

  const points: ForecastPoint[] = days.map((day, i) => {
    const masses = arms.map((arm) => arm.points[i].endKg);
    return {
      date: day.date,
      centralKg: central.points[i].endKg,
      lowerKg: Math.min(...masses),
      upperKg: Math.max(...masses),
      boundType: "sensitivity-range",
      expenditureKcal: central.points[i].expenditureKcal,
      intakeKcal: day.intakeKcal,
      massBeforeKg: central.points[i].startKg,
    };
  });
  return { status: "complete", points, warnings, assumptions, refusal: null };
}

export function prefixMatches(previous: ForecastPoint[], next: ForecastPoint[], editDate: string): boolean {
  const limit = previous.findIndex((p) => p.date >= editDate);
  const count = limit === -1 ? previous.length : limit;
  for (let i = 0; i < count; i++) {
    const a = previous[i];
    const b = next[i];
    if (!a || !b || a.date !== b.date) return false;
    if (Math.abs(a.centralKg - b.centralKg) > 1e-9) return false;
    if (Math.abs(a.lowerKg - b.lowerKg) > 1e-9) return false;
    if (Math.abs(a.upperKg - b.upperKg) > 1e-9) return false;
  }
  return true;
}

export function applyRangeOverride(inputs: ScenarioInputs, start: string, end: string, patch: Partial<DayPlanInput>, note?: string): ScenarioInputs {
  const next: ScenarioInputs = structuredClone(inputs);
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const dates = enumerateDates(from, Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000) + 1);
  for (const date of dates) {
    const existing = next.overrides.find((o) => o.date === date);
    if (existing) {
      existing.inputs = { ...existing.inputs, ...patch };
      if (note !== undefined) existing.note = note;
    } else {
      const created: DayOverride = { date, inputs: { ...patch }, note: note ?? "" };
      next.overrides.push(created);
    }
  }
  next.overrides.sort((a, b) => a.date.localeCompare(b.date));
  return next;
}

export function clearOverrides(inputs: ScenarioInputs, start: string, end: string): ScenarioInputs {
  const next: ScenarioInputs = structuredClone(inputs);
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  next.overrides = next.overrides.filter((o) => o.date < from || o.date > to);
  return next;
}

export function stableString(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function canonicalSnapshot(inputs: ScenarioInputs): string {
  return stableString(inputs);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortValue(v)]));
  }
  return value;
}

export function sourceLabel(source: RuleSource, day: ResolvedDay): string {
  if (source === "override") return "Single-day override";
  if (source === "phase") return `Phase · ${day.phaseName ?? "Untitled phase"}`;
  if (source === "weekly") return "Weekday template";
  return "Baseline";
}

export { MODEL };
