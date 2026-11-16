import { useState } from "react";
import { PageTitle } from "../components/Shell";
import { Button, Field, Notice } from "../components/ui";
import { PRIVACY } from "../copy";
import { stamp } from "../format";
import { MODEL } from "../model/parameters";
import { EXPORT_FORMAT, thinForExport } from "../state/export";
import { usageRows } from "../state/usage";
import { go } from "../route";
import {
  addCycleLog,
  deleteAccount,
  deleteCycleLog,
  deleteDevice,
  deleteProfile,
  downloadBackup,
  importLocalAccount,
  recordExport,
  restoreDemo,
  restoreSnapshot,
  sessionAccount,
  setFlag,
  setOptionalConsent,
  setPassphrase,
  updateNotifications,
  updatePreferences,
  updateProfile,
  useSession,
  withdrawUse,
} from "../state/store";

export function Settings() {
  const { account, profile, db } = useSession();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!account || !profile) return null;
  const cycleOn = account.consents.some((item) => item.consentType === "cycle-context" && item.grantedAt && !item.revokedAt);
  const prefs = account.preferences;
  return (
    <section>
      <PageTitle kicker="Settings" title="Preferences, privacy, and data" lede="Data for this session stays in this browser unless you export it." />
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <article className="card">
        <h2>Display</h2>
        <div className="grid-2">
          <Field label="Weight unit">
            <select value={prefs.unit} onChange={(event) => updatePreferences(account.id, { unit: event.target.value as "kg" | "lb" })}>
              <option value="kg">Kilograms</option>
              <option value="lb">Pounds</option>
            </select>
          </Field>
          <Field label="Height unit">
            <select value={prefs.lengthUnit} onChange={(event) => updatePreferences(account.id, { lengthUnit: event.target.value as "cm" | "ft" })}>
              <option value="cm">Centimetres</option>
              <option value="ft">Feet and inches</option>
            </select>
          </Field>
          <Field label="Date format">
            <select value={prefs.dateFormat} onChange={(event) => updatePreferences(account.id, { dateFormat: event.target.value as typeof prefs.dateFormat })}>
              <option value="iso">2026-11-16</option>
              <option value="dmy">16 Nov 2026</option>
              <option value="mdy">Nov 16, 2026</option>
              <option value="long">Monday, 16 Nov 2026</option>
            </select>
          </Field>
          <Field label="Theme">
            <select value={prefs.theme} onChange={(event) => updatePreferences(account.id, { theme: event.target.value as typeof prefs.theme })}>
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Time zone" hint="Local calendar days for new scenarios use this zone. Saved versions keep the zone in their snapshot.">
            <input value={prefs.timeZone} onChange={(event) => updatePreferences(account.id, { timeZone: event.target.value })} />
          </Field>
        </div>
        <label className="check"><input type="checkbox" checked={prefs.hideWeight} onChange={(event) => updatePreferences(account.id, { hideWeight: event.target.checked })} /> Hide absolute weight numbers</label>
        <label className="check"><input type="checkbox" checked={prefs.pauseTracking} onChange={(event) => updatePreferences(account.id, { pauseTracking: event.target.checked })} /> Pause weigh-in tracking</label>
      </article>
      <ProfileForm />
      <article className="card">
        <h2>Reminders</h2>
        <p>Off by default. Copy stays neutral. There are no streaks.</p>
        <label className="check"><input type="checkbox" checked={account.notifications.reviewEnabled} onChange={(event) => { updateNotifications(account.id, { reviewEnabled: event.target.checked }); setOptionalConsent(account.id, "reminders", event.target.checked); }} /> Remind me to review a scenario</label>
        <Field label="Every N days"><input value={account.notifications.reviewEveryDays} onChange={(event) => updateNotifications(account.id, { reviewEveryDays: Number(event.target.value) })} /></Field>
        <Field label="Hour"><input value={account.notifications.reviewHour} onChange={(event) => updateNotifications(account.id, { reviewHour: Number(event.target.value) })} /></Field>
        <Field label="Quiet hours start"><input value={account.notifications.quietStartHour} onChange={(event) => updateNotifications(account.id, { quietStartHour: Number(event.target.value) })} /></Field>
        <Field label="Quiet hours end"><input value={account.notifications.quietEndHour} onChange={(event) => updateNotifications(account.id, { quietEndHour: Number(event.target.value) })} /></Field>
        <label className="check"><input type="checkbox" checked={account.notifications.phaseStartEnabled} onChange={(event) => updateNotifications(account.id, { phaseStartEnabled: event.target.checked })} /> Mention when a planned phase starts</label>
        <label className="check"><input type="checkbox" checked={account.notifications.pauseAll} onChange={(event) => updateNotifications(account.id, { pauseAll: event.target.checked })} /> Pause all reminders</label>
        <label className="check">
          <input
            type="checkbox"
            checked={account.notifications.browserNotifications}
            onChange={(event) => {
              if (event.target.checked && typeof Notification !== "undefined") {
                void Notification.requestPermission().then((permission) => updateNotifications(account.id, { browserNotifications: permission === "granted" }));
              } else updateNotifications(account.id, { browserNotifications: false });
            }}
          />
          Also use browser notifications
        </label>
      </article>
      <article className="card">
        <h2>Cycle context</h2>
        <p>Optional and sensitive. It is not used to adjust weight or the forecast, and it does not assume a cycle. Turning it off can delete the notes.</p>
        <label className="check"><input type="checkbox" checked={cycleOn} onChange={(event) => setOptionalConsent(account.id, "cycle-context", event.target.checked, !event.target.checked)} /> Store cycle notes</label>
        {cycleOn ? <CycleForm /> : null}
      </article>
      <article className="card">
        <h2>Privacy</h2>
        <p>{PRIVACY}</p>
        <ul>
          <li>Profiles: {account.profiles.length}</li>
          <li>Scenarios: {account.scenarios.length}</li>
          <li>Weigh-ins on the chart: {account.observations.filter((item) => !item.deletedAt).length}. Removed and still stored: {account.observations.filter((item) => item.deletedAt).length}.</li>
          <li>Cycle notes: {account.cycleLogs.length}</li>
          <li>Analytics vendor: none. Counts below stay in this browser and are not uploaded.</li>
          {usageRows().map((row) => <li key={row.name}>Opened {row.name}: {row.count}</li>)}
        </ul>
        <h3>Consent records</h3>
        <ul>
          {[...db.viewer.consents, ...account.consents].map((item) => (
            <li key={item.id}>{consentName(item.consentType)} · policy {item.policyVersion} · {item.grantedAt ? `granted ${stamp(item.grantedAt)}` : "not granted"}{item.revokedAt ? ` · revoked ${stamp(item.revokedAt)}` : ""}</li>
          ))}
        </ul>
        <Button onClick={() => withdrawUse()}>Withdraw terms and close the studio</Button>
      </article>
      <article className="card">
        <h2>Export</h2>
        <Button onClick={() => exportJson(account)}>Download JSON</Button>
        <Button onClick={() => exportCsv(account)}>Download weigh-in CSV</Button>
        <Button onClick={() => go("report")}>Open print-ready report</Button>
        {db.recoveryAvailable ? <Button onClick={() => downloadText("trajectory-backup.txt", downloadBackup() ?? "")}>Download unreadable backup</Button> : null}
      </article>
      <ImportCard />
      <article className="card">
        <h2>Model registry</h2>
        <p>{MODEL.name}</p>
        <p>ID {MODEL.id} · version {MODEL.version} · engine {MODEL.engineBuild}</p>
        <p>{MODEL.shortCitation}. These are the published adult equations. This build is not a clinically validated medical device. Older saved runs keep the model id they were generated with.</p>
        <label className="check"><input type="checkbox" checked={account.featureFlags.advancedMath} onChange={(event) => setFlag(account.id, event.target.checked)} /> Show the parameter list in Insights-sized detail on the report</label>
        <p className="fine">Feature flags: health sync locked off. Hosted accounts locked off. Cycle overlay follows your consent.</p>
        <h3>Masked summary</h3>
        <p>Scenarios {account.scenarios.length}. Readings {account.observations.filter((item) => !item.deletedAt).length}. No weight values are shown here.</p>
      </article>
      <LockForm />
      <article className="card">
        <h2>Delete</h2>
        <DeleteSession />
        <Button variant="danger" onClick={() => void deleteDevice().then(() => setMessage("Personal local data was removed from this browser. The age check is required again."))}>Delete everything on this device</Button>
        <Button onClick={() => void restoreDemo().then(() => setMessage("Sample profile restored."))}>Restore sample profile</Button>
        {account.profiles.length > 1 ? <Button variant="danger" onClick={() => { const result = deleteProfile(account.id, profile.id); if (!result.ok) setError(result.message); }}>Delete active profile</Button> : null}
      </article>
    </section>
  );
}

function ProfileForm() {
  const { account, profile } = useSession();
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : "");
  const [weightKg, setWeight] = useState(profile ? String(profile.referenceWeightKg) : "");
  const [maintenance, setMaintenance] = useState(profile?.maintenanceKcal?.toString() ?? "");
  const [birth, setBirth] = useState(profile?.birthDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  if (!account || !profile) return null;
  return (
    <article className="card">
      <h2>Profile inputs</h2>
      <p>Saving here does not rewrite scenarios. Each scenario keeps its snapshot until you re-run it from the simulator.</p>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {saved ? <p role="status">{saved}</p> : null}
      <div className="grid-2">
        <Field label="Date of birth"><input type="date" value={birth} onChange={(event) => setBirth(event.target.value)} /></Field>
        <Field label="Height, cm"><input value={height} onChange={(event) => setHeight(event.target.value)} /></Field>
        <Field label="Reference weight, kg"><input value={weightKg} onChange={(event) => setWeight(event.target.value)} /></Field>
        <Field label="Maintenance kcal"><input value={maintenance} onChange={(event) => setMaintenance(event.target.value)} /></Field>
        <Field label="Parameter">
          <select value={profile.sexParameter} onChange={(event) => updateProfile(account.id, profile.id, { sexParameter: event.target.value as typeof profile.sexParameter })}>
            <option value="unspecified">Not sure / prefer not to provide</option>
            <option value="parameter-a">Men’s published equations (Jackson; Mifflin–St Jeor)</option>
            <option value="parameter-b">Women’s published equations (Jackson; Mifflin–St Jeor)</option>
          </select>
        </Field>
        <Field label="Excluded context">
          <select value={profile.excludedContext} onChange={(event) => updateProfile(account.id, profile.id, { excludedContext: event.target.value as typeof profile.excludedContext })}>
            <option value="none">None</option>
            <option value="pregnancy">Pregnancy</option>
            <option value="breastfeeding">Breastfeeding</option>
            <option value="medical-management">Medical management</option>
            <option value="pediatric">Pediatric</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
      <Button onClick={() => {
        const result = updateProfile(account.id, profile.id, {
          birthDate: birth,
          heightCm: Number(height),
          referenceWeightKg: Number(weightKg),
          maintenanceKcal: maintenance.trim() === "" ? null : Number(maintenance),
          energyBasis: profile.energyBasis === "model-estimated" ? "model-estimated" : profile.energyBasis,
        });
        setError(result.ok ? null : result.message);
        setSaved(result.ok ? "Profile inputs saved. Existing scenarios were not rewritten." : null);
      }}>Save profile inputs</Button>
      <p className="fine">Affected scenarios: {account.scenarios.filter((item) => item.profileId === profile.id).map((item) => item.name).join(", ") || "none"}.</p>
    </article>
  );
}

function CycleForm() {
  const { account, profile } = useSession();
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  if (!account || !profile) return null;
  return (
    <div>
      <Field label="Date"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
      <Field label="Note"><input value={note} onChange={(event) => setNote(event.target.value)} /></Field>
      <Button onClick={() => date && addCycleLog(account.id, { profileId: profile.id, date, kind: note ? "note" : "bleeding-started", note })}>Add cycle note</Button>
      <ul>
        {account.cycleLogs.filter((log) => log.profileId === profile.id).map((log) => (
          <li key={log.id}>{log.date}: {log.kind} {log.note} <button type="button" onClick={() => deleteCycleLog(account.id, log.id)}>Remove</button></li>
        ))}
      </ul>
    </div>
  );
}

function LockForm() {
  const { account } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (!account) return null;
  return (
    <article className="card">
      <h2>Local lock</h2>
      <p>A passphrase is hashed on this device. It is not a hosted password, and email reset is unavailable.</p>
      <Field label="Current passphrase"><input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} /></Field>
      <Field label="New passphrase"><input type="password" value={next} onChange={(event) => setNext(event.target.value)} /></Field>
      <Button onClick={() => void setPassphrase(account.id, next, current).then((result) => setMessage(result.ok ? "Lock updated." : result.message))}>Save passphrase</Button>
      {message ? <p>{message}</p> : null}
    </article>
  );
}

function DeleteSession() {
  const { account } = useSession();
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  if (!account) return null;
  return (
    <div>
      <Field label={account.passphraseHash ? "Passphrase to delete this session" : "Type DELETE"}>
        <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      </Field>
      <Button variant="danger" onClick={() => void deleteAccount(account.id, confirmation).then((result) => setMessage(result.ok ? "This local session was deleted from the browser. There is no server copy." : result.message))}>Delete this local session</Button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

function ImportCard() {
  const [message, setMessage] = useState<string | null>(null);
  return (
    <article className="card">
      <h2>Bring a file back</h2>
      <p>A JSON export from this app opens as a local session on this browser. The file does not contain the passphrase. Each save also keeps the previous browser snapshot, which you can restore here.</p>
      <Field label="Import a Trajectory JSON file">
        <input aria-label="Import JSON" type="file" accept="application/json,.json" onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          try {
            const result = await importLocalAccount(JSON.parse(await file.text()));
            setMessage(result.ok ? "Import opened as the current session." : result.message);
          } catch {
            setMessage("That file could not be read. Nothing was imported.");
          }
        }} />
      </Field>
      <Button onClick={() => { const result = restoreSnapshot(); setMessage(result.ok ? "Restored the previous local snapshot." : result.message); }}>Restore previous snapshot</Button>
      {message ? <p role="status">{message}</p> : null}
    </article>
  );
}

function exportJson(account: NonNullable<ReturnType<typeof sessionAccount>>) {
  downloadText(`trajectory-${account.id}.json`, JSON.stringify({ meta: { format: EXPORT_FORMAT, model: MODEL, derived: "recompute" }, account: thinForExport(account) }, null, 2));
  recordExport(account.id, "json");
}

function exportCsv(account: NonNullable<ReturnType<typeof sessionAccount>>) {
  const lines = ["local_date,local_time,timezone,value_kg,source_value,source_unit,source,source_record_id,import_batch_id,note,deleted_at"];
  for (const obs of account.observations) {
    lines.push([obs.localDate, obs.localTime, obs.timeZone, obs.valueKg, obs.sourceValue, obs.sourceUnit, obs.source, obs.sourceRecordId ?? "", obs.importBatchId ?? "", csvCell(obs.note), obs.deletedAt ?? ""].join(","));
  }
  downloadText("trajectory-weigh-ins.csv", lines.join("\n"));
  recordExport(account.id, "csv");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function consentName(type: string) {
  if (type === "cycle-context") return "Cycle notes";
  if (type === "health-sync") return "Health sync";
  if (type === "terms") return "Terms";
  if (type === "privacy") return "Privacy";
  if (type === "reminders") return "Reminders";
  return type;
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
