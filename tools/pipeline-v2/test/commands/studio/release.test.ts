import { describe, expect, test } from "bun:test";
import { routeKey } from "../../../src/commands/studio/_release-routes.ts";
import {
  earliestStudioTrendMonth,
  requireStudioReleaseMonth,
} from "../../../src/commands/studio/release.ts";

describe("studio release D1 replay boundary", () => {
  test("requires an explicit covered-month partition and derives the earliest trend month", () => {
    expect(() => requireStudioReleaseMonth(undefined)).toThrow(
      "month is required — run `audit freshness` (plan 087)",
    );
    expect(requireStudioReleaseMonth("2026-04")).toBe("2026-04");
    expect(
      earliestStudioTrendMonth([
        [{ month: "2025-11" }, { month: "2026-03" }],
        [{ month: "2023-04" }, { month: "2026-02" }],
      ]),
    ).toBe("2023-04");
    expect(earliestStudioTrendMonth([])).toBeNull();
  });

  test("keeps exact route identities distinct when assembling route interventions", () => {
    expect(routeKey("B44")).toBe("B44");
    expect(routeKey("B44+")).toBe("B44+");
    expect(routeKey("b44")).toBe("b44");
    expect(() => routeKey(" B44 ")).toThrow("exact non-empty route identity");
  });

  test("loads serving export rows through the Effect D1 replay boundary", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/studio/release.ts", import.meta.url),
    ).text();

    expect(source).toContain("runD1ReplayBoundary({");
    expect(source).toContain("loadStudioReleaseD1Context");
    expect(source).toContain("Bun.file(fromCliPath(options.schemaPath)).text()");
    expect(source).toContain("Bun.file(fromCliPath(options.seedPath)).text()");
    expect(source).toContain("const root = fromCliPath(routeSliceArtifactsRoot)");
    expect(source).toContain('operation: "loadCurrentMonthRouteSchedules"');
    expect(source).toContain("FROM local_route_schedule_stop");
    expect(source).toContain("schedule_date >= ?");
    expect(source).toContain("schedule_date < ?");
    expect(source).toContain("currentScheduleRowsByRoute");
    expect(source).not.toContain("fromRepoRoot(options.");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new Database");
    expect(source).not.toContain("createBunSqliteServingDb");
    expect(source).not.toContain('const defaultMonth = "2026-03"');
    expect(source).not.toContain('data/exports/d1/2026-03/schema.sql');
    expect(source).not.toContain('data/exports/d1/2026-03/seed.sql');
  });

  test("preserves absolute source and snapshot overrides", async () => {
    const source = await Bun.file(
      new URL("../../../src/commands/studio/_release-geometry.ts", import.meta.url),
    ).text();

    expect(source).toContain("fromCliPath(routeShapeSnapshotPath)");
    expect(source).toContain("fromCliPath(stopSnapshotPath)");
    expect(source).toContain("fromCliPath(args.routeShapeSnapshotPath)");
    expect(source).toContain("fromCliPath(args.stopSnapshotPath)");
    expect(source).not.toContain("fromRepoRoot(routeShapeSnapshotPath)");
  });
});
