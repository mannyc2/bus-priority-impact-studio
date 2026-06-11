import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeMonthShadowAuditPath } from "../../../src/commands/audit/route-month-shadow";

const commandPath = join(import.meta.dir, "../../../src/commands/audit/route-month-shadow.ts");

describe("audit route-month-shadow boundary", () => {
  test("keeps shadow artifact construction and row loading out of the command", () => {
    const text = readFileSync(commandPath, "utf8");

    expect(text).toContain('from "@bp/applied-research/artifacts"');
    expect(text).toContain('from "@bp/applied-research/evaluation"');
    expect(text).toContain('from "@bp/applied-research/local-db"');
    expect(text).not.toContain("local_finding_coverage_audit");
    expect(text).not.toContain("local_finding_candidate");
    expect(text).not.toContain("ROUTE_MONTH_BASELINE_DETECTOR_IDS");
    expect(text).not.toContain("RICHER_GRAIN_DETECTOR_IDS");
    expect(text).not.toContain("numberValue");
  });

  test("uses the package-owned detector-shadow-audits namespace", () => {
    expect(
      routeMonthShadowAuditPath({ artifactRoot: "data/artifacts", releaseMonth: "2026-03" }),
    ).toBe("data/artifacts/detector-shadow-audits/2026-03/route-month-false-negative-shadow.json");
  });
});
