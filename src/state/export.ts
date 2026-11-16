import { runForecast } from "../model/engine";
import type { Account, ScenarioVersion } from "./types";

export const EXPORT_FORMAT = "trajectory-local-2";

/** Inputs, settings, and version identity. Forecast points are rebuilt on import. */
export function thinForExport(account: Account): Account {
  const copy = structuredClone(account);
  copy.passphraseHash = null;
  copy.passphraseSalt = null;
  copy.scenarios = copy.scenarios.map((scenario) => ({
    ...scenario,
    versions: scenario.versions.map(stripDerived),
  }));
  return copy;
}

function stripDerived(version: ScenarioVersion): ScenarioVersion {
  return {
    ...version,
    assumptions: [],
    forecast: {
      ...version.forecast,
      points: [],
      assumptions: [],
      warnings: [],
    },
  };
}

export async function refillForecasts(account: Account): Promise<Account> {
  const scenarios = [];
  for (const scenario of account.scenarios) {
    const versions = [];
    for (const version of scenario.versions) {
      if (version.forecast.points.length) {
        versions.push(version);
        continue;
      }
      const result = runForecast(version.inputSnapshot);
      if (result.status !== "complete") {
        versions.push(version);
        continue;
      }
      versions.push({
        ...version,
        assumptions: result.assumptions,
        forecast: {
          ...version.forecast,
          status: "complete" as const,
          points: result.points,
          assumptions: result.assumptions,
          warnings: result.warnings,
          refusal: null,
        },
      });
    }
    scenarios.push({ ...scenario, versions });
  }
  return { ...account, scenarios };
}
