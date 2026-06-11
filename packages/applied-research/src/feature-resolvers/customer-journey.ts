import type { FeatureQuality } from "@bp/analytics/features";
import {
  CUSTOMER_JOURNEY_FEATURE_GRAIN,
  type CustomerJourneyFeature,
} from "@bp/analytics/features";

export type CustomerJourneyMetricSourceRow = {
  route_id: unknown;
  month: unknown;
  period: unknown;
  trip_type: unknown;
  customers: unknown;
  additional_bus_stop_time_minutes: unknown;
  additional_travel_time_minutes: unknown;
  customer_journey_time_minutes: unknown;
};

export type CustomerJourneyRouteRollup = {
  routeId: string;
  month: string;
  worstCohort: {
    period: string;
    tripType: string;
    journeyTimePerformance: number;
  };
  customerWeightedJourneyTimePerformance: number;
  dominantSide: "wait" | "travel" | "mixed" | "none";
  persistenceCount: number;
  totalExposedCustomers: number;
};

export type CustomerJourneyFeatureResolverResult = {
  features: CustomerJourneyFeature[];
  rollups: CustomerJourneyRouteRollup[];
  summary: {
    sourceKind: "customer_journey_metric_from_local_sqlite_v1";
    featureGrain: typeof CUSTOMER_JOURNEY_FEATURE_GRAIN;
    asOfMonth: string | null;
    featureCount: number;
    rollupCount: number;
  };
};

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected text value");
  return value;
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Expected finite numeric value");
  return parsed;
}

function quality(customers: number): FeatureQuality {
  return {
    coverageStatus: "complete",
    observedCount: 1,
    expectedCount: 1,
    coverageShare: 1,
    freshnessStatus: "fresh",
    sampleCount: Math.max(Math.round(customers), 0),
    minSampleCount: 1,
    sampleStatus: customers > 0 ? "supported" : "insufficient_samples",
  };
}

export function buildCustomerJourneyFeaturesFromMetricRows(input: {
  rows: readonly CustomerJourneyMetricSourceRow[];
}): CustomerJourneyFeatureResolverResult {
  const features = input.rows.map((row) => {
    const customers = numberValue(row.customers);
    return {
      routeId: text(row.route_id),
      month: text(row.month),
      period: text(row.period) as CustomerJourneyFeature["period"],
      tripType: text(row.trip_type) as CustomerJourneyFeature["tripType"],
      customers,
      additionalWaitMinutes: numberValue(row.additional_bus_stop_time_minutes),
      additionalTravelMinutes: numberValue(row.additional_travel_time_minutes),
      // The local column name says minutes, but MTA CJTP is a 0..1 performance share.
      journeyTimePerformance: numberValue(row.customer_journey_time_minutes),
      quality: quality(customers),
    } satisfies CustomerJourneyFeature;
  });
  const asOfMonth = features.reduce<string | null>(
    (max, feature) => (max === null || feature.month > max ? feature.month : max),
    null,
  );
  const rollups = buildCustomerJourneyRouteRollups({
    features: asOfMonth === null ? [] : features.filter((feature) => feature.month === asOfMonth),
    history: features,
  });
  return {
    features,
    rollups,
    summary: {
      sourceKind: "customer_journey_metric_from_local_sqlite_v1",
      featureGrain: CUSTOMER_JOURNEY_FEATURE_GRAIN,
      asOfMonth,
      featureCount: features.length,
      rollupCount: rollups.length,
    },
  };
}

export function buildCustomerJourneyRouteRollups(input: {
  features: readonly CustomerJourneyFeature[];
  history: readonly CustomerJourneyFeature[];
}): CustomerJourneyRouteRollup[] {
  const byRoute = new Map<string, CustomerJourneyFeature[]>();
  for (const feature of input.features) {
    byRoute.set(feature.routeId, [...(byRoute.get(feature.routeId) ?? []), feature]);
  }
  return [...byRoute.entries()]
    .map(([routeId, rows]) => {
      const totalExposedCustomers = rows.reduce((sum, row) => sum + row.customers, 0);
      const customerWeightedJourneyTimePerformance =
        totalExposedCustomers === 0
          ? 0
          : rows.reduce((sum, row) => sum + row.journeyTimePerformance * row.customers, 0) /
            totalExposedCustomers;
      const wait = rows.reduce(
        (sum, row) => sum + Math.max(row.additionalWaitMinutes, 0) * row.customers,
        0,
      );
      const travel = rows.reduce(
        (sum, row) => sum + Math.max(row.additionalTravelMinutes, 0) * row.customers,
        0,
      );
      const worst = [...rows].sort(
        (left, right) => left.journeyTimePerformance - right.journeyTimePerformance,
      )[0] as CustomerJourneyFeature;
      const persistenceCount = input.history.filter(
        (row) =>
          row.routeId === routeId &&
          row.period === worst.period &&
          row.tripType === worst.tripType &&
          row.journeyTimePerformance <= worst.journeyTimePerformance,
      ).length;
      return {
        routeId,
        month: worst.month,
        worstCohort: {
          period: worst.period,
          tripType: worst.tripType,
          journeyTimePerformance: worst.journeyTimePerformance,
        },
        customerWeightedJourneyTimePerformance,
        dominantSide:
          wait <= 0 && travel <= 0
            ? "none"
            : Math.abs(wait - travel) < 0.01
              ? "mixed"
              : wait > travel
                ? "wait"
                : "travel",
        persistenceCount,
        totalExposedCustomers,
      } satisfies CustomerJourneyRouteRollup;
    })
    .sort((left, right) => left.routeId.localeCompare(right.routeId));
}
