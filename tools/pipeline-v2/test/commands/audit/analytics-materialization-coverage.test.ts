import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const COMMAND_PATH = new URL(
  "../../../src/commands/audit/analytics-materialization-coverage.ts",
  import.meta.url,
);

describe("analytics materialization coverage audit boundary", () => {
  test("keeps route probing, artifact discovery, and audit construction in applied-research", () => {
    const source = readFileSync(COMMAND_PATH, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/evaluation"');
    expect(source).toContain("canonical product completeness is audit data-product-completeness");
    expect(source).toContain("buildAnalyticsMaterializationCoverageAudit({");
    expect(source).toContain("registryProducts: materializationCoverageRegistryProducts()");
    expect(source).not.toContain("local_route_segment_speed");
    expect(source).not.toContain("local_observed_headway_sample");
    expect(source).not.toContain("analytics-stop-direction-hour-ewt");
    expect(source).not.toContain("route-brief-input.json");
    expect(source).not.toContain("Bun.file");
    expect(source).not.toContain("canonicalRouteId");
  });
});
