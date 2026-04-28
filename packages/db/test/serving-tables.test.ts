import { describe, expect, test } from "bun:test";

async function readInitialD1Migration(): Promise<string> {
  return Bun.file(new URL("../migrations/d1/0000_tense_jane_foster.sql", import.meta.url)).text();
}

describe("D1 serving table schema", () => {
  test("includes compact serving tables for route artifacts and comparisons", async () => {
    const migrationSql = await readInitialD1Migration();

    expect(migrationSql).toContain("CREATE TABLE `route_scorecard`");
    expect(migrationSql).toContain("CREATE TABLE `route_scorecard_citation`");
    expect(migrationSql).toContain("CREATE TABLE `route_catalog`");
    expect(migrationSql).toContain("CREATE TABLE `route_catalog_type`");
    expect(migrationSql).toContain("CREATE TABLE `route_direction`");
    expect(migrationSql).toContain("CREATE TABLE `route_month_coverage`");
    expect(migrationSql).toContain("CREATE TABLE `route_readiness`");
    expect(migrationSql).toContain("CREATE TABLE `route_readiness_missing_input`");
    expect(migrationSql).toContain("CREATE TABLE `route_build_plan`");
    expect(migrationSql).toContain("CREATE TABLE `route_reliability_baseline`");
    expect(migrationSql).toContain("CREATE TABLE `route_reliability_gap_window`");
    expect(migrationSql).toContain("CREATE TABLE `route_month_source_status`");
    expect(migrationSql).toContain("CREATE TABLE `route_month_trend`");
    expect(migrationSql).toContain("CREATE TABLE `route_equity_context`");
    expect(migrationSql).toContain("CREATE TABLE `route_artifact`");
    expect(migrationSql).toContain("CREATE TABLE `route_brief_summary`");
    expect(migrationSql).toContain("CREATE TABLE `route_brief_peak_window`");
    expect(migrationSql).toContain("CREATE TABLE `route_brief_slowest_window`");
    expect(migrationSql).toContain("CREATE TABLE `route_comparison_rank`");
    expect(migrationSql).toContain("CREATE TABLE `route_batch_status`");
    expect(migrationSql).toContain("CREATE TABLE `route_batch_built_route`");
    expect(migrationSql).toContain("CREATE TABLE `route_batch_issue`");
    expect(migrationSql).not.toContain("citations_json");
    expect(migrationSql).not.toContain("missing_inputs_json");
    expect(migrationSql).not.toContain("source_status_json");
    expect(migrationSql).not.toContain("built_route_ids_json");
  });
});
