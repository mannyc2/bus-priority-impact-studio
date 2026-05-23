import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildSourceCoverageLedger,
  type SourceConfig,
} from "../src/jobs/audit/source-coverage-ledger.js";

describe("source coverage ledger", () => {
  test("classifies full-history, backfill, sampled, and excluded sources", () => {
    const sqlite = new Database(":memory:");
    sqlite.exec(`
      CREATE TABLE route_trend (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL
      );
      CREATE TABLE permits (
        permit_number TEXT PRIMARY KEY,
        issued_work_start_date TEXT,
        physical_id TEXT
      );
      CREATE TABLE context_event (
        event_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL
      );
      CREATE TABLE equity (
        route_id TEXT NOT NULL,
        month TEXT NOT NULL
      );

      INSERT INTO route_trend VALUES ('M1', '2023-04'), ('M1', '2026-03');
      INSERT INTO permits VALUES
        ('p1', '2026-03-01', '100'),
        ('p2', '2026-03-02', NULL);
      INSERT INTO context_event VALUES ('permit:p1', 'nyc_dot_street_permits');
    `);

    const sourceConfigs: SourceConfig[] = [
      {
        sourceId: "route_month_trends",
        tableName: "route_trend",
        dateExpression: "month",
        role: "baseline",
        targetStartMonth: "2023-04",
        targetEndMonth: "2026-03",
        requireRows: true,
      },
      {
        sourceId: "dot_street_permits",
        tableName: "permits",
        dateExpression: "issued_work_start_date",
        role: "historical",
        targetStartMonth: "2023-04",
        targetEndMonth: "2026-04",
        geocodeColumn: "physical_id",
        joinTable: "context_event",
        joinSourceId: "nyc_dot_street_permits",
      },
      {
        sourceId: "parking_violations",
        tableName: "missing_parking",
        dateExpression: "issue_date",
        role: "historical",
        targetStartMonth: "2023-04",
        targetEndMonth: "2026-03",
      },
      {
        sourceId: "equity_context",
        tableName: "equity",
        dateExpression: "month",
        role: "baseline",
        requireRows: true,
      },
    ];

    const ledger = buildSourceCoverageLedger({
      sqlite,
      month: "2026-03",
      generatedAt: "2026-05-21T00:00:00.000Z",
      sourceConfigs,
    });

    sqlite.close();

    expect(ledger.summary).toEqual({
      sourceCount: 4,
      decisionCounts: {
        complete_for_history: 0,
        backfill_required: 4,
        release_context_only: 0,
        current_signal_only: 0,
        excluded_until_fixed: 0,
      },
      detectorEligibilityCounts: {
        automatic_primary: 0,
        manual_review_primary: 0,
        context_only: 0,
        current_signal_only: 0,
        missing_data_only: 4,
        blocked: 0,
      },
      sourcesNeedingAction: 4,
    });
    expect(ledger.sources.find((source) => source.sourceId === "route_month_trends")).toEqual(
      expect.objectContaining({
        decision: "backfill_required",
        readiness: expect.objectContaining({ status: "needs_backfill" }),
        evidence: expect.objectContaining({
          allowedRoles: ["missing_data", "coverage_audit"],
          detectorEligibility: "missing_data_only",
          primaryEvidenceAllowed: false,
          automaticPromotionAllowed: false,
        }),
      }),
    );
    expect(ledger.sources.find((source) => source.sourceId === "dot_street_permits")).toEqual(
      expect.objectContaining({
        decision: "backfill_required",
        geocode: { geocodedRows: 1, geocodeRate: 0.5 },
        join: { joinedRows: 1, joinRate: 0.5 },
      }),
    );
    expect(ledger.sources.find((source) => source.sourceId === "parking_violations")).toEqual(
      expect.objectContaining({
        decision: "backfill_required",
        readiness: expect.objectContaining({ status: "needs_backfill" }),
      }),
    );
    expect(ledger.sources.find((source) => source.sourceId === "equity_context")).toEqual(
      expect.objectContaining({
        decision: "backfill_required",
        readiness: expect.objectContaining({ status: "blocked" }),
      }),
    );
  });
});
