import { useState } from "react";
import { PageTitle } from "../components/Shell";
import { Button, Dialog } from "../components/ui";
import { setConnection, setOptionalConsent, useSession } from "../state/store";
import type { ConnectionRecord } from "../state/types";

export function Connections() {
  const { account } = useSession();
  const [open, setOpen] = useState<null | "appleHealth" | "healthConnect">(null);
  if (!account) return null;
  return (
    <section>
      <PageTitle kicker="Connections" title="Health platforms" lede="This browser cannot read Apple Health or Health Connect. Nothing below is a successful sync." />
      <ConnectionCard
        title="Apple Health"
        body="A native iOS app could later request read access to weight and activity. Write access is not part of a first integration. This page does not open a Health permission dialog and does not import data."
        record={account.connections.appleHealth}
        onAttempt={() => setOpen("appleHealth")}
        onRevoke={() => {
          setConnection(account.id, "appleHealth", "revoked");
          setOptionalConsent(account.id, "health-sync", false);
        }}
        onClear={() => setConnection(account.id, "appleHealth", "not-requested")}
      />
      <ConnectionCard
        title="Health Connect"
        body="A native Android app could later request read access to weight, steps, and activity, one type at a time. This browser build cannot. Permission changes and deleted records are not applicable until a native app exists."
        record={account.connections.healthConnect}
        onAttempt={() => setOpen("healthConnect")}
        onRevoke={() => {
          setConnection(account.id, "healthConnect", "revoked");
          setOptionalConsent(account.id, "health-sync", false);
        }}
        onClear={() => setConnection(account.id, "healthConnect", "not-requested")}
      />
      <Dialog open={open != null} title="Not available in the browser" onClose={() => setOpen(null)}>
        <p>No health-platform permission was requested. No data was read. The connection status will stay unavailable, not connected.</p>
        <Button
          variant="primary"
          onClick={() => {
            if (open) setConnection(account.id, open, "unavailable");
            setOpen(null);
          }}
        >
          Record that this cannot connect
        </Button>
        <Button onClick={() => setOpen(null)}>Close</Button>
      </Dialog>
      <p className="fine">CSV import on the Progress page is the way to bring in readings here. It is separate from these platforms.</p>
    </section>
  );
}

function ConnectionCard({ title, body, record, onAttempt, onRevoke, onClear }: { title: string; body: string; record: ConnectionRecord; onAttempt: () => void; onRevoke: () => void; onClear: () => void }) {
  const status = record.status === "not-requested" ? "Not available in the browser" : record.status === "unavailable" ? "Unavailable — connection was not made" : "Revoked — no sync will run";
  return (
    <article className="card">
      <h2>{title}</h2>
      <p className="figure">{status}</p>
      <p>{body}</p>
      <ul>
        <li>Read weight: not requested</li>
        <li>Read activity: not requested</li>
        <li>Write: not requested</li>
        <li>Last sync: never</li>
      </ul>
      <p className="fine">{record.note}</p>
      <div className="toolbar">
        <Button onClick={onAttempt}>Review connection</Button>
        <Button onClick={onRevoke}>I do not consent to health-platform sync</Button>
        {record.status === "revoked" ? <Button onClick={onClear}>Clear the refusal</Button> : null}
      </div>
    </article>
  );
}
