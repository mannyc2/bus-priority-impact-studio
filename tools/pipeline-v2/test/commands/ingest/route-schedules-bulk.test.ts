import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runRouteSchedulesBulkIngest } from "../../../src/commands/ingest/route-schedules-bulk.ts";

const manifestText = `
verified_at: "2026-05-31T00:00:00.000Z"
sources:
  - id: bus_schedules_2025
    type: socrata_dataset
    priority: core
    domain: data.ny.gov
    dataset_id: t4bz-xqa9
    url: https://data.ny.gov/Transportation/MTA-Bus-Schedules-2025/t4bz-xqa9
    api_json: https://data.ny.gov/resource/t4bz-xqa9.json
    columns_json: https://data.ny.gov/api/views/t4bz-xqa9/columns.json
    rows_csv: https://data.ny.gov/api/views/t4bz-xqa9/rows.csv?accessType=DOWNLOAD
    purpose: Test source.
    status: active
`;

const displayCsv = [
  "Schedule Day,Day Type,Borough,Operator,Service ID,Direction,Shape ID,Trip Type,Route ID,Stop Sequence,Stop ID,Stop Name,Schedule Time,Origin,Destination,School,Revenue Stop,Timepoint,Boarding,Alighting,Distance from Start,Trip Headsign,Block ID,Depot Code,Bundle",
  "08/29/2025,Weekday,M,NYCT,OH_C5-Weekday,N,M150123,1,M15,2,401235,1 AV/E 2 ST,08/29/2025 06:10:00 PM,0,0,closed,1,0,1,1,200,East Harlem,37530485,OH,2025Jun",
  "08/29/2025,Weekday,B,NYCT,FP_C5-Weekday,E,B100123,1,B1,1,301111,86 ST/4 AV,08/29/2025 09:00:00 AM,1,0,closed,1,1,1,1,0,Bay Ridge,37530000,FP,2025Jun",
  "08/29/2025,Weekday,M,NYCT,OH_C5-Weekday,N,M150123,1,M15,1,401234,1 AV/E 1 ST,08/29/2025 05:58:00 PM,1,0,closed,1,1,1,1,0,East Harlem,37530485,OH,2025Jun",
].join("\n");

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "bp-route-schedules-bulk-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("runRouteSchedulesBulkIngest", () => {
  test("stream-imports display-name Socrata CSV rows with deterministic route row ranks", async () => {
    const tempDir = await makeTempDir();
    const csvPath = join(tempDir, "rows.csv");
    const spoolDir = join(tempDir, "spool");
    await Bun.write(csvPath, displayCsv);

    const sqlite = new Database(":memory:");
    try {
      const result = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["M15"],
        csvPath,
        spoolDir,
        skipDownload: true,
        skipExisting: false,
        manifestText,
      });

      expect(result).toMatchObject({
        sourceYear: 2025,
        sourceId: "bus_schedules_2025",
        routeCount: 1,
        skippedRouteCount: 0,
        spooledRowCount: 2,
        writtenRowCount: 2,
        emptyRouteCount: 0,
        downloaded: false,
      });
      expect(
        sqlite
          .query(
            `
              SELECT row_rank, route_id, schedule_date, schedule_time, stop_sequence, stop_id,
                timepoint, revenue_stop, origin, destination
              FROM local_route_schedule_stop
              WHERE source_year = 2025 AND route_id = 'M15'
              ORDER BY row_rank
            `,
          )
          .all(),
      ).toEqual([
        {
          row_rank: 1,
          route_id: "M15",
          schedule_date: "2025-08-29T00:00:00.000",
          schedule_time: "2025-08-29T17:58:00.000",
          stop_sequence: 1,
          stop_id: "401234",
          timepoint: 1,
          revenue_stop: 1,
          origin: 1,
          destination: 0,
        },
        {
          row_rank: 2,
          route_id: "M15",
          schedule_date: "2025-08-29T00:00:00.000",
          schedule_time: "2025-08-29T18:10:00.000",
          stop_sequence: 2,
          stop_id: "401235",
          timepoint: 0,
          revenue_stop: 1,
          origin: 0,
          destination: 0,
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("skips completed routes while importing requested incomplete routes", async () => {
    const tempDir = await makeTempDir();
    const csvPath = join(tempDir, "rows.csv");
    await Bun.write(csvPath, displayCsv);
    const sqlite = new Database(":memory:");
    try {
      await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["M15"],
        csvPath,
        spoolDir: join(tempDir, "spool-1"),
        skipDownload: true,
        skipExisting: false,
        manifestText,
      });

      const result = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["M15", "B1"],
        csvPath,
        spoolDir: join(tempDir, "spool-2"),
        skipDownload: true,
        skipExisting: true,
        manifestText,
      });

      expect(result).toMatchObject({
        routeCount: 2,
        skippedRouteCount: 1,
        spooledRowCount: 1,
        writtenRowCount: 1,
        emptyRouteCount: 0,
      });
      expect(
        sqlite
          .query(
            `
              SELECT route_id, COUNT(*) AS row_count
              FROM local_route_schedule_stop
              WHERE source_year = 2025
              GROUP BY route_id
              ORDER BY route_id
            `,
          )
          .all(),
      ).toEqual([
        { route_id: "B1", row_count: 1 },
        { route_id: "M15", row_count: 2 },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("marks requested routes with no source rows as source_absent, not complete", async () => {
    const tempDir = await makeTempDir();
    const firstCsvPath = join(tempDir, "first.csv");
    const secondCsvPath = join(tempDir, "second.csv");
    await Bun.write(firstCsvPath, displayCsv);
    await Bun.write(
      secondCsvPath,
      [
        "Schedule Day,Day Type,Borough,Operator,Service ID,Direction,Shape ID,Trip Type,Route ID,Stop Sequence,Stop ID,Stop Name,Schedule Time,Origin,Destination,School,Revenue Stop,Timepoint,Boarding,Alighting,Distance from Start,Trip Headsign,Block ID,Depot Code,Bundle",
        "08/29/2025,Weekday,Q,NYCT,OH_C5-Weekday,N,Z900001,1,Z9,1,909001,TEST STOP,08/29/2025 05:58:00 PM,1,0,closed,1,1,1,1,0,Terminal,999,OH,2025Jun",
      ].join("\n"),
    );

    const sqlite = new Database(":memory:");
    try {
      const first = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["Z9"],
        csvPath: firstCsvPath,
        spoolDir: join(tempDir, "spool-1"),
        skipDownload: true,
        skipExisting: false,
        manifestText,
      });
      expect(
        sqlite
          .query(
            "SELECT status, row_count FROM local_route_schedule_ingest_status WHERE source_year = 2025 AND route_id = 'Z9'",
          )
          .get(),
      ).toEqual({ status: "source_absent", row_count: 0 });
      const second = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["Z9"],
        csvPath: secondCsvPath,
        spoolDir: join(tempDir, "spool-2"),
        skipDownload: true,
        skipExisting: true,
        manifestText,
      });

      expect(first).toMatchObject({ emptyRouteCount: 1, writtenRowCount: 0 });
      expect(second).toMatchObject({ skippedRouteCount: 0, writtenRowCount: 1 });
      expect(
        sqlite
          .query(
            "SELECT status, row_count FROM local_route_schedule_ingest_status WHERE source_year = 2025 AND route_id = 'Z9'",
          )
          .get(),
      ).toEqual({ status: "complete", row_count: 1 });
    } finally {
      sqlite.close();
    }
  });

  test("downloads and reuses a cached bulk CSV before importing", async () => {
    const tempDir = await makeTempDir();
    const csvPath = join(tempDir, "cache", "rows.csv");
    const sqlite = new Database(":memory:");
    try {
      let fetchCount = 0;
      const fetcher = async () => {
        fetchCount += 1;
        return new Response(displayCsv, {
          headers: {
            "content-type": "text/csv",
            "content-length": String(displayCsv.length),
          },
        });
      };

      const first = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["B1"],
        csvPath,
        spoolDir: join(tempDir, "spool-1"),
        skipExisting: false,
        fetcher,
        manifestText,
      });
      const second = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["B1"],
        csvPath,
        spoolDir: join(tempDir, "spool-2"),
        skipExisting: true,
        fetcher,
        manifestText,
      });

      expect(first.downloaded).toBe(true);
      expect(second.downloaded).toBe(false);
      expect(first.downloadOnly).toBe(false);
      expect(fetchCount).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  test("imports all CSV chunks from a SODA3 partition manifest", async () => {
    const tempDir = await makeTempDir();
    const partitionRoot = join(tempDir, "partitioned");
    const chunkA = join(partitionRoot, "chunks", "schedule_date-2025-08-01-to-2025-09-01");
    const chunkB = join(partitionRoot, "chunks", "schedule_date-2025-09-01-to-2025-10-01");
    await mkdir(chunkA, { recursive: true });
    await mkdir(chunkB, { recursive: true });
    await Bun.write(join(chunkA, "rows.csv"), `${displayCsv}\n`);
    await Bun.write(
      join(chunkB, "rows.csv"),
      [
        "Schedule Day,Day Type,Borough,Operator,Service ID,Direction,Shape ID,Trip Type,Route ID,Stop Sequence,Stop ID,Stop Name,Schedule Time,Origin,Destination,School,Revenue Stop,Timepoint,Boarding,Alighting,Distance from Start,Trip Headsign,Block ID,Depot Code,Bundle",
        "09/02/2025,Weekday,M,NYCT,OH_C5-Weekday,N,M150123,1,M15,3,401236,1 AV/E 3 ST,09/02/2025 06:20:00 PM,0,1,closed,1,0,1,1,300,East Harlem,37530485,OH,2025Sep",
      ].join("\n"),
    );
    const manifestPath = join(partitionRoot, "partition-manifest.json");
    await Bun.write(
      manifestPath,
      JSON.stringify(
        {
          sourceId: "bus_schedules_2025",
          chunks: [
            {
              path: join("chunks", "schedule_date-2025-08-01-to-2025-09-01", "rows.csv"),
            },
            {
              path: join("chunks", "schedule_date-2025-09-01-to-2025-10-01", "rows.csv"),
            },
          ],
        },
        null,
        2,
      ),
    );

    const sqlite = new Database(":memory:");
    try {
      const result = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["M15"],
        partitionManifestPath: manifestPath,
        spoolDir: join(tempDir, "spool"),
        skipExisting: false,
        manifestText,
      });

      expect(result).toMatchObject({
        csvPath: manifestPath,
        csvPathCount: 2,
        routeCount: 1,
        spooledRowCount: 3,
        writtenRowCount: 3,
        downloaded: false,
      });
      expect(
        sqlite
          .query(
            `
              SELECT row_rank, route_id, schedule_date, schedule_time, stop_sequence, stop_id
              FROM local_route_schedule_stop
              WHERE source_year = 2025 AND route_id = 'M15'
              ORDER BY row_rank
            `,
          )
          .all(),
      ).toEqual([
        {
          row_rank: 1,
          route_id: "M15",
          schedule_date: "2025-08-29T00:00:00.000",
          schedule_time: "2025-08-29T17:58:00.000",
          stop_sequence: 1,
          stop_id: "401234",
        },
        {
          row_rank: 2,
          route_id: "M15",
          schedule_date: "2025-08-29T00:00:00.000",
          schedule_time: "2025-08-29T18:10:00.000",
          stop_sequence: 2,
          stop_id: "401235",
        },
        {
          row_rank: 3,
          route_id: "M15",
          schedule_date: "2025-09-02T00:00:00.000",
          schedule_time: "2025-09-02T18:20:00.000",
          stop_sequence: 3,
          stop_id: "401236",
        },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("restricts partition imports to missing current-catalog routes", async () => {
    const tempDir = await makeTempDir();
    const csvPath = join(tempDir, "rows.csv");
    await Bun.write(csvPath, displayCsv);

    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_route_catalog (
          route_id text PRIMARY KEY
        );
        INSERT INTO local_route_catalog (route_id) VALUES ('B1'), ('M15');
      `);

      await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["M15"],
        csvPath,
        spoolDir: join(tempDir, "spool-1"),
        skipDownload: true,
        skipExisting: false,
        manifestText,
      });

      const progress: string[] = [];
      const result = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: [],
        csvPath,
        spoolDir: join(tempDir, "spool-2"),
        skipDownload: true,
        onlyMissingCurrentRoutes: true,
        manifestText,
        progress: (event) => {
          if (event.kind === "route_filter_resolved") progress.push(event.routeIds.join(","));
        },
      });

      expect(progress).toEqual(["B1"]);
      expect(result).toMatchObject({
        routeCount: 1,
        skippedRouteCount: 0,
        spooledRowCount: 1,
        writtenRowCount: 1,
        emptyRouteCount: 0,
      });
      expect(
        sqlite
          .query(
            `
              SELECT route_id, COUNT(*) AS row_count
              FROM local_route_schedule_stop
              WHERE source_year = 2025
              GROUP BY route_id
              ORDER BY route_id
            `,
          )
          .all(),
      ).toEqual([
        { route_id: "B1", row_count: 1 },
        { route_id: "M15", row_count: 2 },
      ]);
    } finally {
      sqlite.close();
    }
  });

  test("can download a CSV snapshot without importing rows", async () => {
    const tempDir = await makeTempDir();
    const csvPath = join(tempDir, "cache", "rows.csv");
    const sqlite = new Database(":memory:");
    try {
      const result = await runRouteSchedulesBulkIngest({
        sqlite,
        sourceYear: 2025,
        routes: ["M15"],
        csvPath,
        downloadOnly: true,
        fetcher: async () => new Response(displayCsv),
        manifestText,
      });

      expect(result).toMatchObject({
        downloaded: true,
        downloadOnly: true,
        routeCount: 0,
        writtenRowCount: 0,
      });
      expect(await Bun.file(csvPath).text()).toBe(displayCsv);
      expect(
        sqlite
          .query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'local_route_schedule_stop'",
          )
          .get(),
      ).not.toBeNull();
      expect(
        sqlite.query("SELECT COUNT(*) AS row_count FROM local_route_schedule_stop").get(),
      ).toEqual({ row_count: 0 });
    } finally {
      sqlite.close();
    }
  });
});
