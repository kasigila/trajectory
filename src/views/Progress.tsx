import { useMemo, useState } from "react";
import { TrajectoryChart } from "../components/Chart";
import { PageTitle } from "../components/Shell";
import { Button, Field, Notice } from "../components/ui";
import { energy, weight, when } from "../format";
import { parseCsv, parseLooseDate, parseNumber, type DateOrder } from "../model/csv";
import { todayIso } from "../model/dates";
import { LIMITS } from "../model/parameters";
import { TREND_DESCRIPTION, smoothObservations } from "../model/trend";
import { lbToKg } from "../model/units";
import { addComposition, addObservation, addOtherMeasurement, commitImport, deleteObservation, updateObservation, updatePreferences, useSession } from "../state/store";

const SAMPLE = `date,weight,unit,note
2026-09-15,86.6,kg,home scale
2026-09-22,86.4,kg,home scale
2026-09-22,86.5,kg,second reading same morning
`;

export function Progress() {
  const { account, profile } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!account || !profile) return null;
  const observations = account.observations.filter((obs) => obs.profileId === profile.id);
  const active = observations.filter((obs) => !obs.deletedAt).sort((a, b) => a.localDate.localeCompare(b.localDate) || a.observedAt.localeCompare(b.observedAt));
  const scenarios = account.scenarios.filter((item) => item.profileId === profile.id);
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const original = scenario?.versions[0];
  const trend = smoothObservations(active.map((obs) => ({ date: obs.localDate, kg: obs.valueKg })));
  const today = todayIso(account.preferences.timeZone);
  return (
    <section>
      <PageTitle kicker="Progress" title="Readings and the original forecast" lede="Scale readings stay measurements. The line is the first saved run of the chosen scenario, not a refit." />
      {account.preferences.pauseTracking ? <Notice>Tracking is paused. History is kept. Nothing is requested of you. Resume in Settings when you want.</Notice> : null}
      <label>
        Original forecast
        <select value={scenario?.id ?? ""} onChange={(event) => setScenarioId(event.target.value)}>
          {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {original ? (
        <TrajectoryChart
          caption={`Original forecast for ${scenario?.name}, generated ${original.forecast.completedAt}`}
          unit={account.preferences.unit}
          hideAbsolute={account.preferences.hideWeight}
          dateStyle={account.preferences.dateFormat}
          today={today}
          observations={active.map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          trend={trend}
          series={[{ id: original.id, label: "Original Hall forecast", band: true, dash: "2 3", points: original.forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg })) }]}
        />
      ) : <p>No saved forecast yet.</p>}
      <p className="fine">{TREND_DESCRIPTION}</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <WeighInForm paused={account.preferences.pauseTracking} onSave={(value, unit, date, time, note) => {
        const kg = unit === "lb" ? lbToKg(value) : value;
        const result = addObservation(account.id, {
          profileId: profile.id,
          observedAt: `${date}T${time || "07:00"}:00`,
          localDate: date,
          localTime: time || "07:00",
          timeZone: account.preferences.timeZone,
          valueKg: kg,
          sourceValue: value,
          sourceUnit: unit,
          source: "manual",
          sourceRecordId: null,
          importBatchId: null,
          note,
        });
        if (!result.ok) setError(result.message);
        else {
          setError(null);
          setMessage(result.warning ?? "Reading saved. The forecast and the plan were not changed.");
        }
      }} />
      <h2>History</h2>
      <ul className="plain">
        {active.map((obs) => (
          <ObservationRow key={obs.id} id={obs.id} label={`${when(obs.localDate, account.preferences)} ${obs.localTime} · ${weight(obs.valueKg, account.preferences)} · ${obs.source}${obs.note ? ` · ${obs.note}` : ""}`} corrections={obs.corrections.length} onSave={(value, note) => {
            const kg = account.preferences.unit === "lb" ? lbToKg(value) : value;
            const result = updateObservation(account.id, obs.id, kg, note);
            if (!result.ok) setError(result.message);
            else setMessage("Reading updated. Earlier value kept in its correction history. The forecast was not changed.");
          }} onDelete={() => { deleteObservation(account.id, obs.id); setMessage("Reading removed from the chart. The record stays under removed readings."); }} />
        ))}
      </ul>
      <details>
        <summary>Removed readings</summary>
        <ul>{observations.filter((obs) => obs.deletedAt).map((obs) => <li key={obs.id}>{obs.localDate} · removed {obs.deletedAt}</li>)}</ul>
      </details>
      <CsvImport paused={account.preferences.pauseTracking} timeZone={account.preferences.timeZone} existingDates={active.map((obs) => obs.localDate)} onCommit={async (rows, text) => {
        const result = await commitImport(account.id, { profileId: profile.id, timeZone: account.preferences.timeZone, sourceLabel: "csv", fileText: text, rows });
        if (!result.ok) setError(result.message);
        else setMessage(result.warning ?? "Import finished.");
      }} />
      <OtherLogs />
      <p className="fine">Software store range for a reading: {LIMITS.weightKg[0]}–{LIMITS.weightKg[1]} kg. Values outside it are refused and not clamped. This is not a clinical limit.</p>
      <button type="button" className="btn quiet" onClick={() => updatePreferences(account.id, { hideWeight: !account.preferences.hideWeight })}>
        {account.preferences.hideWeight ? "Show weight numbers" : "Hide weight numbers"}
      </button>
    </section>
  );
}

function WeighInForm({ paused, onSave }: { paused: boolean; onSave: (value: number, unit: "kg" | "lb", date: string, time: string, note: string) => void }) {
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("07:00");
  const [note, setNote] = useState("");
  if (paused) return <p>The entry form is hidden while tracking is paused.</p>;
  return (
    <form className="card" onSubmit={(event) => { event.preventDefault(); onSave(Number(value), unit, date, time, note); }}>
      <h2>Add a weigh-in</h2>
      <div className="grid-2">
        <Field label="Value"><input required value={value} onChange={(event) => setValue(event.target.value)} /></Field>
        <Field label="Unit"><select value={unit} onChange={(event) => setUnit(event.target.value as "kg" | "lb")}><option value="kg">kg</option><option value="lb">lb</option></select></Field>
        <Field label="Date"><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
      </div>
      <Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button variant="primary" type="submit">Save reading</Button>
    </form>
  );
}

function ObservationRow({ label, corrections, onSave, onDelete }: { id: string; label: string; corrections: number; onSave: (value: number, note: string) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  return (
    <li>
      {label}
      {corrections ? ` · ${corrections} correction${corrections === 1 ? "" : "s"}` : ""}
      <button type="button" onClick={() => setOpen((v) => !v)}>Edit</button>
      <button type="button" onClick={onDelete}>Remove</button>
      {open ? (
        <div className="grid-2">
          <input aria-label="Corrected value" value={value} onChange={(event) => setValue(event.target.value)} />
          <input aria-label="Corrected note" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button onClick={() => onSave(Number(value), note)}>Save correction</Button>
        </div>
      ) : null}
    </li>
  );
}

function CsvImport({ paused, existingDates, onCommit }: { paused: boolean; timeZone: string; existingDates: string[]; onCommit: (rows: { localDate: string; localTime: string; value: number; unit: "kg" | "lb"; note: string; sourceRecordId: string }[], text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [order, setOrder] = useState<DateOrder>("ymd");
  const [dateCol, setDateCol] = useState(0);
  const [weightCol, setWeightCol] = useState(1);
  const [unitCol, setUnitCol] = useState(2);
  const [noteCol, setNoteCol] = useState(3);
  const [fallback, setFallback] = useState<"kg" | "lb">("kg");
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const table = useMemo(() => parseCsv(text), [text]);
  if (paused) return <p>CSV import is off while tracking is paused.</p>;
  const preview = table.rows.map((row, index) => {
    const date = parseLooseDate(row[dateCol] ?? "", order);
    const value = parseNumber(row[weightCol] ?? "");
    const unitText = (row[unitCol] ?? "").toLowerCase();
    const unit = unitText.includes("lb") ? "lb" : unitText.includes("kg") ? "kg" : fallback;
    const duplicate = date ? existingDates.includes(date) : false;
    const error = !date ? "Date not recognised" : value == null ? "Weight not numeric" : "";
    return { index, date, value, unit, note: row[noteCol] ?? "", duplicate, error, sourceRecordId: `row-${index + 2}` };
  });
  return (
    <div className="card">
      <h2>Import CSV</h2>
      <p>Map columns, check the preview, then import. Likely duplicates are skipped. Manual readings are not overwritten.</p>
      <textarea aria-label="CSV text" value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste CSV, or load a file" />
      <input aria-label="CSV file" type="file" accept=".csv,text/csv" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (file) setText(await file.text());
      }} />
      <Button onClick={() => setText(SAMPLE)}>Load sample CSV</Button>
      {table.headers.length ? (
        <>
          <div className="grid-2">
            <Field label="Date order"><select value={order} onChange={(event) => setOrder(event.target.value as DateOrder)}><option value="ymd">Year-month-day</option><option value="mdy">Month/day/year</option><option value="dmy">Day/month/year</option></select></Field>
            <Field label="If unit column is empty"><select value={fallback} onChange={(event) => setFallback(event.target.value as "kg" | "lb")}><option value="kg">kg</option><option value="lb">lb</option></select></Field>
            <Map label="Date column" headers={table.headers} value={dateCol} onChange={setDateCol} />
            <Map label="Weight column" headers={table.headers} value={weightCol} onChange={setWeightCol} />
            <Map label="Unit column" headers={table.headers} value={unitCol} onChange={setUnitCol} />
            <Map label="Note column" headers={table.headers} value={noteCol} onChange={setNoteCol} />
          </div>
          <div className="table-wrap">
            <table>
              <caption>Import preview</caption>
              <thead><tr><th>Use</th><th>Date</th><th>Weight</th><th>Status</th></tr></thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.index}>
                    <td><input type="checkbox" checked={picked[row.index] ?? !row.error} disabled={Boolean(row.error)} onChange={(event) => setPicked({ ...picked, [row.index]: event.target.checked })} /></td>
                    <td>{row.date ?? "—"}</td>
                    <td>{row.value ?? "—"} {row.unit}</td>
                    <td>{row.error || (row.duplicate ? "Same calendar day already has a reading. You can still import it as an additional reading." : "Ready")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="primary" onClick={() => void onCommit(preview.filter((row) => (picked[row.index] ?? !row.error) && row.date && row.value != null).map((row) => ({ localDate: row.date!, localTime: "07:00", value: row.value!, unit: row.unit, note: row.note, sourceRecordId: row.sourceRecordId })), text)}>
            Import selected rows
          </Button>
        </>
      ) : null}
    </div>
  );
}

function Map({ label, headers, value, onChange }: { label: string; headers: string[]; value: number; onChange: (n: number) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}
      </select>
    </Field>
  );
}

function OtherLogs() {
  const { account, profile } = useSession();
  const [waist, setWaist] = useState("");
  const [fat, setFat] = useState("");
  const [date, setDate] = useState("");
  if (!account || !profile) return null;
  return (
    <div className="card">
      <h2>Other measurements</h2>
      <p>Waist and body composition are optional records. They are not inputs to the weight model.</p>
      <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label="Waist, cm"><input value={waist} onChange={(event) => setWaist(event.target.value)} /></Field>
      <Button onClick={() => date && addOtherMeasurement(account.id, { profileId: profile.id, date, kind: "waist", label: "Waist", valueCm: Number(waist), note: "" })}>Save waist</Button>
      <Field label="Body fat, percent"><input value={fat} onChange={(event) => setFat(event.target.value)} /></Field>
      <Button onClick={() => {
        const result = addComposition(account.id, { profileId: profile.id, date, bodyFatPct: fat ? Number(fat) : null, leanMassKg: null, source: "manual", method: "unspecified", note: "Consumer estimates vary." });
        if (!result.ok) alert(result.message);
      }}>Save composition</Button>
      <ul>
        {account.otherMeasurements.filter((item) => item.profileId === profile.id).map((item) => <li key={item.id}>{item.date}: {item.label} {item.valueCm} cm</li>)}
        {account.compositionLogs.filter((item) => item.profileId === profile.id).map((item) => <li key={item.id}>{item.date}: body fat {item.bodyFatPct ?? "—"}% · {item.source}</li>)}
      </ul>
    </div>
  );
}

void energy;
