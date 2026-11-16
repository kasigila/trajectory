import { changeLines, type ChangeExplanation } from "../model/explain";

export function ChangeList({ change, dateStyle }: { change: ChangeExplanation | null | undefined; dateStyle: "iso" | "dmy" | "mdy" | "long" }) {
  const lines = change ? changeLines(change, dateStyle) : ["Save a scenario to see an explanation."];
  return (
    <ul className="change-list">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
