import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { buildSourceCoverageLedger, type SourceConfig } from "../src/local-db";

describe("source coverage ledger local DB builder", () => {
  test("classifies complete history and carries quality caveats", () => {
    const sqlite = new Database(":memory:");
    try {
      sqlite.exec(`
        CREATE TABLE local_test_source (
          observed_at TEXT NOT NULL,
          physical_id TEXT,
          has_metric INTEGER NOT NULL
        );
        INSERT INTO local_test_source VALUES
          ('2026-01-15', '100', 1),
          ('2026-02-15', '', 1),
          ('2026-03-15', '300', 1);
        CREATE TABLE local_context_event (source_id TEXT NOT NULL);
        INSERT INTO local_context_event VALUES ('test_source'), ('test_source');
      `);

      const configs: readonly SourceConfig[] = [
        {
          sourceId: "test_source",
          tableName: "local_test_source",
          dateExpression: "observed_at",
          role: "historical",
          targetStartMonth: "2026-01",
          targetEndMonth: "2026-03",
          geocodeColumn: "physical_id",
          joinTable: "local_context_event",
          joinSourceId: "test_source",
          minGeocodeRate: 0.9,
          requiredCoverageColumns: [{ columnName: "has_metric", label: "metric" }],
        },
      ];

      const ledger = buildSourceCoverageLedger({
        sqlite,
        month: "2026-03",
        dbPath: "/tmp/local.sqlite",
        generatedAt: "2026-06-06T00:00:00.000Z",
        sourceConfigs: configs,
      });

      expect(ledger.summary).toMatchObject({
        sourceCount: 1,
        sourcesNeedingAction: 1,
      });
      expect(ledger.sources[0]).toMatchObject({
        sourceId: "test_source",
        decision: "complete_for_history",
        rowCount: 3,
        range: { min: "2026-01", max: "2026-03", monthCount: 3 },
        geocode: { geocodedRows: 2, geocodeRate: 2 / 3 },
        join: { joinedRows: 2, joinRate: 2 / 3 },
        readiness: {
          status: "needs_decision",
          reasons: ["geocode rate 0.667 is below 0.900"],
        },
        evidence: {
          detectorEligibility: "manual_review_primary",
          primaryEvidenceAllowed: true,
          automaticPromotionAllowed: false,
        },
      });
    } finally {
      sqlite.close();
    }
  });

  test("reports missing tables through source policy", () => {
    const sqlite = new Database(":memory:");
    try {
      const ledger = buildSourceCoverageLedger({
        sqlite,
        month: "2026-03",
        generatedAt: "2026-06-06T00:00:00.000Z",
        sourceConfigs: [
          {
            sourceId: "blocked_source",
            tableName: "local_missing_source",
            dateExpression: "month",
            role: "historical",
            forceDecision: "excluded_until_fixed",
          },
        ],
      });

      expect(ledger.sources[0]).toMatchObject({
        sourceId: "blocked_source",
        decision: "excluded_until_fixed",
        rowCount: 0,
        readiness: {
          status: "blocked",
          reasons: ["table local_missing_source is missing"],
        },
        evidence: {
          detectorEligibility: "blocked",
          allowedRoles: ["coverage_audit"],
          primaryEvidenceAllowed: false,
        },
      });
      expect(ledger.summary.sourcesNeedingAction).toBe(1);
    } finally {
      sqlite.close();
    }
  });
});
