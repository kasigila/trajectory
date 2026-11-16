import { describe, expect, it } from "vitest";
import type { ScenarioInputs } from "../model/types";
import type { Database } from "./types";
import { deleteObservation, getState, hydrate, restoreObservation, setReadingCalibration, setStorageForTests, touchDraft, undoDraft } from "./store";

const inputs = { horizonDays: 10, name: "Plan", goal: null } as ScenarioInputs;

describe("draft undo and removed readings", () => {
  it("undoes the first draft edit and restores a removed reading", async () => {
    const saved = new Map<string, string>();
    const db = {
      schema: 2,
      hydrated: true,
      recoveryAvailable: false,
      viewer: { birthDate: "1990-01-01", adultOk: true, consents: [] },
      sessionAccountId: "acct",
      onboarding: null,
      deletionReceipt: null,
      accounts: [{
        id: "acct",
        scenarios: [{ id: "scn", versions: [{ id: "ver", inputSnapshot: inputs }], activeVersionId: "ver" }],
        observations: [{ id: "obs", profileId: "prof", deletedAt: null, valueKg: 70, localDate: "2026-11-01" }],
        drafts: {},
        audits: [],
      }],
    } as unknown as Database;
    saved.set("trajectory.v1", JSON.stringify(db));
    setStorageForTests({
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => void saved.set(key, value),
      removeItem: (key) => void saved.delete(key),
    });
    await hydrate();
    touchDraft("acct", "scn", "ver", (current) => ({ ...current, horizonDays: 11 }));
    expect(getState().accounts[0].drafts.scn.past).toHaveLength(1);
    expect(getState().accounts[0].drafts.scn.inputs.horizonDays).toBe(11);
    undoDraft("acct", "scn");
    expect(getState().accounts[0].drafts.scn.inputs.horizonDays).toBe(10);
    deleteObservation("acct", "obs");
    expect(getState().accounts[0].observations[0].deletedAt).toBeTruthy();
    expect(restoreObservation("acct", "obs").ok).toBe(true);
    expect(getState().accounts[0].observations[0].deletedAt).toBeNull();
    expect(setReadingCalibration("acct", "obs", true).ok).toBe(true);
    expect(getState().accounts[0].observations[0].excludeFromCalibration).toBe(true);
  });
});
