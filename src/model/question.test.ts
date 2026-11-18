import { describe, expect, it } from "vitest";
import { askForecast } from "./question";
import type { ProfileInput } from "./types";

const profile: ProfileInput = {
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
};

function endKg(intakeKcal: number, days: number) {
  const result = askForecast(profile, { startKg: 86, startDate: "2026-11-17", intakeKcal, days, timeZone: "America/Toronto" });
  expect(result.status).toBe("complete");
  return result.points.at(-1)?.centralKg ?? NaN;
}

describe("the calorie question", () => {
  it("answers a low intake immediately and loses more at 500 kcal than at 1000", () => {
    const low = endKg(500, 30);
    const higher = endKg(1000, 30);
    expect(low).toBeLessThan(86);
    expect(low).toBeLessThan(higher);
  });

  it("loses more over 30 days than over 20 days at the same intake", () => {
    expect(endKg(1000, 30)).toBeLessThan(endKg(1000, 20));
  });

  it("keeps a weight for day 15 of a 30-day question", () => {
    const result = askForecast(profile, { startKg: 86, startDate: "2026-11-17", intakeKcal: 1000, days: 30, timeZone: "America/Toronto" });
    expect(result.points).toHaveLength(30);
    expect(result.points[14].centralKg).toBeLessThan(86);
    expect(result.points[14].centralKg).toBeGreaterThan(result.points[29].centralKg);
  });

  it("does not change the stored starting weight", () => {
    askForecast(profile, { startKg: 80, startDate: "2026-11-17", intakeKcal: 500, days: 30, timeZone: "America/Toronto" });
    expect(profile.referenceWeightKg).toBe(86);
  });
});
