import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPipelineDb, listBusCustomerJourneyMetricRowsForMonth } from "@bp/db/local";
import { runBusCustomerJourneyMetricsIngest } from "../../../src/commands/ingest/bus-customer-journey-metrics.ts";

const manifestText = `
verified_at: "2026-05-31T00:00:00.000Z"
sources:
  - id: bus_customer_journey_metrics
    type: socrata_dataset
    priority: secondary
    domain: data.ny.gov
    dataset_id: 8mkn-d32t
    url: https://data.ny.gov/Transportation/MTA-Bus-Customer-Journey-Focused-Metrics-Beginning/8mkn-d32t
    api: soda3
    default_access:
      kind: query
      format: json
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: false
    purpose: Test source.
    status: active
`;

describe("ingest bus-customer-journey-metrics", () => {
  test("normalizes and stages official route-month ABST metrics", async () => {
    const sqlite = new Database(":memory:");
    const tempDir = await mkdtemp(join(tmpdir(), "bp-cji-"));
    try {
      const result = await runBusCustomerJourneyMetricsIngest({
        local: {
          db: createLocalPipelineDb(sqlite),
          sqlite,
          path: ":memory:",
          spatialite: null,
        },
        startYear: 2026,
        startMonth: 1,
        endYear: 2026,
        endMonth: 1,
        fetchedAt: new Date("2026-05-31T00:00:00.000Z"),
        manifestText,
        snapshotPath: join(tempDir, "raw.json"),
        fetcher: async () =>
          new Response(
            JSON.stringify([
              {
                month: "2026-01-01T00:00:00.000",
                borough: "Brooklyn",
                trip_type: "Local",
                route_id: "B1",
                period: "Peak",
                number_of_customers: "100",
                additional_bus_stop_time: "2.5",
                additional_travel_time: "1.5",
                customer_journey_time: "25",
              },
              {
                month: "2026-01-01T00:00:00.000",
                borough: "Brooklyn",
                trip_type: "Local",
                route_id: "B1",
                period: "Off-Peak",
                number_of_customers: "50",
                additional_bus_stop_time: "3.5",
                additional_travel_time: "1.2",
                customer_journey_time: "24",
              },
              {
                month: "2026-01-01T00:00:00.000",
                borough: "Systemwide",
                trip_type: "All",
                route_id: "ALL",
                period: "All",
                number_of_customers: "150",
                additional_bus_stop_time: "3",
                additional_travel_time: "1",
                customer_journey_time: "24",
              },
            ]),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      });

      expect(result).toMatchObject({
        startMonth: "2026-01",
        endMonth: "2026-01",
        monthCount: 1,
        rowCount: 2,
        routeCount: 1,
      });

      const stagedRows = await listBusCustomerJourneyMetricRowsForMonth(
        createLocalPipelineDb(sqlite),
        "2026-01",
      );
      expect(stagedRows).toEqual([
        expect.objectContaining({
          routeId: "B1",
          period: "Off-Peak",
          customers: 50,
          additionalBusStopTimeMinutes: 3.5,
        }),
        expect.objectContaining({
          routeId: "B1",
          period: "Peak",
          customers: 100,
          additionalBusStopTimeMinutes: 2.5,
        }),
      ]);
    } finally {
      sqlite.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
