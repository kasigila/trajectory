import type { Database } from "./types";

/**
 * This build opens schema 2 only.
 * A later migration belongs here. Unknown documents are rejected so they can be kept as a backup instead of being rewritten.
 */
export function acceptStoredDatabase(raw: unknown): Database {
  if (!raw || typeof raw !== "object") throw new Error("This browser save is not a Trajectory document.");
  const parsed = raw as { schema?: number; accounts?: unknown };
  if (parsed.schema === 2 && Array.isArray(parsed.accounts)) return raw as Database;
  throw new Error(`This browser save is schema ${String(parsed.schema ?? "unknown")}, and this build only opens schema 2. It was not converted.`);
}
