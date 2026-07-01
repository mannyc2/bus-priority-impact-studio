import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/source-coverage.ts");

describe("source coverage audit boundary", () => {
  test("keeps source coverage ledger construction in pipeline-local aggregates", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain("runLocalDbCommandBoundary({");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).not.toContain("withLocalDb");
    expect(source).not.toContain("localDbFromCtx");
    expect(source).toContain('from "@bp/pipeline-v2/local-db-aggregates"');
    expect(source).toContain("buildSourceCoverageLedger({");
    expect(source).not.toContain("function tableExists");
    expect(source).not.toContain("function columnExists");
    expect(source).not.toContain("CREATE TABLE");
    expect(source).not.toContain("SELECT COUNT(DISTINCT SUBSTR");
    expect(source).not.toContain("SOURCE_CONFIGS");
  });
});
