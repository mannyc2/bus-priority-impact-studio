import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  buildCustomerJourneyFeaturesFromMetricRows,
  buildCustomerJourneyRouteRollups,
} from "../src/feature-resolvers/customer-journey";
import { loadCustomerJourneyMetricLocalDbRows } from "../src/local-db/customer-journey-rows";

function createDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE local_bus_customer_journey_metric (
      route_id TEXT,
      month TEXT,
      period TEXT,
      trip_type TEXT,
      customers REAL,
      additional_bus_stop_time_minutes REAL,
      additional_travel_time_minutes REAL,
      customer_journey_time_minutes REAL
    );
    INSERT INTO local_bus_customer_journey_metric VALUES
      ('B41','2026-03','Peak','LCL/LTD',1000,2.0,1.0,0.50),
      ('M15','2026-03','Peak','LCL/LTD',1000,1.0,1.0,0.80),
      ('B41','2026-04','Peak','LCL/LTD',2000,4.0,1.0,0.40),
      ('B41','2026-04','Off-Peak','LCL/LTD',1000,1.0,3.0,0.60),
      ('M15','2026-04','Peak','LCL/LTD',1000,1.0,1.0,0.90);
  `);
  return db;
}

describe("customer journey resolver", () => {
  test("loads the full CJTP cohort through latest available source month", () => {
    const db = createDb();
    try {
      const rows = loadCustomerJourneyMetricLocalDbRows({
        sqlite: db,
        historyStartMonth: "2026-03",
      });
      expect(rows).toHaveLength(5);
      expect(rows.map((row) => row.month)).toContain("2026-04");
    } finally {
      db.close();
    }
  });

  test("builds features and route-level rollups with weighted CJTP and dominant side", () => {
    const db = createDb();
    try {
      const resolved = buildCustomerJourneyFeaturesFromMetricRows({
        rows: loadCustomerJourneyMetricLocalDbRows({
          sqlite: db,
          historyStartMonth: "2026-03",
        }),
      });
      expect(resolved.summary).toMatchObject({
        asOfMonth: "2026-04",
        featureCount: 5,
      });
      const b41 = resolved.rollups.find((rollup) => rollup.routeId === "B41");
      expect(b41).toMatchObject({
        customerWeightedJourneyTimePerformance: 0.4666666666666667,
        dominantSide: "wait",
        totalExposedCustomers: 3000,
      });
    } finally {
      db.close();
    }
  });

  test("rollup row count equals distinct routes with snapshot cohorts", () => {
    const db = createDb();
    try {
      const resolved = buildCustomerJourneyFeaturesFromMetricRows({
        rows: loadCustomerJourneyMetricLocalDbRows({
          sqlite: db,
          historyStartMonth: "2026-03",
        }),
      });
      const rollups = buildCustomerJourneyRouteRollups({
        features: resolved.features.filter((feature) => feature.month === "2026-04"),
        history: resolved.features,
      });
      expect(rollups).toHaveLength(2);
    } finally {
      db.close();
    }
  });
});
