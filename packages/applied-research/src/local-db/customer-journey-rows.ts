import type { Database } from "bun:sqlite";
import type { CustomerJourneyMetricSourceRow } from "../feature-resolvers/customer-journey";

export type CustomerJourneyMetricLocalDbQuery = {
  readonly sqlite: Database;
  readonly historyStartMonth: string;
  readonly snapshotMonth?: string;
};

export function latestCustomerJourneyMetricMonth(sqlite: Database): string | null {
  const row = sqlite
    .query(
      `
        SELECT MAX(month) AS month
        FROM local_bus_customer_journey_metric
        WHERE route_id <> 'ALL'
      `,
    )
    .get() as { month: string | null } | null;
  return row?.month ?? null;
}

export function loadCustomerJourneyMetricLocalDbRows(
  input: CustomerJourneyMetricLocalDbQuery,
): CustomerJourneyMetricSourceRow[] {
  const asOfMonth = input.snapshotMonth ?? latestCustomerJourneyMetricMonth(input.sqlite);
  if (asOfMonth === null) return [];
  const query = input.sqlite.query(
    `
      SELECT
        route_id,
        month,
        period,
        trip_type,
        customers,
        additional_bus_stop_time_minutes,
        additional_travel_time_minutes,
        customer_journey_time_minutes
      FROM local_bus_customer_journey_metric
      WHERE route_id <> 'ALL'
        AND month >= ?
        AND month <= ?
      ORDER BY month, period, trip_type, route_id
    `,
  );
  return query.all(input.historyStartMonth, asOfMonth) as CustomerJourneyMetricSourceRow[];
}
