import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/build/context-event-route-touches.ts",
);

describe("build context-event-route-touches command boundary", () => {
  test("keeps path policy in analytics and route-touch SQL in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/analytics/artifacts"');
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("materializeContextEventRouteTouches({");
    expect(source).toContain("auditContextEventRouteTouches(");
    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
    expect(source).not.toContain("local_route_lion_link");
    expect(source).not.toContain("local_parking_violation_match");
    expect(source).not.toContain("local_context_event_route_touch");
    expect(source).not.toContain("GROUP BY source_id, event_kind");
  });
});
