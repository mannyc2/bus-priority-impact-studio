import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  buildRouteCapabilityManifest,
  type RouteCapabilityInputRow,
  type RouteCapabilitySourceStatus,
} from "@bp/applied-research/evaluation";
import { STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY } from "@bp/domain/studio";
import * as z from "zod";
import type { D1CanonicalInputs } from "./d1-inputs";

/**
 * Builds the route capability manifest (frontend §7.1 / hard-cutover C1) from the
 * per-route rows the `export d1` flow already assembled in `readLocalD1Inputs`, plus
 * the per-route detector counts parsed from the staged detector readiness manifest.
 * The pure state machine lives in `@bp/applied-research`; this module is the join.
 */

// Reliability-family detectors — their readiness drives the `reliability` surface.
const RELIABILITY_DETECTOR_IDS = new Set(["observed_reliability", "headway_reliability_ewt"]);

const DetectorCountsSchema = z
  .object({
    public_finding_candidate: z.number().int().nonnegative().default(0),
    route_context: z.number().int().nonnegative().default(0),
    review_queue: z.number().int().nonnegative().default(0),
    suppressed: z.number().int().nonnegative().default(0),
  })
  .passthrough();

const DetectorReadinessRouteSummariesSchema = z
  .object({
    releaseMonth: z.string().min(1),
    routes: z.array(
      z
        .object({
          routeId: z.string().min(1),
          counts: DetectorCountsSchema,
          byDetector: z.record(z.string(), DetectorCountsSchema).default({}),
          sourceMonths: z.array(z.object({ month: z.string() }).passthrough()).default([]),
          caveats: z.array(z.string()).default([]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type DetectorReadinessRouteSummary = RouteCapabilityInputRow["detector"];

export async function readDetectorReadinessRouteSummaries(input: {
  manifestPath?: string | undefined;
  month: string;
}): Promise<Map<string, DetectorReadinessRouteSummary>> {
  const summaries = new Map<string, DetectorReadinessRouteSummary>();
  if (input.manifestPath === undefined) return summaries;
  const file = Bun.file(input.manifestPath);
  if (!(await file.exists())) return summaries;

  const manifest = DetectorReadinessRouteSummariesSchema.parse(JSON.parse(await file.text()));
  if (manifest.releaseMonth !== input.month) {
    throw new Error(
      `Detector readiness manifest month ${manifest.releaseMonth} does not match export month ${input.month}.`,
    );
  }

  for (const route of manifest.routes) {
    let reliabilityFindingCount = 0;
    let reliabilityContextCount = 0;
    for (const [detectorId, counts] of Object.entries(route.byDetector)) {
      if (!RELIABILITY_DETECTOR_IDS.has(detectorId)) continue;
      reliabilityFindingCount += counts.public_finding_candidate;
      reliabilityContextCount += counts.route_context;
    }
    summaries.set(route.routeId, {
      present: true,
      findingCandidateCount: route.counts.public_finding_candidate,
      contextCount: route.counts.route_context,
      reviewQueueCount: route.counts.review_queue,
      suppressedCount: route.counts.suppressed,
      reliabilityFindingCount,
      reliabilityContextCount,
      months: [...new Set(route.sourceMonths.map((entry) => entry.month))].sort(),
      caveats: route.caveats,
    });
  }
  return summaries;
}

const ABSENT_DETECTOR: DetectorReadinessRouteSummary = {
  present: false,
  findingCandidateCount: 0,
  contextCount: 0,
  reviewQueueCount: 0,
  suppressedCount: 0,
  reliabilityFindingCount: 0,
  reliabilityContextCount: 0,
  months: [],
  caveats: [],
};

function normalizeSourceStatus(raw: string): RouteCapabilitySourceStatus {
  switch (raw) {
    case "available":
    case "ok":
      return "available";
    case "partial":
    case "insufficient_samples":
      return "partial";
    case "blocked":
    case "upstream_blocked":
    case "downstream_blocked":
      return "blocked";
    default:
      return "absent";
  }
}

const SOURCE_STATUS_SEVERITY: Record<RouteCapabilitySourceStatus, number> = {
  available: 0,
  partial: 1,
  absent: 2,
  blocked: 3,
};

function worstStatus(
  current: RouteCapabilitySourceStatus | undefined,
  next: RouteCapabilitySourceStatus,
): RouteCapabilitySourceStatus {
  if (current === undefined) return next;
  return SOURCE_STATUS_SEVERITY[next] > SOURCE_STATUS_SEVERITY[current] ? next : current;
}

type TrendAggregate = {
  pointCount: number;
  speedMonthCount: number;
  ridershipMonthCount: number;
  endMonth: string | null;
};

export function toRouteCapabilityInputRows(
  d1Inputs: Pick<
    D1CanonicalInputs,
    | "routeCatalog"
    | "routeReadiness"
    | "routeBriefSummaries"
    | "routeMonthTrends"
    | "routeArtifacts"
    | "routeSpeedHistoryCoverage"
    | "routeMonthSourceStatuses"
  >,
  readinessSummaries: Map<string, DetectorReadinessRouteSummary>,
): RouteCapabilityInputRow[] {
  const readinessByRoute = new Map(d1Inputs.routeReadiness.map((row) => [row.routeId, row]));
  const summaryByRoute = new Map(d1Inputs.routeBriefSummaries.map((row) => [row.routeId, row]));
  const speedCoverageByRoute = new Map(
    d1Inputs.routeSpeedHistoryCoverage.map((row) => [row.routeId, row]),
  );
  const artifactRouteIds = new Set(d1Inputs.routeArtifacts.map((row) => row.routeId));

  const trendByRoute = new Map<string, TrendAggregate>();
  for (const trend of d1Inputs.routeMonthTrends) {
    const aggregate = trendByRoute.get(trend.routeId) ?? {
      pointCount: 0,
      speedMonthCount: 0,
      ridershipMonthCount: 0,
      endMonth: null,
    };
    aggregate.pointCount += 1;
    if (trend.hasSpeedTrend) aggregate.speedMonthCount += 1;
    if (trend.hasRidershipTrend) aggregate.ridershipMonthCount += 1;
    if (aggregate.endMonth === null || trend.month > aggregate.endMonth) {
      aggregate.endMonth = trend.month;
    }
    trendByRoute.set(trend.routeId, aggregate);
  }

  const reliabilityStatusByRoute = new Map<string, RouteCapabilitySourceStatus>();
  const ridershipStatusByRoute = new Map<string, RouteCapabilitySourceStatus>();
  for (const source of d1Inputs.routeMonthSourceStatuses) {
    const status = normalizeSourceStatus(source.status);
    if (source.sourceScope === "reliability") {
      reliabilityStatusByRoute.set(
        source.routeId,
        worstStatus(reliabilityStatusByRoute.get(source.routeId), status),
      );
    } else if (source.sourceScope === "equity_context") {
      ridershipStatusByRoute.set(
        source.routeId,
        worstStatus(ridershipStatusByRoute.get(source.routeId), status),
      );
    }
  }

  return d1Inputs.routeCatalog.map((catalogRow): RouteCapabilityInputRow => {
    const routeId = catalogRow.routeId;
    const summary = summaryByRoute.get(routeId);
    const readiness = readinessByRoute.get(routeId);
    const speed = speedCoverageByRoute.get(routeId);
    const trend = trendByRoute.get(routeId);
    return {
      routeId,
      hasSummary: summary !== undefined,
      publicVisible: summary?.publicVisible ?? false,
      baselineMonth: summary?.month ?? null,
      hasArtifact: artifactRouteIds.has(routeId),
      history: {
        endMonth: trend?.endMonth ?? null,
        pointCount: trend?.pointCount ?? 0,
        speedMonthCount: trend?.speedMonthCount ?? 0,
        ridershipMonthCount: trend?.ridershipMonthCount ?? 0,
      },
      speedHistory:
        speed === undefined
          ? null
          : {
              endMonth: speed.historyEndMonth,
              monthCount: speed.monthCount,
              missingCellCount: speed.missingCellCount,
            },
      scheduleTimepointCount: readiness?.scheduleTimepointCount ?? 0,
      treatment: {
        aceActive: summary?.aceActive ?? false,
        busLaneMatchedLaneCount: summary?.busLaneMatchedLaneCount ?? 0,
      },
      detector: readinessSummaries.get(routeId) ?? ABSENT_DETECTOR,
      sourceStatus: {
        reliability: reliabilityStatusByRoute.get(routeId) ?? "absent",
        ridership: ridershipStatusByRoute.get(routeId) ?? "absent",
      },
    };
  });
}

export async function buildAndWriteRouteCapabilityManifest(input: {
  d1Inputs: Parameters<typeof toRouteCapabilityInputRows>[0];
  readinessSummaries: Map<string, DetectorReadinessRouteSummary>;
  artifactRoot: string;
  releaseMonth: string;
  generatedAt: string;
}): Promise<{ outputPath: string; routeCount: number; sha256: string; byteLength: number }> {
  const rows = toRouteCapabilityInputRows(input.d1Inputs, input.readinessSummaries);
  const manifest = buildRouteCapabilityManifest({
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    rows,
  });
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  const outputPath = join(input.artifactRoot, STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY);
  await mkdir(dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, body);
  return {
    outputPath,
    routeCount: manifest.routes.length,
    sha256: createHash("sha256").update(body).digest("hex"),
    byteLength: new TextEncoder().encode(body).byteLength,
  };
}
