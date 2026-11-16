import { ChangeList } from "../components/ChangeList";
import { TrajectoryChart } from "../components/Chart";
import { Disclosure } from "../components/ui";
import { Button } from "../components/ui";
import { energy, stamp, weight, when } from "../format";
import { proposeCalibration } from "../model/calibrate";
import { centralCrossing } from "../model/crossing";
import { weighInPattern } from "../model/streak";
import { todayIso } from "../model/dates";
import { HALL_CITATION, PRODUCT } from "../model/parameters";
import { smoothObservations } from "../model/trend";
import { go } from "../route";
import { useSession } from "../state/store";

export function Overview() {
  const { account, profile } = useSession();
  if (!account || !profile) return null;
  const scenarios = account.scenarios.filter((item) => item.profileId === profile.id && !item.archivedAt);
  const scenario = scenarios[0];
  const version = scenario?.versions.find((item) => item.id === scenario.activeVersionId);
  const observations = account.observations.filter((obs) => obs.profileId === profile.id && !obs.deletedAt).sort((a, b) => a.localDate.localeCompare(b.localDate));
  const forCalibration = observations.filter((obs) => !obs.excludeFromCalibration);
  const latest = observations.at(-1);
  const today = todayIso(account.preferences.timeZone);
  const points = version?.forecast.points ?? [];
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const coverage = version ? proposeCalibration(version.inputSnapshot, forCalibration.map((obs) => ({ date: obs.localDate, kg: obs.valueKg }))) : null;
  const marker = version?.inputSnapshot.goal;
  const pattern = weighInPattern(observations.map((obs) => obs.localDate), today);
  const crossing = marker?.weightKg != null && version ? centralCrossing(points.map((point) => ({ date: point.date, centralKg: point.centralKg })), marker.weightKg) : null;
  const answer = lastPoint ? `${weight(lastPoint.centralKg, account.preferences)} on ${when(lastPoint.date, account.preferences)}` : "No forecast yet";
  return (
    <section className="overview-hero">
      <header className="answer">
        <p className="kicker">Home</p>
        <h1>{answer}</h1>
        <p className="lede">{firstPoint ? `From ${weight(firstPoint.centralKg, account.preferences)} on ${when(firstPoint.date, account.preferences)}. ` : ""}Estimate from your plan. Not a scale reading.</p>
      </header>
      {version ? (
        <TrajectoryChart
          prominent
          caption="Weight on each date"
          unit={account.preferences.unit}
          hideAbsolute={account.preferences.hideWeight}
          dateStyle={account.preferences.dateFormat}
          today={today}
          observations={observations.map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          trend={smoothObservations(observations.map((obs) => ({ date: obs.localDate, kg: obs.valueKg })))}
          goalKg={marker?.weightKg}
          goalDate={marker?.date}
          goalLabel={marker?.label}
          series={[{ id: version.id, label: scenario?.name ?? "Plan", band: true, points: points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg, intake: point.intakeKcal, expenditure: point.expenditureKcal })) }]}
        />
      ) : (
        <p>No forecast yet.</p>
      )}
      <div className="metrics">
        <article>
          <h2>Now</h2>
          <p className="figure">{latest ? weight(latest.valueKg, account.preferences) : "None"}</p>
          <p>{latest ? when(latest.localDate, account.preferences) : "No weigh-in yet."}</p>
        </article>
        <article>
          <h2>Plan</h2>
          <p className="figure">{scenario?.name ?? "None"}</p>
          <p>{version ? `Version ${version.versionNumber}` : "Make a plan to see dates."}</p>
        </article>
        <article>
          <h2>End</h2>
          <p className="figure">{lastPoint ? weight(lastPoint.centralKg, account.preferences) : "—"}</p>
          <p>{lastPoint ? when(lastPoint.date, account.preferences) : "No run yet."}</p>
        </article>
        <article>
          <h2>Calibration progress</h2>
          <p className="figure">{coverage ? `${coverage.readingCount} of ${PRODUCT.calibrationMinReadings}` : "—"}</p>
          <p>{coverage ? `${coverage.readingCount} of ${PRODUCT.calibrationMinReadings} readings` : "Save a plan to start."}</p>
        </article>
      </div>
      <div className="toolbar">
        <Button variant="primary" onClick={() => go(version ? "progress" : "simulator")}>{version ? "Log a weigh-in" : "Make a plan"}</Button>
        <Button onClick={() => go("simulator")}>Change the plan</Button>
        <Button onClick={() => go("compare")}>Compare</Button>
      </div>
      <Disclosure title="Details">
        <p>{lastPoint ? rangeLine(lastPoint.lowerKg, lastPoint.upperKg, account.preferences) : "Save a plan to see an end weight."}</p>
        {coverage ? <p>Calibration progress: {coverage.readingCount} of {PRODUCT.calibrationMinReadings} readings, spanning {coverage.spanDays} of {PRODUCT.calibrationMinSpanDays} days. {coverage.eligible ? "Insights can describe a sketch." : coverage.reason}</p> : null}
        {pattern.lastDate ? <p>{pattern.due ? `Your spacing is about every ${pattern.medianGapDays} days. The last reading was ${pattern.daysSinceLast} days ago.` : `${pattern.onPatternStreak} readings in a row at your own spacing.`} This describes readings already stored here.</p> : null}
        {marker?.weightKg != null ? <p>Marker {weight(marker.weightKg, account.preferences)}{marker.date ? ` by ${when(marker.date, account.preferences)}` : ""}. {crossing ? `The line reaches it on ${when(crossing.date, account.preferences)}. That date is arithmetic on the saved run, not a scale prediction.` : "The line does not reach it in this plan."}</p> : null}
        <h2>Latest saved change</h2>
        <ChangeList change={version?.change} dateStyle={account.preferences.dateFormat} unit={account.preferences.unit} />
        <p>Starting weight {weight(profile.referenceWeightKg, account.preferences)} on {when(profile.referenceDate, account.preferences)}. Baseline expenditure {profile.energyBasis === "model-estimated" ? "estimated from height and activity" : energy(profile.maintenanceKcal ?? 0)}.</p>
        {version ? <p>Forecast saved {stamp(version.forecast.completedAt)}.</p> : null}
        <p>{HALL_CITATION} The shaded band is input sensitivity, not a prediction interval. <a href="#/insights">About the model</a></p>
      </Disclosure>
    </section>
  );
}

function rangeLine(lower: number, upper: number, prefs: Parameters<typeof weight>[1]) {
  const low = weight(lower, prefs);
  const high = weight(upper, prefs);
  if (low === high) return "The two ends of the band round to the same number, so no range is shown.";
  return `End range ${low} to ${high}.`;
}
