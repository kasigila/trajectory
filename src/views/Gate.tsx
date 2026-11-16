import { useState } from "react";
import { DISCLAIMER, PRIVACY, TAGLINE, TERMS } from "../copy";
import { acceptGate, signIn, useDb } from "../state/store";
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
        <h1>A studio for dated body-weight scenarios.</h1>
        <p className="lede">Plan intake and activity across time, edit a day, and see the Hall trajectory with a sensitivity range. It is not a diet tracker and not a medical device.</p>
        {db.deletionReceipt ? <Notice>Local data for “{db.deletionReceipt.label}” was removed on {db.deletionReceipt.at}. The fictional sample is available again after the age check. This build has no server backup.</Notice> : null}
        <Field label="Your date of birth" hint="Used only to enforce the 18+ limit. It is not the sample profile’s date of birth, and health-data permission is not part of this step.">
          <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
        </Field>
        <Disclosure title="Terms">{TERMS}</Disclosure>
        <Disclosure title="Privacy notice">{PRIVACY}</Disclosure>
        {error ? <p role="alert">{error}</p> : null}
        <Button
          variant="primary"
          onClick={() => {
            const result = acceptGate(birthDate);
            if (!result.ok) setError(result.message);
          }}
        >
          I am 18 or older and I accept the terms and privacy notice
        </Button>
        <p className="fine">{DISCLAIMER}</p>
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
          <p>{account.isDemo ? "Sample data. Not your measurements." : "Local session protected by a device passphrase."}</p>
          {account.passphraseHash ? (
            <Field label="Passphrase">
              <input type="password" value={passwords[account.id] ?? ""} onChange={(event) => setPasswords({ ...passwords, [account.id]: event.target.value })} />
            </Field>
          ) : null}
          <Button variant="primary" type="submit">
            {account.isDemo ? "Open the demo" : "Unlock"}
          </Button>
        </form>
      ))}
      {error ? <p role="alert">{error}</p> : null}
    </main>
  );
}
