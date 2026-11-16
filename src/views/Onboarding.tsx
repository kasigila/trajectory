import { useState } from "react";
import { DISCLAIMER } from "../copy";
import { ageOn, isIsoDate, todayIso } from "../model/dates";
import { ACTIVITY_CATEGORIES, CATEGORY_LABEL, LIMITS } from "../model/parameters";
import { ftInToCm, lbToKg } from "../model/units";
import { go } from "../route";
import { finishOnboarding, saveOnboarding, startOnboarding, useDb } from "../state/store";
import type { OnboardingDraft } from "../state/types";
import { Button, Field, Notice } from "../components/ui";

const STEPS = ["Purpose", "Eligibility", "Units", "Body", "Parameter", "Composition", "Energy", "Plan", "Review"];

export function Onboarding() {
  const db = useDb();
  const draft = db.onboarding;
  if (!draft) {
    return (
      <main className="gate">
        <h1>New profile</h1>
        <p>A profile holds the body inputs for scenarios on this device. You can keep it in the current session or make a separate local session.</p>
        <Button variant="primary" onClick={() => startOnboarding(false)}>Add to this session</Button>
        <Button onClick={() => startOnboarding(true)}>Separate local session</Button>
        <Button onClick={() => go("overview")}>Back</Button>
      </main>
    );
  }
  return <Wizard draft={draft} />;
}

function Wizard({ draft }: { draft: OnboardingDraft }) {
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  function patch(partial: Partial<OnboardingDraft>) {
    setError(null);
    saveOnboarding({ ...draft, ...partial });
  }
  async function finish() {
    setError(null);
    setBusy(true);
    const result = await finishOnboarding(draft, passphrase);
    setBusy(false);
    if (!result.ok) setError(result.message);
    else go("simulator");
  }
  return (
    <main className="gate">
      <p className="kicker">Step {draft.step + 1} of {STEPS.length}</p>
      <h1>{STEPS[draft.step]}</h1>
      {draft.step === 0 ? (
        <>
          <p>Trajectory shows how a plan you write could move a Hall-model weight trajectory. It cannot tell you what to eat or how to train, and it will not change the plan for you.</p>
          <p>{DISCLAIMER}</p>
        </>
      ) : null}
      {draft.step === 1 ? (
        <>
          <Field label="Profile date of birth" hint="Age is used in the Jackson body-fat estimate and in Mifflin–St Jeor. Use the calendar. The stored date is year-month-day. This date is the profile’s, separate from the 18+ check.">
            <input type="date" value={draft.birthDate} onChange={(event) => patch({ birthDate: event.target.value })} />
          </Field>
          <Field label="Excluded context" hint="If one of these applies, the app will not make a personalized forecast.">
            <select value={draft.excludedContext} onChange={(event) => patch({ excludedContext: event.target.value as OnboardingDraft["excludedContext"] })}>
              <option value="none">None of these</option>
              <option value="pregnancy">Pregnancy</option>
              <option value="breastfeeding">Breastfeeding</option>
              <option value="medical-management">Managing a medical condition</option>
              <option value="pediatric">Pediatric use</option>
              <option value="other">Another excluded context</option>
            </select>
          </Field>
        </>
      ) : null}
      {draft.step === 2 ? (
        <>
          <Field label="Weight unit"><select value={draft.unit} onChange={(event) => patch({ unit: event.target.value as "kg" | "lb" })}><option value="kg">Kilograms</option><option value="lb">Pounds</option></select></Field>
          <Field label="Height unit"><select value={draft.lengthUnit} onChange={(event) => patch({ lengthUnit: event.target.value as "cm" | "ft" })}><option value="cm">Centimetres</option><option value="ft">Feet and inches</option></select></Field>
        </>
      ) : null}
      {draft.step === 3 ? (
        <>
          <Field label="Profile name"><input value={draft.label} onChange={(event) => patch({ label: event.target.value })} /></Field>
          {draft.lengthUnit === "cm" ? (
            <Field label="Height, cm" hint="Used in the Jackson equation and in Mifflin–St Jeor."><input value={draft.heightCm} onChange={(event) => patch({ heightCm: event.target.value })} /></Field>
          ) : (
            <div className="grid-2">
              <Field label="Feet"><input value={draft.heightFeet} onChange={(event) => patch({ heightFeet: event.target.value })} /></Field>
              <Field label="Inches" hint="Used in the Jackson equation and in Mifflin–St Jeor."><input value={draft.heightInches} onChange={(event) => patch({ heightInches: event.target.value })} /></Field>
            </div>
          )}
          <Field label={`Reference weight, ${draft.unit}`} hint="The Hall model starts the first scenario day at this weight.">
            <input value={draft.weightKg} onChange={(event) => patch({ weightKg: event.target.value })} />
          </Field>
        </>
      ) : null}
      {draft.step === 4 ? (
        <>
          <p>The Hall model uses a sex-related physiological parameter for the Jackson fat equation and the Mifflin–St Jeor resting equation. It is a model input, not a statement of identity. If you leave it unspecified, no personalized forecast is created. Nothing is guessed.</p>
          <Field label="Parameter set">
            <select value={draft.sexParameter} onChange={(event) => patch({ sexParameter: event.target.value as OnboardingDraft["sexParameter"] })}>
              <option value="unspecified">Not sure / prefer not to provide</option>
              <option value="parameter-a">Men’s published equations</option>
              <option value="parameter-b">Women’s published equations</option>
            </select>
          </Field>
        </>
      ) : null}
      {draft.step === 5 ? (
        <>
          <p>Optional. A body-fat percent replaces the Jackson estimate. Leave blank to use Jackson et al. 2002. Consumer estimates vary.</p>
          <Field label="Body fat, percent"><input value={draft.bodyFatPct} onChange={(event) => patch({ bodyFatPct: event.target.value })} /></Field>
          <Field label="Source"><input value={draft.bodyFatSource} onChange={(event) => patch({ bodyFatSource: event.target.value })} /></Field>
          <Field label="Lean mass, kg"><input value={draft.leanMassKg} onChange={(event) => patch({ leanMassKg: event.target.value })} /></Field>
        </>
      ) : null}
      {draft.step === 6 ? (
        <>
          <Field label="How should maintenance be represented?">
            <select value={draft.energyBasis} onChange={(event) => patch({ energyBasis: event.target.value as OnboardingDraft["energyBasis"] })}>
              <option value="user-estimate">I will enter a baseline expenditure</option>
              <option value="model-estimated">Model estimate: reference PAL × Mifflin–St Jeor RMR</option>
            </select>
          </Field>
          {draft.energyBasis === "user-estimate" ? (
            <Field label="Baseline expenditure, kcal/day" hint="The intake that would hold the reference weight. It sets K. It is not a measurement.">
              <input value={draft.maintenanceKcal} onChange={(event) => patch({ maintenanceKcal: event.target.value })} />
            </Field>
          ) : null}
          <Field label="Reference activity">
            <select value={draft.activityCategory} onChange={(event) => patch({ activityCategory: event.target.value as OnboardingDraft["activityCategory"] })}>
              {ACTIVITY_CATEGORIES.map((item) => <option key={item} value={item}>{CATEGORY_LABEL[item]}</option>)}
            </select>
          </Field>
          <Field label="Reference PAL" hint="Hall webappendix equation (8). Sedentary in that paper is 1.5.">
            <input value={draft.referencePal} onChange={(event) => patch({ referencePal: event.target.value })} />
          </Field>
          <Field label="Reference steps" hint="Stored only. Steps are not converted to energy."><input value={draft.steps} onChange={(event) => patch({ steps: event.target.value })} /></Field>
        </>
      ) : null}
      {draft.step === 7 ? (
        <>
          <Field label="Scenario name"><input value={draft.scenarioName} onChange={(event) => patch({ scenarioName: event.target.value })} /></Field>
          <Field label="Template" hint="A convenience preset, not a recommendation.">
            <select value={draft.template} onChange={(event) => patch({ template: event.target.value as OnboardingDraft["template"] })}>
              <option value="same">Same assumptions each day</option>
              <option value="weekday-weekend">Weekday / weekend pattern</option>
            </select>
          </Field>
          <Field label="Start date" hint="Use the calendar. The stored date is year-month-day."><input type="date" value={draft.startDate} onChange={(event) => patch({ startDate: event.target.value })} /></Field>
          <Field label="Horizon, days"><input value={draft.horizonDays} onChange={(event) => patch({ horizonDays: event.target.value })} /></Field>
          <Field label="Baseline intake, kcal"><input value={draft.intakeKcal} onChange={(event) => patch({ intakeKcal: event.target.value })} /></Field>
          {draft.template === "weekday-weekend" ? (
            <>
              <Field label="Weekend intake"><input value={draft.weekendIntakeKcal} onChange={(event) => patch({ weekendIntakeKcal: event.target.value })} /></Field>
              <Field label="Weekend steps"><input value={draft.weekendSteps} onChange={(event) => patch({ weekendSteps: event.target.value })} /></Field>
            </>
          ) : null}
          {draft.separateAccount ? (
            <>
              <Field label="Session name"><input value={draft.accountName} onChange={(event) => patch({ accountName: event.target.value })} /></Field>
              <Field label="Device passphrase" hint="Stored only as a hash on this device. It cannot be reset by email.">
                <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
              </Field>
            </>
          ) : null}
        </>
      ) : null}
      {draft.step === 8 ? (
        <ul className="plain">
          <li>Name: {draft.label || "—"}</li>
          <li>Date of birth: {draft.birthDate || "—"}</li>
          <li>Height: {draft.lengthUnit === "cm" ? `${draft.heightCm || "—"} cm` : `${draft.heightFeet || "—"} ft ${draft.heightInches || "0"} in`}</li>
          <li>Reference weight: {draft.weightKg || "—"} {draft.unit}</li>
          <li>Parameter: {parameterLabel(draft.sexParameter)}</li>
          <li>Body fat: {draft.bodyFatPct.trim() ? `${draft.bodyFatPct}%` : "Not entered"}{draft.bodyFatSource.trim() ? `, source ${draft.bodyFatSource.trim()}` : ""}</li>
          <li>Lean mass: {draft.leanMassKg.trim() ? `${draft.leanMassKg} kg` : "Not entered"}</li>
          <li>Energy basis: {energyLabel(draft.energyBasis)}{draft.energyBasis === "user-estimate" ? `, ${draft.maintenanceKcal || "—"} kcal` : ""}</li>
          <li>Plan: {draft.scenarioName}, {draft.template}, {draft.horizonDays} days from {draft.startDate}, intake {draft.intakeKcal || "—"} kcal</li>
          <li>Excluded context: {draft.excludedContext}</li>
        </ul>
      ) : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <div className="toolbar">
        <Button disabled={draft.step === 0} onClick={() => patch({ step: draft.step - 1 })}>Back</Button>
        {draft.step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => {
            const problem = stepError(draft);
            if (problem) setError(problem);
            else patch({ step: draft.step + 1 });
          }}>Continue</Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => void finish()}>{busy ? "Saving…" : "Save profile and scenario"}</Button>
        )}
        <Button onClick={() => { saveOnboarding(null); go("overview"); }}>Leave without saving</Button>
      </div>
      <p className="fine">Progress on this form is kept in this browser until you save or leave.</p>
    </main>
  );
}

function parameterLabel(value: OnboardingDraft["sexParameter"]) {
  if (value === "parameter-a") return "Men’s published equations";
  if (value === "parameter-b") return "Women’s published equations";
  return "Not specified";
}

function energyLabel(value: OnboardingDraft["energyBasis"]) {
  if (value === "model-estimated") return "Model estimate, PAL times Mifflin–St Jeor";
  if (value === "user-estimate") return "Entered baseline expenditure";
  return "Retrospective sketch";
}

function stepError(draft: OnboardingDraft): string | null {
  if (draft.step === 1) {
    if (!isIsoDate(draft.birthDate)) return "Enter a date of birth before continuing.";
    if (ageOn(draft.birthDate, todayIso("UTC")) < 18) return "A profile under 18 cannot be saved. The date was not changed.";
  }
  if (draft.step === 3) {
    if (!draft.label.trim()) return "Give the profile a name before continuing.";
    const height = draft.lengthUnit === "ft" ? ftInToCm(Number(draft.heightFeet), Number(draft.heightInches) || 0) : Number(draft.heightCm);
    const enteredWeight = Number(draft.weightKg);
    const weightKg = draft.unit === "lb" ? lbToKg(enteredWeight) : enteredWeight;
    if (!draft.heightCm.trim() && draft.lengthUnit === "cm") return "Enter a height before continuing.";
    if (draft.lengthUnit === "ft" && !draft.heightFeet.trim()) return "Enter a height before continuing.";
    if (!Number.isFinite(height) || height < LIMITS.heightCm[0] || height > LIMITS.heightCm[1]) {
      return `Height must be between ${LIMITS.heightCm[0]} and ${LIMITS.heightCm[1]} cm. The value was not changed.`;
    }
    if (!draft.weightKg.trim() || !Number.isFinite(weightKg) || weightKg < LIMITS.weightKg[0] || weightKg > LIMITS.weightKg[1]) {
      return `Reference weight must be between ${LIMITS.weightKg[0]} and ${LIMITS.weightKg[1]} kg. The value was not changed.`;
    }
  }
  if (draft.step === 5) {
    if (draft.bodyFatPct.trim()) {
      const fat = Number(draft.bodyFatPct);
      if (!Number.isFinite(fat) || fat < LIMITS.bodyFatPct[0] || fat > LIMITS.bodyFatPct[1]) {
        return `Body fat must be between ${LIMITS.bodyFatPct[0]} and ${LIMITS.bodyFatPct[1]} percent, or leave it blank.`;
      }
    }
    if (draft.leanMassKg.trim()) {
      const lean = Number(draft.leanMassKg);
      if (!Number.isFinite(lean) || lean < LIMITS.leanMassKg[0] || lean > LIMITS.leanMassKg[1]) {
        return `Lean mass must be between ${LIMITS.leanMassKg[0]} and ${LIMITS.leanMassKg[1]} kg, or leave it blank.`;
      }
    }
  }
  if (draft.step === 6 && draft.energyBasis === "user-estimate") {
    const maintenance = Number(draft.maintenanceKcal);
    if (!draft.maintenanceKcal.trim() || !Number.isFinite(maintenance)) return "Enter a baseline expenditure, or choose the model estimate.";
    if (maintenance < LIMITS.maintenanceKcal[0] || maintenance > LIMITS.maintenanceKcal[1]) {
      return `Baseline expenditure must be between ${LIMITS.maintenanceKcal[0]} and ${LIMITS.maintenanceKcal[1]} kcal. It was not changed.`;
    }
  }
  if (draft.step === 7) {
    if (!isIsoDate(draft.startDate)) return "Choose a start date before continuing.";
    const horizon = Number(draft.horizonDays);
    if (!Number.isInteger(horizon) || horizon < LIMITS.horizonMin || horizon > LIMITS.horizonMax) {
      return `Horizon must be a whole number from ${LIMITS.horizonMin} to ${LIMITS.horizonMax} days.`;
    }
    const intake = Number(draft.intakeKcal);
    if (!draft.intakeKcal.trim() || !Number.isFinite(intake)) return "Enter a baseline intake before continuing.";
    if (intake < LIMITS.intakeKcal[0] || intake > LIMITS.intakeKcal[1]) {
      return `Intake must be between ${LIMITS.intakeKcal[0]} and ${LIMITS.intakeKcal[1]} kcal. It was not changed.`;
    }
  }
  return null;
}
