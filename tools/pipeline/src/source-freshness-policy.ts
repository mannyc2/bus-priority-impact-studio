export type SourceFreshnessPolicy = {
  sourceId: string;
  expectedLagDays: number;
};

export const SOURCE_FRESHNESS_POLICIES: readonly SourceFreshnessPolicy[] = [
  // NYC 311 current, DOT real-time speeds: operational feeds expected to move daily.
  { sourceId: "nyc_311_service_requests_current", expectedLagDays: 2 },
  { sourceId: "nyc_dot_real_time_traffic_speeds", expectedLagDays: 2 },
  // Historical 311 is static for this product's March 2026 release context.
  { sourceId: "nyc_311_service_requests_historical", expectedLagDays: 365 },
  // Permits, parking, and collisions are used as current operational context;
  // weekly freshness is a realistic local pipeline target without pretending
  // each source updates on the same daily cadence.
  { sourceId: "nyc_dot_street_construction_permits", expectedLagDays: 7 },
  { sourceId: "nyc_dot_street_opening_permits", expectedLagDays: 7 },
  { sourceId: "nyc_parking_violations_current", expectedLagDays: 7 },
  { sourceId: "nypd_motor_vehicle_collisions", expectedLagDays: 7 },
  // Traffic-volume and ACE aggregate evidence are slower-moving context layers.
  { sourceId: "nyc_dot_automated_traffic_volume_counts", expectedLagDays: 90 },
  { sourceId: "nyc_mta_ace_violations", expectedLagDays: 45 },
] as const;
