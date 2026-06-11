import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/build/context-event-route-touches.ts",
);

describe("build context-event-route-touches command boundary", () => {
  test("keeps route-touch SQL and path naming in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("materializeContextEventRouteTouches({");
    expect(source).toContain("auditContextEventRouteTouches(");
    expect(source).not.toContain("local_route_lion_link");
    expect(source).not.toContain("local_parking_violation_match");
    expect(source).not.toContain("local_context_event_route_touch");
    expect(source).not.toContain("GROUP BY source_id, event_kind");
  });
});
