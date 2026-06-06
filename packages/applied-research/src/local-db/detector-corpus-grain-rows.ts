import type { Database } from "bun:sqlite";

export type DetectorCorpusGrainCoverageCounts = {
  total: number;
  hit: number;
  cleanNoHit: number;
  skippedMissingInput: number;
  skippedFailedJoin: number;
  sourceLag: number;
  missingReasonCounts: Record<string, number>;
};

export type DetectorCorpusGrainLocalDbQuery = {
  readonly sqlite: Database;
  readonly releaseMonth: string;
};

export type DetectorCorpusGrainLocalDbRows = {
  readonly candidateCounts: ReadonlyMap<string, number> | null;
  readonly coverageCounts: ReadonlyMap<string, DetectorCorpusGrainCoverageCounts> | null;
};

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tableExists(sqlite: Database, tableName: string): boolean {
  const row = sqlite
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: unknown } | null;
  return row?.name === tableName;
}

function tableColumns(sqlite: Database, tableName: string): Set<string> {
  const rows = sqlite.query(`PRAGMA table_info(${tableName})`).all() as { name?: unknown }[];
  return new Set(
    rows.map((row) => textValue(row.name)).filter((name): name is string => name !== null),
  );
}

function hasColumns(sqlite: Database, tableName: string, columns: readonly string[]): boolean {
  if (!tableExists(sqlite, tableName)) return false;
  const observed = tableColumns(sqlite, tableName);
  return columns.every((column) => observed.has(column));
}

function zeroCoverageCounts(): DetectorCorpusGrainCoverageCounts {
  return {
    total: 0,
    hit: 0,
    cleanNoHit: 0,
    skippedMissingInput: 0,
    skippedFailedJoin: 0,
    sourceLag: 0,
    missingReasonCounts: {},
  };
}

function queryCandidateCounts(
  sqlite: Database,
  releaseMonth: string,
): ReadonlyMap<string, number> | null {
  if (!hasColumns(sqlite, "local_finding_candidate", ["detector_id", "month"])) return null;
  const rows = sqlite
    .query(
      `
        SELECT detector_id, COUNT(*) AS row_count
        FROM local_finding_candidate
        WHERE month = ?
        GROUP BY detector_id
      `,
    )
    .all(releaseMonth) as { detector_id?: unknown; row_count?: unknown }[];

  const counts = new Map<string, number>();
  for (const row of rows) {
    const detectorId = textValue(row.detector_id);
    if (detectorId !== null) counts.set(detectorId, numberValue(row.row_count));
  }
  return counts;
}

function queryCoverageCounts(
  sqlite: Database,
  releaseMonth: string,
): ReadonlyMap<string, DetectorCorpusGrainCoverageCounts> | null {
  if (!hasColumns(sqlite, "local_finding_coverage_audit", ["detector_id", "month", "outcome"])) {
    return null;
  }

  const counts = new Map<string, DetectorCorpusGrainCoverageCounts>();
  const rows = sqlite
    .query(
      `
        SELECT detector_id, outcome, COUNT(*) AS row_count
        FROM local_finding_coverage_audit
        WHERE month = ?
        GROUP BY detector_id, outcome
      `,
    )
    .all(releaseMonth) as { detector_id?: unknown; outcome?: unknown; row_count?: unknown }[];

  for (const row of rows) {
    const detectorId = textValue(row.detector_id);
    const outcome = textValue(row.outcome);
    if (detectorId === null || outcome === null) continue;
    const current = counts.get(detectorId) ?? zeroCoverageCounts();
    const count = numberValue(row.row_count);
    current.total += count;
    if (outcome === "hit") current.hit += count;
    if (outcome === "clean_no_hit") current.cleanNoHit += count;
    if (outcome === "skipped_missing_input") current.skippedMissingInput += count;
    if (outcome === "skipped_failed_join") current.skippedFailedJoin += count;
    if (outcome === "source_lag") current.sourceLag += count;
    counts.set(detectorId, current);
  }

  if (tableColumns(sqlite, "local_finding_coverage_audit").has("reason_code")) {
    const reasonRows = sqlite
      .query(
        `
          SELECT detector_id, reason_code, COUNT(*) AS row_count
          FROM local_finding_coverage_audit
          WHERE month = ?
            AND outcome IN ('skipped_missing_input', 'skipped_failed_join', 'source_lag')
            AND reason_code IS NOT NULL
          GROUP BY detector_id, reason_code
        `,
      )
      .all(releaseMonth) as { detector_id?: unknown; reason_code?: unknown; row_count?: unknown }[];

    for (const row of reasonRows) {
      const detectorId = textValue(row.detector_id);
      const reasonCode = textValue(row.reason_code);
      if (detectorId === null || reasonCode === null) continue;
      const current = counts.get(detectorId) ?? zeroCoverageCounts();
      current.missingReasonCounts[reasonCode] =
        (current.missingReasonCounts[reasonCode] ?? 0) + numberValue(row.row_count);
      counts.set(detectorId, current);
    }
  }

  return counts;
}

export function loadDetectorCorpusGrainLocalDbRows(
  input: DetectorCorpusGrainLocalDbQuery,
): DetectorCorpusGrainLocalDbRows {
  return {
    candidateCounts: queryCandidateCounts(input.sqlite, input.releaseMonth),
    coverageCounts: queryCoverageCounts(input.sqlite, input.releaseMonth),
  };
}
