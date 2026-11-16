import { useMemo, useState } from "react";
import { TrajectoryChart } from "../components/Chart";
import { PageTitle } from "../components/Shell";
import { Button, Disclosure, Field, Notice } from "../components/ui";
import { energy, stamp, weight, when } from "../format";
import { formatKg } from "../model/units";
import { parseCsv, parseLooseDate, parseNumber, type DateOrder } from "../model/csv";
import { importStatus } from "../model/import-status";
import { todayIso } from "../model/dates";
import { LIMITS } from "../model/parameters";
import { TREND_DESCRIPTION, smoothObservations } from "../model/trend";
import { kgToLb, lbToKg, round1 } from "../model/units";
import { addComposition, addObservation, addOtherMeasurement, commitImport, deleteObservation, restoreObservation, setReadingCalibration, updateObservation, updatePreferences, useSession } from "../state/store";

function sampleCsv(unit: "kg" | "lb") {
  const shown = (kg: number) => (unit === "lb" ? kgToLb(kg) : kg).toFixed(1);
  return `date,weight,unit,note
2026-09-15,${shown(86.6)},${unit},home scale
2026-09-22,${shown(86.4)},${unit},home scale
2026-09-22,${shown(86.5)},${unit},second reading same morning
`;
}

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
      <PageTitle kicker="Track" title="Weigh-ins" lede="Your readings next to the first saved forecast." />
      {account.preferences.pauseTracking ? <Notice>Tracking is paused. History is kept. Nothing is requested of you. Resume in Settings when you want.</Notice> : null}
      <label>
        Original forecast
        <select value={scenario?.id ?? ""} onChange={(event) => setScenarioId(event.target.value)}>
          {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {original ? (
        <TrajectoryChart
          caption={`Original forecast for ${scenario?.name}. Generated ${stamp(original.forecast.completedAt)}.`}
          unit={account.preferences.unit}
          hideAbsolute={account.preferences.hideWeight}
          dateStyle={account.preferences.dateFormat}
          today={today}
          observations={active.map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          trend={trend}
          series={[{ id: original.id, label: "Original forecast", band: true, dash: "2 3", points: original.forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg })) }]}
        />
      ) : <p>No saved forecast yet.</p>}
      <Disclosure title="About the trend line"><p>{TREND_DESCRIPTION}</p></Disclosure>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <WeighInForm paused={account.preferences.pauseTracking} onSave={(value, unit, date, time, note, exclude) => {
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
          excludeFromCalibration: exclude,
        });
        if (!result.ok) {
          setError(result.message);
          return false;
        }
        setError(null);
        setMessage(result.warning ?? `Weigh-in ${formatKg(kg, account.preferences.unit)} saved for ${date}. The forecast was not changed.`);
        return true;
      }} />
      <h2>History</h2>
      <ul className="plain">
        {active.map((obs) => (
          <ObservationRow key={obs.id} id={obs.id} label={`${when(obs.localDate, account.preferences)} ${obs.localTime} · ${weight(obs.valueKg, account.preferences)} · ${obs.source}${obs.excludeFromCalibration ? " · left out of calibration" : ""}${obs.note ? ` · ${obs.note}` : ""}`} corrections={obs.corrections.length} initialValue={String(round1(account.preferences.unit === "lb" ? kgToLb(obs.valueKg) : obs.valueKg))} initialNote={obs.note} excluded={Boolean(obs.excludeFromCalibration)} onCalibration={() => {
            const result = setReadingCalibration(account.id, obs.id, !obs.excludeFromCalibration);
            if (!result.ok) setError(result.message);
            else setMessage(obs.excludeFromCalibration ? "Reading included in calibration again. It was already on the chart. The forecast was not changed." : "Reading left out of calibration. It stays on the chart. The forecast was not changed.");
          }} onSave={(value, note) => {
            const kg = account.preferences.unit === "lb" ? lbToKg(value) : value;
            const result = updateObservation(account.id, obs.id, kg, note);
            if (!result.ok) setError(result.message);
            else setMessage("Reading updated. Earlier value kept in its correction history. The forecast was not changed.");
          }} onDelete={() => {
            deleteObservation(account.id, obs.id);
            setMessage("Weigh-in removed from the chart. Restore it under Removed readings. The forecast was not changed.");
          }} />
        ))}
      </ul>
      <details>
        <summary>Removed readings</summary>
        <ul>
          {observations.filter((obs) => obs.deletedAt).length ? null : <li>No removed readings.</li>}
          {observations.filter((obs) => obs.deletedAt).map((obs) => (
            <li key={obs.id}>
              {when(obs.localDate, account.preferences)} · {weight(obs.valueKg, account.preferences)} · removed {stamp(obs.deletedAt ?? "")}
              <button type="button" onClick={() => { const result = restoreObservation(account.id, obs.id); if (!result.ok) setError(result.message); else setMessage("Reading restored to the chart. The forecast was not changed."); }}>Restore</button>
            </li>
          ))}
        </ul>
      </details>
      <Disclosure title="Import a spreadsheet">
      <CsvImport paused={account.preferences.pauseTracking} timeZone={account.preferences.timeZone} referenceKg={profile.referenceWeightKg} existing={active.map((obs) => ({ date: obs.localDate, kg: obs.valueKg }))} onCommit={async (rows, text) => {
        const result = await commitImport(account.id, { profileId: profile.id, timeZone: account.preferences.timeZone, sourceLabel: "csv", fileText: text, rows });
        if (!result.ok) {
          setError(result.message);
          return false;
        }
        setError(null);
        setMessage(result.warning ?? "Import finished.");
        return true;
      }} />
      </Disclosure>
      <Disclosure title="Other measurements"><OtherLogs /></Disclosure>
      <p className="fine">This app stores readings from {formatKg(LIMITS.weightKg[0], account.preferences.unit)} to {formatKg(LIMITS.weightKg[1], account.preferences.unit)}. A value outside that is not saved. This is a software limit, not a clinical one.</p>
      <button type="button" className="btn quiet" onClick={() => updatePreferences(account.id, { hideWeight: !account.preferences.hideWeight })}>
        {account.preferences.hideWeight ? "Show weight numbers" : "Hide weight numbers"}
      </button>
    </section>
  );
}

function WeighInForm({ paused, onSave }: { paused: boolean; onSave: (value: number, unit: "kg" | "lb", date: string, time: string, note: string, exclude: boolean) => boolean }) {
  const { account } = useSession();
  const unit = account?.preferences.unit ?? "kg";
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("07:00");
  const [note, setNote] = useState("");
  const [exclude, setExclude] = useState(false);
  if (paused) return <p>The entry form is hidden while tracking is paused.</p>;
  return (
    <form className="card" onSubmit={(event) => {
      event.preventDefault();
      if (onSave(Number(value), unit, date, time, note, exclude)) {
        setValue("");
        setNote("");
        setExclude(false);
      }
    }}>
      <h2>Add a weigh-in</h2>
      <div className="grid-2">
        <Field label={`Weight, ${unit}`}><input required inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} /></Field>
        <Field label="Date" hint="Use the calendar. The stored date is year-month-day."><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field>
      </div>
      <Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <label className="check"><input type="checkbox" checked={exclude} onChange={(event) => setExclude(event.target.checked)} /> Different conditions. Leave this reading out of calibration. It still appears on the chart.</label>
      <Button variant="primary" type="submit">Save reading</Button>
    </form>
  );
}

function ObservationRow({ label, corrections, initialValue, initialNote, excluded, onCalibration, onSave, onDelete }: { id: string; label: string; corrections: number; initialValue: string; initialNote: string; excluded: boolean; onCalibration: () => void; onSave: (value: number, note: string) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [note, setNote] = useState(initialNote);
  return (
    <li>
      {label}
      {corrections ? ` · ${corrections} correction${corrections === 1 ? "" : "s"}` : ""}
      <button type="button" onClick={() => setOpen((v) => !v)}>Edit</button>
      <button type="button" onClick={onCalibration}>{excluded ? "Use in calibration" : "Leave out of calibration"}</button>
      {confirming ? (
        <span role="status">
          Remove this weigh-in from the chart? You can restore it afterward. The forecast is not changed.
          <button type="button" onClick={() => { onDelete(); setConfirming(false); }}>Remove reading</button>
          <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}>Remove</button>
      )}
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

function CsvImport({ paused, existing, referenceKg, onCommit }: { paused: boolean; timeZone: string; existing: { date: string; kg: number }[]; referenceKg: number; onCommit: (rows: { localDate: string; localTime: string; value: number; unit: "kg" | "lb"; note: string; sourceRecordId: string }[], text: string) => Promise<boolean> }) {
  const [text, setText] = useState("");
  const [order, setOrder] = useState<DateOrder>("ymd");
  const [dateCol, setDateCol] = useState(0);
  const [weightCol, setWeightCol] = useState(1);
  const [unitCol, setUnitCol] = useState(2);
  const [noteCol, setNoteCol] = useState(3);
  const { account } = useSession();
  const fallback = account?.preferences.unit ?? "kg";
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const table = useMemo(() => parseCsv(text), [text]);
  if (paused) return <p>CSV import is off while tracking is paused.</p>;
  const preview = table.rows.map((row, index) => {
    const date = parseLooseDate(row[dateCol] ?? "", order);
    const value = parseNumber(row[weightCol] ?? "");
    const unitText = (row[unitCol] ?? "").toLowerCase();
    const unit = unitText.includes("lb") ? "lb" : unitText.includes("kg") ? "kg" : fallback;
    const kg = value == null ? null : unit === "lb" ? lbToKg(value) : value;
    const sameDay = Boolean(date && existing.some((item) => item.date === date));
    const sameReading = Boolean(date && kg != null && existing.some((item) => item.date === date && Math.abs(item.kg - kg) < 0.05));
    const far = kg != null && Math.abs(kg - referenceKg) > Math.max(8, referenceKg * 0.15);
    const error = !date ? "Date not recognised" : value == null ? "Weight not numeric" : "";
    return { index, date, value, unit, note: row[noteCol] ?? "", sameDay, sameReading, far, error, sourceRecordId: `row-${index + 2}` };
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
      <Button onClick={() => setText(sampleCsv(fallback))}>Load sample CSV</Button>
      {table.headers.length ? (
        <>
          <div className="grid-2">
            <Field label="Date order"><select value={order} onChange={(event) => setOrder(event.target.value as DateOrder)}><option value="ymd">Year-month-day</option><option value="mdy">Month/day/year</option><option value="dmy">Day/month/year</option></select></Field>
            <p>If a row has no unit, it is read as {fallback}.</p>
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
                    <td><input type="checkbox" checked={picked[row.index] ?? (!row.error && !row.far && !row.sameReading)} disabled={Boolean(row.error)} onChange={(event) => setPicked({ ...picked, [row.index]: event.target.checked })} /></td>
                    <td>{row.date ?? "—"}</td>
                    <td>{row.value ?? "—"} {row.unit}</td>
                    <td>{importStatus(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="primary" onClick={() => void onCommit(preview.filter((row) => (picked[row.index] ?? (!row.error && !row.far && !row.sameReading)) && row.date && row.value != null).map((row) => ({ localDate: row.date!, localTime: "07:00", value: row.value!, unit: row.unit, note: row.note, sourceRecordId: row.sourceRecordId })), text).then((ok) => { if (ok) { setText(""); setPicked({}); } })}>
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
  const [note, setNote] = useState<string | null>(null);
  if (!account || !profile) return null;
  return (
    <div className="card">
      <h2>Other measurements</h2>
      <p>Waist and body composition are optional records. They are not inputs to the weight model.</p>
      {note ? <p role="status">{note}</p> : null}
      <Field label="Date" hint="Use the calendar. The stored date is year-month-day."><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label="Waist, cm" hint={`Stored between ${LIMITS.waistCm[0]} and ${LIMITS.waistCm[1]} cm. Not used by the forecast.`}><input value={waist} onChange={(event) => setWaist(event.target.value)} /></Field>
      <Button onClick={() => {
        const result = addOtherMeasurement(account.id, { profileId: profile.id, date, kind: "waist", label: "Waist", valueCm: Number(waist), note: "" });
        setNote(result.ok ? "Waist saved. It is not used by the forecast." : result.message);
        if (result.ok) setWaist("");
      }}>Save waist</Button>
      <Field label="Body fat, percent" hint={`Stored between ${LIMITS.bodyFatPct[0]} and ${LIMITS.bodyFatPct[1]} percent, or leave blank.`}><input value={fat} onChange={(event) => setFat(event.target.value)} /></Field>
      <Button onClick={() => {
        const result = addComposition(account.id, { profileId: profile.id, date, bodyFatPct: fat ? Number(fat) : null, leanMassKg: null, source: "manual", method: "unspecified", note: "Consumer estimates vary." });
        setNote(result.ok ? "Body fat saved. The forecast was not changed." : result.message);
        if (result.ok) setFat("");
      }}>Save composition</Button>
      <ul>
        {account.otherMeasurements.filter((item) => item.profileId === profile.id).map((item) => <li key={item.id}>{item.date}: {item.label} {item.valueCm} cm</li>)}
        {account.compositionLogs.filter((item) => item.profileId === profile.id).map((item) => <li key={item.id}>{item.date}: body fat {item.bodyFatPct ?? "—"}% · {item.source}</li>)}
      </ul>
    </div>
  );
}

void energy;
