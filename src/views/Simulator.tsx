import { useEffect, useMemo, useRef, useState } from "react";
import { ChangeList } from "../components/ChangeList";
import { TrajectoryChart } from "../components/Chart";
import { Timeline } from "../components/Timeline";
import { Button, Disclosure, Field, Notice } from "../components/ui";
import { PageTitle } from "../components/Shell";
import { energy, stamp } from "../format";
import { formatKg, kgToLb, lbToKg } from "../model/units";
import { addDays, todayIso } from "../model/dates";
import { activityAdjustmentKcal, resolveDay, resolvePlan, sourceLabel } from "../model/engine";
import { forecastAsync } from "../model/forecast-async";
import { explainChange, showStoredWeight } from "../model/explain";
import { ACTIVITY_CATEGORIES, CATEGORY_LABEL, LIMITS, type ActivityCategory } from "../model/parameters";
import type { ActivityMode, DayPlanInput, ForecastResult, PhaseRule, ScenarioInputs } from "../model/types";
import { go } from "../route";
import {
  applyDayEdit,
  clearDayOverrides,
  commitDraft,
  discardDraft,
  duplicateScenario,
  profileStale,
  redoDraft,
  renameScenario,
  replaceInputs,
  rerunLatest,
  rerunWithProfile,
  setActiveVersion,
  setArchived,
  setScenarioLabels,
  undoDraft,
  useSession,
} from "../state/store";
import type { ScenarioVersion } from "../state/types";

export function Simulator() {
  const { account, profile } = useSession();
  const [showArchived, setShowArchived] = useState(false);
  const scenarios = account?.scenarios.filter((item) => item.profileId === profile?.id && (showArchived || !item.archivedAt)) ?? [];
  const [scenarioId, setScenarioId] = useState(scenarios.find((item) => !item.archivedAt)?.id ?? scenarios[0]?.id ?? "");
  const scenario = scenarios.find((item) => item.id === scenarioId) ?? scenarios[0];
  const [pinned, setPinned] = useState<string | null>(null);
  const version = scenario?.versions.find((item) => item.id === (pinned ?? scenario.activeVersionId)) ?? scenario?.versions.at(-1);
  const draft = scenario ? account?.drafts[scenario.id] : undefined;
  const inputs = draft?.inputs ?? version?.inputSnapshot;
  const [selection, setSelection] = useState<{ start: string; end: string } | null>(null);
  const [preview, setPreview] = useState<ForecastResult | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showWeighIns, setShowWeighIns] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotency = useRef(crypto.randomUUID());

  useEffect(() => {
    setPreview(null);
    setSelection(null);
    setPinned(null);
  }, [scenarioId]);

  if (!account || !profile) return null;
  if (!scenario || !version || !inputs) {
    return (
      <section>
        <PageTitle kicker="Plan" title="No plan yet" lede="Write a plan to see a weight on each date." />
        <Button variant="primary" onClick={() => go("onboarding")}>
          Make a plan
        </Button>
      </section>
    );
  }

  const end = addDays(inputs.startDate, inputs.horizonDays - 1);
  const today = todayIso(account.preferences.timeZone);
  const resolved = resolvePlan(inputs);
  const marks = Object.fromEntries(resolved.map((day) => [day.date, { phase: day.phaseName, override: day.sources.intakeKcal === "override" || day.sources.steps === "override" || day.sources.activityMode === "override", noted: Boolean(day.note) }]));
  const observations = account.observations.filter((obs) => obs.profileId === profile.id && !obs.deletedAt);
  const original = scenario.versions[0];
  const stale = profileStale(profile, version.inputSnapshot.profile);
  const previewExplain = preview?.status === "complete" ? explainChange(version.inputSnapshot, version.forecast.points, inputs, preview.points) : null;

  async function run<T>(work: () => Promise<T> | T) {
    setRunning(true);
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 40));
    try {
      return await work();
    } catch (caught) {
      const id = `err_${crypto.randomUUID().slice(0, 8)}`;
      setError(`The forecast did not finish (${id}). The draft is unchanged. ${caught instanceof Error ? caught.message : ""}`);
      return null;
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="studio">
      <PageTitle kicker="Plan" title={scenario.name} lede="Change the plan, then save a version." />
      <div className="toolbar">
        <label>
          Scenario
          <select
            value={scenario.id}
            onChange={(event) => setScenarioId(event.target.value)}
          >
            {scenarios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Version
          <select value={version.id} onChange={(event) => { setPinned(event.target.value); setPreview(null); }}>
            {scenario.versions.map((item) => (
              <option key={item.id} value={item.id}>
                v{item.versionNumber}
                {item.id === scenario.activeVersionId ? " · active" : ""} · {stamp(item.createdAt)}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Archived
        </label>
        <label className="check">
          <input type="checkbox" checked={showWeighIns} onChange={(event) => setShowWeighIns(event.target.checked)} /> Weigh-ins
        </label>
        <label className="check">
          <input type="checkbox" checked={showOriginal} onChange={(event) => setShowOriginal(event.target.checked)} /> Original version
        </label>
      </div>
      {version.id !== scenario.activeVersionId ? (
        <Notice>
          Viewing version {version.versionNumber}. Version {scenario.versions.find((item) => item.id === scenario.activeVersionId)?.versionNumber} is still the active one. Nothing has been overwritten.
          <Button onClick={() => setActiveVersion(account.id, scenario.id, version.id)}>Make this version active</Button>
        </Notice>
      ) : null}
      {draft ? <Notice tone="warn">Unsaved draft. The chart’s solid line is the saved version until you preview or save.</Notice> : null}
      {stale ? (
        <Notice tone="warn">
          Profile inputs changed after this version. The forecast still uses the snapshot from {stamp(version.createdAt)}. Other scenarios keep their own snapshots.
          <Button
            onClick={() =>
              void run(async () => {
                const result = await rerunWithProfile(account.id, scenario.id, version.id, profile);
                if (!result.ok) setError(`${result.message} ${result.errorId}`);
                else setMessage("A new version uses the current profile. The previous version is still saved. Planned days were copied, not rewritten by the app.");
              })
            }
          >
            Re-run with current profile
          </Button>
        </Notice>
      ) : null}
      {running ? <p className="status" role="status">Working…</p> : null}
      {error ? <p className="status error" role="alert">{error}</p> : null}
      {message ? <p className="status" role="status">{message}</p> : null}
      <TrajectoryChart
        caption={`${scenario.name}, version ${version.versionNumber}`}
        unit={account.preferences.unit}
        hideAbsolute={account.preferences.hideWeight}
        dateStyle={account.preferences.dateFormat}
        today={today}
        goalKg={inputs.goal?.weightKg}
        goalDate={inputs.goal?.date}
        goalLabel={inputs.goal?.label}
        milestones={inputs.milestones.filter((mark) => !mark.removedAt)}
        cycleDates={account.consents.some((item) => item.consentType === "cycle-context" && item.grantedAt && !item.revokedAt) ? account.cycleLogs.filter((log) => log.profileId === profile.id).map((log) => log.date) : []}
        observations={showWeighIns ? observations.map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source })) : []}
        series={[
          { id: version.id, label: `Version ${version.versionNumber}`, points: toChartPoints(version.forecast.points), band: !preview },
          ...(preview?.status === "complete" ? [{ id: "preview", label: "Unsaved preview", dash: "5 5", points: toChartPoints(preview.points), band: true }] : []),
          ...(showOriginal && original.id !== version.id ? [{ id: original.id, label: "Original version", dash: "2 4", points: toChartPoints(original.forecast.points), band: false }] : []),
        ]}
      />
      <Disclosure title="Why this forecast">
        <ChangeList change={previewExplain ?? version.change} dateStyle={account.preferences.dateFormat} unit={account.preferences.unit} />
        <p>
          Saved {stamp(version.forecast.completedAt)}.
          <button type="button" className="btn quiet" onClick={() => void navigator.clipboard.writeText(version.inputHash)}>Copy run id</button>
        </p>
        {version.forecast.warnings.map((warning) => (
          <p key={warning}>{showStoredWeight(warning, account.preferences.unit)}</p>
        ))}
      </Disclosure>
      <div className="studio-grid">
        <Timeline
          start={inputs.startDate}
          end={end}
          today={today}
          selectedStart={selection?.start ?? null}
          selectedEnd={selection?.end ?? null}
          marks={marks}
          dateStyle={account.preferences.dateFormat}
          onSelect={(date, extend) => {
            setSelection((current) => {
              if (extend && current) return { start: current.start, end: date };
              return { start: date, end: date };
            });
          }}
        />
        <DayEditor
          inputs={inputs}
          selection={selection}
          onApply={(patch, note) => {
            if (!selection) return;
            applyDayEdit(account.id, scenario.id, draft?.baseVersionId ?? version.id, selection.start, selection.end, patch, note);
            setPreview(null);
            setMessage(null);
          }}
          onClear={() => {
            if (!selection) return;
            clearDayOverrides(account.id, scenario.id, draft?.baseVersionId ?? version.id, selection.start, selection.end);
            setPreview(null);
          }}
          onInputs={(next) => {
            replaceInputs(account.id, scenario.id, draft?.baseVersionId ?? version.id, next);
            setPreview(null);
          }}
        />
      </div>
      <div className="toolbar">
        <Button
          variant="primary"
          disabled={running || !draft}
          onClick={() =>
            void run(async () => {
              const result = await commitDraft(account.id, scenario.id, idempotency.current, "edit");
              if (!result.ok) setError(`${result.message}`);
              else {
                idempotency.current = crypto.randomUUID();
                setPreview(null);
                setPinned(null);
                setMessage("Saved as a new version. The previous version is unchanged.");
              }
            })
          }
        >
          Save as new version
        </Button>
        <Button
          disabled={running}
          onClick={() =>
            void run(async () => {
              const result = await forecastAsync(inputs);
              if (result.status === "refused") setError(result.refusal?.message ?? "The preview was refused.");
              else setPreview(result);
            })
          }
        >
          {running ? "Working…" : "Preview forecast"}
        </Button>
        <Button disabled={!draft?.past.length} onClick={() => { undoDraft(account.id, scenario.id); setPreview(null); setMessage("Undid the last draft edit. Save a version when you want to keep what remains."); }}>
          Undo draft
        </Button>
        <Button disabled={!draft?.future.length} onClick={() => { redoDraft(account.id, scenario.id); setPreview(null); setMessage("Redid the draft edit."); }}>
          Redo draft
        </Button>
        <Button
          disabled={!draft}
          onClick={() => {
            discardDraft(account.id, scenario.id);
            setPreview(null);
            setMessage("Draft discarded. The saved version is unchanged.");
          }}
        >
          Cancel draft
        </Button>
        <Button onClick={() => go("report")}>Print report</Button>
      </div>
      <ScenarioMeta accountId={account.id} scenarioId={scenario.id} version={version} name={scenario.name} labels={scenario.labels} archived={Boolean(scenario.archivedAt)} />
    </section>
  );
}

function toChartPoints(points: ScenarioVersion["forecast"]["points"]) {
  return points.map((point) => ({
    date: point.date,
    kg: point.centralKg,
    lower: point.lowerKg,
    upper: point.upperKg,
    intake: point.intakeKcal,
    expenditure: point.expenditureKcal,
  }));
}

function DayEditor({
  inputs,
  selection,
  onApply,
  onClear,
  onInputs,
}: {
  inputs: ScenarioInputs;
  selection: { start: string; end: string } | null;
  onApply: (patch: Partial<DayPlanInput>, note?: string) => void;
  onClear: () => void;
  onInputs: (inputs: ScenarioInputs) => void;
}) {
  const day = selection ? resolveDay(inputs, selection.start) : null;
  const [intake, setIntake] = useState("0");
  const [mode, setMode] = useState<ActivityMode>("steps");
  const [category, setCategory] = useState<ActivityCategory>("moderate");
  const [steps, setSteps] = useState("0");
  const [pal, setPal] = useState("");
  const [explicit, setExplicit] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [note, setNote] = useState("");
  const [writeIntake, setWriteIntake] = useState(false);
  const [writeActivity, setWriteActivity] = useState(false);
  const [writeNote, setWriteNote] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!day) return;
    setIntake(String(Math.round(day.intakeKcal)));
    setMode(day.activityMode);
    setCategory(day.activityCategory);
    setSteps(String(Math.round(day.steps)));
    setPal(day.pal == null ? "" : String(day.pal));
    setExplicit(String(Math.round(day.explicitActivityKcal)));
    setMinutes(String(Math.round(day.exerciseMinutes)));
    setNote(day.note);
    setWriteIntake(false);
    setWriteActivity(false);
    setWriteNote(false);
    setConfirm(false);
  }, [day?.date, selection?.start, selection?.end, inputs]);

  const rangeLabel = selection ? (selection.start === selection.end ? selection.start : `${selection.start} through ${selection.end}, inclusive`) : "No dates selected";
  const hasOverride = useMemo(() => {
    if (!selection) return false;
    const [from, to] = selection.start <= selection.end ? [selection.start, selection.end] : [selection.end, selection.start];
    return inputs.overrides.some((item) => item.date >= from && item.date <= to);
  }, [inputs.overrides, selection]);

  function apply() {
    const patch: Partial<DayPlanInput> = {};
    if (writeIntake) {
      const value = Number(intake);
      if (!Number.isFinite(value)) return;
      patch.intakeKcal = value;
    }
    if (writeActivity) {
      patch.activityMode = mode;
      patch.activityCategory = category;
      patch.steps = Number(steps);
      patch.pal = pal.trim() === "" ? null : Number(pal);
      patch.explicitActivityKcal = Number(explicit);
      patch.exerciseMinutes = Number(minutes);
    }
    if (!writeIntake && !writeActivity && !writeNote) return;
    if (hasOverride && !confirm) {
      setConfirm(true);
      return;
    }
    onApply(patch, writeNote ? note : undefined);
    setConfirm(false);
  }

  return (
    <div className="editor">
      <h2>Selected dates</h2>
      <p>{rangeLabel}. Shift-click or shift-arrow extends a range. Both ends are included.</p>
      {day ? (
        <>
          <p>{energy(day.intakeKcal)} planned. Activity {energy(activityAdjustmentKcal(day, inputs.profile).kcal)}.</p>
          <Disclosure title="Where these numbers come from">
            <p>{`Intake comes from the ${sourceLabel(day.sources.intakeKcal, day).toLowerCase()}. Activity comes from the ${sourceLabel(day.sources.activityMode, day).toLowerCase()}.`}</p>
          </Disclosure>
          <Field label="Intake, kcal/day" hint="A planned assumption. Food logging is not required.">
            <input value={intake} inputMode="decimal" onChange={(event) => { setIntake(event.target.value); setWriteIntake(true); }} />
          </Field>
          <Field label="Activity mode">
            <select value={mode} onChange={(event) => { setMode(event.target.value as ActivityMode); setWriteActivity(true); }}>
              <option value="category">Activity category and PAL</option>
              <option value="steps">Steps recorded, PAL unchanged</option>
              <option value="explicit-kcal">Explicit activity energy</option>
            </select>
          </Field>
          <Field label="Category" hint="Only sedentary has a published PAL (1.5) when the PAL field is empty. Other categories keep the reference PAL.">
            <select value={category} onChange={(event) => { setCategory(event.target.value as ActivityCategory); setWriteActivity(true); }}>
              {ACTIVITY_CATEGORIES.map((item) => (
                <option key={item} value={item}>{CATEGORY_LABEL[item]}</option>
              ))}
            </select>
          </Field>
          <Field label="Activity level" hint="Leave blank to keep the current value. 1.5 is the usual starting point.">
            <input value={pal} inputMode="decimal" onChange={(event) => { setPal(event.target.value); setWriteActivity(true); }} />
          </Field>
          <Field label="Steps" hint="Saved with the plan. Steps do not change the curve.">
            <input value={steps} inputMode="numeric" onChange={(event) => { setSteps(event.target.value); setWriteActivity(true); }} />
          </Field>
          <Field label="Explicit activity energy, kcal/day" hint="Replaces the δ × body-weight term. PAL, steps, and exercise minutes are not added on top.">
            <input value={explicit} inputMode="decimal" onChange={(event) => { setExplicit(event.target.value); setWriteActivity(true); }} />
          </Field>
          <Field label="Structured exercise, minutes" hint="Stored only. No published kcal-per-minute term is applied.">
            <input value={minutes} inputMode="numeric" onChange={(event) => { setMinutes(event.target.value); setWriteActivity(true); }} />
          </Field>
          <Field label="Note" hint="Context only. A note does not change the model.">
            <textarea value={note} onChange={(event) => { setNote(event.target.value); setWriteNote(true); }} />
          </Field>
          {confirm ? <Notice tone="warn">Some selected dates already have overrides. Applying replaces those fields on each date in the range.</Notice> : null}
          <div className="toolbar">
            <Button variant="primary" onClick={apply}>{confirm ? "Replace existing overrides" : "Apply to draft"}</Button>
            <Button onClick={onClear}>Clear overrides in range</Button>
          </div>
        </>
      ) : (
        <p>Select a day on the timeline.</p>
      )}
      <PhaseEditor inputs={inputs} onInputs={onInputs} />
      <WeekEditor inputs={inputs} onInputs={onInputs} />
      <CopyEditor inputs={inputs} selection={selection} onInputs={onInputs} />
      <MarkerEditor inputs={inputs} onInputs={onInputs} />
    </div>
  );
}

function PhaseEditor({ inputs, onInputs }: { inputs: ScenarioInputs; onInputs: (inputs: ScenarioInputs) => void }) {
  const [name, setName] = useState("Phase");
  const [start, setStart] = useState(inputs.startDate);
  const [end, setEnd] = useState(addDays(inputs.startDate, Math.min(13, inputs.horizonDays - 1)));
  const [intake, setIntake] = useState("2300");
  const [steps, setSteps] = useState("10000");
  const [pal, setPal] = useState("");
  return (
    <Disclosure title="Phases">
      <p className="fine">A phase covers its start and end dates, inclusive. If two phases overlap, the one that starts later applies. A single-day override still wins.</p>
      <ul className="plain">
        {inputs.phases.map((phase) => (
          <li key={phase.id}>
            {phase.name}: {phase.start} to {phase.end}
            <button type="button" onClick={() => onInputs({ ...inputs, phases: inputs.phases.filter((item) => item.id !== phase.id) })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid-2">
        <Field label="Name"><input value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Intake"><input value={intake} onChange={(event) => setIntake(event.target.value)} /></Field>
        <Field label="Start"><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
        <Field label="End"><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
        <Field label="Steps" hint="Saved only. Steps do not change the curve."><input value={steps} onChange={(event) => setSteps(event.target.value)} /></Field>
        <Field label="PAL" hint="Optional. Blank keeps the PAL already on those dates."><input value={pal} onChange={(event) => setPal(event.target.value)} /></Field>
      </div>
      <Button
        onClick={() => {
          const phase: PhaseRule = {
            id: crypto.randomUUID(),
            name: name || "Phase",
            start,
            end,
            inputs: {
              intakeKcal: Number(intake),
              steps: Number(steps),
              ...(pal.trim() === "" ? {} : { pal: Number(pal) }),
            },
            note: "",
          };
          onInputs({ ...inputs, phases: [...inputs.phases, phase] });
        }}
      >
        Add phase to draft
      </Button>
    </Disclosure>
  );
}

function WeekEditor({ inputs, onInputs }: { inputs: ScenarioInputs; onInputs: (inputs: ScenarioInputs) => void }) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const [cells, setCells] = useState(() => weekCells(inputs));
  const [status, setStatus] = useState<string | null>(null);
  const signature = JSON.stringify(inputs.weekly.days);
  useEffect(() => setCells(weekCells(inputs)), [signature]);
  return (
    <Disclosure title="Weekday template">
      <p>This fills empty days. Blank leaves a field alone. Nothing is written until you apply it.</p>
      <label className="check">
        <input type="checkbox" checked={inputs.weekly.enabled} onChange={(event) => onInputs({ ...inputs, weekly: { ...inputs.weekly, enabled: event.target.checked } })} />
        Use weekday template
      </label>
      <div className="week-row week-head" aria-hidden="true"><span>Day</span><span>Intake, kcal</span><span>PAL</span></div>
      {labels.map((label, index) => (
        <div key={label} className="week-row">
          <span>{label}</span>
          <input aria-label={`${label} intake, kcal`} inputMode="decimal" placeholder="Intake" value={cells[index].intake} onChange={(event) => setCells(cells.map((cell, i) => i === index ? { ...cell, intake: event.target.value } : cell))} />
          <input aria-label={`${label} PAL`} inputMode="decimal" placeholder="PAL" value={cells[index].pal} onChange={(event) => setCells(cells.map((cell, i) => i === index ? { ...cell, pal: event.target.value } : cell))} />
        </div>
      ))}
      {status ? <p role="status">{status}</p> : null}
      <Button onClick={() => {
        const days = { ...inputs.weekly.days };
        for (let index = 0; index < cells.length; index++) {
          const intakeText = cells[index].intake.trim();
          const palText = cells[index].pal.trim();
          const intakeKcal = intakeText === "" ? undefined : Number(intakeText);
          const pal = palText === "" ? undefined : Number(palText);
          if (intakeKcal != null && (!Number.isFinite(intakeKcal) || intakeKcal < LIMITS.intakeKcal[0] || intakeKcal > LIMITS.intakeKcal[1])) {
            setStatus(`${labels[index]} intake must be between ${LIMITS.intakeKcal[0]} and ${LIMITS.intakeKcal[1]} kcal, or blank. Nothing was applied.`);
            return;
          }
          if (pal != null && (!Number.isFinite(pal) || pal < LIMITS.pal[0] || pal > LIMITS.pal[1])) {
            setStatus(`${labels[index]} PAL must be between ${LIMITS.pal[0]} and ${LIMITS.pal[1]}, or blank. Nothing was applied.`);
            return;
          }
          const key = index as 0 | 1 | 2 | 3 | 4 | 5 | 6;
          days[key] = { ...days[key], intakeKcal, pal };
        }
        onInputs({ ...inputs, weekly: { ...inputs.weekly, days } });
        setStatus("Weekday template applied to the draft. Save a version when you want to keep it.");
      }}>Apply weekday template</Button>
    </Disclosure>
  );
}

function weekCells(inputs: ScenarioInputs) {
  return [0, 1, 2, 3, 4, 5, 6].map((index) => {
    const day = inputs.weekly.days[index as 0 | 1 | 2 | 3 | 4 | 5 | 6];
    return { intake: day?.intakeKcal == null ? "" : String(day.intakeKcal), pal: day?.pal == null ? "" : String(day.pal) };
  });
}

function CopyEditor({ inputs, selection, onInputs }: { inputs: ScenarioInputs; selection: { start: string; end: string } | null; onInputs: (inputs: ScenarioInputs) => void }) {
  const [target, setTarget] = useState(inputs.startDate);
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return (
    <Disclosure title="Copy">
      <Field label="Copy onto this start date" hint="Year-month-day. Copying onto a phase day asks before it replaces that day.">
        <input type="date" value={target} onChange={(event) => { setTarget(event.target.value); setConfirm(false); }} />
      </Field>
      {status ? <p role="status">{status}</p> : null}
      {confirm ? <Notice tone="warn">The destination already has edits or a phase. Copy again to replace those dates.</Notice> : null}
      <div className="toolbar">
        <Button onClick={() => copy(1)}>Copy selected day</Button>
        <Button onClick={() => copy(7)}>Copy seven days</Button>
      </div>
    </Disclosure>
  );

  function copy(count: number) {
    if (!selection) {
      setStatus("Select a day on the calendar first. Nothing was copied.");
      return;
    }
    const sourceStart = selection.start;
    const next = structuredClone(inputs);
    let replaced = false;
    for (let i = 0; i < count; i++) {
      const from = addDays(sourceStart, i);
      const to = addDays(target, i);
      const source = resolveDay(inputs, from);
      const destination = resolveDay(inputs, to);
      const inPhase = inputs.phases.some((phase) => to >= phase.start && to <= phase.end);
      if (next.overrides.some((item) => item.date === to) || inPhase || destination.phaseName) replaced = true;
      next.overrides = next.overrides.filter((item) => item.date !== to);
      next.overrides.push({
        date: to,
        inputs: {
          intakeKcal: source.intakeKcal,
          activityMode: source.activityMode,
          activityCategory: source.activityCategory,
          steps: source.steps,
          pal: source.pal,
          explicitActivityKcal: source.explicitActivityKcal,
          exerciseMinutes: source.exerciseMinutes,
        },
        note: source.note,
      });
    }
    if (replaced && !confirm) {
      setConfirm(true);
      return;
    }
    next.overrides.sort((a, b) => a.date.localeCompare(b.date));
    onInputs(next);
    setConfirm(false);
    setStatus(replaced ? `Copied ${count} day${count === 1 ? "" : "s"} over a phase or an existing edit. Undo draft is below the chart if you want the previous draft back.` : `Copied ${count} day${count === 1 ? "" : "s"} onto the draft. Save a version when you want to keep it.`);
  }
}

function MarkerEditor({ inputs, onInputs }: { inputs: ScenarioInputs; onInputs: (inputs: ScenarioInputs) => void }) {
  const { account } = useSession();
  const unit = account?.preferences.unit ?? "kg";
  const [label, setLabel] = useState("Marker");
  const [date, setDate] = useState(inputs.startDate);
  const [goal, setGoal] = useState(inputs.goal?.weightKg == null ? "" : (unit === "lb" ? kgToLb(inputs.goal.weightKg) : inputs.goal.weightKg).toFixed(1));
  const [goalDate, setGoalDate] = useState(inputs.goal?.date ?? "");
  const [status, setStatus] = useState<string | null>(null);
  return (
    <Disclosure title="Chart marker and notes">
      <p>A marker is a mark on the chart. It does not change the starting weight.</p>
      <Field label={`Chart marker, ${unit}`}>
        <input value={goal} onChange={(event) => { setGoal(event.target.value); setStatus(null); }} />
      </Field>
      <Field label="Target date">
        <input type="date" value={goalDate} onChange={(event) => { setGoalDate(event.target.value); setStatus(null); }} />
      </Field>
      {status ? <p role="status">{status}</p> : null}
      <Button
        onClick={() => {
          const typed = goal.trim() === "" ? null : Number(goal);
          const weightKg = typed == null ? null : unit === "lb" ? lbToKg(typed) : typed;
          if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < LIMITS.weightKg[0] || weightKg > LIMITS.weightKg[1])) {
            setStatus(`A chart marker must be between ${formatKg(LIMITS.weightKg[0], unit)} and ${formatKg(LIMITS.weightKg[1], unit)}, or blank to remove it. Nothing was saved.`);
            return;
          }
          onInputs({ ...inputs, goal: weightKg == null ? null : { weightKg, date: goalDate || null, label: "Chart marker" } });
          setStatus(weightKg == null ? "Chart marker removed from the draft." : `Chart marker ${formatKg(weightKg, unit)} saved on the draft.`);
        }}
      >
        Save chart marker
      </Button>
      <ul className="plain">
        {inputs.milestones.map((mark) => (
          <li key={mark.id}>
            {mark.date}: {mark.label}{mark.removedAt ? " · removed" : ""}
            <button type="button" onClick={() => onInputs({ ...inputs, milestones: inputs.milestones.map((item) => item.id === mark.id ? { ...item, removedAt: item.removedAt ? null : new Date().toISOString() } : item) })}>
              {mark.removedAt ? "Restore" : "Remove"}
            </button>
          </li>
        ))}
      </ul>
      <Field label="Milestone label"><input value={label} onChange={(event) => setLabel(event.target.value)} /></Field>
      <Field label="Milestone date" hint="Year-month-day. The milestone is a label on the chart."><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Button onClick={() => { onInputs({ ...inputs, milestones: [...inputs.milestones, { id: crypto.randomUUID(), date, label: label.trim() || "Milestone" }] }); setLabel(""); setStatus(`Milestone ${label.trim() || "Milestone"} on ${date} saved on the draft and drawn on the chart.`); }}>Add milestone</Button>
      <Horizon inputs={inputs} onInputs={onInputs} />
    </Disclosure>
  );
}

function Horizon({ inputs, onInputs }: { inputs: ScenarioInputs; onInputs: (inputs: ScenarioInputs) => void }) {
  const [days, setDays] = useState(String(inputs.horizonDays));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <div>
      <Field label="Horizon, local days" hint={`Whole days from ${LIMITS.horizonMin} to ${LIMITS.horizonMax}. Past ${LIMITS.horizonWarnAfter} days, the view is an unvalidated extrapolation.`}>
        <input value={days} onChange={(event) => { setDays(event.target.value); setError(null); }} />
      </Field>
      {error ? <p role="alert">{error}</p> : null}
      {saved ? <p role="status">{saved}</p> : null}
      <Button onClick={() => {
        const count = Number(days);
        if (!Number.isInteger(count) || count < LIMITS.horizonMin || count > LIMITS.horizonMax) {
          setError(`Enter a whole number from ${LIMITS.horizonMin} to ${LIMITS.horizonMax} days. The horizon was not changed.`);
          setSaved(null);
          return;
        }
        setError(null);
        onInputs({ ...inputs, horizonDays: count });
        setSaved(`Horizon of ${count} days saved on the draft.`);
      }}>Apply horizon to draft</Button>
    </div>
  );
}

function downloadPhases(inputs: ScenarioInputs) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trajectory//Phases//EN", "CALSCALE:GREGORIAN"];
  for (const phase of inputs.phases) {
    const endExclusive = addDays(phase.end, 1).replaceAll("-", "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${phase.id}@trajectory.local`,
      `DTSTART;VALUE=DATE:${phase.start.replaceAll("-", "")}`,
      `DTEND;VALUE=DATE:${endExclusive}`,
      `SUMMARY:${phase.name.replaceAll(/[\r\n,;]/g, " ")}`,
      "DESCRIPTION:Scenario phase dates only. Measurements are not included. The end date in the plan is inclusive.",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "trajectory-phases.ics";
  link.click();
  URL.revokeObjectURL(url);
}

function ScenarioMeta({ accountId, scenarioId, version, name, labels, archived }: { accountId: string; scenarioId: string; version: ScenarioVersion; name: string; labels: string[]; archived: boolean }) {
  const [title, setTitle] = useState(name);
  const [tag, setTag] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => setTitle(name), [name]);
  return (
    <Disclosure title="Scenario, versions, and assumptions">
      <Field label="Name" hint="Renaming does not recalculate and does not create a version.">
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Button onClick={() => { renameScenario(accountId, scenarioId, title); setStatus(`Scenario name “${title}” saved. The forecast was not recalculated.`); }}>Rename</Button>
      {status ? <p role="status">{status}</p> : null}
      <p>Labels: {labels.join(", ") || "None"}. Labels are names you chose. They do not assume a weight goal.</p>
      <Field label="Add label">
        <input value={tag} onChange={(event) => setTag(event.target.value)} />
      </Field>
      <Button onClick={() => tag.trim() && setScenarioLabels(accountId, scenarioId, [...new Set([...labels, tag.trim()])])}>Add label</Button>
      <div className="toolbar">
        <Button onClick={() => void duplicateScenario(accountId, scenarioId, version.id)}>Duplicate this version</Button>
        <Button onClick={() => void rerunLatest(accountId, scenarioId, version.id)}>Recalculate with latest model</Button>
        <Button onClick={() => downloadPhases(version.inputSnapshot)}>Download phase calendar</Button>
        {confirmRemove ? (
          <span role="status">
            Remove this scenario from the active list? The versions stay on this device and can be restored.
            <Button onClick={() => { setArchived(accountId, scenarioId, true); setConfirmRemove(false); setStatus("Scenario removed from the active list. The versions are still on this device."); }}>Remove scenario</Button>
            <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
          </span>
        ) : (
          <Button onClick={() => {
            if (archived) {
              setArchived(accountId, scenarioId, false);
              setStatus("Scenario restored to the active list.");
              return;
            }
            setConfirmRemove(true);
          }}>{archived ? "Restore scenario" : "Remove scenario"}</Button>
        )}
      </div>
      <ul className="assumptions">
        {version.assumptions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Disclosure>
  );
}
