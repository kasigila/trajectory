import { useState } from "react";
import { ChangeList } from "../components/ChangeList";
import { PageTitle } from "../components/Shell";
import { Button, Disclosure, Notice } from "../components/ui";
import { HOW_TO_READ } from "../copy";
import { energy, weight } from "../format";
import { proposeCalibration } from "../model/calibrate";
import { divergenceCopy } from "../model/explain";
import { MODEL } from "../model/parameters";
import { acceptCalibration, declineCalibration, useSession } from "../state/store";

export function Insights() {
  const { account, profile } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  if (!account || !profile) return null;
  const scenario = account.scenarios.find((item) => item.profileId === profile.id && !item.archivedAt);
  const version = scenario?.versions.find((item) => item.id === scenario.activeVersionId);
  const original = scenario?.versions[0];
  const observations = account.observations.filter((obs) => obs.profileId === profile.id && !obs.deletedAt);
  const forCalibration = observations.filter((obs) => !obs.excludeFromCalibration);
  const pairs = observations.map((obs) => ({
    date: obs.localDate,
    observed: obs.valueKg,
    forecast: original?.forecast.points.find((point) => point.date === obs.localDate)?.centralKg ?? null,
  }));
  const proposal = version ? proposeCalibration(version.inputSnapshot, forCalibration.map((obs) => ({ date: obs.localDate, kg: obs.valueKg }))) : null;
  return (
    <section>
      <PageTitle kicker="Learn" title="About the model" lede="The chart is an estimate from a published model. It is not a scale reading." />
      <Disclosure title="How to read the chart">
        <p>{HOW_TO_READ}</p>
      </Disclosure>
      <article className="card">
        <h2>Latest saved change</h2>
        <ChangeList change={version?.change} dateStyle={account.preferences.dateFormat} unit={account.preferences.unit} />
      </article>
      <article className="card">
        <h2>Readings and the first forecast</h2>
        <p>{divergenceCopy(pairs, account.preferences.unit)}</p>
      </article>
      <article className="card">
        <h2>Calibration</h2>
        {proposal ? (
          <>
            <p>{proposal.reason}</p>
            {proposal.eligible && proposal.proposedMaintenanceKcal != null ? (
              <>
                <p>Proposed baseline expenditure from the retrospective sketch: {energy(proposal.proposedMaintenanceKcal)}. Mean assumed intake {energy(proposal.meanIntakeKcal ?? 0)}. Trend change {weight(proposal.trendChangeKg ?? 0, account.preferences)}.</p>
                <div className="toolbar">
                  <Button variant="primary" onClick={() => scenario && void acceptCalibration(account.id, scenario.id).then((result) => setMessage(result.ok ? result.warning ?? "Accepted. A new version stores the basis. Intake and activity were not edited." : result.message))}>Accept on a new version</Button>
                  <Button onClick={() => scenario && declineCalibration(account.id, scenario.id)}>Keep the prior basis</Button>
                </div>
              </>
            ) : (
              <Notice>Not enough reliable data yet. No personalized number was invented.</Notice>
            )}
          </>
        ) : <p>A saved scenario is needed before a sketch can be described.</p>}
        {message ? <p role="status">{message}</p> : null}
      </article>
      <Disclosure title="Technical details">
        <ul>{version?.assumptions.map((line) => <li key={line}>{line}</li>) ?? <li>None yet.</li>}</ul>
        <p>{MODEL.name}. {MODEL.shortCitation}.</p>
      </Disclosure>
    </section>
  );
}
