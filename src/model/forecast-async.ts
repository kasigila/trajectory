import { runForecast } from "./engine";
import type { ForecastResult, ScenarioInputs } from "./types";

interface ReplyMessage {
  id: number;
  result?: ForecastResult;
  error?: string;
}

let worker: Worker | null = null;
let nextId = 0;
const waiters = new Map<number, { resolve: (result: ForecastResult) => void; reject: (error: Error) => void }>();

function attach(current: Worker) {
  current.onmessage = (event: MessageEvent<ReplyMessage>) => {
    const waiter = waiters.get(event.data.id);
    if (!waiter) return;
    waiters.delete(event.data.id);
    if (event.data.result) waiter.resolve(event.data.result);
    else waiter.reject(new Error(event.data.error ?? "The forecast worker returned nothing."));
  };
  current.onerror = () => {
    for (const waiter of waiters.values()) waiter.reject(new Error("The forecast worker stopped. The draft was not changed."));
    waiters.clear();
    worker = null;
  };
}

export function forecastAsync(inputs: ScenarioInputs): Promise<ForecastResult> {
  if (typeof window === "undefined" || typeof Worker === "undefined") return Promise.resolve(runForecast(inputs));
  try {
    worker ??= new Worker(new URL("./forecast.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return Promise.resolve(runForecast(inputs));
  }
  if (!worker.onmessage) attach(worker);
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    waiters.set(id, { resolve, reject });
    worker?.postMessage({ id, inputs });
  });
}
