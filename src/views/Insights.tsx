import { useState } from "react";
import { PageTitle } from "../components/Shell";
import { Button, Notice } from "../components/ui";
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
  const pairs = observations.map((obs) => ({
    date: obs.localDate,
    observed: obs.valueKg,
    forecast: original?.forecast.points.find((point) => point.date === obs.localDate)?.centralKg ?? null,
  }));
  const proposal = version ? proposeCalibration(version.inputSnapshot, observations.map((obs) => ({ date: obs.localDate, kg: obs.valueKg }))) : null;
  return (
    <section>
      <PageTitle kicker="Insights" title="What the lines mean" lede="Explanations stay descriptive. They do not judge a reading or rewrite a plan." />
      <article className="card">
        <h2>How to read the chart</h2>
        <p>{HOW_TO_READ}</p>
      </article>
      <article className="card">
        <h2>Latest saved change</h2>
        <p className="change-copy">{version?.change.narrative ?? "Save a scenario to see an explanation."}</p>
      </article>
      <article className="card">
        <h2>Readings and the original forecast</h2>
        <p>{divergenceCopy(pairs)}</p>
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
      <article className="card">
        <h2>Assumptions on the active version</h2>
        <ul>{version?.assumptions.map((line) => <li key={line}>{line}</li>) ?? <li>None yet.</li>}</ul>
        <p className="fine">Model {MODEL.name}. {MODEL.shortCitation}. Not a clinically validated medical device.</p>
      </article>
    </section>
  );
}
