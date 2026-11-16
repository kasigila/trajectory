export interface CrossingPoint {
  date: string;
  centralKg: number;
}

/**
 * First local day the central series reaches the chart marker.
 * This is arithmetic on a saved run. It is not a validated scale prediction.
 */
export function centralCrossing(points: CrossingPoint[], targetKg: number): { date: string; relation: "at-or-below" | "at-or-above" } | null {
  if (!points.length || !Number.isFinite(targetKg)) return null;
  const first = points[0].centralKg;
  const relation = first > targetKg ? "at-or-below" : "at-or-above";
  const reached = (kg: number) => (relation === "at-or-below" ? kg <= targetKg : kg >= targetKg);
  const hit = points.find((point) => reached(point.centralKg));
  return hit ? { date: hit.date, relation } : null;
}
