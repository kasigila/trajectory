import { ChangeList } from "../components/ChangeList";
import { TrajectoryChart } from "../components/Chart";
import { PageTitle } from "../components/Shell";
import { energy, stamp, weight, when } from "../format";
import { proposeCalibration } from "../model/calibrate";
import { centralCrossing } from "../model/crossing";
import { weighInPattern } from "../model/streak";
import { todayIso } from "../model/dates";
import { HALL_CITATION, MODEL, PRODUCT } from "../model/parameters";
import { smoothObservations } from "../model/trend";
import { go } from "../route";
import { useSession } from "../state/store";
import { Button } from "../components/ui";

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
  const lastPoint = version?.forecast.points.at(-1);
  const parameter =
    profile.sexParameter === "parameter-a" ? "men’s published equations" : profile.sexParameter === "parameter-b" ? "women’s published equations" : "not specified";
  const coverage = version ? proposeCalibration(version.inputSnapshot, forCalibration.map((obs) => ({ date: obs.localDate, kg: obs.valueKg }))) : null;
  const marker = version?.inputSnapshot.goal;
  const pattern = weighInPattern(observations.map((obs) => obs.localDate), today);
  const crossing = marker?.weightKg != null && version ? centralCrossing(version.forecast.points.map((point) => ({ date: point.date, centralKg: point.centralKg })), marker.weightKg) : null;
  return (
    <section className="overview-hero">
      <PageTitle compact kicker="Trajectory" title={profile.label} lede="Hall model for the active plan. Readings stay off the curve." />
      {version ? (
        <TrajectoryChart
          prominent
          caption="Projected weight · Published Hall model · Hall et al., Lancet 2011 · not a medical device"
          unit={account.preferences.unit}
          hideAbsolute={account.preferences.hideWeight}
          dateStyle={account.preferences.dateFormat}
          today={today}
          observations={observations.map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          trend={smoothObservations(observations.map((obs) => ({ date: obs.localDate, kg: obs.valueKg })))}
          goalKg={marker?.weightKg}
          goalDate={marker?.date}
          goalLabel={marker?.label}
          series={[{ id: version.id, label: "Hall projected weight", band: true, points: version.forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg, intake: point.intakeKcal, expenditure: point.expenditureKcal })) }]}
        />
      ) : (
        <p>No forecast yet. Save a scenario to see one.</p>
      )}
      <p className="chart-cite">{HALL_CITATION} The shaded band is input sensitivity, not a prediction interval.</p>
      <div className="metrics">
        <article>
          <h2>Latest reading</h2>
          <p className="figure">{latest ? weight(latest.valueKg, account.preferences) : "None"}</p>
          <p>{latest ? `${when(latest.localDate, account.preferences)} · ${latest.source}` : "Weigh-ins are optional."}</p>
        </article>
        <article>
          <h2>Active scenario</h2>
          <p className="figure">{scenario?.name ?? "None"}</p>
          <p>{version ? `Version ${version.versionNumber} · ${MODEL.name}` : "Create a scenario to see a forecast."}</p>
        </article>
        <article>
          <h2>End of horizon</h2>
          <p className="figure">{lastPoint ? weight(lastPoint.centralKg, account.preferences) : "—"}</p>
          <p>{lastPoint ? `Central estimate on ${when(lastPoint.date, account.preferences)}. ${rangeLine(lastPoint.lowerKg, lastPoint.upperKg, account.preferences)}` : "No run yet."}</p>
        </article>
      </div>
      <p className="fine">Baseline expenditure on the profile: {profile.energyBasis === "model-estimated" ? "PAL × Mifflin–St Jeor RMR" : energy(profile.maintenanceKcal ?? 0)}. Starting weight {weight(profile.referenceWeightKg, account.preferences)} on {when(profile.referenceDate, account.preferences)}. Model input: {parameter}.</p>
      <article className="card">
        <h2>Calibration progress</h2>
        <p>{coverage ? `${coverage.readingCount} of ${PRODUCT.calibrationMinReadings} readings, spanning ${coverage.spanDays} of ${PRODUCT.calibrationMinSpanDays} days. ${coverage.eligible ? "A retrospective sketch can be described in Insights." : coverage.reason}` : "Save a scenario before coverage can be counted."}{observations.length !== forCalibration.length ? ` ${observations.length - forCalibration.length} reading${observations.length - forCalibration.length === 1 ? "" : "s"} left out of calibration still show on the chart.` : ""}</p>
      </article>
      <article className="card">
        <h2>Latest saved change</h2>
        <ChangeList change={version?.change} dateStyle={account.preferences.dateFormat} />
      </article>
      {pattern.lastDate ? <p className="fine">{pattern.due ? `Your own spacing is about every ${pattern.medianGapDays} days, and the last reading was ${pattern.daysSinceLast} days ago.` : `Your recent weigh-ins run ${pattern.onPatternStreak} in a row at your own spacing.`} This is a description of readings already stored here, not a request to weigh in.</p> : null}
      {marker?.weightKg != null ? <p className="fine">Chart marker {weight(marker.weightKg, account.preferences)}{marker.label ? ` (${marker.label})` : ""}. {crossing ? `The central series reaches it on ${when(crossing.date, account.preferences)}. That date is arithmetic on the saved run, not a validated scale prediction.` : "The central series does not reach it inside this horizon."}</p> : null}
      {version ? <p className="fine">Forecast generated {stamp(version.forecast.completedAt)}. Hash {version.inputHash.slice(0, 12)}.</p> : null}
      <div className="toolbar">
        <Button variant="primary" onClick={() => go("simulator")}>Open simulator</Button>
        <Button onClick={() => go("progress")}>Add a weigh-in</Button>
        <Button onClick={() => go("compare")}>Compare</Button>
      </div>
    </section>
  );
}

function rangeLine(lower: number, upper: number, prefs: Parameters<typeof weight>[1]) {
  const low = weight(lower, prefs);
  const high = weight(upper, prefs);
  if (low === high) return "The sensitivity arms do not separate at 0.1 kg, so no range is shown. Not a scale prediction.";
  return `Range ${low} – ${high}. Not a scale prediction.`;
}
