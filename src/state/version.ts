import { proposeCalibration } from "../model/calibrate";
import { canonicalSnapshot, runForecast } from "../model/engine";
import { explainChange } from "../model/explain";
import { sha256 } from "../model/hash";
import { MODEL } from "../model/parameters";
import type { ScenarioInputs } from "../model/types";
import type { ScenarioVersion } from "./types";

export async function buildVersion(args: {
  scenarioId: string;
  versionNumber: number;
  parent: ScenarioVersion | null;
  inputs: ScenarioInputs;
  idempotencyKey: string;
  editKind: ScenarioVersion["editKind"];
  duplicatedFromVersionId?: string | null;
  createdAt?: string;
}): Promise<{ ok: true; version: ScenarioVersion } | { ok: false; message: string; errorId: string }> {
  const started = args.createdAt ?? new Date().toISOString();
  let result;
  try {
    result = runForecast(args.inputs);
  } catch (error) {
    const errorId = `err_${crypto.randomUUID().slice(0, 8)}`;
    return {
      ok: false,
      errorId,
      message: `The Hall model did not finish (${errorId}). Your inputs are still in the draft. ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
  if (result.status !== "complete") {
    const errorId = `err_${crypto.randomUUID().slice(0, 8)}`;
    return { ok: false, errorId, message: `${result.refusal?.message ?? "The run was refused."} Reference ${errorId}.` };
  }
  const completed = args.createdAt ?? new Date().toISOString();
  const inputHash = await sha256(canonicalSnapshot(args.inputs));
  const id = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const change = explainChange(args.parent?.inputSnapshot ?? null, args.parent?.forecast.points ?? null, args.inputs, result.points);
  const version: ScenarioVersion = {
    id,
    scenarioId: args.scenarioId,
    versionNumber: args.versionNumber,
    parentVersionId: args.parent?.id ?? null,
    duplicatedFromVersionId: args.duplicatedFromVersionId ?? null,
    createdAt: completed,
    modelId: MODEL.id,
    modelVersion: MODEL.version,
    engineBuild: MODEL.engineBuild,
    inputSnapshot: structuredClone(args.inputs),
    inputHash,
    assumptions: result.assumptions,
    idempotencyKey: args.idempotencyKey,
    editKind: args.editKind,
    change,
    forecast: {
      id: runId,
      scenarioVersionId: id,
      modelId: MODEL.id,
      modelVersion: MODEL.version,
      engineBuild: MODEL.engineBuild,
      status: "complete",
      inputHash,
      startedAt: started,
      completedAt: completed,
      warnings: result.warnings,
      assumptions: result.assumptions,
      refusal: null,
      points: result.points,
      errorId: null,
    },
  };
  return { ok: true, version };
}

export { proposeCalibration };
