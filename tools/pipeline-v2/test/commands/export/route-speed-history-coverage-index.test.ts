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
  test("keeps coverage table materialization in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("materializeRouteSpeedHistoryCoverageIndex({");
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
                available_cell_count, missing_cell_count
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
        },
      ]);
    } finally {
      sqlite.close();
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
