import { runForecast } from "./engine";
import type { ForecastResult, ProfileInput, ScenarioInputs } from "./types";

/** One flat question: eat this many calories every day for this many days, starting from this weight. */
export function askForecast(
  profile: ProfileInput,
  args: { startKg: number; startDate: string; intakeKcal: number; days: number; timeZone: string },
): ForecastResult {
  return runForecast(flatQuestion(profile, args));
}

export function flatQuestion(
  profile: ProfileInput,
  args: { startKg: number; startDate: string; intakeKcal: number; days: number; timeZone: string },
): ScenarioInputs {
  return {
    name: "Question",
    description: "The same calories every day.",
    labels: [],
    startDate: args.startDate,
    horizonDays: args.days,
    timeZone: args.timeZone,
    baseline: {
      intakeKcal: args.intakeKcal,
      activityMode: "category",
      activityCategory: profile.referenceActivity.category,
      steps: profile.referenceActivity.steps,
      pal: profile.referenceActivity.pal,
      explicitActivityKcal: 0,
      exerciseMinutes: 0,
      note: "",
    },
    weekly: { enabled: false, days: {} },
    phases: [],
    overrides: [],
    goal: null,
    milestones: [],
    profile: { ...profile, referenceWeightKg: args.startKg, referenceDate: args.startDate },
  };
}
