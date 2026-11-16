export interface CsvTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): CsvTable {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    if (row.some((c) => c !== "")) rows.push(row);
  }
  if (!rows.length) return { headers: [], rows: [] };
  return { headers: rows[0], rows: rows.slice(1) };
}

export type DateOrder = "ymd" | "mdy" | "dmy";

export function parseLooseDate(value: string, order: DateOrder): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return valid(v) ? v : null;
  }
  const m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const month = order === "mdy" ? a : b;
  const day = order === "mdy" ? b : a;
  if (order === "ymd") return null;
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return valid(iso) ? iso : null;
}

function valid(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function parseNumber(value: string): number | null {
  const cleaned = value.replace(/,/g, "").replace(/kg|lb|lbs/gi, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
