import { describe, expect, test } from "bun:test";
import { createServingTablesSql } from "../src/index.js";

describe("D1 serving table schema", () => {
  test("includes compact serving tables for route artifacts and comparisons", () => {
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_scorecard");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_catalog");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_month_coverage");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_readiness");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_build_plan");
    expect(createServingTablesSql).toContain(
      "CREATE TABLE IF NOT EXISTS route_reliability_baseline",
    );
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_month_trend");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_equity_context");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_artifact");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_brief_summary");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_comparison_rank");
    expect(createServingTablesSql).toContain("CREATE TABLE IF NOT EXISTS route_batch_status");
  });
});
