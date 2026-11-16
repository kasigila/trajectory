import { describe, expect, it } from "vitest";
import { bodyFatBoundMessage, horizonBoundMessage, intakeBoundMessage, leanBoundMessage, waistBoundMessage, weightBoundMessage } from "./bounds";
import { LIMITS } from "./parameters";
import { runForecast } from "./engine";
import type { ScenarioInputs } from "./types";

describe("shared software bounds", () => {
  it("accepts the edges and rejects one past each edge", () => {
    expect(weightBoundMessage(LIMITS.weightKg[0])).toBeNull();
    expect(weightBoundMessage(LIMITS.weightKg[1])).toBeNull();
    expect(weightBoundMessage(LIMITS.weightKg[0] - 1)).toMatch(/was not changed/);
    expect(weightBoundMessage(LIMITS.weightKg[1] + 1)).toMatch(/was not changed/);
    expect(weightBoundMessage(Number.NaN)).toMatch(/was not changed/);

    expect(bodyFatBoundMessage(LIMITS.bodyFatPct[0])).toBeNull();
    expect(bodyFatBoundMessage(LIMITS.bodyFatPct[1])).toBeNull();
    expect(bodyFatBoundMessage(0)).toMatch(/was not changed/);
    expect(bodyFatBoundMessage(999)).toMatch(/was not changed/);

    expect(leanBoundMessage(50, 70)).toBeNull();
    expect(leanBoundMessage(70, 70)).toMatch(/below the reference weight/);
    expect(leanBoundMessage(LIMITS.leanMassKg[0] - 1, 70)).toMatch(/was not changed/);

    expect(waistBoundMessage(LIMITS.waistCm[0])).toBeNull();
    expect(waistBoundMessage(LIMITS.waistCm[1])).toBeNull();
    expect(waistBoundMessage(999)).toMatch(/was not changed/);

    expect(horizonBoundMessage(1)).toBeNull();
    expect(horizonBoundMessage(365)).toBeNull();
    expect(horizonBoundMessage(0)).toMatch(/was not changed/);
    expect(horizonBoundMessage(999)).toMatch(/was not changed/);
    expect(horizonBoundMessage(1.5)).toMatch(/was not changed/);
  });

  it("warns on an unusual intake and still blocks only the hard software bound", () => {
    expect(intakeBoundMessage(1800)).toEqual({ error: null, warning: null });
    expect(intakeBoundMessage(LIMITS.intakeWarnKcal[0] - 1).error).toBeNull();
    expect(intakeBoundMessage(LIMITS.intakeWarnKcal[0] - 1).warning).toMatch(/can still be saved/);
    expect(intakeBoundMessage(LIMITS.intakeKcal[1] + 1).error).toMatch(/was not changed/);
    expect(intakeBoundMessage(-1).error).toMatch(/was not changed/);
  });
});

describe("sensitivity band", () => {
  it("keeps the low edge at or below the central value and a non-zero width on the default plan", () => {
    const plan: ScenarioInputs = {
      name: "Test",
      description: "",
      labels: [],
      startDate: "2026-01-01",
      horizonDays: 90,
      timeZone: "America/Toronto",
      baseline: { intakeKcal: 1800, activityMode: "category", activityCategory: "sedentary", steps: 7000, pal: null, explicitActivityKcal: 0, exerciseMinutes: 0, note: "" },
      weekly: { enabled: false, days: {} },
      phases: [],
      overrides: [],
      goal: null,
      milestones: [],
      profile: {
        birthDate: "1990-06-15",
        heightCm: 170,
        referenceWeightKg: 70,
        referenceDate: "2026-01-01",
        sexParameter: "parameter-a",
        bodyFatPct: 28,
        bodyFatSource: "",
        bodyFatConfidence: "low",
        leanMassKg: null,
        energyBasis: "user-estimate",
        maintenanceKcal: 2200,
        calibrationNote: null,
        referenceActivity: { category: "sedentary", steps: 7000, pal: 1.5 },
        excludedContext: "none",
        excludedDetail: "",
      },
    };
    const forecast = runForecast(plan);
    expect(forecast.status).toBe("complete");
    if (forecast.status !== "complete") return;
    for (const point of forecast.points) {
      expect(point.lowerKg).toBeLessThanOrEqual(point.centralKg);
      expect(point.upperKg).toBeGreaterThanOrEqual(point.centralKg);
    }
    const last = forecast.points.at(-1)!;
    expect(last.upperKg - last.lowerKg).toBeGreaterThan(0.2);
  });
});
