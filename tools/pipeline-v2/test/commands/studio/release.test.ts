import { describe, expect, test } from "bun:test";

describe("studio release D1 replay boundary", () => {
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
