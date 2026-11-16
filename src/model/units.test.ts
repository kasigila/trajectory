import { describe, expect, it } from "vitest";
import { formatKg, kgToLb, lbToKg, unitSystemPatch } from "./units";

describe("display units", () => {
  it("converts pounds at 2.20462 and shows one decimal", () => {
    const shown = formatKg(70, "lb");
    expect(shown).toBe(`${(Math.round(70 * 2.20462 * 10) / 10).toFixed(1)} lb`);
    expect(shown).not.toMatch(/\bkg\b/);
    expect(kgToLb(1)).toBe(2.20462);
    expect(lbToKg(kgToLb(86.1825508481))).toBeCloseTo(86.1825508481, 8);
  });

  it("keeps metric labels in kilograms", () => {
    expect(formatKg(70, "kg")).toBe("70.0 kg");
    expect(unitSystemPatch("imperial")).toEqual({ unitSystem: "imperial", unit: "lb", lengthUnit: "ft" });
    expect(unitSystemPatch("metric").unit).toBe("kg");
  });
});
