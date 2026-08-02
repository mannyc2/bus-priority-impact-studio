export const LOGICAL_DATASET_GRAINS = ["month", "day", "snapshot", "realtime"] as const;

export type LogicalDatasetGrain = (typeof LOGICAL_DATASET_GRAINS)[number];

export type LogicalDatasetDescriptor = {
  readonly datasetId: string;
  readonly sourceIds: readonly string[];
  readonly grain: LogicalDatasetGrain;
  readonly cadence: string;
  readonly earliestTrustworthy: string | null;
  readonly earliestTrustworthyReason: string;
  readonly completenessRule: string;
  readonly publicSurfaces: readonly string[];
};

/**
 * The public-data registry is deliberately pipeline-owned. A source belongs to one
 * logical dataset even when that product feeds several public surfaces.
 *
 * The period floors below are source-policy boundaries, not convenient analysis
 * defaults: they are corroborated by the named Socrata dataset families and by the
 * live range receipt produced before a history publication.
 */
export const LOGICAL_DATASETS = [
  {
    datasetId: "route-speed",
    sourceIds: ["bus_segment_speeds_2023_2024", "bus_segment_speeds_2025"],
    grain: "month",
    cadence: "monthly after the upstream month is complete",
    earliestTrustworthy: "2023-04",
    earliestTrustworthyReason:
      "The official historical segment-speed family begins with the first complete April 2023 partition.",
    completenessRule:
      "Every month is complete only when the upstream grouped route inventory is present and the immutable partition receipt matches its row count and SHA-256.",
    publicSurfaces: ["route history", "route trend", "map speed layers"],
  },
  {
    datasetId: "route-ridership",
    sourceIds: ["bus_hourly_ridership_2020_2024", "bus_hourly_ridership_2025"],
    grain: "month",
    cadence: "monthly after the upstream month is complete",
    earliestTrustworthy: "2020-01",
    earliestTrustworthyReason:
      "The official historical hourly-ridership family is explicitly bounded to 2020-2024; the publication receipt records the live minimum timestamp.",
    completenessRule:
      "A partition is complete only after all grouped route rows are captured, canonically sorted, hashed, and covered by an atomic receipt.",
    publicSurfaces: ["route history", "route trend", "ridership context"],
  },
  {
    datasetId: "route-schedule",
    sourceIds: [
      "bus_schedules_2023",
      "bus_schedules_2024",
      "bus_schedules_2025",
      "bus_schedules_2026",
    ],
    grain: "snapshot",
    cadence: "annual schedule-family snapshots",
    earliestTrustworthy: "snapshot:2023",
    earliestTrustworthyReason:
      "The registered official schedule family begins with the 2023 snapshot; earlier schedules have no registered reproducible source.",
    completenessRule:
      "A schedule year is present only when its registered snapshot and route/timepoint inventory receipt are complete.",
    publicSurfaces: ["schedule baseline", "route readiness"],
  },
  {
    datasetId: "route-reliability",
    sourceIds: ["bus_wait_assessment"],
    grain: "month",
    cadence: "monthly wait-assessment publication",
    earliestTrustworthy: "2015-01",
    earliestTrustworthyReason:
      "A live Socrata minimum probe on 2026-08-02 found the official wait-assessment family begins at 2015-01.",
    completenessRule:
      "Monthly assessment partitions require exact source counts and hashes; an absent month is an explicit gap.",
    publicSurfaces: ["route reliability", "data notes"],
  },
  {
    datasetId: "route-customer-journey",
    sourceIds: ["bus_customer_journey_metrics"],
    grain: "snapshot",
    cadence: "registered customer-journey metric snapshots",
    earliestTrustworthy: null,
    earliestTrustworthyReason:
      "This release does not claim a continuous customer-journey history; the existing reviewed snapshot remains explicit.",
    completenessRule:
      "A public customer-journey metric is present only when its reviewed source snapshot is named by the release.",
    publicSurfaces: ["route reliability context"],
  },
  {
    datasetId: "realtime-operations",
    sourceIds: [
      "bus_time_gtfsrt_trip_updates",
      "bus_time_gtfsrt_vehicle_positions",
      "bus_time_gtfsrt_alerts",
    ],
    grain: "realtime",
    cadence: "best-effort timestamped captures",
    earliestTrustworthy: null,
    earliestTrustworthyReason:
      "Realtime capture began opportunistically; no continuous historical window is claimed by an immutable candidate.",
    completenessRule:
      "Every capture must carry its own timestamped receipt; absent intervals are never represented as continuous coverage.",
    publicSurfaces: ["current reliability signals", "data notes"],
  },
  {
    datasetId: "route-identity",
    sourceIds: [
      "current_bus_routes",
      "current_bus_stops",
      "bus_routes_all_bundles",
      "bus_stops_all_bundles",
      "bus_gtfs_bronx",
      "bus_gtfs_brooklyn",
      "bus_gtfs_manhattan",
      "bus_gtfs_queens",
      "bus_gtfs_staten_island",
      "bus_gtfs_mta_bus_company",
    ],
    grain: "snapshot",
    cadence: "reviewed source snapshot",
    earliestTrustworthy: null,
    earliestTrustworthyReason:
      "This product is an exact reviewed serving snapshot; no historical continuity is claimed.",
    completenessRule:
      "The snapshot must pass the exact route-universe receipt and preserve plus-suffixed identities.",
    publicSurfaces: ["all route APIs", "route geometry", "map"],
  },
  {
    datasetId: "interventions",
    sourceIds: [
      "ace_routes",
      "ace_violations",
      "nyc_dot_bus_lanes_local_streets",
      "nyc_dot_street_construction_permits",
      "nyc_dot_street_opening_permits",
      "mta_ace_page",
    ],
    grain: "snapshot",
    cadence: "reviewed evidence snapshot",
    earliestTrustworthy: null,
    earliestTrustworthyReason:
      "The public product is a reviewed evidence snapshot with event-level dates, not an inferred continuous source panel.",
    completenessRule:
      "Every accepted episode and route membership must resolve to immutable reviewed evidence; absence never fabricates an event.",
    publicSurfaces: ["interventions", "route treatment history"],
  },
  {
    datasetId: "geometry-map",
    sourceIds: ["nyc_borough_boundaries", "nyc_lion_street_centerline"],
    grain: "snapshot",
    cadence: "reviewed geometry snapshot",
    earliestTrustworthy: null,
    earliestTrustworthyReason:
      "Map geometry is served as a versioned snapshot; historical geometry continuity is not claimed.",
    completenessRule:
      "The map manifest must enumerate and hash every public layer and route artifact.",
    publicSurfaces: ["network map", "route maps"],
  },
  {
    datasetId: "route-equity",
    sourceIds: ["census_acs5_profile_tracts"],
    grain: "snapshot",
    cadence: "ACS five-year release snapshot",
    earliestTrustworthy: null,
    earliestTrustworthyReason:
      "Equity context is a release-specific ACS snapshot; the UI does not claim a continuous monthly history.",
    completenessRule:
      "Every public route row must either join to the pinned ACS snapshot or expose the missing join honestly.",
    publicSurfaces: ["route equity context", "priority comparisons"],
  },
] as const satisfies readonly LogicalDatasetDescriptor[];

export const PRIMARY_ROUTE_SPEED_FLOOR = "2023-04" as const;
export const ROUTE_RIDERSHIP_FLOOR = "2020-01" as const;

export function logicalDatasetById(datasetId: string): LogicalDatasetDescriptor {
  const descriptor = LOGICAL_DATASETS.find((entry) => entry.datasetId === datasetId);
  if (descriptor === undefined) throw new Error(`Unknown logical dataset ${datasetId}.`);
  return descriptor;
}

export function assertCandidateSourceRegistry(input: {
  readonly datasets: readonly { datasetId: string; sourceIds: readonly string[] }[];
}): void {
  const registryOwner = new Map<string, string>();
  for (const descriptor of LOGICAL_DATASETS) {
    for (const sourceId of descriptor.sourceIds) {
      const prior = registryOwner.get(sourceId);
      if (prior !== undefined) {
        throw new Error(
          `Logical source ${sourceId} belongs to both ${prior} and ${descriptor.datasetId}.`,
        );
      }
      registryOwner.set(sourceId, descriptor.datasetId);
    }
  }
  const used = new Map<string, string>();
  for (const dataset of input.datasets) {
    for (const sourceId of dataset.sourceIds) {
      const expected = registryOwner.get(sourceId);
      if (expected === undefined)
        throw new Error(`Candidate source ${sourceId} is not registered.`);
      if (expected !== dataset.datasetId) {
        throw new Error(
          `Candidate source ${sourceId} belongs to ${expected}, not ${dataset.datasetId}.`,
        );
      }
      const prior = used.get(sourceId);
      if (prior !== undefined)
        throw new Error(`Candidate source ${sourceId} is mapped more than once.`);
      used.set(sourceId, dataset.datasetId);
    }
  }
}
