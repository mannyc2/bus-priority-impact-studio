import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/source-coverage.ts");

describe("source coverage audit boundary", () => {
  test("keeps source coverage ledger construction in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("buildSourceCoverageLedger({");
    expect(source).not.toContain("function tableExists");
    expect(source).not.toContain("function columnExists");
    expect(source).not.toContain("CREATE TABLE");
    expect(source).not.toContain("SELECT COUNT(DISTINCT SUBSTR");
    expect(source).not.toContain("SOURCE_CONFIGS");
  });
});
