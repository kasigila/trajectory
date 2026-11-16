import { describe, expect, it } from "vitest";
import type { ScenarioInputs } from "../model/types";
import { buildVersion } from "./version";
import { refillForecasts, thinForExport } from "./export";
import type { Account } from "./types";

const inputs: ScenarioInputs = {
  name: "Export",
  description: "",
  labels: [],
  startDate: "2026-01-01",
  horizonDays: 14,
  timeZone: "America/Toronto",
  baseline: { intakeKcal: 1800, activityMode: "category", activityCategory: "sedentary", steps: 7000, pal: null, explicitActivityKcal: 0, exerciseMinutes: 0, note: "" },
  weekly: { enabled: false, days: {} },
  phases: [],
  overrides: [],
  goal: null,
  milestones: [],
  profile: {
    birthDate: "1990-01-01",
    heightCm: 170,
    referenceWeightKg: 70,
    referenceDate: "2026-01-01",
    sexParameter: "parameter-a",
    bodyFatPct: null,
    bodyFatSource: "",
    bodyFatConfidence: "unspecified",
    leanMassKg: null,
    energyBasis: "user-estimate",
    maintenanceKcal: 2200,
    calibrationNote: null,
    referenceActivity: { category: "sedentary", steps: 7000, pal: 1.5 },
    excludedContext: "none",
    excludedDetail: "",
  },
};

describe("thin export", () => {
  it("drops forecast points and rebuilds them from the saved inputs", async () => {
    const built = await buildVersion({ scenarioId: "scn", versionNumber: 1, parent: null, inputs, idempotencyKey: "once", editKind: "initial" });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const account = { scenarios: [{ id: "scn", versions: [built.version] }] } as unknown as Account;
    const thin = thinForExport(account);
    expect(thin.scenarios[0].versions[0].forecast.points).toEqual([]);
    expect(JSON.stringify(thin).length).toBeLessThan(JSON.stringify(account).length);
    const restored = await refillForecasts(thin);
    expect(restored.scenarios[0].versions[0].forecast.points).toHaveLength(14);
    expect(restored.scenarios[0].versions[0].forecast.points[0].centralKg).toBeCloseTo(built.version.forecast.points[0].centralKg, 6);
  });
});
