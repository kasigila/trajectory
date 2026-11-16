import { describe, expect, it } from "vitest";
import { centralCrossing } from "./crossing";
import { weighInPattern } from "./streak";

describe("chart marker crossing", () => {
  const points = [
    { date: "2026-01-01", centralKg: 70 },
    { date: "2026-01-02", centralKg: 68 },
    { date: "2026-01-03", centralKg: 65 },
  ];

  it("finds the first day the central series reaches the marker from above", () => {
    expect(centralCrossing(points, 68)).toEqual({ date: "2026-01-02", relation: "at-or-below" });
  });

  it("returns nothing when the marker stays beyond the horizon", () => {
    expect(centralCrossing(points, 60)).toBeNull();
  });

  it("names the first day when the series is already on the marker", () => {
    expect(centralCrossing(points, 70)?.date).toBe("2026-01-01");
  });

  it("finds a crossing from below when the series rises", () => {
    const rising = points.map((point, index) => ({ ...point, centralKg: 60 + index * 5 }));
    expect(centralCrossing(rising, 65)?.date).toBe("2026-01-02");
  });
});

describe("weigh-in pattern", () => {
  it("counts an on-pattern run and marks a reading as due from the person's own gap", () => {
    const pattern = weighInPattern(["2026-01-01", "2026-01-08", "2026-01-15"], "2026-01-22");
    expect(pattern.medianGapDays).toBe(7);
    expect(pattern.onPatternStreak).toBe(3);
    expect(pattern.due).toBe(true);
  });

  it("does not call a same-day reading due", () => {
    expect(weighInPattern(["2026-01-01", "2026-01-08"], "2026-01-08").due).toBe(false);
  });
});
