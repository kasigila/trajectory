import { diffDays } from "./dates";

export interface WeighInPattern {
  lastDate: string | null;
  daysSinceLast: number | null;
  medianGapDays: number | null;
  onPatternStreak: number;
  due: boolean;
}

/** A local description of the person's own weigh-in spacing. Not a target and not a score. */
export function weighInPattern(dates: string[], today: string): WeighInPattern {
  const unique = [...new Set(dates.filter(Boolean))].sort();
  if (!unique.length) return { lastDate: null, daysSinceLast: null, medianGapDays: null, onPatternStreak: 0, due: false };
  const lastDate = unique[unique.length - 1];
  const gaps = unique.slice(1).map((date, index) => diffDays(date, unique[index]));
  const medianGapDays = gaps.length ? median(gaps) : null;
  const allowance = medianGapDays == null ? 1 : Math.max(1, Math.round(medianGapDays * 1.5));
  let onPatternStreak = 1;
  for (let index = unique.length - 1; index > 0; index--) {
    if (diffDays(unique[index], unique[index - 1]) > allowance) break;
    onPatternStreak += 1;
  }
  const daysSinceLast = diffDays(today, lastDate);
  const due = lastDate !== today && medianGapDays != null && daysSinceLast >= medianGapDays;
  return { lastDate, daysSinceLast, medianGapDays, onPatternStreak, due };
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
