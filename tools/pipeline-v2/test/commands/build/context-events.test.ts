import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/build/context-events.ts");

describe("build context-events command boundary", () => {
  test("keeps context-event normalization and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runBuildContextEvents({");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("createHash");
    expect(source).not.toContain("normalizeContextEventTime");
    expect(source).not.toContain("upsertContextEvents");
    expect(source).not.toContain("local_311_service_request");
    expect(source).not.toContain("local_ace_violation_summary");
  });
});
