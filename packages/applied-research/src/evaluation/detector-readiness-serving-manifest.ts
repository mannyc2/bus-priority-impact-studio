import type { DetectorReadinessBucket } from "./detector-readiness-projection";

export type DetectorReadinessProjectionItemLike = {
  readonly identityKey?: string;
  readonly detectorId: string;
  readonly routeId: string | null;
  readonly scopeId: string;
  readonly bucket: DetectorReadinessBucket;
  readonly reviewedFrontendUse?: string;
  readonly emittedCandidate?: boolean;
  readonly reasonCode?: string | null;
  readonly caveats?: readonly string[];
  readonly rootCauseTags?: readonly string[];
  readonly geometrySourceConfirmed?: boolean;
  readonly label?: unknown;
  readonly candidate?: unknown;
};

export type DetectorReadinessProjectionLike = {
  readonly artifactKind: string;
  readonly schemaVersion: number;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly asOfMonth?: string;
  readonly summary?: {
    readonly coverageSkippedCount?: number;
    readonly unreviewedSuppressedCoverageCount?: number;
  };
  readonly items: readonly DetectorReadinessProjectionItemLike[];
};

export type DetectorReadinessServingRef = {
  readonly detectorId: string;
  readonly routeId: string;
  readonly scopeId: string;
  readonly month: string;
  readonly asOfMonth: string | null;
  readonly bucket: Extract<DetectorReadinessBucket, "public_finding_candidate" | "route_context">;
  readonly reviewedFrontendUse: string | null;
  readonly evidenceRefPath: string;
  readonly sourceProjectionPath: string;
  readonly readinessReason: string;
  readonly caveats: readonly string[];
};

export type DetectorReadinessServingCounts = Record<DetectorReadinessBucket, number> & {
  readonly coverageSkipped: number;
  readonly unreviewedSuppressedCoverage: number;
};

export type RouteDetectorReadinessSummary = {
  readonly routeId: string;
  readonly counts: DetectorReadinessServingCounts;
  readonly byDetector: Record<string, DetectorReadinessServingCounts>;
  readonly sourceMonths: readonly {
    readonly detectorId: string;
    readonly month: string;
    readonly asOfMonth: string | null;
  }[];
  readonly publicFindingCandidateRefs: readonly DetectorReadinessServingRef[];
  readonly routeContextRefs: readonly DetectorReadinessServingRef[];
  readonly reviewQueueCounts: Record<string, number>;
  readonly suppressedCounts: Record<string, number>;
  readonly caveats: readonly string[];
};

export type DetectorReadinessServingManifest = {
  readonly artifactKind: "detector_readiness_serving_manifest";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly sourceProjections: readonly {
    readonly artifactKind: string;
    readonly path: string;
    readonly releaseMonth: string;
    readonly asOfMonth: string | null;
    readonly generatedAt: string;
  }[];
  readonly sourceEvaluations: readonly {
    readonly detectorFamily: string;
    readonly path: string;
  }[];
  readonly summary: {
    readonly routeCount: number;
    readonly omittedNoRouteItemCount: number;
    readonly publicFindingCandidateRefCount: number;
    readonly routeContextRefCount: number;
    readonly reviewQueueItemCount: number;
    readonly suppressedItemCount: number;
    readonly coverageSkippedCount: number;
    readonly unreviewedSuppressedCoverageCount: number;
    readonly byBucket: Record<DetectorReadinessBucket, number>;
    readonly byDetector: Record<string, DetectorReadinessServingCounts>;
  };
  readonly routes: readonly RouteDetectorReadinessSummary[];
};

export type BuildDetectorReadinessServingManifestInput = {
  readonly generatedAt: string;
  readonly releaseMonth: string;
  readonly sourceProjections: readonly {
    readonly path: string;
    readonly projection: DetectorReadinessProjectionLike;
  }[];
  readonly sourceEvaluations?: readonly {
    readonly detectorFamily: string;
    readonly path: string;
  }[];
};

type MutableRouteSummary = {
  readonly routeId: string;
  readonly counts: DetectorReadinessServingCounts;
  readonly byDetector: Map<string, DetectorReadinessServingCounts>;
  readonly sourceMonths: Map<
    string,
    { detectorId: string; month: string; asOfMonth: string | null }
  >;
  readonly publicFindingCandidateRefs: DetectorReadinessServingRef[];
  readonly routeContextRefs: DetectorReadinessServingRef[];
  readonly reviewQueueCounts: Map<string, number>;
  readonly suppressedCounts: Map<string, number>;
  readonly caveats: Set<string>;
};

function emptyServingCounts(): DetectorReadinessServingCounts {
  return {
    public_finding_candidate: 0,
    route_context: 0,
    review_queue: 0,
    suppressed: 0,
    coverageSkipped: 0,
    unreviewedSuppressedCoverage: 0,
  };
}

function incrementCount(
  counts: DetectorReadinessServingCounts,
  bucket: DetectorReadinessBucket,
): void {
  counts[bucket] += 1;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function field(value: Record<string, unknown> | null, key: string): unknown {
  return value?.[key];
}

function sortedRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortedCountsRecord(
  map: Map<string, DetectorReadinessServingCounts>,
): Record<string, DetectorReadinessServingCounts> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function compactCaveats(item: DetectorReadinessProjectionItemLike): string[] {
  return uniqueSorted([...(item.caveats ?? []), ...(item.rootCauseTags ?? [])].filter(Boolean));
}

function sourceMonth(input: {
  readonly projection: DetectorReadinessProjectionLike;
  readonly item: DetectorReadinessProjectionItemLike;
}): string {
  const candidate = record(input.item.candidate);
  return (
    text(field(candidate, "month")) ??
    text(field(candidate, "asOfMonth")) ??
    input.projection.asOfMonth ??
    input.projection.releaseMonth
  );
}

function evidenceRefPath(input: {
  readonly sourceProjectionPath: string;
  readonly item: DetectorReadinessProjectionItemLike;
}): string {
  const label = record(input.item.label);
  const packetFile = text(field(label, "packetFile"));
  if (packetFile !== null) return packetFile;

  return `${input.sourceProjectionPath}#scope:${encodeURIComponent(input.item.scopeId)}`;
}

function readinessReason(item: DetectorReadinessProjectionItemLike): string {
  const label = record(item.label);
  const parts = [
    text(item.reviewedFrontendUse),
    text(item.reasonCode),
    text(field(label, "reviewerAction")),
    text(field(label, "falsePositiveRootCause")),
    ...compactCaveats(item).slice(0, 3),
  ].filter((part): part is string => part !== null && part.length > 0);
  return parts.length > 0 ? uniqueSorted(parts).join("; ") : item.bucket;
}

function servingRef(input: {
  readonly sourceProjectionPath: string;
  readonly projection: DetectorReadinessProjectionLike;
  readonly item: DetectorReadinessProjectionItemLike;
  readonly bucket: Extract<DetectorReadinessBucket, "public_finding_candidate" | "route_context">;
}): DetectorReadinessServingRef {
  return {
    detectorId: input.item.detectorId,
    routeId: input.item.routeId ?? "",
    scopeId: input.item.scopeId,
    month: sourceMonth(input),
    asOfMonth: input.projection.asOfMonth ?? null,
    bucket: input.bucket,
    reviewedFrontendUse: text(input.item.reviewedFrontendUse),
    evidenceRefPath: evidenceRefPath({
      sourceProjectionPath: input.sourceProjectionPath,
      item: input.item,
    }),
    sourceProjectionPath: input.sourceProjectionPath,
    readinessReason: readinessReason(input.item),
    caveats: compactCaveats(input.item),
  };
}

function routeSummary(routeId: string): MutableRouteSummary {
  return {
    routeId,
    counts: emptyServingCounts(),
    byDetector: new Map(),
    sourceMonths: new Map(),
    publicFindingCandidateRefs: [],
    routeContextRefs: [],
    reviewQueueCounts: new Map(),
    suppressedCounts: new Map(),
    caveats: new Set(),
  };
}

function sortedRefs(refs: readonly DetectorReadinessServingRef[]): DetectorReadinessServingRef[] {
  return [...refs].sort((left, right) =>
    `${left.detectorId}\0${left.scopeId}`.localeCompare(`${right.detectorId}\0${right.scopeId}`),
  );
}

export function buildDetectorReadinessServingManifest(
  input: BuildDetectorReadinessServingManifestInput,
): DetectorReadinessServingManifest {
  const routes = new Map<string, MutableRouteSummary>();
  const byBucket: Record<DetectorReadinessBucket, number> = {
    public_finding_candidate: 0,
    route_context: 0,
    review_queue: 0,
    suppressed: 0,
  };
  const byDetector = new Map<string, DetectorReadinessServingCounts>();
  let omittedNoRouteItemCount = 0;
  let coverageSkippedCount = 0;
  let unreviewedSuppressedCoverageCount = 0;

  for (const source of input.sourceProjections) {
    coverageSkippedCount += source.projection.summary?.coverageSkippedCount ?? 0;
    unreviewedSuppressedCoverageCount +=
      source.projection.summary?.unreviewedSuppressedCoverageCount ?? 0;

    for (const item of source.projection.items) {
      if (item.routeId === null || item.routeId.length === 0) {
        omittedNoRouteItemCount += 1;
        continue;
      }

      byBucket[item.bucket] += 1;
      const globalDetectorCounts = byDetector.get(item.detectorId) ?? emptyServingCounts();
      incrementCount(globalDetectorCounts, item.bucket);
      byDetector.set(item.detectorId, globalDetectorCounts);

      const route = routes.get(item.routeId) ?? routeSummary(item.routeId);
      incrementCount(route.counts, item.bucket);
      const routeDetectorCounts = route.byDetector.get(item.detectorId) ?? emptyServingCounts();
      incrementCount(routeDetectorCounts, item.bucket);
      route.byDetector.set(item.detectorId, routeDetectorCounts);

      const month = sourceMonth({ projection: source.projection, item });
      const sourceMonthKey = `${item.detectorId}\0${month}\0${source.projection.asOfMonth ?? ""}`;
      route.sourceMonths.set(sourceMonthKey, {
        detectorId: item.detectorId,
        month,
        asOfMonth: source.projection.asOfMonth ?? null,
      });

      for (const caveat of compactCaveats(item)) route.caveats.add(caveat);

      if (item.bucket === "public_finding_candidate") {
        route.publicFindingCandidateRefs.push(
          servingRef({
            sourceProjectionPath: source.path,
            projection: source.projection,
            item,
            bucket: "public_finding_candidate",
          }),
        );
      } else if (item.bucket === "route_context") {
        route.routeContextRefs.push(
          servingRef({
            sourceProjectionPath: source.path,
            projection: source.projection,
            item,
            bucket: "route_context",
          }),
        );
      } else if (item.bucket === "review_queue") {
        route.reviewQueueCounts.set(
          item.detectorId,
          (route.reviewQueueCounts.get(item.detectorId) ?? 0) + 1,
        );
      } else if (item.bucket === "suppressed") {
        route.suppressedCounts.set(
          item.detectorId,
          (route.suppressedCounts.get(item.detectorId) ?? 0) + 1,
        );
      }

      routes.set(item.routeId, route);
    }
  }

  const routeRows = [...routes.values()]
    .sort((left, right) => left.routeId.localeCompare(right.routeId))
    .map(
      (route): RouteDetectorReadinessSummary => ({
        routeId: route.routeId,
        counts: route.counts,
        byDetector: sortedCountsRecord(route.byDetector),
        sourceMonths: [...route.sourceMonths.values()].sort((left, right) =>
          `${left.detectorId}\0${left.month}\0${left.asOfMonth ?? ""}`.localeCompare(
            `${right.detectorId}\0${right.month}\0${right.asOfMonth ?? ""}`,
          ),
        ),
        publicFindingCandidateRefs: sortedRefs(route.publicFindingCandidateRefs),
        routeContextRefs: sortedRefs(route.routeContextRefs),
        reviewQueueCounts: sortedRecord(route.reviewQueueCounts),
        suppressedCounts: sortedRecord(route.suppressedCounts),
        caveats: uniqueSorted(route.caveats),
      }),
    );

  return {
    artifactKind: "detector_readiness_serving_manifest",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    releaseMonth: input.releaseMonth,
    sourceProjections: input.sourceProjections.map((source) => ({
      artifactKind: source.projection.artifactKind,
      path: source.path,
      releaseMonth: source.projection.releaseMonth,
      asOfMonth: source.projection.asOfMonth ?? null,
      generatedAt: source.projection.generatedAt,
    })),
    sourceEvaluations: [...(input.sourceEvaluations ?? [])],
    summary: {
      routeCount: routeRows.length,
      omittedNoRouteItemCount,
      publicFindingCandidateRefCount: routeRows.reduce(
        (sum, route) => sum + route.publicFindingCandidateRefs.length,
        0,
      ),
      routeContextRefCount: routeRows.reduce(
        (sum, route) => sum + route.routeContextRefs.length,
        0,
      ),
      reviewQueueItemCount: byBucket.review_queue,
      suppressedItemCount: byBucket.suppressed,
      coverageSkippedCount,
      unreviewedSuppressedCoverageCount,
      byBucket,
      byDetector: sortedCountsRecord(byDetector),
    },
    routes: routeRows,
  };
}
