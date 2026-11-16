import { useEffect } from "react";
import { Shell } from "./components/Shell";
import { useRoute } from "./route";
import { hydrate, useSession } from "./state/store";
import { Compare } from "./views/Compare";
import { Connections } from "./views/Connections";
import { Gate } from "./views/Gate";
import { Insights } from "./views/Insights";
import { Onboarding } from "./views/Onboarding";
import { Overview } from "./views/Overview";
import { Progress } from "./views/Progress";
import { Report } from "./views/Report";
import { Settings } from "./views/Settings";
import { Simulator } from "./views/Simulator";

export function App() {
  const { db, account } = useSession();
  const route = useRoute();
  useEffect(() => {
    void hydrate();
  }, []);
  useEffect(() => {
    const theme = account?.preferences.theme ?? "system";
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      root.dataset.theme = dark ? "dark" : "light";
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [account?.preferences.theme]);
  if (!db.hydrated) return <main className="gate"><p>Loading the studio…</p></main>;
  if (!db.viewer.adultOk || !account) return <Gate />;
  if (route === "onboarding") return <Onboarding />;
  const page = route === "simulator" ? <Simulator /> : route === "compare" ? <Compare /> : route === "progress" ? <Progress /> : route === "insights" ? <Insights /> : route === "connections" ? <Connections /> : route === "settings" ? <Settings /> : route === "report" ? <Report /> : <Overview />;
  return <Shell route={route}>{page}</Shell>;
}
