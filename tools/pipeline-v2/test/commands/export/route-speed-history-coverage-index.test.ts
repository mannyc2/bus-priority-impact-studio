import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runRouteSpeedHistoryCoverageIndex } from "../../../src/commands/export/route-speed-history-coverage-index.ts";
import type { OpenLocalPipelineDb } from "../../../src/lib/local-db.ts";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/export/route-speed-history-coverage-index.ts",
);

async function writeFixture(path: string, value: unknown): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("route speed-history coverage index export", () => {
  test("keeps coverage table materialization in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("materializeRouteSpeedHistoryCoverageIndex({");
    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
    expect(source).not.toContain("CREATE TABLE IF NOT EXISTS local_route_speed_history_coverage");
    expect(source).not.toContain("DELETE FROM local_route_speed_history_coverage");
    expect(source).not.toContain("INSERT INTO local_route_speed_history_coverage");
    expect(source).not.toContain("normalizeRouteId");
  });

  test("materializes available route speed-history rows from the batch manifest", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "bp-speed-history-index-"));
    const sqlite = new Database(":memory:");
    try {
      const artifactRoot = join(tmp, "artifacts");
      const manifestPath = join(
        artifactRoot,
        "studio/v2/speed-histories/2026-01_to_2026-03/manifest.json",
      );
      const b41Path = join(artifactRoot, "studio/v2/routes/b41/speed-history.json");
      await writeFixture(b41Path, { artifactKind: "studio_route_speed_history" });
      sqlite.exec(`
        CREATE TABLE local_route_speed_history_coverage (
          route_id TEXT NOT NULL,
          month TEXT NOT NULL,
          route_slug TEXT NOT NULL,
          history_start_month TEXT NOT NULL,
          history_end_month TEXT NOT NULL,
          artifact_path TEXT NOT NULL,
          artifact_status TEXT NOT NULL,
          month_count INTEGER NOT NULL,
          segment_count INTEGER NOT NULL,
          cell_count INTEGER NOT NULL,
          available_cell_count INTEGER NOT NULL,
          missing_cell_count INTEGER NOT NULL,
          generated_at TEXT NOT NULL,
          PRIMARY KEY (route_id, month)
        )
      `);
      await writeFixture(manifestPath, {
        artifactKind: "studio_route_speed_history_manifest",
        schemaVersion: 1,
        source: {
          startMonth: "2026-01",
          endMonth: "2026-03",
        },
        routes: [
          {
            routeId: "B41",
            routeSlug: "b41",
            status: "written",
            readiness: "series_ready_with_gaps",
            reasons: ["partial_month_coverage"],
            artifactPath: b41Path,
            monthCount: 3,
            segmentCount: 2,
            cellCount: 24,
            availableCellCount: 20,
            missingCellCount: 4,
          },
          {
            routeId: "M1",
            routeSlug: "m1",
            status: "failed",
            readiness: "failed",
            reasons: ["spine_validation_failed"],
            artifactPath: join(artifactRoot, "studio/v2/routes/m1/speed-history.json"),
            monthCount: null,
            segmentCount: null,
            cellCount: null,
            availableCellCount: null,
            missingCellCount: null,
          },
        ],
      });
      const local = {
        db: null,
        sqlite,
        path: join(tmp, "pipeline.sqlite"),
        spatialite: null,
      } as unknown as OpenLocalPipelineDb;

      const result = await runRouteSpeedHistoryCoverageIndex({
        local,
        releaseMonth: "2026-03",
        startMonth: "2026-01",
        endMonth: "2026-03",
        manifestPath,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(result).toMatchObject({
        expectedRouteCount: 2,
        availableRouteCount: 1,
        missingRouteCount: 1,
        tableRowCount: 1,
      });
      expect(
        sqlite
          .query(
            `
              SELECT route_id, month, route_slug, history_start_month, history_end_month,
                artifact_status, month_count, segment_count, cell_count,
                available_cell_count, missing_cell_count, spine_readiness, spine_reason_json,
                matched_current_segment_count, unmatched_current_segment_count
              FROM local_route_speed_history_coverage
              ORDER BY route_id
            `,
          )
          .all(),
      ).toEqual([
        {
          route_id: "B41",
          month: "2026-03",
          route_slug: "b41",
          history_start_month: "2026-01",
          history_end_month: "2026-03",
          artifact_status: "written",
          month_count: 3,
          segment_count: 2,
          cell_count: 24,
          available_cell_count: 20,
          missing_cell_count: 4,
          spine_readiness: "series_ready_with_gaps",
          spine_reason_json: '["partial_month_coverage"]',
          matched_current_segment_count: null,
          unmatched_current_segment_count: null,
        },
      ]);
    } finally {
      sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
