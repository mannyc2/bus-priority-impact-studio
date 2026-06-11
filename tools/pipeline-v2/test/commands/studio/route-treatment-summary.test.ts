import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { routeTreatmentSummaryArtifactPath } from "@bp/applied-research/artifacts";

describe("studio route-treatment-summary command", () => {
  test("keeps treatment materialization and SQL out of the command", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../src/commands/studio/route-treatment-summary.ts"),
      "utf8",
    );

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain('from "@bp/applied-research/treatments"');
    expect(source).not.toContain("FROM local_route_catalog");
    expect(source).not.toContain("function buildRouteTreatmentSummaryArtifact");
  });

  test("uses the package-owned artifact path", () => {
    expect(routeTreatmentSummaryArtifactPath({ artifactRoot: "data/artifacts", month: "2026-03" })).toBe(
      "data/artifacts/studio/v2/route-treatment-summary/2026-03/route-treatment-summary.json",
    );
  });
});
