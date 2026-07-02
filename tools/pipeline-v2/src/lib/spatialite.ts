import type { Database } from "bun:sqlite";

/**
 * Spatialite loadable-extension support for the local pipeline DB.
 *
 * Worker / D1 never load this. See docs/decisions/0007-spatialite-for-local-geo-joins.md.
 *
 * Install locally:
 *   - Linux:  sudo apt install libsqlite3-mod-spatialite
 *   - macOS:  brew install libspatialite
 *   - Nix:    nix-shell -p libspatialite
 *
 * Override the loader path with SPATIALITE_PATH if your install lives elsewhere.
 */

// bun-sqlite's loadExtension appends the platform-native extension
// (.so/.dylib/.dll) to the path automatically — so we pass un-suffixed paths.
const CANDIDATE_PATHS = [
  process.env["SPATIALITE_PATH"],
  "/usr/lib/x86_64-linux-gnu/mod_spatialite",
  "/usr/lib/aarch64-linux-gnu/mod_spatialite",
  "/opt/homebrew/lib/mod_spatialite",
  "/usr/local/lib/mod_spatialite",
  "/usr/lib64/mod_spatialite",
  "mod_spatialite",
].filter((p): p is string => typeof p === "string" && p.length > 0);

export class SpatialiteUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpatialiteUnavailableError";
  }
}

let cachedPath: string | undefined;

export function loadSpatialite(sqlite: Database): { path: string; version: string } {
  const errors: string[] = [];
  const paths = cachedPath ? [cachedPath, ...CANDIDATE_PATHS] : CANDIDATE_PATHS;

  for (const candidate of paths) {
    try {
      sqlite.loadExtension(candidate);
      cachedPath = candidate;
      const version = readSpatialiteVersion(sqlite);
      ensureSpatialMetadata(sqlite);
      return { path: candidate, version };
    } catch (err) {
      errors.push(`  ${candidate}: ${(err as Error).message}`);
    }
  }

  throw new SpatialiteUnavailableError(
    [
      "Could not load mod_spatialite. Install the extension and retry, or set SPATIALITE_PATH.",
      "  Linux: sudo apt install libsqlite3-mod-spatialite",
      "  macOS: brew install libspatialite",
      "Attempted paths:",
      ...errors,
    ].join("\n"),
  );
}

function readSpatialiteVersion(sqlite: Database): string {
  const row = sqlite.query<{ v: string }, []>("SELECT spatialite_version() AS v").get();
  return row?.v ?? "unknown";
}

function ensureSpatialMetadata(sqlite: Database): void {
  const row = sqlite
    .query<{ n: number }, []>(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='spatial_ref_sys'",
    )
    .get();
  if ((row?.n ?? 0) > 0) return;
  sqlite.exec("SELECT InitSpatialMetaData(1)");
}
