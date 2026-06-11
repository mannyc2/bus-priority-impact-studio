import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/audit/route-schedule-progress.ts",
  import.meta.url,
);

describe("audit route-schedule-progress boundary", () => {
  test("keeps schedule-progress SQLite aggregation in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("auditRouteScheduleProgress(sqlite)");
    expect(source).not.toContain("local_route_schedule_stop");
    expect(source).not.toContain("local_gtfs_static_bundle");
    expect(source).not.toContain("sqlite.query");
    expect(source).not.toContain("tableExists");
  });
});
