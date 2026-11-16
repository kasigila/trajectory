import { diffDays } from "./dates";
import { PRODUCT } from "./parameters";

export interface ObservationPoint {
  date: string;
  kg: number;
}

export interface TrendPoint {
  date: string;
  kg: number;
}

/**
 * Trailing exponential average in observation order.
 * Missing days are not filled in. The line drawn between points is only a visual join.
 * Alpha is a display smoother, not the physiological model.
 */
export function smoothObservations(points: ObservationPoint[], alpha = PRODUCT.trendAlpha): TrendPoint[] {
  const sorted = [...points].filter((p) => Number.isFinite(p.kg)).sort((a, b) => a.date.localeCompare(b.date) || a.kg - b.kg);
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  for (const point of sorted) {
    trend = trend == null ? point.kg : alpha * point.kg + (1 - alpha) * trend;
    out.push({ date: point.date, kg: trend });
  }
  return out;
}

export const TREND_DESCRIPTION = `The trend is a trailing exponential average of recorded weigh-ins, with alpha ${PRODUCT.trendAlpha}. A new reading moves the trend by ${Math.round(PRODUCT.trendAlpha * 100)}% of the gap. It lags, and a single reading does not define it. Days without a reading have no trend value. Connecting the marks on the chart is visual only. This smoother is not the Hall forecast and not a body-composition measure.`;

export function trendSpanDays(points: ObservationPoint[]): number {
  if (points.length < 2) return 0;
  const dates = points.map((p) => p.date).sort();
  return diffDays(dates[dates.length - 1], dates[0]);
}
