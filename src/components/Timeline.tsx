import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatDate, weekday } from "../model/dates";

interface DayMark {
  phase: string | null;
  override: boolean;
  noted?: boolean;
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
  const months = useMemo(() => groupMonths(start, end), [start, end]);
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const [index, setIndex] = useState(() => monthIndex(groupMonths(start, end), selectedStart, today));
  useEffect(() => {
    if (!selectedStart) return;
    const next = months.findIndex((month) => month.days.includes(selectedStart));
    if (next >= 0) setIndex(next);
  }, [selectedStart, start, end, months]);
  useEffect(() => {
    const date = pendingFocus.current;
    if (!date || !root.current) return;
    const button = root.current.querySelector<HTMLButtonElement>(`[data-date="${date}"]`);
    if (!button) return;
    button.focus();
    pendingFocus.current = null;
  }, [index, selectedStart]);
  const month = months[Math.min(index, months.length - 1)] ?? months[0];
  const [from, to] = selectedStart && selectedEnd ? (selectedStart <= selectedEnd ? [selectedStart, selectedEnd] : [selectedEnd, selectedStart]) : ["", ""];
  if (!month) return null;
  return (
    <div className="timeline" ref={root} aria-label="Plan timeline. Ranges include the first and last selected date.">
      <div className="timeline-nav">
        <button type="button" className="btn" disabled={index <= 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous month</button>
        <h3>{month.label}</h3>
        <button type="button" className="btn" disabled={index >= months.length - 1} onClick={() => setIndex((value) => Math.min(months.length - 1, value + 1))}>Next month</button>
      </div>
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
          const kind = mark?.override ? "Override" : mark?.phase ? mark.phase : "Plan";
          return (
            <button
              key={date}
              type="button"
              className={["day", date === today ? "today" : "", mark?.phase ? "phase" : "", mark?.override ? "override" : "", mark?.noted ? "noted" : ""].filter(Boolean).join(" ")}
              aria-pressed={selected}
              aria-label={`${formatDate(date, dateStyle)}, ${kind}${mark?.noted ? ", has a note" : ""}`}
              onClick={(event) => onSelect(date, event.shiftKey)}
              onKeyDown={(event) => {
                const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : 0;
                if (!delta) return;
                event.preventDefault();
                const next = addDays(date, delta);
                if (next < start || next > end) return;
                pendingFocus.current = next;
                onSelect(next, event.shiftKey);
              }}
              data-date={date}
            >
              <strong>{Number(date.slice(8))}</strong>
              <em>{kind}{mark?.noted ? " · note" : ""}</em>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function monthIndex(months: { days: string[] }[], selected: string | null, today: string) {
  const preferred = selected || today;
  const found = months.findIndex((month) => month.days.includes(preferred));
  return found >= 0 ? found : 0;
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
