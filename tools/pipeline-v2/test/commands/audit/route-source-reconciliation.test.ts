import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/audit/route-source-reconciliation.ts",
);

describe("route source reconciliation audit boundary", () => {
  test("keeps reconciliation SQL and classification in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("buildRouteSourceReconciliation({");
    expect(source).not.toContain('from "bun:sqlite"');
    expect(source).not.toContain("new BunDatabase");
    expect(source).not.toContain("function tableExists");
    expect(source).not.toContain("function columnExists");
    expect(source).not.toContain("local_route_schedule_stop");
    expect(source).not.toContain("source_absent_or_current_only");
    expect(source).not.toContain("canonicalRouteId");
  });
});
