import { useState } from "react";
import { TrajectoryChart } from "../components/Chart";
import { PageTitle } from "../components/Shell";
import { Button, Notice } from "../components/ui";
import { energy, stamp, weight, when } from "../format";
import { maintenanceBasis } from "../model/engine";
import { round1 } from "../model/units";
import { duplicateScenario, useSession } from "../state/store";
import type { Scenario, ScenarioVersion } from "../state/types";

export function Compare() {
  const { account, profile } = useSession();
  const scenarios = account?.scenarios.filter((item) => item.profileId === profile?.id) ?? [];
  const [ids, setIds] = useState<string[]>(() => scenarios.filter((item) => !item.archivedAt).slice(0, 2).map((item) => item.id));
  const [date, setDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (!account || !profile) return null;
  const chosen = ids.map((id) => scenarios.find((item) => item.id === id)).filter((item): item is Scenario => Boolean(item)).slice(0, 3);
  const versions = chosen.map((scenario) => scenario.versions.find((item) => item.id === scenario.activeVersionId)).filter((item): item is ScenarioVersion => Boolean(item));
  const dashes = [undefined, "7 5", "2 3"];
  const warnings = alignmentWarnings(versions);
  const focus = date || versions[0]?.forecast.points[0]?.date || "";
  return (
    <section>
      <PageTitle kicker="Compare" title="Plans side by side" lede="Differences are between Hall model runs. They are not guaranteed outcomes." />
      <div className="toolbar">
        {[0, 1, 2].map((slot) => (
          <label key={slot}>
            Scenario {slot + 1}
            <select
              value={ids[slot] ?? ""}
              onChange={(event) => {
                const next = [...ids];
                next[slot] = event.target.value;
                setIds(next.filter(Boolean));
              }}
            >
              <option value="">None</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.name}
                  {scenario.archivedAt ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {versions.length < 2 ? (
        <Notice>
          Duplicate this scenario to compare a variation.
          {chosen[0] ? <Button onClick={() => void duplicateScenario(account.id, chosen[0].id, chosen[0].activeVersionId).then((result) => setMessage(result.ok ? `Duplicated ${chosen[0].name}. Choose it as Scenario 2.` : result.message))}>Duplicate {chosen[0].name}</Button> : null}
        </Notice>
      ) : null}
      {warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
      {versions.length >= 2 ? (
        <TrajectoryChart
          caption="Comparison of saved scenario versions"
          unit={account.preferences.unit}
          hideAbsolute={account.preferences.hideWeight}
          dateStyle={account.preferences.dateFormat}
          series={versions.map((version, index) => ({
            id: version.id,
            label: chosen[index]?.name ?? `Scenario ${index + 1}`,
            dash: dashes[index],
            band: false,
            points: version.forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg })),
          }))}
        />
      ) : (
        <p>Choose two saved scenarios. A third is optional.</p>
      )}
      <p className="fine">Sensitivity ranges are in the table below so several shaded bands do not hide one another. Line style differs as well as colour.</p>
      <FieldDate date={focus} onChange={setDate} />
      {focus && versions.length >= 2 ? <Delta versions={versions} names={chosen.map((item) => item.name)} date={when(focus, account.preferences)} unit={account.preferences.unit} hide={account.preferences.hideWeight} /> : null}
      <div className="table-wrap">
        <table>
          <caption>Assumptions for the compared versions</caption>
          <thead>
            <tr>
              <th>Field</th>
              {chosen.map((scenario) => <th key={scenario.id}>{scenario.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><th>Version</th>{versions.map((version) => <td key={version.id}>{version.versionNumber}</td>)}</tr>
            <tr><th>Model</th>{versions.map((version) => <td key={version.id}>{version.modelId} {version.modelVersion}</td>)}</tr>
            <tr><th>Generated</th>{versions.map((version) => <td key={version.id}>{stamp(version.forecast.completedAt)}</td>)}</tr>
            <tr><th>Start</th>{versions.map((version) => <td key={version.id}>{when(version.inputSnapshot.startDate, account.preferences)}</td>)}</tr>
            <tr><th>Horizon</th>{versions.map((version) => <td key={version.id}>{version.inputSnapshot.horizonDays} inclusive days</td>)}</tr>
            <tr><th>Time zone</th>{versions.map((version) => <td key={version.id}>{version.inputSnapshot.timeZone}</td>)}</tr>
            <tr><th>Maintenance basis</th>{versions.map((version) => <td key={version.id}>{energy(maintenanceBasis(version.inputSnapshot.profile) ?? NaN)} ({basisName(version.inputSnapshot.profile.energyBasis)})</td>)}</tr>
            <tr><th>Reference weight</th>{versions.map((version) => <td key={version.id}>{weight(version.inputSnapshot.profile.referenceWeightKg, account.preferences)}</td>)}</tr>
            <tr><th>Labels</th>{chosen.map((scenario) => <td key={scenario.id}>{scenario.labels.join(", ") || "—"}</td>)}</tr>
            {focus ? (
              <tr>
                <th>Central on {focus}</th>
                {versions.map((version) => {
                  const point = version.forecast.points.find((item) => item.date === focus);
                  if (!point) return <td key={version.id}>Outside this run</td>;
                  const central = weight(point.centralKg, account.preferences);
                  const low = weight(point.lowerKg, account.preferences);
                  const high = weight(point.upperKg, account.preferences);
                  return <td key={version.id}>{low === high ? central : `${central} (${low}–${high})`}</td>;
                })}
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className="toolbar">
        {chosen.map((scenario) => (
          <Button key={scenario.id} onClick={() => void duplicateScenario(account.id, scenario.id, scenario.activeVersionId).then((result) => setMessage(result.ok ? `Duplicated ${scenario.name}. The original is unchanged.` : result.message))}>
            Duplicate {scenario.name}
          </Button>
        ))}
      </div>
    </section>
  );
}

function FieldDate({ date, onChange }: { date: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>Inspect a date</span>
      <small>Compares the central estimates on this calendar day. It does not change either plan. Year-month-day.</small>
      <input type="date" value={date} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Delta({ versions, names, date, unit, hide }: { versions: ScenarioVersion[]; names: string[]; date: string; unit: "kg" | "lb"; hide: boolean }) {
  const a = versions[0].forecast.points.find((point) => point.date === date);
  const b = versions[1].forecast.points.find((point) => point.date === date);
  if (!a || !b) return <p>That date is not on both runs. The chart stays aligned to the calendar.</p>;
  const delta = a.centralKg - b.centralKg;
  const shown = hide ? "a hidden absolute difference" : `${round1(Math.abs(unit === "lb" ? delta * 2.2046226218 : delta)).toFixed(1)} ${unit}`;
  return <p>On {date}, {names[0]} minus {names[1]} is {shown} on the central estimates. This is a modelled difference, not a guaranteed outcome.</p>;
}

function basisName(value: string) {
  if (value === "user-estimate") return "entered expenditure";
  if (value === "model-estimated") return "PAL × Mifflin–St Jeor";
  if (value === "retrospective") return "retrospective sketch";
  return value;
}

function alignmentWarnings(versions: ScenarioVersion[]) {
  const warnings: string[] = [];
  if (versions.length < 2) return warnings;
  const starts = new Set(versions.map((version) => version.inputSnapshot.startDate));
  if (starts.size > 1) warnings.push("These scenarios do not start on the same date. The chart is aligned on the calendar, so a gap is a real date gap.");
  const zones = new Set(versions.map((version) => version.inputSnapshot.timeZone));
  if (zones.size > 1) warnings.push("Time zones differ. Each run still uses the local dates stored in its snapshot.");
  const horizons = new Set(versions.map((version) => version.inputSnapshot.horizonDays));
  if (horizons.size > 1) warnings.push("Horizons differ. Dates past the shorter run are absent for that scenario, not missing data.");
  const models = new Set(versions.map((version) => `${version.modelId}@${version.modelVersion}`));
  if (models.size > 1) warnings.push("Model versions differ. Older runs were not rewritten.");
  const profiles = new Set(versions.map((version) => `${version.inputSnapshot.profile.referenceWeightKg}|${version.inputSnapshot.profile.maintenanceKcal}|${version.inputSnapshot.profile.heightCm}`));
  if (profiles.size > 1) warnings.push("Profile assumptions in the snapshots differ. The table lists them.");
  return warnings;
}
