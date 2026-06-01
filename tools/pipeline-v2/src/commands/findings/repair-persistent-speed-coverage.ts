import { Database } from "bun:sqlite";
import { stableId } from "@bp/analytics/core";
import { PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID } from "@bp/analytics";
import {
  type FindingCoverageAudit,
  FindingCoverageAuditSchema,
} from "@bp/domain";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

type MissingSegmentCoverageRow = {
  candidate_id: unknown;
  detector_run_id: unknown;
  detector_id: unknown;
  month: unknown;
  scope_kind: unknown;
  scope_id: unknown;
  route_id: unknown;
  evidence_ref: unknown;
  created_at: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseEvidenceRef(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function buildPersistentSpeedSegmentCoverageRepairs(input: {
  generatedAt: string;
  rows: readonly MissingSegmentCoverageRow[];
}): FindingCoverageAudit[] {
  const output: FindingCoverageAudit[] = [];
  for (const row of input.rows) {
    const candidateId = text(row.candidate_id);
    const detectorRunId = text(row.detector_run_id);
    const detectorId = text(row.detector_id);
    const month = text(row.month);
    const scopeKind = text(row.scope_kind);
    const scopeId = text(row.scope_id);
    if (
      candidateId === null ||
      detectorRunId === null ||
      detectorId === null ||
      month === null ||
      scopeKind !== "segment" ||
      scopeId === null
    ) {
      continue;
    }
    output.push(
      FindingCoverageAuditSchema.parse({
        auditId: stableId(detectorRunId, "audit", "segment", text(row.route_id) ?? "unknown", scopeId),
        detectorRunId,
        detectorId,
        month,
        scopeKind,
        scopeId,
        outcome: "hit",
        reasonCode: null,
        reason: null,
        inputsSeenJson: JSON.stringify({
          candidateId,
          routeId: text(row.route_id),
          scopeId,
          repairedFrom: "local_finding_candidate",
          primaryEvidence: parseEvidenceRef(row.evidence_ref),
        }),
        inputsExpectedJson: JSON.stringify({
          scopeKind: "segment",
          detectorCandidate: "persistent_speed_hotspot",
          exactScopeCoverageRequired: true,
        }),
        createdAt: input.generatedAt,
      }),
    );
  }
  return output;
}

function queryMissingSegmentCoverage(sqlite: Database, month: string): MissingSegmentCoverageRow[] {
  return sqlite
    .query(
      `
        SELECT
          c.candidate_id,
          c.detector_run_id,
          c.detector_id,
          c.month,
          c.scope_kind,
          c.scope_id,
          c.route_id,
          MIN(e.evidence_ref) AS evidence_ref,
          c.created_at
        FROM local_finding_candidate c
        LEFT JOIN local_finding_coverage_audit a
          ON a.detector_run_id = c.detector_run_id
         AND a.detector_id = c.detector_id
         AND a.month = c.month
         AND a.scope_kind = c.scope_kind
         AND a.scope_id = c.scope_id
        LEFT JOIN local_finding_evidence_link e
          ON e.candidate_id = c.candidate_id
         AND e.evidence_role = 'primary'
        WHERE c.month = ?
          AND c.detector_id = ?
          AND c.scope_kind = 'segment'
          AND a.audit_id IS NULL
        GROUP BY
          c.candidate_id,
          c.detector_run_id,
          c.detector_id,
          c.month,
          c.scope_kind,
          c.scope_id,
          c.route_id,
          c.created_at
        ORDER BY c.detector_score DESC, c.candidate_id
      `,
    )
    .all(month, PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID) as MissingSegmentCoverageRow[];
}

function insertCoverage(sqlite: Database, rows: readonly FindingCoverageAudit[]): void {
  const insert = sqlite.query(
    `
      INSERT OR IGNORE INTO local_finding_coverage_audit (
        audit_id,
        detector_run_id,
        detector_id,
        month,
        scope_kind,
        scope_id,
        outcome,
        reason_code,
        reason,
        inputs_seen_json,
        inputs_expected_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  const transaction = sqlite.transaction((coverageRows: readonly FindingCoverageAudit[]) => {
    for (const row of coverageRows) {
      insert.run(
        row.auditId,
        row.detectorRunId,
        row.detectorId,
        row.month,
        row.scopeKind,
        row.scopeId,
        row.outcome,
        row.reasonCode,
        row.reason,
        row.inputsSeenJson,
        row.inputsExpectedJson,
        row.createdAt,
      );
    }
  });
  transaction(rows);
}

export default defineCommand({
  path: ["findings", "repair-persistent-speed-coverage"],
  summary: "Backfill exact segment-scope coverage rows for persistent_speed_hotspot candidates.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      execute: z.coerce.boolean().default(false),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    detectorId: z.string(),
    execute: z.boolean(),
    missingSegmentCoverageCount: z.number().int().nonnegative(),
    insertedCoverageCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const sqlite = new Database(dbPath);
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const repairs = buildPersistentSpeedSegmentCoverageRepairs({
        generatedAt: new Date().toISOString(),
        rows: queryMissingSegmentCoverage(sqlite, releaseMonth),
      });
      if (input.options.execute) insertCoverage(sqlite, repairs);
      return {
        releaseMonth,
        detectorId: PERSISTENT_SPEED_HOTSPOT_DETECTOR_ID,
        execute: input.options.execute,
        missingSegmentCoverageCount: repairs.length,
        insertedCoverageCount: input.options.execute ? repairs.length : 0,
      };
    } finally {
      sqlite.close();
    }
  },
});
