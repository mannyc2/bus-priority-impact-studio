import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type LocalRouteSegmentSpeedCell,
  replaceRouteMonthTrends,
  replaceRouteSegmentSpeedCells,
} from "@bp/db/local";
import routeMonthSpeedGoldenDiff from "../../../src/commands/build/route-month-speed-golden-diff.ts";

const runGoldenDiff = routeMonthSpeedGoldenDiff.run;
if (runGoldenDiff === undefined) throw new Error("golden-diff command has no run handler");

import { openLocalPipelineDb } from "../../../src/lib/local-db.ts";

function cell(overrides: Partial<LocalRouteSegmentSpeedCell>): LocalRouteSegmentSpeedCell {
  return {
    routeId: "Q63",
    isoMonth: "2026-03",
    timestamp: "2026-03-01T08:00:00.000",
    dayOfWeek: "Friday",
    hourOfDay: 8,
    direction: "N",
    borough: "Queens",
    routeType: "Local",
    stopOrder: 1,
    timepointStopId: "921855",
    timepointStopName: "39 AV/MAIN ST",
    timepointStopLatitude: 40.7601,
    timepointStopLongitude: -73.8301,
    nextTimepointStopId: "982491",
    nextTimepointStopName: null,
    nextTimepointStopLatitude: null,
    nextTimepointStopLongitude: null,
    roadDistanceMiles: 0.52,
    averageTravelTimeMinutes: 4.2,
    averageRoadSpeedMph: 7.4,
    busTripCount: 6,
    ...overrides,
  };
}

describe("build route-month-speed-golden-diff", () => {
  it("uses the Effect local DB boundary for read-only local DB access", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/build/route-month-speed-golden-diff.ts", import.meta.url),
    ).text();

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new BunDatabase");
  });

  it("reports byte-identical when the trend row equals the cell projection", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "golden-diff-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const outputPath = join(tmp, "golden-diff.json");
    const local = await openLocalPipelineDb(dbPath);
    try {
      replaceRouteSegmentSpeedCells(local.db, "Q63", "2026-03", [
        cell({}),
        cell({ hourOfDay: 9, averageRoadSpeedMph: 6.123456, busTripCount: 3 }),
      ]);
      await replaceRouteMonthTrends(local.db, [
        {
          routeId: "Q63",
          month: "2026-03",
          speedObservationCount: 2,
          speedBusTripCount: 9,
          averageSpeedMph: Math.round(((7.4 + 6.123456) / 2) * 10_000) / 10_000,
          ridership: undefined,
          transfers: undefined,
          hasSpeedTrend: true,
          hasRidershipTrend: false,
        },
      ]);
      local.sqlite.close();

      const result = await runGoldenDiff({
        ctx: {},
        input: { options: { db: dbPath, output: outputPath } },
      } as never);

      expect(result).toMatchObject({
        comparedRowCount: 1,
        matchCount: 1,
        mismatchCount: 0,
        trendOnlyRowCount: 0,
        byteIdentical: true,
      });

      const artifact = JSON.parse(await Bun.file(outputPath).text());
      expect(artifact.byteIdentical).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("flags mismatching aggregates", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "golden-diff-"));
    const dbPath = join(tmp, "pipeline.sqlite");
    const local = await openLocalPipelineDb(dbPath);
    try {
      replaceRouteSegmentSpeedCells(local.db, "Q63", "2026-03", [cell({})]);
      await replaceRouteMonthTrends(local.db, [
        {
          routeId: "Q63",
          month: "2026-03",
          speedObservationCount: 2,
          speedBusTripCount: 9,
          averageSpeedMph: 7.4,
          ridership: undefined,
          transfers: undefined,
          hasSpeedTrend: true,
          hasRidershipTrend: false,
        },
      ]);
      local.sqlite.close();

      const result = await runGoldenDiff({
        ctx: {},
        input: { options: { db: dbPath, output: join(tmp, "out.json") } },
      } as never);

      expect(result).toMatchObject({
        comparedRowCount: 1,
        matchCount: 0,
        mismatchCount: 2,
        byteIdentical: false,
      });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
