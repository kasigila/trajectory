/** Civil dates are YYYY-MM-DD. Model steps are local calendar days, inclusive. */

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(later: string, earlier: string): number {
  const a = Date.parse(later + "T00:00:00Z");
  const b = Date.parse(earlier + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}

export function enumerateDates(start: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export function weekday(iso: string): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export function ageOn(birthDate: string, onDate: string): number {
  let age = Number(onDate.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (onDate.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

export function todayIso(timeZone: string, now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fall through */
  }
  return now.toISOString().slice(0, 10);
}

export function formatDate(iso: string, style: "iso" | "dmy" | "mdy" | "long"): string {
  if (!isIsoDate(iso)) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const month = dt.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const weekdayName = dt.toLocaleString("en-GB", { weekday: "long", timeZone: "UTC" });
  if (style === "iso") return iso;
  if (style === "mdy") return `${month} ${d}, ${y}`;
  if (style === "long") return `${weekdayName}, ${d} ${month} ${y}`;
  return `${d} ${month} ${y}`;
}

export function datesInRange(start: string, end: string): string[] {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return [];
  const count = diffDays(end, start) + 1;
  return enumerateDates(start, count);
}

export function clampRange(start: string, end: string): [string, string] {
  return start <= end ? [start, end] : [end, start];
}

export function hourInTimeZone(timeZone: string, now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    return Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  } catch {
    return now.getHours();
  }
}
