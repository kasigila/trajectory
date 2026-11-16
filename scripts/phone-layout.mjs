import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4174;
const chromeBin = process.env.CHROME_PATH || "google-chrome";
const preview = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  stdio: "ignore",
});
const chrome = spawn(chromeBin, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=9340",
  `--user-data-dir=${process.env.TMPDIR || "/tmp"}/trajectory-phone-${process.pid}`,
  "about:blank",
], { stdio: "ignore" });

let failed = false;
function finish(code) {
  preview.kill("SIGTERM");
  chrome.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => finish(1));

try {
  await waitFor(`http://127.0.0.1:${port}/trajectory/`);
  await delay(400);
  const version = await (await fetch("http://127.0.0.1:9340/json/version")).json();
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  browser.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  await new Promise((resolve) => (browser.onopen = resolve));
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const messageId = ++id;
    pending.set(messageId, resolve);
    browser.send(JSON.stringify({ id: messageId, method, params, sessionId }));
  });
  const created = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: created.result.targetId, flatten: true });
  const sessionId = attached.result.sessionId;
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("trajectory.v1", ${JSON.stringify(JSON.stringify(seed()))});`,
  }, sessionId);
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/trajectory/#/simulator` }, sessionId);
  const measure = `(() => {
    const navEl = document.querySelector(".nav");
    const bottomEl = document.querySelector(".bottom-nav");
    const nav = navEl ? getComputedStyle(navEl) : null;
    const bottom = bottomEl ? getComputedStyle(bottomEl) : null;
    return {
      title: document.querySelector("h1")?.textContent ?? "",
      text: document.body.innerText.slice(0, 180),
      navDisplay: nav?.display ?? "missing",
      bottomDisplay: bottom?.display ?? "missing",
      hasIcon: Boolean(document.querySelector(".bottom-nav .icon")),
      resources: performance.getEntriesByType("resource").map((entry) => entry.name.split("/").pop() + ":" + (entry.responseStatus || 0)).join(","),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`;
  let evaluated = await send("Runtime.evaluate", { expression: measure, returnByValue: true }, sessionId);
  for (let attempt = 0; attempt < 20 && !evaluated.result?.result?.value?.title; attempt++) {
    await delay(250);
    evaluated = await send("Runtime.evaluate", { expression: measure, returnByValue: true }, sessionId);
  }
  if (evaluated.result?.exceptionDetails) console.error(JSON.stringify(evaluated.result.exceptionDetails));
  const value = evaluated.result?.result?.value;
  const checks = [
    ["shell is open", value?.title && !String(value.title).includes("date of birth")],
    ["side navigation is hidden", value?.navDisplay === "none"],
    ["bottom navigation is shown", value?.bottomDisplay === "flex"],
    ["navigation has an icon", value?.hasIcon === true],
    ["page does not scroll sideways", value && value.scrollWidth <= value.clientWidth + 1],
  ];
  for (const [name, ok] of checks) {
    console.log(`${ok ? "ok" : "FAIL"} ${name}`);
    if (!ok) failed = true;
  }
  console.log(JSON.stringify(value));
  browser.close();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}
finish(failed ? 1 : 0);

async function waitFor(url) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // preview is still starting
    }
    await delay(250);
  }
  throw new Error(`Preview did not answer at ${url}`);
}

function seed() {
  const connection = (provider) => ({
    provider, status: "unavailable", readWeight: false, readActivity: false, write: false,
    requestedAt: null, revokedAt: null, lastSyncAt: null, note: "Not available in this browser.",
  });
  return {
    schema: 2,
    hydrated: true,
    recoveryAvailable: false,
    viewer: { birthDate: "1990-01-01", adultOk: true, consents: [] },
    sessionAccountId: "acct_phone",
    onboarding: null,
    deletionReceipt: null,
    accounts: [{
      id: "acct_phone",
      displayName: "Phone check",
      isDemo: false,
      passphraseSalt: null,
      passphraseHash: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      preferences: { unit: "kg", lengthUnit: "cm", dateFormat: "dmy", theme: "light", timeZone: "America/Toronto", hideWeight: false, pauseTracking: false },
      notifications: { reviewEnabled: false, reviewEveryDays: 14, reviewHour: 9, quietStartHour: 21, quietEndHour: 8, pauseAll: false, phaseStartEnabled: false, browserNotifications: false, enabledAt: null },
      connections: { appleHealth: connection("apple-health"), healthConnect: connection("health-connect") },
      consents: [],
      profiles: [{
        id: "prof_phone", label: "Phone", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        birthDate: "1990-01-01", heightCm: 170, referenceWeightKg: 70, referenceDate: "2026-01-01",
        sexParameter: "parameter-a", bodyFatPct: null, bodyFatSource: "", bodyFatConfidence: "unspecified", leanMassKg: null,
        energyBasis: "user-estimate", maintenanceKcal: 2200, calibrationNote: null,
        referenceActivity: { category: "sedentary", steps: 7000, pal: 1.5 }, excludedContext: "none", excludedDetail: "",
      }],
      activeProfileId: "prof_phone",
      scenarios: [], observations: [], otherMeasurements: [], compositionLogs: [], cycleLogs: [], importBatches: [],
      drafts: {}, audits: [], reminderDismissedOn: null, phasePromptDismissedOn: null, featureFlags: { advancedMath: false },
    }],
  };
}
