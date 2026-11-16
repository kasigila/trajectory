import { changeLines, type ChangeExplanation } from "../model/explain";

export function ChangeList({ change, dateStyle, unit = "kg" }: { change: ChangeExplanation | null | undefined; dateStyle: "iso" | "dmy" | "mdy" | "long"; unit?: "kg" | "lb" }) {
  const lines = change ? changeLines(change, dateStyle, unit) : ["Save a plan to see what changed."];
  return (
    <ul className="change-list">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
