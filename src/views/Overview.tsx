import { useEffect, useRef, useState } from "react";
import { TrajectoryChart } from "../components/Chart";
import { Button, Disclosure, Field } from "../components/ui";
import { weight, when } from "../format";
import { addDays, todayIso } from "../model/dates";
import { horizonBoundMessage, intakeBoundMessage } from "../model/bounds";
import { askForecast } from "../model/question";
import { smoothObservations } from "../model/trend";
import { go } from "../route";
import { setAsk, toProfileInput, useSession } from "../state/store";
import type { ForecastPoint, ForecastResult } from "../model/types";
import type { Preferences } from "../state/types";

export function Overview() {
  const { account, profile } = useSession();
  const scenario = account?.scenarios.find((item) => item.profileId === profile?.id && !item.archivedAt);
  const version = scenario?.versions.find((item) => item.id === scenario.activeVersionId);
  const startingIntake = profile?.askIntakeKcal ?? version?.inputSnapshot.baseline?.intakeKcal ?? 2000;
  const startingDays = profile?.askDays ?? version?.inputSnapshot.horizonDays ?? 30;
  const [calories, setCalories] = useState(String(Math.round(startingIntake)));
  const [days, setDays] = useState(String(startingDays));
  const held = useRef<ForecastResult | null>(null);
  const observations = (account?.observations ?? []).filter((obs) => obs.profileId === profile?.id && !obs.deletedAt).sort((a, b) => a.localDate.localeCompare(b.localDate));
  const latest = observations.at(-1);
  const today = todayIso(account?.preferences.timeZone ?? "UTC");
  const startKg = latest?.valueKg ?? profile?.referenceWeightKg ?? 0;
  const intake = Number(calories);
  const horizon = Number(days);
  const intakeProblem = intakeBoundMessage(intake);
  const dayProblem = horizonBoundMessage(horizon);
  const ready = intakeProblem.error == null && dayProblem == null;
  const live = account && profile && ready ? askForecast(toProfileInput(profile), { startKg, startDate: today, intakeKcal: intake, days: horizon, timeZone: account.preferences.timeZone }) : null;
  if (live?.status === "complete") held.current = live;
  const forecast = live?.status === "complete" ? live : held.current;
  const last = forecast?.points.at(-1);
  const endDate = last?.date ?? (ready ? addDays(today, horizon - 1) : today);
  useEffect(() => {
    if (!account || !profile || !ready) return;
    if (profile.askIntakeKcal === intake && profile.askDays === horizon) return;
    setAsk(account.id, profile.id, intake, horizon);
  }, [account, profile, intake, horizon, ready]);
  if (!account || !profile) return null;
  const change = last ? changeLine(startKg, last.centralKg, horizon, account.preferences) : "Enter calories and days";
  return (
    <section className="overview-hero">
      <header className="answer">
        <p className="kicker">Home</p>
        <h1>{change}</h1>
        <p className="lede">{last ? `You'd weigh ${weight(last.centralKg, account.preferences)} on ${when(endDate, account.preferences)} if you eat ${Math.round(intake).toLocaleString("en-US")} kcal a day. Estimate, not a scale reading.` : "Your stats are saved. Type calories and days to see a weight."}</p>
      </header>
      <div className="ask">
        <Field label="Calories a day">
          <input inputMode="decimal" value={calories} onChange={(event) => setCalories(event.target.value)} />
        </Field>
        <Field label="Days">
          <input inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} />
        </Field>
      </div>
      {intakeProblem.error ? <p role="alert">{intakeProblem.error}</p> : intakeProblem.warning ? <p>That intake is outside 800–6,000 kcal a day. The estimate is still shown.</p> : null}
      {dayProblem ? <p role="alert">{dayProblem}</p> : null}
      {live?.status === "refused" ? <p role="alert">{live.refusal?.message}</p> : null}
      {forecast ? (
        <TrajectoryChart
          prominent
          caption="Weight if you eat this every day"
          unit={account.preferences.unit}
          hideAbsolute={account.preferences.hideWeight}
          dateStyle={account.preferences.dateFormat}
          today={today}
          observations={observations.map((obs) => ({ id: obs.id, date: obs.localDate, kg: obs.valueKg, source: obs.source }))}
          trend={smoothObservations(observations.map((obs) => ({ date: obs.localDate, kg: obs.valueKg })))}
          series={[{ id: "ask", label: "This question", band: true, points: forecast.points.map((point) => ({ date: point.date, kg: point.centralKg, lower: point.lowerKg, upper: point.upperKg, intake: point.intakeKcal, expenditure: point.expenditureKcal })) }]}
        />
      ) : null}
      {forecast && last ? <DayTable startKg={startKg} startDate={today} points={forecast.points} prefs={account.preferences} /> : null}
      <Button onClick={() => go("progress")}>Log a weigh-in</Button>
      <Disclosure title="Details">
        <p>Starting from {weight(startKg, account.preferences)}{latest ? `, your last weigh-in on ${when(latest.localDate, account.preferences)}` : ""}. Same calories every day. Day-by-day edits stay on Plan.</p>
        {last ? <p>{rangeLine(last.lowerKg, last.upperKg, account.preferences)}</p> : null}
        <p><a href="#/insights">About the model</a></p>
      </Disclosure>
    </section>
  );
}

function DayTable({ startKg, startDate, points, prefs }: { startKg: number; startDate: string; points: ForecastPoint[]; prefs: Preferences }) {
  const rows = [{ day: "Start", date: startDate, kg: startKg }, ...points.map((point, index) => ({ day: String(index + 1), date: point.date, kg: point.centralKg }))];
  return (
    <div className="table-wrap day-table">
      <table>
        <caption>What you could weigh on each day. An estimate, not a scale reading.</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Date</th>
            <th scope="col">Weight</th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.day}-${row.date}`}>
              <th scope="row">{row.day}</th>
              <td>{when(row.date, prefs)}</td>
              <td>{weight(row.kg, prefs)}</td>
              <td>{changeFrom(startKg, row.kg, prefs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function changeFrom(startKg: number, kg: number, prefs: Preferences) {
  if (weight(startKg, prefs) === weight(kg, prefs)) return "Same";
  return `${weight(Math.abs(startKg - kg), prefs)} ${startKg > kg ? "less" : "more"}`;
}

function changeLine(startKg: number, endKg: number, days: number, prefs: Parameters<typeof weight>[1]) {
  const start = weight(startKg, prefs);
  const end = weight(endKg, prefs);
  if (start === end) return `About the same in ${days} days`;
  const less = startKg > endKg;
  return `${weight(Math.abs(startKg - endKg), prefs)} ${less ? "less" : "more"} in ${days} days`;
}

function rangeLine(lower: number, upper: number, prefs: Parameters<typeof weight>[1]) {
  const low = weight(lower, prefs);
  const high = weight(upper, prefs);
  if (low === high) return "The two ends of the band round to the same number, so no range is shown.";
  return `The range on the last day is ${low} to ${high}.`;
}
