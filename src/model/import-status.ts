export function importStatus(row: { error: string; far: boolean; sameReading: boolean; sameDay: boolean }): string {
  const bits: string[] = [];
  if (row.error) bits.push(row.error);
  if (row.sameReading) bits.push("Already imported. This row will be skipped.");
  else if (row.sameDay) bits.push("Same calendar day already has a different reading. You can still import this one.");
  if (row.far) bits.push("Far from the profile reference weight. Leave it unchecked unless you mean to import it. The chart axis will not stretch to it.");
  if (!bits.length) bits.push("Ready");
  return bits.join(" ");
}
