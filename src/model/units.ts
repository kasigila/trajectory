const LB_PER_KG = 2.2046226218;
const CM_PER_IN = 2.54;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_IN;
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const total = cm / CM_PER_IN;
  let feet = Math.floor(total / 12);
  let inches = total - feet * 12;
  if (inches >= 11.95) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatKg(kg: number, unit: "kg" | "lb", hide = false): string {
  if (hide) return "Hidden";
  if (!Number.isFinite(kg)) return "—";
  if (unit === "lb") return `${round1(kgToLb(kg)).toFixed(1)} lb`;
  return `${round1(kg).toFixed(1)} kg`;
}

export function formatKcal(kcal: number): string {
  if (!Number.isFinite(kcal)) return "—";
  return `${Math.round(kcal).toLocaleString("en-US")} kcal`;
}

export function formatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
