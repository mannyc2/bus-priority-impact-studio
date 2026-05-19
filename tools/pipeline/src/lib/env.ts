import { existsSync, readFileSync } from "node:fs";
import { fromRepoRoot } from "./paths.js";

/**
 * Bun auto-loads `.env` from the working directory. When the pipeline runs
 * via `bun --filter @bp/pipeline ...`, CWD becomes `tools/pipeline`, so
 * the root `.env` is never read. This helper loads the canonical root `.env`
 * and merges it into `process.env` without overwriting anything that is
 * already set (so explicit `KEY=value bun ...` still wins).
 *
 * Idempotent: re-invocation is a no-op.
 */
let loaded = false;

export function loadRepoRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const path = fromRepoRoot(".env");
  if (!existsSync(path)) return;

  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
