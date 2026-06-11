import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";

async function readD1Migrations(): Promise<string> {
  const migrationsDir = new URL("../migrations/d1/", import.meta.url);
  const filenames = (await readdir(migrationsDir))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const migrations = await Promise.all(
    filenames.map((filename) => Bun.file(new URL(filename, migrationsDir)).text()),
  );

  return migrations.join("\n");
}

describe("D1 serving table schema", () => {
  test("includes compact serving tables for route artifacts and comparisons", async () => {
    const migrationSql = await readD1Migrations();

    expect(migrationSql).toContain("CREATE TABLE `route_artifact`");
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
    expect(migrationSql).toContain("CREATE TABLE `route_observed_reliability_summary`");
    expect(migrationSql).toContain("CREATE TABLE `intervention_event`");
    expect(migrationSql).toContain("CREATE TABLE `route_intervention_comparison`");
    expect(migrationSql).toContain("CREATE TABLE `corridor`");
    expect(migrationSql).toContain("CREATE TABLE `corridor_route_member`");
    expect(migrationSql).toContain("CREATE TABLE `corridor_month_summary`");
    expect(migrationSql).toContain("CREATE TABLE `corridor_intervention_context`");
    expect(migrationSql).toContain("CREATE TABLE `corridor_hotspot`");
    expect(migrationSql).toContain("CREATE TABLE `corridor_artifact`");
    expect(migrationSql).toContain("CREATE TABLE `route_month_source_status`");
    expect(migrationSql).toContain("CREATE TABLE `route_month_trend`");
    expect(migrationSql).toContain("CREATE TABLE `route_timeline_index`");
    expect(migrationSql).toContain("CREATE TABLE `route_speed_history_coverage`");
    expect(migrationSql).toContain("CREATE TABLE `source_month_coverage`");
    expect(migrationSql).toContain("CREATE TABLE `route_equity_context`");
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
