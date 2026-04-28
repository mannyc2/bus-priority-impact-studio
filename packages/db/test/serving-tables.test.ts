import { describe, expect, test } from "bun:test";
import { createServingTablesSql } from "../src/index.js";

describe("D1 serving table schema", () => {
  test("includes compact serving tables for route artifacts and comparisons", () => {
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_scorecard");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_scorecard_citation");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_catalog");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_catalog_type");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_direction");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_month_coverage");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_readiness");
    expect(createServingTablesSql).toContain(
      "CREATE TABLE IF NOT EXISTS route_readiness_missing_input",
    );
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_build_plan");
    expect(createServingTablesSql).toContain(
      "CREATE TABLE IF NOT EXISTS route_reliability_baseline",
    );
    expect(createServingTablesSql).toContain(
      "CREATE TABLE IF NOT EXISTS route_reliability_gap_window",
    );
    expect(createServingTablesSql).toContain(
      "CREATE TABLE IF NOT EXISTS route_month_source_status",
    );
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_month_trend");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_equity_context");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_artifact");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_brief_summary");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_brief_peak_window");
    expect(createServingTablesSql).toContain(
      "CREATE TABLE IF NOT EXISTS route_brief_slowest_window",
    );
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_comparison_rank");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_batch_status");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_batch_built_route");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_batch_issue");
    expect(createServingTablesSql).not.toContain("citations_json");
    expect(createServingTablesSql).not.toContain("missing_inputs_json");
    expect(createServingTablesSql).not.toContain("source_status_json");
    expect(createServingTablesSql).not.toContain("built_route_ids_json");
  });
});
