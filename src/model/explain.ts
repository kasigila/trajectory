import { addDays, diffDays, formatDate } from "./dates";
import { activityAdjustmentKcal, resolvePlan } from "./engine";
import { formatKcal, round1 } from "./units";
import type { ForecastPoint, PlanDiffSpan, ScenarioInputs } from "./types";

export interface ChangeExplanation {
  narrative: string;
  firstDivergence: string | null;
  prefixUnchanged: boolean;
  endDeltaKg: number | null;
  spans: PlanDiffSpan[];
}

function sameDayPlan(a: ScenarioInputs, b: ScenarioInputs, date: string): { intake: boolean; activity: boolean; lines: string[] } {
  const da = resolvePlan({ ...a, startDate: date, horizonDays: 1 })[0];
  const db = resolvePlan({ ...b, startDate: date, horizonDays: 1 })[0];
  const lines: string[] = [];
  const intake = da.intakeKcal !== db.intakeKcal;
  if (intake) lines.push(`intake ${formatKcal(da.intakeKcal)} → ${formatKcal(db.intakeKcal)}`);
  const aa = activityAdjustmentKcal(da, a.profile).kcal;
  const ab = activityAdjustmentKcal(db, b.profile).kcal;
  const activity = Math.abs(aa - ab) > 0.01 || da.activityMode !== db.activityMode;
  if (activity) {
    lines.push(`Hall activity term ${formatKcal(aa)} → ${formatKcal(ab)}`);
  }
  if (da.note !== db.note) lines.push("the day note changed (notes do not change the arithmetic)");
  return { intake, activity, lines };
}

export function diffInputSpans(before: ScenarioInputs, after: ScenarioInputs): PlanDiffSpan[] {
  const start = before.startDate < after.startDate ? before.startDate : after.startDate;
  const endA = addDays(before.startDate, before.horizonDays - 1);
  const endB = addDays(after.startDate, after.horizonDays - 1);
  const end = endA > endB ? endA : endB;
  const total = diffDays(end, start) + 1;
  const spans: PlanDiffSpan[] = [];
  let open: PlanDiffSpan | null = null;
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i);
    const inA = date >= before.startDate && date <= endA;
    const inB = date >= after.startDate && date <= endB;
    let lines: string[] = [];
    if (!inA || !inB) {
      lines = [!inA ? "this date was added to the horizon" : "this date was removed from the horizon"];
    } else {
      lines = sameDayPlan(before, after, date).lines;
    }
    const key = lines.join("|");
    if (!key) {
      open = null;
      continue;
    }
    if (open && open.lines.join("|") === key && addDays(open.end, 1) === date) {
      open.end = date;
    } else {
      open = { start: date, end: date, lines };
      spans.push(open);
    }
  }
  return spans;
}

export function explainChange(before: ScenarioInputs | null, beforePoints: ForecastPoint[] | null, after: ScenarioInputs, afterPoints: ForecastPoint[]): ChangeExplanation {
  if (!before || !beforePoints) {
    const first = afterPoints[0];
    const last = afterPoints.at(-1);
    return {
      firstDivergence: first?.date ?? null,
      prefixUnchanged: true,
      endDeltaKg: null,
      spans: [],
      narrative: first && last
        ? `This is the first saved version. The Hall model starts at the reference weight and applies the plan one local day at a time. On ${last.date} the central estimate is shown to the nearest 0.1 kg. The band is a sensitivity range, not a promise of a scale reading. Later edits will keep this version.`
        : "This version has no forecast points.",
    };
  }
  const spans = diffInputSpans(before, after);
  let firstDivergence: string | null = null;
  const count = Math.min(beforePoints.length, afterPoints.length);
  for (let i = 0; i < count; i++) {
    if (beforePoints[i].date !== afterPoints[i].date || Math.abs(beforePoints[i].centralKg - afterPoints[i].centralKg) > 1e-6) {
      firstDivergence = afterPoints[i].date;
      break;
    }
  }
  if (!firstDivergence && afterPoints.length !== beforePoints.length) {
    firstDivergence = afterPoints[Math.min(count, afterPoints.length - 1)]?.date ?? null;
  }
  const prefixUnchanged = firstDivergence == null ? true : beforePoints.every((p) => p.date >= firstDivergence! || afterPoints.some((n) => n.date === p.date && Math.abs(n.centralKg - p.centralKg) <= 1e-6 && Math.abs(n.lowerKg - p.lowerKg) <= 1e-6));
  const endBefore = beforePoints.at(-1);
  const endAfter = afterPoints.at(-1);
  const endDeltaKg = endBefore && endAfter && endBefore.date === endAfter.date ? endAfter.centralKg - endBefore.centralKg : null;
  const inputBits = spans.slice(0, 3).map((span) => {
    const when = span.start === span.end ? span.start : `${span.start} through ${span.end} (inclusive)`;
    return `${when}: ${span.lines.join("; ")}`;
  });
  const more = spans.length > 3 ? ` ${spans.length - 3} more date span${spans.length - 3 === 1 ? "" : "s"} also differ.` : "";
  let direction = "The central estimate at the end of the shared dates is effectively unchanged at the 0.1 kg display.";
  if (endDeltaKg != null && Math.abs(endDeltaKg) >= 0.05) {
    direction = `On ${endAfter?.date} the central estimate is ${round1(Math.abs(endDeltaKg)).toFixed(1)} kg ${endDeltaKg > 0 ? "higher" : "lower"} than the previous version.`;
  } else if (endBefore && endAfter && endBefore.date !== endAfter.date) {
    direction = "The horizon dates are not the same, so the last-day comparison is omitted. Both versions remain saved.";
  }
  const prefix = prefixUnchanged && firstDivergence
    ? `Days before ${firstDivergence} match the previous version. They were not rewritten.`
    : firstDivergence
      ? `The first difference in the central estimate is on ${firstDivergence}.`
      : "The central estimates match the previous version on every shared date.";
  const profileNote = profileChanged(before, after)
    ? " Profile inputs in the snapshot differ. A profile change can move the path from the first day, because the Hall model starts from those baseline conditions."
    : "";
  const narrative = [
    inputBits.length ? `What changed in the plan:\n${inputBits.join("\n")}${more ? `\n${more.trim()}` : ""}` : "No day-level intake or activity difference was found. If the path still moved, a baseline condition such as maintenance, reference weight, or horizon changed.",
    prefix,
    direction,
    "The shaded band is a sensitivity range from the Jackson standard error and the alternate baseline-expenditure closure, not a confidence interval.",
    "The previous version is still saved and was not overwritten.",
  ].join("\n");
  return { narrative: narrative + profileNote, firstDivergence, prefixUnchanged, endDeltaKg, spans };
}

export function changeLines(change: ChangeExplanation, style: "iso" | "dmy" | "mdy" | "long"): string[] {
  const spanLines = [...(change.spans ?? [])].reverse().map((span) => {
    const when = span.start === span.end ? formatDate(span.start, style) : `${formatDate(span.start, style)} through ${formatDate(span.end, style)}, inclusive`;
    return `${when}: ${span.lines.join("; ")}`;
  });
  const prose = (change.narrative ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("What changed") && !/^\d{4}-\d{2}-\d{2}/.test(line) && !line.includes(" more date span"));
  return spanLines.length ? [...spanLines, ...prose] : prose.length ? prose : [change.narrative || "No change has been described for this version."];
}

function profileChanged(a: ScenarioInputs, b: ScenarioInputs): boolean {
  return JSON.stringify(a.profile) !== JSON.stringify(b.profile);
}

export function divergenceCopy(pairs: { date: string; observed: number; forecast: number | null }[]): string {
  const known = pairs.filter((p) => p.forecast != null) as { date: string; observed: number; forecast: number }[];
  if (known.length === 0) {
    return "There is no saved forecast on the dates of these readings, so a gap is not described. Readings stay observations. They do not edit the plan.";
  }
  if (known.length < 2) {
    const only = known[0];
    const gap = round1(only.observed - only.forecast);
    return `One reading on ${only.date} sits ${Math.abs(gap).toFixed(1)} kg ${gap >= 0 ? "above" : "below"} the original Hall central estimate. A single reading is a measurement, not a trend, and scale values vary. This is not a judgment of the plan. The forecast was not changed when the reading was saved.`;
  }
  const gaps = known.map((p) => ({ ...p, gap: p.observed - p.forecast }));
  const mean = gaps.reduce((s, g) => s + Math.abs(g.gap), 0) / gaps.length;
  const largest = gaps.reduce((a, b) => (Math.abs(a.gap) > Math.abs(b.gap) ? a : b));
  return `Across ${known.length} readings, the absolute gap versus the original Hall forecast averages about ${round1(mean).toFixed(1)} kg. The largest gap in this set is ${round1(Math.abs(largest.gap)).toFixed(1)} kg on ${largest.date}. A gap can come from ordinary scale variability, a routine that differed from the plan, inputs the model never saw, or the limits of these equations. It is not a verdict on you or on the plan, and it is not a diagnosis of a plateau. Saving these readings did not change planned intake or activity.`;
}
