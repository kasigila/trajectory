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
  await send("Browser.grantPermissions", {
    origin: `http://127.0.0.1:${port}`,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("trajectory.v1", ${JSON.stringify(JSON.stringify(seed()))});`,
  }, sessionId);
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/trajectory/#/overview` }, sessionId);
  const measure = `(() => {
    const navEl = document.querySelector(".nav");
    const bottomEl = document.querySelector(".bottom-nav");
    const nav = navEl ? getComputedStyle(navEl) : null;
    const bottom = bottomEl ? getComputedStyle(bottomEl) : null;
    const plot = document.querySelector(".chart-plot");
    const plotBox = plot?.getBoundingClientRect();
    const titleBox = document.querySelector("h1")?.getBoundingClientRect();
    const copy = [...document.querySelectorAll("button")].find((button) => button.textContent === "Copy for notes");
    return {
      title: document.querySelector("h1")?.textContent ?? "",
      text: document.body.innerText.slice(0, 180),
      plotHeight: plotBox?.height ?? 0,
      chartBeforeTitle: Boolean(plotBox && titleBox && plotBox.top < titleBox.top),
      hasCopy: Boolean(copy),
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
    ["weight chart is on screen", value && value.plotHeight >= 400 && value.chartBeforeTitle],
    ["notes copy is offered", value?.hasCopy === true],
  ];
  for (const [name, ok] of checks) {
    console.log(`${ok ? "ok" : "FAIL"} ${name}`);
    if (!ok) failed = true;
  }
  console.log(JSON.stringify(value));
  await send("Runtime.evaluate", {
    expression: `document.querySelectorAll("button").forEach((button) => { if (button.textContent === "Copy for notes") button.click(); })`,
  }, sessionId);
  await delay(300);
  const copied = await send("Runtime.evaluate", {
    expression: `document.querySelector("[role=status]")?.textContent ?? ""`,
    returnByValue: true,
  }, sessionId);
  const note = copied.result?.result?.value ?? "";
  const noteOk = note.startsWith("Copied.") || note.startsWith("Copy was blocked");
  console.log(`${noteOk ? "ok" : "FAIL"} copy tells you what happened: ${note}`);
  if (!noteOk) failed = true;
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
      scenarios: [phoneScenario()], observations: [], otherMeasurements: [], compositionLogs: [], cycleLogs: [], importBatches: [],
      drafts: {}, audits: [], reminderDismissedOn: null, phasePromptDismissedOn: null, featureFlags: { advancedMath: false },
    }],
  };
}

function phoneScenario() {
  const points = Array.from({ length: 15 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10);
    const centralKg = Math.round((70 - index * 0.12) * 10) / 10;
    return {
      date,
      centralKg,
      lowerKg: Math.round((centralKg - 0.4) * 10) / 10,
      upperKg: Math.round((centralKg + 0.3) * 10) / 10,
      boundType: "sensitivity-range",
      expenditureKcal: 2200,
      intakeKcal: 1800,
      massBeforeKg: centralKg,
    };
  });
  return {
    id: "scn_phone",
    profileId: "prof_phone",
    name: "Phone plan",
    description: "",
    labels: [],
    createdAt: "2026-11-01T00:00:00.000Z",
    archivedAt: null,
    activeVersionId: "ver_phone",
    versions: [{
      id: "ver_phone",
      scenarioId: "scn_phone",
      versionNumber: 1,
      parentVersionId: null,
      duplicatedFromVersionId: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      modelId: "hall-2011",
      modelVersion: "1",
      engineBuild: "phone-check",
      inputSnapshot: { goal: null, horizonDays: 15 },
      inputHash: "phone-check-hash",
      assumptions: [],
      forecast: {
        id: "run_phone",
        scenarioVersionId: "ver_phone",
        modelId: "hall-2011",
        modelVersion: "1",
        engineBuild: "phone-check",
        status: "complete",
        inputHash: "phone-check-hash",
        startedAt: "2026-11-01T00:00:00.000Z",
        completedAt: "2026-11-01T00:00:01.000Z",
        warnings: [],
        assumptions: [],
        refusal: null,
        points,
        errorId: null,
      },
      idempotencyKey: "phone",
      editKind: "initial",
      change: { narrative: "Phone check.", firstDivergence: null, prefixUnchanged: true, endDeltaKg: null, spans: [] },
    }],
  };
}
