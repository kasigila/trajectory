export type IconName =
  | "overview"
  | "simulator"
  | "compare"
  | "progress"
  | "insights"
  | "connections"
  | "settings"
  | "report"
  | "check"
  | "warning";

const PATHS: Record<IconName, string> = {
  overview: "M4 14h16M6 14V6h4v8M12 14V8h4v6",
  simulator: "M5 16c2-6 4-6 6 0s4 6 6 0M4 8h16",
  compare: "M6 5v14M14 5v14M4 9h4M12 13h4",
  progress: "M4 16l4-5 3 3 5-7 4 4",
  insights: "M10 4a6 6 0 0 1 4 10l-1 3h-6l-1-3a6 6 0 0 1 4-10zM8 17h4",
  connections: "M8 8a3 3 0 1 0 0.01 0M16 14a3 3 0 1 0 0.01 0M10.5 9.5l3 3",
  settings: "M10 7v2M10 13v2M7 10h2M13 10h2M10 6.5a3.5 3.5 0 1 0 0.01 0",
  report: "M6 3h6l4 4v12H6zM12 3v4h4",
  check: "M4 10l4 4 8-8",
  warning: "M10 4l8 14H2zM10 9v4M10 15.5v.5",
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
