import { describe, expect, it } from "vitest";
import { trendNote, weeklyPoints } from "./trend-note";

describe("trend note", () => {
  it("keeps the first day, each seventh day, and the last day", () => {
    const days = Array.from({ length: 16 }, (_, index) => index);
    expect(weeklyPoints(days)).toEqual([0, 7, 14, 15]);
  });

  it("writes a note that can be pasted as text", () => {
    const note = trendNote({
      title: "Hall projected weight",
      rows: [
        { date: "16 Nov 2026", value: "69.9 kg", range: null },
        { date: "13 Feb 2027", value: "66.4 kg", range: "64.7 kg to 66.5 kg" },
      ],
    });
    expect(note).toContain("16 Nov 2026\t69.9 kg");
    expect(note).toContain("66.4 kg\t64.7 kg to 66.5 kg");
    expect(note).toContain("Not a predicted scale reading");
  });
});