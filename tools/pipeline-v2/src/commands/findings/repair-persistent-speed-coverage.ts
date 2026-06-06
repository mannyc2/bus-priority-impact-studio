import { Database, type Database as SqliteDatabase } from "bun:sqlite";
import {
  buildPersistentSpeedSegmentCoverageRepairs,
  PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID,
} from "@bp/applied-research/evaluation";
import { loadPersistentSpeedSegmentCoverageRepairLocalDbRows } from "@bp/applied-research/local-db";
import type { FindingCoverageAudit } from "@bp/domain/findings";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

function insertCoverage(sqlite: SqliteDatabase, rows: readonly FindingCoverageAudit[]): void {
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
        rows: loadPersistentSpeedSegmentCoverageRepairLocalDbRows({
          sqlite,
          month: releaseMonth,
        }).rows,
      });
      if (input.options.execute) insertCoverage(sqlite, repairs);
      return {
        releaseMonth,
        detectorId: PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID,
        execute: input.options.execute,
        missingSegmentCoverageCount: repairs.length,
        insertedCoverageCount: input.options.execute ? repairs.length : 0,
      };
    } finally {
      sqlite.close();
    }
  },
});
