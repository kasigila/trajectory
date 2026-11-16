import { useEffect, useState } from "react";

export const ROUTES = ["overview", "simulator", "compare", "progress", "insights", "connections", "settings", "report", "onboarding"] as const;
export type Route = (typeof ROUTES)[number];

function read(): Route {
  const name = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return (ROUTES as readonly string[]).includes(name) ? (name as Route) : "overview";
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(typeof window === "undefined" ? "overview" : read());
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.hash = "/overview";
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function go(route: Route) {
  window.location.hash = `/${route}`;
}
