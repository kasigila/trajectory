import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = 4175;
const chromeBin = process.env.CHROME_PATH || "google-chrome";
const preview = spawn("node", ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  stdio: "ignore",
});
const chrome = spawn(chromeBin, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=9341",
  `--user-data-dir=${process.env.TMPDIR || "/tmp"}/trajectory-retest-${process.pid}`,
  "about:blank",
], { stdio: "ignore" });

let failed = false;
function finish(code) {
  preview.kill("SIGTERM");
  chrome.kill("SIGTERM");
  process.exit(code);
}

try {
  await waitFor(`http://127.0.0.1:${port}/trajectory/`);
  await delay(300);
  const version = await (await fetch("http://127.0.0.1:9341/json/version")).json();
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("trajectory.v1", ${JSON.stringify(JSON.stringify(seed()))});`,
  }, sessionId);

  async function go(hash) {
    await send("Page.navigate", { url: `http://127.0.0.1:${port}/trajectory/${hash}` }, sessionId);
    await evalValue(`document.querySelector("h1")?.textContent || ""`);
  }
  async function evalValue(expression) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const evaluated = await send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
      const value = evaluated.result?.result?.value;
      if (value) return value;
      await delay(200);
    }
    return "";
  }
  async function clickText(text) {
    return evalValue(`(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === ${JSON.stringify(text)});
      if (!button) return "";
      button.click();
      return "clicked";
    })()`);
  }

  await go("#/progress");
  const opened = await evalValue(`document.querySelector("h1")?.textContent || ""`);
  check("progress is open", opened.includes("Weigh-ins"));
  check("remove asks before deleting", await clickText("Remove") === "clicked" && (await evalValue("document.body.innerText")).includes("Remove this weigh-in from the chart"));
  check("remove reading is confirmed in the page", await clickText("Remove reading") === "clicked");
  const removed = await evalValue("document.body.innerText");
  check("removed reading is announced", removed.includes("Weigh-in removed from the chart"));
  await clickText("Restore");
  const restored = await evalValue("document.body.innerText");
  check("restore puts the reading back", restored.includes("Reading restored to the chart"));

  await go("#/compare");
  const compared = await evalValue("document.body.innerText");
  check("inspect date uses a shared day", compared.includes("central estimates") && !compared.includes("That date is not on both runs"));

  await go("#/simulator");
  const undo = await evalValue(`(() => {
    const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Undo draft");
    const save = [...document.querySelectorAll("button")].find((item) => item.textContent.trim() === "Save as new version");
    const saveColor = save ? getComputedStyle(save).color : "";
    return JSON.stringify({
      undoDisabled: Boolean(button?.disabled),
      hasNext: [...document.querySelectorAll("button")].some((item) => item.textContent.trim() === "Next month"),
      saveColor,
    });
  })()`);
  const undoState = JSON.parse(undo || "{}");
  check("undo draft starts disabled", undoState.undoDisabled === true);
  check("calendar shows one month at a time", undoState.hasNext === true);
  check("disabled save is not pale green on white", undoState.saveColor === "rgb(77, 91, 103)");

  await go("#/overview");
  const overview = await evalValue("document.body.innerText");
  check("home answers calories and days", overview.includes("Calories a day") && overview.includes("kcal a day") && overview.includes("in "));
  async function ask(calories, days) {
    await evalValue(`(() => {
      const inputs = [...document.querySelectorAll(".ask input")];
      const set = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      };
      if (inputs[0]) set(inputs[0], ${JSON.stringify(calories)});
      if (inputs[1]) set(inputs[1], ${JSON.stringify(days)});
      return "set";
    })()`);
    await delay(80);
    return evalValue(`document.querySelector("h1")?.textContent || ""`);
  }
  const firstAnswer = await ask("500", "30");
  const secondAnswer = await ask("1000", "20");
  check("changing calories and days updates the answer", Boolean(firstAnswer) && Boolean(secondAnswer) && firstAnswer !== secondAnswer && secondAnswer.includes("in 20 days"));
  if (firstAnswer === secondAnswer) console.log(JSON.stringify({ firstAnswer, secondAnswer }));

  await clickText("Sign out");
  await delay(150);
  const signText = await evalValue("document.body.innerText");
  check("sign out asks and stays on the page", signText.includes("data stays on this device") && signText.includes("Retest"));
  await clickText("Stay signed in");

  await go("#/onboarding");
  await clickText("Add to this session");
  await delay(200);
  check("purpose does not advance on the default", await clickText("Continue") === "clicked" && (await evalValue("document.body.innerText")).includes("Confirm the purpose"));
  await evalValue(`(() => { const box = document.querySelector('input[type="checkbox"]'); if (box) box.click(); return "ok"; })()`);
  await clickText("Continue");
  await delay(200);
  const eligibility = await evalValue("document.body.innerText");
  check("purpose continues after an explicit choice", eligibility.includes("Eligibility") || eligibility.includes("Profile date of birth"));

  await send("Emulation.setDeviceMetricsOverride", { width: 1680, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await go("#/overview");
  const gaps = JSON.parse(await evalValue(`(() => {
    const main = document.querySelector("main");
    const workspace = document.querySelector(".workspace");
    const box = main.getBoundingClientRect();
    const parent = workspace.getBoundingClientRect();
    return JSON.stringify({ left: Math.round(box.left - parent.left), right: Math.round(parent.right - box.right), width: Math.round(box.width) });
  })()`) || "{}");
  check("wide layout centers the column", Math.abs(gaps.left - gaps.right) <= 24 && gaps.width >= 1000 && gaps.width <= 1180);
  console.log(JSON.stringify(gaps));

  await go("#/settings");
  await delay(300);
  const switched = await evalValue(`(() => {
    const field = [...document.querySelectorAll("label, .field")].find((item) => (item.textContent || "").includes("Units"));
    const select = field?.querySelector("select");
    if (!select) return "missing";
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, "imperial");
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return select.value;
  })()`);
  check("units switch to imperial", switched === "imperial");
  await delay(300);
  for (const route of ["#/overview", "#/simulator", "#/progress", "#/compare", "#/settings", "#/report", "#/insights", "#/connections"]) {
    await go(route);
    await delay(300);
    const text = await evalValue("document.body.innerText");
    const leaked = text.split(/[^A-Za-z]+/).some((word) => word.toLowerCase() === "kg");
    check(`no kilogram label on ${route}`, !leaked);
    if (leaked) console.log(text.slice(0, 800));
  }
  browser.close();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  failed = true;
}
finish(failed ? 1 : 0);

function check(name, ok) {
  console.log(`${ok ? "ok" : "FAIL"} ${name}`);
  if (!ok) failed = true;
}

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

function point(index) {
  const date = new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10);
  const centralKg = Math.round((70 - index * 0.08) * 10) / 10;
  return {
    date, centralKg, lowerKg: centralKg - 0.4, upperKg: centralKg + 0.3, boundType: "sensitivity-range",
    expenditureKcal: 2200, intakeKcal: 1800, massBeforeKg: centralKg,
  };
}

function scenario(id, name) {
  const points = Array.from({ length: 40 }, (_, index) => point(index));
  return {
    id, profileId: "prof", name, description: "", labels: [], createdAt: "2026-11-01T00:00:00.000Z", archivedAt: null, activeVersionId: `${id}-v`,
    versions: [{
      id: `${id}-v`, scenarioId: id, versionNumber: 1, parentVersionId: null, duplicatedFromVersionId: null,
      createdAt: "2026-11-01T00:00:00.000Z", modelId: "hall-lancet-2011", modelVersion: "2011.webappendix", engineBuild: "trajectory-web-0.2.0",
      inputSnapshot: {
        name, description: "", labels: [], startDate: "2026-11-01", horizonDays: 40, timeZone: "America/Toronto",
        baseline: { intakeKcal: 1800, activityMode: "category", activityCategory: "sedentary", steps: 7000, pal: 1.5, explicitActivityKcal: 0, exerciseMinutes: 0, note: "" },
        weekly: { enabled: false, days: {} }, phases: [], overrides: [],
        goal: { weightKg: 68, date: "2026-12-01", label: "Chart marker" }, milestones: [],
        profile: {
          birthDate: "1990-01-01", heightCm: 170, referenceWeightKg: 70, referenceDate: "2026-11-01",
          sexParameter: "parameter-a", bodyFatPct: null, bodyFatSource: "", bodyFatConfidence: "unspecified", leanMassKg: null,
          energyBasis: "user-estimate", maintenanceKcal: 2200, calibrationNote: null,
          referenceActivity: { category: "sedentary", steps: 7000, pal: 1.5 }, excludedContext: "none", excludedDetail: "",
        },
      },
      inputHash: `${id}-hash`, assumptions: [], idempotencyKey: id, editKind: "initial",
      change: { narrative: "First saved version.", firstDivergence: null, prefixUnchanged: true, endDeltaKg: null, spans: [] },
      forecast: {
        id: `${id}-run`, scenarioVersionId: `${id}-v`, modelId: "hall-lancet-2011", modelVersion: "2011", engineBuild: "retest",
        status: "complete", inputHash: `${id}-hash`, startedAt: "2026-11-01T00:00:00.000Z", completedAt: "2026-11-01T00:00:01.000Z",
        warnings: [], assumptions: [], refusal: null, errorId: null, points,
      },
    }],
  };
}

function seed() {
  const connection = (provider) => ({
    provider, status: "unavailable", readWeight: false, readActivity: false, write: false,
    requestedAt: null, revokedAt: null, lastSyncAt: null, note: "Not available in this browser.",
  });
  return {
    schema: 2, hydrated: true, recoveryAvailable: false,
    viewer: { birthDate: "1990-01-01", adultOk: true, consents: [] },
    sessionAccountId: "acct", onboarding: null, deletionReceipt: null,
    accounts: [{
      id: "acct", displayName: "Retest", isDemo: false, passphraseSalt: null, passphraseHash: null, createdAt: "2026-01-01T00:00:00.000Z",
      preferences: { unit: "kg", lengthUnit: "cm", dateFormat: "dmy", theme: "light", timeZone: "America/Toronto", hideWeight: false, pauseTracking: false },
      notifications: { reviewEnabled: false, reviewEveryDays: 14, reviewHour: 9, quietStartHour: 21, quietEndHour: 8, pauseAll: false, phaseStartEnabled: false, browserNotifications: false, enabledAt: null },
      connections: { appleHealth: connection("apple-health"), healthConnect: connection("health-connect") },
      consents: [],
      profiles: [{
        id: "prof", label: "Retest", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        birthDate: "1990-01-01", heightCm: 170, referenceWeightKg: 70, referenceDate: "2026-11-01",
        sexParameter: "parameter-a", bodyFatPct: null, bodyFatSource: "", bodyFatConfidence: "unspecified", leanMassKg: null,
        energyBasis: "user-estimate", maintenanceKcal: 2200, calibrationNote: null,
        referenceActivity: { category: "sedentary", steps: 7000, pal: 1.5 }, excludedContext: "none", excludedDetail: "",
      }],
      activeProfileId: "prof",
      scenarios: [scenario("scn-a", "Plan A"), scenario("scn-b", "Plan B")],
      observations: [{
        id: "obs", profileId: "prof", observedAt: "2026-11-01T07:00:00", localDate: "2026-11-01", localTime: "07:00",
        timeZone: "America/Toronto", valueKg: 90, sourceValue: 90, sourceUnit: "kg", source: "manual", sourceRecordId: null,
        importBatchId: null, note: "", createdAt: "2026-11-01T07:00:00.000Z", deletedAt: null, corrections: [], syncStatus: "local-only",
      }],
      otherMeasurements: [], compositionLogs: [], cycleLogs: [], importBatches: [],
      drafts: {}, audits: [], reminderDismissedOn: null, phasePromptDismissedOn: null, featureFlags: { advancedMath: false },
    }],
  };
}
