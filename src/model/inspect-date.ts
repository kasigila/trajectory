/** A date that is on every compared run. Today when it is shared, otherwise the last shared day. */
export function pickInspectDate(series: string[][], today: string): string {
  if (!series.length || !series[0]?.length) return "";
  if (series.length === 1) return series[0].includes(today) ? today : (series[0].at(-1) ?? "");
  const sets = series.map((dates) => new Set(dates));
  const shared = series[0].filter((date) => sets.every((set) => set.has(date)));
  if (shared.includes(today)) return today;
  return shared.at(-1) ?? "";
}
