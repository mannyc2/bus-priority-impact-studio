import { Database } from "bun:sqlite";
import {
  buildPersistentSpeedSegmentCoverageRepairs,
  PERSISTENT_SPEED_SEGMENT_COVERAGE_REPAIR_DETECTOR_ID,
} from "@bp/applied-research/evaluation";
import { loadPersistentSpeedSegmentCoverageRepairLocalDbRows } from "@bp/applied-research/local-db";
import { createLocalPipelineDb, insertCoverageAuditIgnore } from "@bp/db/local";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { fromCliPath } from "../../lib/paths.ts";

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
      const localDb = createLocalPipelineDb(sqlite);
      const repairs = buildPersistentSpeedSegmentCoverageRepairs({
        generatedAt: new Date().toISOString(),
        rows: loadPersistentSpeedSegmentCoverageRepairLocalDbRows({
          sqlite,
          month: releaseMonth,
        }).rows,
      });
      if (input.options.execute) await insertCoverageAuditIgnore(localDb, repairs);
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
