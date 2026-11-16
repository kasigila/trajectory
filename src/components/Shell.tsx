import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Notice } from "./ui";
import { Icon, type IconName } from "./icons";
import { Logo } from "./Logo";
import { noteRoute } from "../state/usage";
import { diffDays, hourInTimeZone, todayIso } from "../model/dates";
import type { Route } from "../route";
import { dismissReminder, setActiveProfile, signOut, useSession } from "../state/store";

const PRIMARY: Array<{ id: Route; label: string; icon: IconName }> = [
  { id: "overview", label: "Home", icon: "overview" },
  { id: "simulator", label: "Plan", icon: "simulator" },
  { id: "progress", label: "Track", icon: "progress" },
  { id: "compare", label: "Compare", icon: "compare" },
];

const MORE: Array<{ id: Route; label: string; icon: IconName }> = [
  { id: "report", label: "Report", icon: "report" },
  { id: "insights", label: "Learn", icon: "insights" },
  { id: "settings", label: "Settings", icon: "settings" },
  { id: "connections", label: "Connections", icon: "connections" },
];

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { account, profile } = useSession();
  const [more, setMore] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  useEffect(() => {
    if (account) noteRoute(route);
  }, [account, route]);
  if (!account || !profile) return null;
  const today = todayIso(account.preferences.timeZone);
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="nav">
        <Logo />
        <nav aria-label="Primary">
          {[...PRIMARY, ...MORE].map((item) => (
            <a key={item.id} href={`#/${item.id}`} aria-current={route === item.id ? "page" : undefined}>
              <Icon name={item.icon} />
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="title-block">
            <p className="kicker">{account.displayName}</p>
            <label>
              <span className="sr-only">Active profile</span>
              <select value={profile.id} onChange={(event) => setActiveProfile(account.id, event.target.value)} aria-label="Active profile">
                {account.profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="today">{today} · {account.preferences.timeZone}</p>
          </div>
          <div className="top-actions">
            <a href="#/onboarding">New profile</a>
            {confirmSignOut ? (
              <span className="signout-confirm" role="status">
                Sign out of this session? The data stays on this device. Nothing is uploaded or deleted.
                <button type="button" className="btn quiet" onClick={() => signOut()}>Sign out</button>
                <button type="button" className="btn" onClick={() => setConfirmSignOut(false)}>Stay signed in</button>
              </span>
            ) : (
              <button type="button" className="btn quiet" onClick={() => setConfirmSignOut(true)}>
                Sign out
              </button>
            )}
          </div>
        </header>
        {account.isDemo ? <Notice>Sample data, not your measurements. This opens on {profile.label}. Use New profile to enter your own. Numbers stay in this browser.</Notice> : null}
        <Reminders />
        <main id="content">{children}</main>
        <footer className="legal">Not a medical device. The chart is an estimate, not a scale reading. <a href="#/insights">About the model</a></footer>
      </div>
      <nav className="bottom-nav" aria-label="Mobile">
        {PRIMARY.slice(0, 4).map((item) => (
          <a key={item.id} href={`#/${item.id}`} aria-current={route === item.id ? "page" : undefined}>
            <Icon name={item.icon} />
            {item.label}
          </a>
        ))}
        <button type="button" aria-expanded={more} onClick={() => setMore((value) => !value)}>
          More
        </button>
        {more ? (
          <div className="more-menu">
            {MORE.map((item) => (
              <a key={item.id} href={`#/${item.id}`} onClick={() => setMore(false)}>
                <Icon name={item.icon} />
                {item.label}
              </a>
            ))}
          </div>
        ) : null}
      </nav>
    </div>
  );
}

function Reminders() {
  const { account } = useSession();
  const [notified, setNotified] = useState("");
  useEffect(() => {
    if (!account) return;
    const note = account.notifications;
    if (!note.browserNotifications || note.pauseAll || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const today = todayIso(account.preferences.timeZone);
    if (notified === today) return;
    const hour = hourInTimeZone(account.preferences.timeZone);
    if (quiet(hour, note.quietStartHour, note.quietEndHour)) return;
    if (!reviewDue(account, today, hour) && !phaseDue(account, today)) return;
    setNotified(today);
    new Notification("Trajectory", { body: "Reminder you set: review a scenario when you want to. Nothing is overdue." });
  }, [account, notified]);
  if (!account) return null;
  const today = todayIso(account.preferences.timeZone);
  const hour = hourInTimeZone(account.preferences.timeZone);
  const review = reviewDue(account, today, hour);
  const phase = phaseDue(account, today);
  if (!review && !phase) return null;
  return (
    <div className="reminders">
      {review ? (
        <p>
          Reminder you set: review a scenario when you want to. This is optional.
          <button type="button" onClick={() => dismissReminder(account.id, "review", today)}>
            Dismiss
          </button>
        </p>
      ) : null}
      {phase ? (
        <p>
          A phase you planned starts today: {phase}. This is a reminder you turned on. It is not a request to weigh in.
          <button type="button" onClick={() => dismissReminder(account.id, "phase", today)}>
            Dismiss
          </button>
        </p>
      ) : null}
    </div>
  );
}

function quiet(hour: number, start: number, end: number) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function reviewDue(account: NonNullable<ReturnType<typeof useSession>["account"]>, today: string, hour: number) {
  const note = account.notifications;
  if (!note.reviewEnabled || note.pauseAll || quiet(hour, note.quietStartHour, note.quietEndHour) || hour < note.reviewHour) return false;
  if (account.reminderDismissedOn && diffDays(today, account.reminderDismissedOn) < Math.max(note.reviewEveryDays, 1)) return false;
  if (note.reviewEveryDays > 0 && note.enabledAt && diffDays(today, note.enabledAt.slice(0, 10)) < note.reviewEveryDays) return false;
  return true;
}

function phaseDue(account: NonNullable<ReturnType<typeof useSession>["account"]>, today: string) {
  const note = account.notifications;
  if (!note.phaseStartEnabled || note.pauseAll || account.phasePromptDismissedOn === today) return "";
  const profileId = account.activeProfileId;
  for (const scenario of account.scenarios) {
    if (scenario.profileId !== profileId || scenario.archivedAt) continue;
    const version = scenario.versions.find((item) => item.id === scenario.activeVersionId);
    const phase = version?.inputSnapshot.phases.find((item) => item.start === today);
    if (phase) return phase.name;
  }
  return "";
}

const TITLE_ICON: Partial<Record<string, IconName>> = {
  Home: "overview",
  Plan: "simulator",
  Compare: "compare",
  Track: "progress",
  Learn: "insights",
  Connections: "connections",
  Settings: "settings",
  Report: "report",
};

export function PageTitle({ kicker, title, lede, compact }: { kicker: string; title: string; lede?: string; compact?: boolean }) {
  const icon = TITLE_ICON[kicker];
  return (
    <header className={compact ? "page-title compact" : "page-title"}>
      <p className="kicker">{icon ? <Icon name={icon} /> : null}{kicker}</p>
      <h1>{title}</h1>
      {lede ? <p className="lede">{lede}</p> : null}
    </header>
  );
}
