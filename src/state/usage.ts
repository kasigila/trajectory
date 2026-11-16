const KEY = "trajectory.usage.v1";

function read(): Record<string, number> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function noteRoute(route: string) {
  const counts = read();
  const key = `open:${route}`;
  counts[key] = (counts[key] ?? 0) + 1;
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(counts));
}

export function usageRows(): { name: string; count: number }[] {
  return Object.entries(read())
    .map(([name, count]) => ({ name: name.replace(/^open:/, ""), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
