import { TrajectoryChart } from "../components/Chart";
import { PageTitle } from "../components/Shell";
import { DISCLAIMER } from "../copy";
import { energy, stamp, weight, when } from "../format";
import { addDays, todayIso } from "../model/dates";
import { maintenanceBasis } from "../model/engine";
import { MODEL } from "../model/parameters";
import { useSession } from "../state/store";
import { Button } from "../components/ui";

export function Report() {
  const { account, profile } = useSession();
  if (!account || !profile) return null;
  const scenario = account.scenarios.find((item) => item.profileId === profile.id && !item.archivedAt);
  const version = scenario?.versions.find((item) => item.id === scenario.activeVersionId);
  const today = todayIso(account.preferences.timeZone);
  return (
    <section className="report-sheet">
      <PageTitle kicker="Private report" title={scenario?.name ?? "No scenario"} lede="Print this page, or choose Save as PDF in the print dialog. The file stays on your device." />
      <Button className="no-print" variant="primary" onClick={() => window.print()}>Print or save as PDF</Button>
      <p>Profile {profile.label}. Generated {stamp(new Date().toISOString())} for local dates in {account.preferences.timeZone}.</p>
      {version && scenario ? (
        <>
          <p>Version {version.versionNumber}. {MODEL.name} ({MODEL.shortCitation}). Not a clinically validated medical device. Model {MODEL.id} {MODEL.version}. Engine {MODEL.engineBuild}. Run {version.forecast.id}. Hash {version.inputHash}. Saved {stamp(version.forecast.completedAt)}.</p>
          <p>Horizon {when(version.inputSnapshot.startDate, account.preferences)} through {when(addDays(version.inputSnapshot.startDate, version.inputSnapshot.horizonDays - 1), account.preferences)}, both dates included. Maintenance basis {energy(maintenanceBasis(version.inputSnapshot.profile) ?? NaN)}.</p>
          <TrajectoryChart
            caption="Report chart"
            unit={account.preferences.unit}
            hideAbsolute={account.preferences.hideWeight}
            dateStyle={account.preferences.dateFormat}
            today={today}
            goalKg={version.inputSnapshot.goal?.weightKg}
            goalLabel={version.inputSnapshot.goal?.label}
            series={[{ id: version.id, label: scenario.name, band: true, points: version.forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg })) }]}
            observations={account.observations.filter((obs) => obs.profileId === profile.id && !obs.deletedAt).map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          />
          <h2>Why this version differs from its parent</h2>
          <p>{version.change.narrative}</p>
          <h2>Assumptions</h2>
          <ul>{(account.featureFlags.advancedMath ? version.assumptions : version.assumptions.slice(0, 6)).map((line) => <li key={line}>{line}</li>)}</ul>
          <p>Reference weight {weight(version.inputSnapshot.profile.referenceWeightKg, account.preferences)} on {when(version.inputSnapshot.profile.referenceDate, account.preferences)}. Height {version.inputSnapshot.profile.heightCm} cm is used in the Jackson equation and in Mifflin–St Jeor.</p>
        </>
      ) : <p>Save a scenario before printing a report.</p>}
      <h2>Limits</h2>
      <p>{DISCLAIMER}</p>
      <p>The shaded area is a sensitivity range, not a confidence interval. No crossing date is reported. The plan is not changed by this report.</p>
    </section>
  );
}
