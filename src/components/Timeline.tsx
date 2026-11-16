import { addDays, formatDate, weekday } from "../model/dates";

interface DayMark {
  phase: string | null;
  override: boolean;
}

interface Props {
  start: string;
  end: string;
  today: string;
  selectedStart: string | null;
  selectedEnd: string | null;
  marks: Record<string, DayMark>;
  dateStyle?: "iso" | "dmy" | "mdy" | "long";
  onSelect: (date: string, extend: boolean) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Timeline({ start, end, today, selectedStart, selectedEnd, marks, dateStyle = "dmy", onSelect }: Props) {
  const months = groupMonths(start, end);
  const [from, to] = selectedStart && selectedEnd ? (selectedStart <= selectedEnd ? [selectedStart, selectedEnd] : [selectedEnd, selectedStart]) : ["", ""];
  return (
    <div className="timeline" aria-label="Plan timeline. Ranges include the first and last selected date.">
      {months.map((month) => (
        <section key={month.key}>
          <h3>{month.label}</h3>
          <div className="weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="month-grid" role="grid" aria-label={month.label}>
            {Array.from({ length: month.lead }, (_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {month.days.map((date) => {
              const mark = marks[date];
              const selected = Boolean(from && date >= from && date <= to);
              return (
                <button
                  key={date}
                  type="button"
                  className={date === today ? "day today" : "day"}
                  aria-pressed={selected}
                  aria-label={`${formatDate(date, dateStyle)}${mark?.phase ? `, phase ${mark.phase}` : ""}${mark?.override ? ", single-day override" : ""}`}
                  onClick={(event) => onSelect(date, event.shiftKey)}
                  onKeyDown={(event) => {
                    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : 0;
                    if (!delta) return;
                    event.preventDefault();
                    const next = addDays(date, delta);
                    if (next < start || next > end) return;
                    onSelect(next, event.shiftKey);
                    const target = (event.currentTarget.parentElement?.querySelector(`[data-date="${next}"]`) as HTMLButtonElement | null);
                    target?.focus();
                  }}
                  data-date={date}
                >
                  <strong>{Number(date.slice(8))}</strong>
                  {mark?.phase ? <em>{mark.phase}</em> : <em>Base</em>}
                  {mark?.override ? <i aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupMonths(start: string, end: string) {
  const months: { key: string; label: string; lead: number; days: string[] }[] = [];
  let cursor = start;
  while (cursor <= end) {
    const key = cursor.slice(0, 7);
    let bucket = months.find((month) => month.key === key);
    if (!bucket) {
      const [y, m] = key.split("-").map(Number);
      const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      bucket = { key, label, lead: weekday(cursor), days: [] };
      months.push(bucket);
    }
    bucket.days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return months;
}
