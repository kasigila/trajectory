import { useState } from "react";
import { DISCLAIMER, PRIVACY, TAGLINE, TERMS } from "../copy";
import { go } from "../route";
import { acceptGate, sessionAccount, signIn, useDb } from "../state/store";
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
        <p className="lede">This is a private weight-forecasting tool for adults. After this age check you set up your own profile. It is not a sample person, not a diet tracker, and not a medical device.</p>
        {db.deletionReceipt ? <Notice>Local data for “{db.deletionReceipt.label}” was removed on {db.deletionReceipt.at}. This build has no server backup.</Notice> : null}
        <Field label="Your date of birth" hint="Used only to enforce the 18+ limit. Use the calendar. Your profile can use a different date. Health-data permission is not part of this step.">
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
            else if (!sessionAccount()?.profiles.length) go("onboarding");
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
