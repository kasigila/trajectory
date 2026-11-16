import { describe, expect, it } from "vitest";
import { weighInsFar } from "../format";
import { changeLines, type ChangeExplanation } from "./explain";
import { importStatus } from "./import-status";
import { pickInspectDate } from "./inspect-date";
import { acceptStoredDatabase } from "../state/schema";

describe("retest copy", () => {
  it("uses sits for one far reading and sit for more than one", () => {
    expect(weighInsFar(1)).toMatch(/^1 weigh-in sits far/);
    expect(weighInsFar(2)).toMatch(/^2 weigh-ins sit far/);
  });

  it("inspects today when both runs include it, otherwise the last shared day", () => {
    const early = ["2026-11-01", "2026-11-16"];
    const later = ["2026-11-16", "2026-12-01"];
    expect(pickInspectDate([early, later], "2026-11-16")).toBe("2026-11-16");
    expect(pickInspectDate([early, ["2026-11-01", "2026-11-20"]], "2026-11-16")).toBe("2026-11-01");
    expect(pickInspectDate([early, later], "2026-12-25")).toBe("2026-11-16");
  });

  it("labels an already imported row even when it is also far from the reference weight", () => {
    const text = importStatus({ error: "", far: true, sameReading: true, sameDay: true });
    expect(text).toContain("Already imported");
    expect(text).toContain("Far from the profile reference weight");
  });

  it("lists plan changes newest first", () => {
    const change: ChangeExplanation = {
      narrative: "What changed in the plan:\n2026-11-01: intake\nDays before 2026-11-02 match the previous version.",
      firstDivergence: "2026-11-02",
      prefixUnchanged: true,
      endDeltaKg: null,
      spans: [
        { start: "2026-11-01", end: "2026-11-01", lines: ["intake 2,200 kcal → 1,800 kcal"] },
        { start: "2026-11-08", end: "2026-11-10", lines: ["the day note changed (notes do not change the arithmetic)"] },
      ],
    };
    const lines = changeLines(change, "iso");
    expect(lines[0]).toContain("2026-11-08");
    expect(lines[1]).toContain("2026-11-01");
    expect(lines.at(-1)).toContain("Days before");
  });

  it("opens schema 2 and refuses anything else", () => {
    expect(acceptStoredDatabase({ schema: 2, accounts: [] }).schema).toBe(2);
    expect(() => acceptStoredDatabase({ schema: 1, accounts: [] })).toThrow(/schema 2/);
  });
});
