import type { Database } from "bun:sqlite";
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Schema } from "effect";

export const FRESHNESS_GRAINS = ["month", "snapshot", "realtime"] as const;
export const FRESHNESS_STATUSES = ["current", "unknown", "unavailable"] as const;

export type FreshnessGrain = (typeof FRESHNESS_GRAINS)[number];
export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number] | `behind(${number})`;
export type FreshnessPublishTarget = "d1" | "map" | "none";

export type FreshnessUpstreamProbe =
  | { readonly kind: "route_speed"; readonly sourceId: string }
  | {
      readonly kind: "socrata_max";
      readonly sourceId: string;
      readonly field: string;
    }
  | { readonly kind: "none" };

export type FreshnessIngestedProbe =
  | {
      readonly kind: "sqlite_max";
      readonly table: string;
      readonly expression: string;
    }
  | { readonly kind: "none" };

export type FreshnessSourceDescriptor = {
  /** Logical public dataset ID. Kept as sourceId for CLI/API compatibility. */
  readonly sourceId: string;
  readonly sourceIds?: readonly string[] | undefined;
  readonly grain: FreshnessGrain;
  readonly servingCritical: boolean;
  readonly upstreamProbe: FreshnessUpstreamProbe;
  readonly ingestedProbe: FreshnessIngestedProbe;
  readonly publishTarget: FreshnessPublishTarget;
  readonly unavailableReason?: string | undefined;
};

export const FRESHNESS_SOURCE_DESCRIPTORS = [
  {
    sourceId: "route-speed",
    sourceIds: ["bus_segment_speeds_2023_2024", "bus_segment_speeds_2025"],
    grain: "month",
    servingCritical: true,
    upstreamProbe: { kind: "route_speed", sourceId: "bus_segment_speeds_2025" },
    ingestedProbe: {
      kind: "sqlite_max",
      table: "local_route_segment_speed",
      expression: "max(month)",
    },
    publishTarget: "d1",
  },
  {
    sourceId: "route-ridership",
    sourceIds: ["bus_hourly_ridership_2020_2024", "bus_hourly_ridership_2025"],
    grain: "month",
    servingCritical: true,
    upstreamProbe: {
      kind: "socrata_max",
      sourceId: "bus_hourly_ridership_2025",
      field: "transit_timestamp",
    },
    ingestedProbe: {
      kind: "sqlite_max",
      table: "local_route_hourly_ridership",
      expression: "max(month)",
    },
    publishTarget: "d1",
  },
  {
    sourceId: "route-reliability",
    sourceIds: ["bus_wait_assessment"],
    grain: "month",
    servingCritical: true,
    upstreamProbe: {
      kind: "socrata_max",
      sourceId: "bus_wait_assessment",
      field: "month",
    },
    ingestedProbe: {
      kind: "sqlite_max",
      table: "local_bus_wait_assessment",
      expression: "max(month)",
    },
    publishTarget: "d1",
  },
  {
    sourceId: "realtime-operations",
    sourceIds: [
      "bus_time_gtfsrt_trip_updates",
      "bus_time_gtfsrt_vehicle_positions",
      "bus_time_gtfsrt_alerts",
    ],
    grain: "realtime",
    servingCritical: false,
    upstreamProbe: { kind: "none" },
    ingestedProbe: {
      kind: "sqlite_max",
      table: "local_gtfs_rt_feed_snapshot",
      expression: "max(substr(fetched_at, 1, 10))",
    },
    publishTarget: "none",
    unavailableReason: "Realtime captures do not define a continuous immutable publication window.",
  },
  {
    sourceId: "route-schedule",
    sourceIds: [
      "bus_schedules_2023",
      "bus_schedules_2024",
      "bus_schedules_2025",
      "bus_schedules_2026",
    ],
    grain: "snapshot",
    servingCritical: true,
    upstreamProbe: { kind: "none" },
    ingestedProbe: { kind: "none" },
    publishTarget: "d1",
    unavailableReason: "Annual schedule snapshots have no continuous upstream-period clock.",
  },
  {
    sourceId: "route-customer-journey",
    sourceIds: ["bus_customer_journey_metrics"],
    grain: "snapshot",
    servingCritical: false,
    upstreamProbe: { kind: "none" },
    ingestedProbe: { kind: "none" },
    publishTarget: "d1",
    unavailableReason: "The reviewed customer-journey context is a release snapshot.",
  },
  {
    sourceId: "interventions",
    sourceIds: ["ace_routes", "ace_violations"],
    grain: "month",
    servingCritical: true,
    upstreamProbe: {
      kind: "socrata_max",
      sourceId: "ace_violations",
      field: "first_occurrence",
    },
    ingestedProbe: {
      kind: "sqlite_max",
      table: "local_ace_violation_summary",
      expression: "max(month)",
    },
    publishTarget: "d1",
  },
  {
    sourceId: "route-identity",
    sourceIds: ["current_bus_routes", "current_bus_stops"],
    grain: "snapshot",
    servingCritical: true,
    upstreamProbe: { kind: "none" },
    ingestedProbe: { kind: "none" },
    publishTarget: "d1",
    unavailableReason: "Versioned snapshots have no continuous upstream-period clock.",
  },
  {
    sourceId: "geometry-map",
    sourceIds: ["nyc_borough_boundaries", "nyc_lion_street_centerline"],
    grain: "snapshot",
    servingCritical: true,
    upstreamProbe: { kind: "none" },
    ingestedProbe: { kind: "none" },
    publishTarget: "map",
    unavailableReason: "Versioned geometry snapshots have no continuous upstream-period clock.",
  },
  {
    sourceId: "route-equity",
    sourceIds: ["census_acs5_profile_tracts"],
    grain: "snapshot",
    servingCritical: false,
    upstreamProbe: { kind: "none" },
    ingestedProbe: { kind: "none" },
    publishTarget: "d1",
    unavailableReason: "ACS context is a release snapshot, not a monthly clock.",
  },
] as const satisfies readonly FreshnessSourceDescriptor[];

const FreshnessValueSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}(?:-\d{2})?$/u));
const NullableFreshnessValueSchema = Schema.NullOr(FreshnessValueSchema);
const NullableLagSchema = Schema.NullOr(
  Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
);

export const FreshnessLedgerRowSchema = Schema.Struct({
  datasetId: Schema.String.check(Schema.isMinLength(1)),
  sourceIds: Schema.Array(Schema.String.check(Schema.isMinLength(1))),
  grain: Schema.Literals(FRESHNESS_GRAINS),
  servingCritical: Schema.Boolean,
  upstreamLatest: NullableFreshnessValueSchema,
  ingestedLatest: NullableFreshnessValueSchema,
  publishedCoverageEnd: NullableFreshnessValueSchema,
  ingestLagMonths: NullableLagSchema,
  publishLagMonths: NullableLagSchema,
  status: Schema.String.check(Schema.isPattern(/^(?:current|unknown|unavailable|behind\(\d+\))$/u)),
  gaps: Schema.Array(Schema.Struct({ start: FreshnessValueSchema, end: FreshnessValueSchema })),
});

export const FreshnessLedgerSchema = Schema.Struct({
  artifactKind: Schema.Literal("freshness_ledger"),
  schemaVersion: Schema.Literal(2),
  checkedAt: Schema.String.check(Schema.isMinLength(1)),
  publishedAt: Schema.NullOr(Schema.String.check(Schema.isMinLength(1))),
  rows: Schema.Array(FreshnessLedgerRowSchema),
});

export type FreshnessLedgerRow = typeof FreshnessLedgerRowSchema.Type;
export type FreshnessLedger = typeof FreshnessLedgerSchema.Type;

export type PublishedFreshness = {
  readonly publishedAt: string;
  readonly coverageEnd: string;
};

export function normalizeFreshnessValue(value: unknown, grain: FreshnessGrain): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?/u.exec(trimmed);
  if (match === null) return null;
  const [, year, month, day] = match;
  if (year === undefined || month === undefined) return null;
  if (Number(month) < 1 || Number(month) > 12) return null;
  if (grain === "month") return `${year}-${month}`;
  if (day === undefined || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

function monthIndex(value: string): number | null {
  const match = /^(\d{4})-(\d{2})/u.exec(value);
  if (match === null) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

export function freshnessLagMonths(
  upstreamLatest: string | null,
  comparedLatest: string | null,
): number | null {
  if (upstreamLatest === null || comparedLatest === null) return null;
  const upstream = monthIndex(upstreamLatest);
  const compared = monthIndex(comparedLatest);
  if (upstream === null || compared === null) return null;
  return Math.max(0, upstream - compared);
}

export function freshnessStatus(input: {
  upstreamLatest: string | null;
  ingestedLatest: string | null;
  publishedCoverageEnd: string | null;
  unavailable?: boolean | undefined;
}): FreshnessStatus {
  if (input.unavailable === true) return "unavailable";
  const ingestLag = freshnessLagMonths(input.upstreamLatest, input.ingestedLatest);
  const publishLag = freshnessLagMonths(input.upstreamLatest, input.publishedCoverageEnd);
  if (ingestLag === null || publishLag === null) return "unknown";
  const lag = Math.max(ingestLag, publishLag);
  return lag === 0 ? "current" : `behind(${lag})`;
}

function attentionRank(row: FreshnessLedgerRow): number {
  if (row.status.startsWith("behind(")) {
    return Math.max(row.ingestLagMonths ?? 0, row.publishLagMonths ?? 0);
  }
  // Keep unknown conspicuous: above a one/two-period delay, below a clearly
  // stale four-plus-period delay. Unavailable has an evidenced boundary.
  if (row.status === "unknown") return 3;
  if (row.status === "unavailable") return -1;
  return 0;
}

export function sortFreshnessRows(rows: readonly FreshnessLedgerRow[]): FreshnessLedgerRow[] {
  return [...rows].sort(
    (left, right) =>
      attentionRank(right) - attentionRank(left) || left.datasetId.localeCompare(right.datasetId),
  );
}

export function buildFreshnessLedger(input: {
  readonly checkedAt: string;
  readonly publishedAt: string | null;
  readonly descriptors: readonly FreshnessSourceDescriptor[];
  readonly upstreamLatest: ReadonlyMap<string, string | null>;
  readonly ingestedLatest: ReadonlyMap<string, string | null>;
  readonly publishedCoverageEnd: ReadonlyMap<FreshnessPublishTarget, string | null>;
  readonly publishedDatasetCoverage?:
    | ReadonlyMap<string, { end: string | null; gaps: readonly { start: string; end: string }[] }>
    | undefined;
}): FreshnessLedger {
  const rows = input.descriptors.map((descriptor): FreshnessLedgerRow => {
    const upstreamLatest = input.upstreamLatest.get(descriptor.sourceId) ?? null;
    const ingestedLatest = input.ingestedLatest.get(descriptor.sourceId) ?? null;
    const datasetCoverage = input.publishedDatasetCoverage?.get(descriptor.sourceId);
    const publishedCoverageEnd =
      datasetCoverage?.end ??
      (descriptor.publishTarget === "none"
        ? null
        : (input.publishedCoverageEnd.get(descriptor.publishTarget) ?? null));
    return {
      datasetId: descriptor.sourceId,
      sourceIds: [...(descriptor.sourceIds ?? [descriptor.sourceId])].toSorted(),
      grain: descriptor.grain,
      servingCritical: descriptor.servingCritical,
      upstreamLatest,
      ingestedLatest,
      publishedCoverageEnd,
      ingestLagMonths: freshnessLagMonths(upstreamLatest, ingestedLatest),
      publishLagMonths: freshnessLagMonths(upstreamLatest, publishedCoverageEnd),
      status: freshnessStatus({
        upstreamLatest,
        ingestedLatest,
        publishedCoverageEnd,
        unavailable: descriptor.unavailableReason !== undefined,
      }),
      gaps: [...(datasetCoverage?.gaps ?? [])],
    };
  });

  return {
    artifactKind: "freshness_ledger",
    schemaVersion: 2,
    checkedAt: input.checkedAt,
    publishedAt: input.publishedAt,
    rows: sortFreshnessRows(rows),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readPublishedArtifact(path: string): Promise<PublishedFreshness | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  try {
    const raw: unknown = await file.json();
    if (!isRecord(raw)) return null;
    const { publishedAt, coverage } = raw;
    if (typeof publishedAt !== "string" || !isRecord(coverage)) return null;
    const { end } = coverage;
    if (typeof end !== "string") return null;
    const coverageEnd = normalizeFreshnessValue(end, "month");
    if (coverageEnd === null) return null;
    return { publishedAt, coverageEnd };
  } catch {
    return null;
  }
}

export async function latestPublishedFreshness(
  root: string,
  fileName: string,
): Promise<PublishedFreshness | null> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates: PublishedFreshness[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = await readPublishedArtifact(join(root, entry.name, fileName));
    if (candidate !== null) candidates.push(candidate);
  }
  return (
    candidates.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))[0] ?? null
  );
}

export function readIngestedFreshness(
  sqlite: Database,
  descriptor: FreshnessSourceDescriptor,
): string | null {
  if (descriptor.ingestedProbe.kind === "none") return null;
  const table = descriptor.ingestedProbe.table;
  const exists = sqlite
    .query("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { present?: number } | null;
  if (exists?.present !== 1) return null;

  const row = sqlite
    .query(`SELECT ${descriptor.ingestedProbe.expression} AS latest FROM ${table}`)
    .get() as { latest?: unknown } | null;
  return normalizeFreshnessValue(row?.latest, descriptor.grain);
}
