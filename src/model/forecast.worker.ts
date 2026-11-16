import { runForecast } from "./engine";
import type { ForecastResult, ScenarioInputs } from "./types";

interface RequestMessage {
  id: number;
  inputs: ScenarioInputs;
}

interface ReplyMessage {
  id: number;
  result?: ForecastResult;
  error?: string;
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null;
  postMessage: (message: ReplyMessage) => void;
};

scope.onmessage = (event) => {
  const { id, inputs } = event.data;
  try {
    scope.postMessage({ id, result: runForecast(inputs) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : "The forecast worker failed." });
  }
};
