import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(import.meta.dir, "../../../src/commands/route/readiness.ts");

describe("route readiness command boundary", () => {
  test("keeps readiness scoring and local DB writes in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("runRouteReadiness({");
    expect(source).not.toContain('from "@bp/db/local"');
    expect(source).not.toContain("listRouteCatalog");
    expect(source).not.toContain("replaceRouteReadiness");
    expect(source).not.toContain("function scoreReadiness");
    expect(source).not.toContain("function missingInputs");
    expect(source).not.toContain("statusPriority");
  });
});
