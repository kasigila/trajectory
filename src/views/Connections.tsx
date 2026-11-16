import { useState } from "react";
import { PageTitle } from "../components/Shell";
import { Button, Dialog, Disclosure } from "../components/ui";
import { setConnection, setOptionalConsent, useSession } from "../state/store";
import type { ConnectionRecord } from "../state/types";

export function Connections() {
  const { account } = useSession();
  const [open, setOpen] = useState<null | "appleHealth" | "healthConnect">(null);
  if (!account) return null;
  return (
    <section>
      <PageTitle kicker="Connections" title="Health apps" lede="Not available in this browser." />
      <ConnectionCard
        title="Apple Health"
        body="A phone app could ask to read weight later. This page does not."
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
        body="A phone app could ask to read weight later. This page does not."
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
      <p>To add old readings, use Import a spreadsheet on Track.</p>
    </section>
  );
}

function ConnectionCard({ title, body, record, onAttempt, onRevoke, onClear }: { title: string; body: string; record: ConnectionRecord; onAttempt: () => void; onRevoke: () => void; onClear: () => void }) {
  const status = record.status === "not-requested" ? "Not available in the browser" : record.status === "unavailable" ? "Unavailable — connection was not made" : "Revoked — no sync will run";
  return (
    <article className="card">
      <h2>{title}</h2>
      <p className="figure">{status}</p>
      <div className="toolbar">
        <Button variant="primary" onClick={onAttempt}>Review connection</Button>
        <Button onClick={onRevoke}>I do not consent to health-platform sync</Button>
        {record.status === "revoked" ? <Button onClick={onClear}>Clear the refusal</Button> : null}
      </div>
      <Disclosure title="Details"><p>{body}</p><p>{record.note}</p><p>Read weight, read activity, and write are not requested. Last sync: never.</p></Disclosure>
    </article>
  );
}
