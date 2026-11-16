/** Weekly rows plus the first and last day, the way a projection is copied into a note. */
export function weeklyPoints<T>(points: T[]): T[] {
  if (points.length <= 2) return [...points];
  const picked = [points[0]];
  for (let index = 7; index < points.length - 1; index += 7) picked.push(points[index]);
  picked.push(points[points.length - 1]);
  return picked;
}

export function trendNote(args: { title: string; rows: { date: string; value: string; range: string | null }[] }): string {
  const lines = [
    args.title,
    "Central estimate, to 0.1. Not a predicted scale reading and not a medical device.",
    "",
  ];
  if (!args.rows.length) lines.push("No dates to copy.");
  for (const row of args.rows) {
    lines.push(row.range ? `${row.date}\t${row.value}\t${row.range}` : `${row.date}\t${row.value}`);
  }
  lines.push("", "Copied from Trajectory on this device.");
  return lines.join("\n");
}
