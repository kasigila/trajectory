import { formatDate } from "./model/dates";
import { formatKcal, formatKg, round1 } from "./model/units";
import type { Preferences } from "./state/types";

export function when(iso: string, prefs: Preferences) {
  return formatDate(iso.slice(0, 10), prefs.dateFormat);
}

export function weight(kg: number, prefs: Preferences, hide = prefs.hideWeight) {
  return formatKg(kg, prefs.unit, hide);
}

export function weightValue(kg: number, unit: "kg" | "lb") {
  return unit === "lb" ? round1(kg * 2.2046226218) : round1(kg);
}

export function energy(kcal: number) {
  return formatKcal(kcal);
}

export function weighInsFar(count: number): string {
  const noun = count === 1 ? "weigh-in" : "weigh-ins";
  const verb = count === 1 ? "sits" : "sit";
  return `${count} ${noun} ${verb} far from this forecast, so the axis stays on the projection. Those readings remain in the table.`;
}

export function stamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
