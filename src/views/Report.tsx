import { ChangeList } from "../components/ChangeList";
import { TrajectoryChart } from "../components/Chart";
import { PageTitle } from "../components/Shell";
import { DISCLAIMER } from "../copy";
import { energy, stamp, weight, when } from "../format";
import { centralCrossing } from "../model/crossing";
import { addDays, todayIso } from "../model/dates";
import { maintenanceBasis } from "../model/engine";
import { MODEL } from "../model/parameters";
import { useSession } from "../state/store";
import { Button, Disclosure } from "../components/ui";

export function Report() {
  const { account, profile } = useSession();
  if (!account || !profile) return null;
  const scenario = account.scenarios.find((item) => item.profileId === profile.id && !item.archivedAt);
  const version = scenario?.versions.find((item) => item.id === scenario.activeVersionId);
  const today = todayIso(account.preferences.timeZone);
  return (
    <section className="report-sheet">
      <PageTitle kicker="Report" title={scenario?.name ?? "No plan yet"} lede="Print this page, or save it as a PDF. It stays on this device." />
      <Button className="no-print" variant="primary" onClick={() => window.print()}>Print or save as PDF</Button>
      {version && scenario ? (
        <>
          <p>Version {version.versionNumber}, saved {stamp(version.forecast.completedAt)}.</p>
          <TrajectoryChart
            caption="Report chart"
            unit={account.preferences.unit}
            hideAbsolute={account.preferences.hideWeight}
            dateStyle={account.preferences.dateFormat}
            today={today}
            goalKg={version.inputSnapshot.goal?.weightKg}
            goalDate={version.inputSnapshot.goal?.date}
            goalLabel={version.inputSnapshot.goal?.label}
            series={[{ id: version.id, label: scenario.name, band: true, points: version.forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg })) }]}
            observations={account.observations.filter((obs) => obs.profileId === profile.id && !obs.deletedAt).map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          />
          <p>Starting weight {weight(version.inputSnapshot.profile.referenceWeightKg, account.preferences)} on {when(version.inputSnapshot.profile.referenceDate, account.preferences)}. {version.inputSnapshot.goal?.weightKg != null ? crossingCopy(version.forecast.points, version.inputSnapshot.goal.weightKg, (iso) => when(iso, account.preferences)) : "No chart marker on this plan."}</p>
          <Disclosure title="Why this version">
            <ChangeList change={version.change} dateStyle={account.preferences.dateFormat} unit={account.preferences.unit} />
          </Disclosure>
          <Disclosure title="About the model">
            <p>Horizon {when(version.inputSnapshot.startDate, account.preferences)} through {when(addDays(version.inputSnapshot.startDate, version.inputSnapshot.horizonDays - 1), account.preferences)}. Maintenance {energy(maintenanceBasis(version.inputSnapshot.profile) ?? NaN)}.</p>
            <p>Run id {version.inputHash.slice(0, 12)}. <button type="button" className="btn quiet no-print" onClick={() => void navigator.clipboard.writeText(version.inputHash)}>Copy run id</button></p>
            <p>{MODEL.name}. {MODEL.shortCitation}. App version {MODEL.engineBuild}.</p>
            <ul>{version.assumptions.map((line) => <li key={line}>{line}</li>)}</ul>
            <p>{DISCLAIMER}</p>
          </Disclosure>
        </>
      ) : <p>Save a plan before printing a report.</p>}
      <p>The shaded area is a sensitivity range, not a promise of a scale reading.</p>
    </section>
  );
}

function crossingCopy(points: { date: string; centralKg: number }[], targetKg: number, labelDate: (iso: string) => string) {
  const hit = centralCrossing(points, targetKg);
  return hit
    ? `The central series reaches the chart marker on ${labelDate(hit.date)}. That is arithmetic on the saved run, not a validated scale prediction.`
    : "The central series does not reach the chart marker inside this horizon.";
}
