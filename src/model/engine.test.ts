import { describe, expect, it } from "vitest";
import { proposeCalibration } from "./calibrate";
import { parseCsv, parseLooseDate, parseNumber } from "./csv";
import { addDays, ageOn, datesInRange } from "./dates";
import { applyRangeOverride, clearOverrides, prefixMatches, resolveDay, resolvePlan, runForecast } from "./engine";
import { explainChange } from "./explain";
import { initialComposition, simulateHall } from "./hall";
import type { ScenarioInputs } from "./types";
import { kgToLb, lbToKg } from "./units";

function inputs(partial?: Partial<ScenarioInputs>): ScenarioInputs {
  const base: ScenarioInputs = {
    name: "Test",
    description: "",
    labels: [],
    startDate: "2026-01-01",
    horizonDays: 30,
    timeZone: "America/Toronto",
    baseline: {
      intakeKcal: 2500,
      activityMode: "category",
      activityCategory: "sedentary",
      steps: 8000,
      pal: null,
      explicitActivityKcal: 0,
      exerciseMinutes: 0,
      note: "",
    },
    weekly: { enabled: false, days: {} },
    phases: [],
    overrides: [],
    goal: null,
    milestones: [],
    profile: {
      birthDate: "1990-01-01",
      heightCm: 178,
      referenceWeightKg: 86,
      referenceDate: "2026-01-01",
      sexParameter: "parameter-a",
      bodyFatPct: null,
      bodyFatSource: "",
      bodyFatConfidence: "unspecified",
      leanMassKg: null,
      energyBasis: "user-estimate",
      maintenanceKcal: 2700,
      calibrationNote: null,
      referenceActivity: { category: "sedentary", steps: 8000, pal: 1.5 },
      excludedContext: "none",
      excludedDetail: "",
    },
  };
  return { ...base, ...partial, profile: { ...base.profile, ...partial?.profile }, baseline: { ...base.baseline, ...partial?.baseline } };
}

describe("plan precedence", () => {
  it("uses override over phase over weekly over baseline", () => {
    const plan = inputs({
      weekly: { enabled: true, days: { 4: { intakeKcal: 2300 } } },
      phases: [{ id: "p", name: "Shift", start: "2026-01-01", end: "2026-01-31", inputs: { intakeKcal: 2100 }, note: "" }],
      overrides: [{ date: "2026-01-01", inputs: { intakeKcal: 3000 }, note: "one day" }],
    });
    expect(resolveDay(plan, "2026-01-01").intakeKcal).toBe(3000);
    expect(resolveDay(plan, "2026-01-01").sources.intakeKcal).toBe("override");
    expect(resolveDay(plan, "2026-01-02").intakeKcal).toBe(2100);
    expect(resolveDay(plan, "2026-01-02").sources.intakeKcal).toBe("phase");
    const cleared = clearOverrides(plan, "2026-01-01", "2026-01-01");
    expect(resolveDay(cleared, "2026-01-01").intakeKcal).toBe(2100);
  });

  it("keeps a single-day override when the weekly template changes", () => {
    const plan = inputs({
      weekly: { enabled: true, days: { 0: { intakeKcal: 2800 } } },
      overrides: [{ date: "2026-01-04", inputs: { intakeKcal: 1900 }, note: "" }],
    });
    expect(resolveDay(plan, "2026-01-04").intakeKcal).toBe(1900);
    expect(resolveDay(plan, "2026-01-11").intakeKcal).toBe(2800);
  });
});

describe("forecast contract", () => {
  it("is deterministic and always has a sensitivity range", () => {
    const plan = inputs();
    const a = runForecast(plan);
    const b = runForecast(plan);
    expect(a.status).toBe("complete");
    expect(a.points).toEqual(b.points);
    for (const point of a.points) {
      expect(point.lowerKg).toBeLessThanOrEqual(point.centralKg);
      expect(point.upperKg).toBeGreaterThanOrEqual(point.centralKg);
      expect(point.boundType).toBe("sensitivity-range");
    }
    const last = a.points.at(-1)!;
    expect(last.upperKg - last.lowerKg).toBeGreaterThan(0.05);
  });

  it("does not rewrite days before an edit", () => {
    const before = inputs();
    const previous = runForecast(before);
    const after = applyRangeOverride(before, "2026-01-15", "2026-01-15", { intakeKcal: 1800 });
    const next = runForecast(after);
    expect(prefixMatches(previous.points, next.points, "2026-01-15")).toBe(true);
    expect(next.points[14].centralKg).not.toBeCloseTo(previous.points[14].centralKg, 4);
    expect(next.points[13].centralKg).toBeCloseTo(previous.points[13].centralKg, 8);
    const explained = explainChange(before, previous.points, after, next.points);
    expect(explained.prefixUnchanged).toBe(true);
    expect(explained.firstDivergence).toBe("2026-01-15");
    expect(explained.narrative).toMatch(/not overwritten/i);
  });

  it("moves the later path down when intake stays lower", () => {
    const high = runForecast(inputs());
    const low = runForecast(inputs({
      baseline: { intakeKcal: 1800, activityMode: "category", activityCategory: "sedentary", steps: 8000, pal: null, explicitActivityKcal: 0, exerciseMinutes: 0, note: "" },
    }));
    expect(low.points.at(-1)!.centralKg).toBeLessThan(high.points.at(-1)!.centralKg);
  });

  it("moves the later path down when explicit activity energy is higher", () => {
    const rest = runForecast(inputs());
    const moving = runForecast(inputs({
      baseline: { intakeKcal: 2500, activityMode: "explicit-kcal", activityCategory: "sedentary", steps: 0, pal: null, explicitActivityKcal: 1600, exerciseMinutes: 30, note: "" },
    }));
    expect(moving.points.at(-1)!.centralKg).toBeLessThan(rest.points.at(-1)!.centralKg);
    expect(moving.warnings.some((w) => /ignored/i.test(w))).toBe(true);
  });

  it("holds weight when intake matches the baseline expenditure", () => {
    const held = runForecast(inputs({
      baseline: { intakeKcal: 2700, activityMode: "category", activityCategory: "sedentary", steps: 0, pal: 1.5, explicitActivityKcal: 0, exerciseMinutes: 0, note: "" },
    }));
    expect(held.status).toBe("complete");
    expect(held.points.at(-1)!.centralKg).toBeCloseTo(86, 6);
  });

  it("keeps the published energy balance on each day", () => {
    const plan = inputs();
    const composition = initialComposition(plan.profile, plan.profile.referenceDate);
    expect("fatKg" in composition).toBe(true);
    if (!("fatKg" in composition)) return;
    const run = simulateHall(resolvePlan(plan), plan.profile, 2700, composition.fatKg, composition.leanKg);
    expect("points" in run).toBe(true);
    if (!("points" in run)) return;
    for (const point of run.points) expect(Math.abs(point.balanceResidualKj)).toBeLessThan(1e-6);
  });

  it("refuses an unspecified sex parameter instead of guessing", () => {
    const missing = runForecast(inputs({ profile: { ...inputs().profile, sexParameter: "unspecified" } }));
    expect(missing.status).toBe("refused");
    expect(missing.refusal?.code).toBe("sex-parameter");
    expect(missing.points).toHaveLength(0);
  });

  it("refuses excluded contexts and under-18 profiles without inventing a forecast", () => {
    const pregnant = runForecast(inputs({ profile: { ...inputs().profile, excludedContext: "pregnancy" } }));
    expect(pregnant.status).toBe("refused");
    expect(pregnant.points).toHaveLength(0);
    const child = runForecast(inputs({ profile: { ...inputs().profile, birthDate: "2015-01-01" } }));
    expect(child.status).toBe("refused");
    expect(child.refusal?.code).toBe("under-18");
  });

  it("does not clamp an out-of-range intake", () => {
    const refused = runForecast(inputs({
      baseline: { intakeKcal: -50, activityMode: "category", activityCategory: "sedentary", steps: 0, pal: null, explicitActivityKcal: 0, exerciseMinutes: 0, note: "" },
    }));
    expect(refused.status).toBe("refused");
    expect(refused.refusal?.message).toMatch(/not changed/i);
  });
});

describe("dates, units, csv, calibration", () => {
  it("treats ranges as inclusive", () => {
    expect(datesInRange("2026-01-01", "2026-01-03")).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(ageOn("2008-11-16", "2026-11-16")).toBe(18);
    expect(ageOn("2008-11-17", "2026-11-16")).toBe(17);
  });

  it("round-trips kg and lb without using the display rounding", () => {
    const kg = 86.1825508481;
    expect(lbToKg(kgToLb(kg))).toBeCloseTo(kg, 8);
  });

  it("parses quoted csv and ambiguous dates only with an explicit order", () => {
    const table = parseCsv('date,note,weight\n2026-09-08,"hello, world",86.1\n');
    expect(table.headers).toEqual(["date", "note", "weight"]);
    expect(table.rows[0][1]).toBe("hello, world");
    expect(parseLooseDate("09/08/2026", "mdy")).toBe("2026-09-08");
    expect(parseLooseDate("09/08/2026", "dmy")).toBe("2026-08-09");
    expect(parseNumber("1,234.5 lb")).toBe(1234.5);
  });

  it("declines calibration when coverage is short and does not require a plan edit", () => {
    const plan = inputs();
    const early = proposeCalibration(plan, [
      { date: "2026-01-01", kg: 86 },
      { date: "2026-01-08", kg: 85.8 },
    ]);
    expect(early.eligible).toBe(false);
    expect(early.reason).toMatch(/Not enough reliable data yet/);
    const enough = Array.from({ length: 5 }, (_, i) => ({ date: addDays("2026-01-01", i * 7), kg: 86 - i * 0.2 }));
    const ready = proposeCalibration(plan, enough);
    expect(ready.eligible).toBe(true);
    expect(ready.proposedMaintenanceKcal).not.toBeNull();
  });
});
