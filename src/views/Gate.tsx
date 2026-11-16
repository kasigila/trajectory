import { useState } from "react";
import { DISCLAIMER, PRIVACY, TAGLINE, TERMS } from "../copy";
import { go } from "../route";
import { acceptGate, restoreDemo, sessionAccount, signIn, useDb } from "../state/store";
import { stamp } from "../format";
import { Logo } from "../components/Logo";
import { Button, Disclosure, Field, Notice } from "../components/ui";

export function Gate() {
  const db = useDb();
  const [birthDate, setBirthDate] = useState(db.viewer.birthDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  if (!db.viewer.adultOk) {
    return (
      <main className="gate">
        <Logo />
        <p className="tagline">{TAGLINE}</p>
        <h1>See what you would weigh</h1>
        <p className="lede">For adults 18 and older. Not a medical device. Your numbers stay on this device.</p>
        {db.deletionReceipt ? <Notice>Local data for “{db.deletionReceipt.label}” was removed on {stamp(db.deletionReceipt.at)}.</Notice> : null}
        <Field label="Date of birth">
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
        </Field>
        {error ? <p role="alert">{error}</p> : null}
        <Button
          variant="primary"
          onClick={() => {
            const result = acceptGate(birthDate);
            if (!result.ok) setError(result.message);
            else if (!sessionAccount()?.profiles.length) go("onboarding");
          }}
        >
          Continue
        </Button>
        <Button
          onClick={() => {
            const result = acceptGate(birthDate);
            if (!result.ok) setError(result.message);
            else void restoreDemo().then(() => go("overview"));
          }}
        >
          See a sample forecast
        </Button>
        <Disclosure title="Terms">{TERMS}</Disclosure>
        <Disclosure title="Privacy">{PRIVACY}</Disclosure>
        <Disclosure title="About this app"><p>{DISCLAIMER}</p><p>The sample is a made-up profile. It is not your data.</p></Disclosure>
      </main>
    );
  }
  return (
    <main className="gate">
      <Logo />
      <h1>Open a local session</h1>
      <p>These sessions live in this browser. There is no email sign-in and no password reset.</p>
      {db.accounts.map((account) => (
        <form
          key={account.id}
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            void signIn(account.id, passwords[account.id] ?? "").then((result) => {
              if (!result.ok) setError(result.message);
            });
          }}
        >
          <h2>{account.displayName}</h2>
          <p>{account.isDemo ? "Sample data. Not your measurements." : account.passphraseHash ? "Local session protected by a device passphrase." : "Your session on this browser."}</p>
          {account.passphraseHash ? (
            <Field label="Passphrase">
              <input type="password" value={passwords[account.id] ?? ""} onChange={(event) => setPasswords({ ...passwords, [account.id]: event.target.value })} />
            </Field>
          ) : null}
          <Button variant="primary" type="submit">
            {account.isDemo ? "Open the demo" : account.passphraseHash ? "Unlock" : "Open"}
          </Button>
        </form>
      ))}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
