import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import type { Tier2VocabConsumerIndexArtifact } from "./_vocab-consumer-index.ts";

const ARTIFACT_KIND = "bp.tier2_vocab_materialized_views.v1";
const SUMMARY_KIND = "bp.tier2_vocab_materialized_views_summary.v1";

type JsonRecord = Record<string, unknown>;
type ConsumerSurfaceRow = Tier2VocabConsumerIndexArtifact["surfaceRows"][number];
type ConsumerFieldRow = Tier2VocabConsumerIndexArtifact["fieldRows"][number];
type ConsumerUnresolvedRow = Tier2VocabConsumerIndexArtifact["unresolvedRows"][number];
type ConsumerSourceRow = Tier2VocabConsumerIndexArtifact["sourceRows"][number];

type RouteScope = "route_linked" | "source_context";
type DetectorFeatureUse =
  | "metric_feature"
  | "event_or_treatment_feature"
  | "claim_feature"
  | "entity_feature"
  | "document_context_feature"
  | "other_feature";

type RouteEvidenceSurfaceSample = {
  surfaceId: string;
  surfaceKind: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  displayLabel: string | null;
  artifactPath: string;
  payloadSchemaId: string | null;
  canonicalPayload: JsonRecord;
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  fieldKeys: string[];
  coarseFamilies: string[];
  supportIds: string[];
  evidencePointerIds: string[];
};

type RouteEvidenceBundle = {
  routeId: string;
  surfaceCount: number;
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  sourceCount: number;
  sourceIds: string[];
  sourceGroupCounts: Record<string, number>;
  sourcePageRefs: Array<{
    sourceId: string;
    sourceTitle: string | null;
    pageNumbers: number[];
  }>;
  surfaceKindCounts: Record<string, number>;
  keyCounts: Record<string, number>;
  coarseFamilyCounts: Record<string, number>;
  featureUseCounts: Record<DetectorFeatureUse, number>;
  timelineCandidateSurfaceCount: number;
  metricObservationSurfaceCount: number;
  treatmentSurfaceCount: number;
  claimSurfaceCount: number;
  supportIds: string[];
  evidencePointerIds: string[];
  evidencePointerCount: number;
  sampleSurfaces: RouteEvidenceSurfaceSample[];
};

type DetectorFeatureRow = {
  featureId: string;
  featureUse: DetectorFeatureUse;
  routeScope: RouteScope;
  routeIds: string[];
  surfaceId: string;
  sourceId: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  surfaceKind: string;
  displayLabel: string | null;
  artifactPath: string;
  payloadSchemaId: string | null;
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  canonicalLeafId: string;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  modifiers: Record<string, string[]>;
  supportIds: string[];
  evidencePointerIds: string[];
  projectionInputCount: number;
};

type UnresolvedReviewItem = {
  reviewItemId: string;
  keyId: string;
  decision: string;
  rawValue: string;
  reason: string;
  coarseFamily: string | null;
  rowCount: number;
  surfaceCount: number;
  sourceCount: number;
  routeIds: string[];
  sourceIds: string[];
  surfaceKindCounts: Record<string, number>;
  supportIds: string[];
  evidencePointerIds: string[];
  sampleSurfaces: Array<{
    surfaceId: string;
    surfaceKind: string;
    sourceId: string | null;
    sourceTitle: string | null;
    pageNumbers: number[];
    displayLabel: string | null;
    artifactPath: string;
  }>;
};

type SourceCoverageRow = ConsumerSourceRow & {
  routeCount: number;
  routeIds: string[];
  keyCounts: Record<string, number>;
  unresolvedByDecision: Record<string, number>;
  evidencePointerIds: string[];
  evidencePointerCount: number;
  sampleSurfaces: Array<{
    surfaceId: string;
    surfaceKind: string;
    routeIds: string[];
    pageNumbers: number[];
    displayLabel: string | null;
    artifactPath: string;
  }>;
};

export type Tier2VocabMaterializedViewsArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceConsumerIndexPath: string;
  sourceConsumerIndexGeneratedAt: string;
  summary: {
    consumerSurfaceRowCount: number;
    consumerFieldRowCount: number;
    consumerUnresolvedRowCount: number;
    routeEvidenceBundleCount: number;
    routeLinkedSurfaceCount: number;
    detectorFeatureRowCount: number;
    routeLinkedDetectorFeatureRowCount: number;
    sourceContextDetectorFeatureRowCount: number;
    unresolvedReviewItemCount: number;
    sourceCoverageRowCount: number;
    featureUseCounts: Record<DetectorFeatureUse, number>;
    topRouteEvidenceBundles: Array<{
      routeId: string;
      surfaceCount: number;
      mappedFieldCount: number;
      unresolvedFieldCount: number;
      sourceCount: number;
    }>;
    deferredQaFlags: {
      taxonomyQaDeferred: true;
      fieldRowsWithNullStringCoarseFamily: number;
      fieldRowsWithOtherCoarseFamily: number;
      unresolvedRowsWithNullStringCoarseFamily: number;
      unresolvedRowsWithMissingCoarseFamily: number;
      preserveRawUnresolvedRows: number;
    };
    sourceConsumerIndexSummary: Tier2VocabConsumerIndexArtifact["summary"];
  };
  routeEvidenceBundles: RouteEvidenceBundle[];
  detectorFeatureRows: DetectorFeatureRow[];
  unresolvedReviewQueue: UnresolvedReviewItem[];
  sourceCoverageRows: SourceCoverageRow[];
};

export type BuildTier2VocabMaterializedViewsArgs = {
  consumerIndexPath: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
  maxRouteSurfaceSamples?: number;
  maxUnresolvedSamples?: number;
  maxSourceSurfaceSamples?: number;
};

type CliArgs = Partial<BuildTier2VocabMaterializedViewsArgs>;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.length > 0 ? [item] : []))
    : [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function finalizeRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function shortHash(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 12);
}

function stableFeatureId(row: ConsumerFieldRow, routeIds: string[]): string {
  return `feature_${shortHash(
    [
      row.surfaceId,
      row.keyId,
      row.sourceFieldPath,
      row.targetPayloadPath,
      row.rawValue,
      row.canonicalLeafId,
      routeIds.join(","),
    ].join("\u001f"),
  )}`;
}

function reviewItemId(row: ConsumerUnresolvedRow): string {
  return `review_${shortHash(
    [row.keyId, row.decision, row.rawValue, row.reason, row.coarseFamily ?? ""].join("\u001f"),
  )}`;
}

function sourceKey(sourceId: string | null): string {
  return sourceId ?? "unknown_source";
}

function routeIdsForField(row: ConsumerFieldRow, surface: ConsumerSurfaceRow | undefined): string[] {
  return uniqueSorted([...(surface?.routeIds ?? []), ...stringArray(row.modifiers["routeIds"])]);
}

function routeIdsForUnresolved(row: ConsumerUnresolvedRow, surface: ConsumerSurfaceRow | undefined): string[] {
  return uniqueSorted([...(surface?.routeIds ?? []), ...stringArray(row.modifiers?.["routeIds"])]);
}

function featureUseForKey(keyId: string): DetectorFeatureUse {
  if (keyId === "metricFamily" || keyId === "metricSubjectFamily" || keyId === "metricUnit") {
    return "metric_feature";
  }
  if (keyId === "eventFamily" || keyId === "eventSubtype" || keyId === "eventTreatmentFamily") {
    return "event_or_treatment_feature";
  }
  if (keyId === "claimKind" || keyId === "claimResearchUseTag") return "claim_feature";
  if (keyId === "entityKind" || keyId === "entityRole") return "entity_feature";
  if (keyId === "contextKind" || keyId === "questionKind" || keyId === "tableKind") {
    return "document_context_feature";
  }
  return "other_feature";
}

function routeBundleSampleFor(input: {
  surface: ConsumerSurfaceRow;
  fields: ConsumerFieldRow[];
  unresolved: ConsumerUnresolvedRow[];
}): RouteEvidenceSurfaceSample {
  return {
    surfaceId: input.surface.surfaceId,
    surfaceKind: input.surface.surfaceKind,
    sourceId: input.surface.sourceId,
    sourceTitle: input.surface.sourceTitle,
    sourceGroup: input.surface.sourceGroup,
    pageNumbers: input.surface.pageNumbers,
    displayLabel: input.surface.displayLabel,
    artifactPath: input.surface.artifactPath,
    payloadSchemaId: input.surface.payloadSchemaId,
    canonicalPayload: input.surface.canonicalPayload,
    mappedFieldCount: input.fields.length,
    unresolvedFieldCount: input.unresolved.length,
    fieldKeys: uniqueSorted([
      ...input.fields.map((row) => row.keyId),
      ...input.unresolved.map((row) => row.keyId),
    ]),
    coarseFamilies: uniqueSorted([
      ...input.fields.map((row) => row.coarseFamily),
      ...input.unresolved.flatMap((row) => (row.coarseFamily === null ? [] : [row.coarseFamily])),
    ]),
    supportIds: uniqueSorted([
      ...input.fields.flatMap((row) => row.evidence.supportIds),
      ...input.unresolved.flatMap((row) => row.evidence.supportIds),
    ]),
    evidencePointerIds: uniqueSorted([
      ...input.fields.flatMap((row) => row.evidence.evidencePointerIds),
      ...input.unresolved.flatMap((row) => row.evidence.evidencePointerIds),
    ]),
  };
}

function sortSurfaceSamples(left: RouteEvidenceSurfaceSample, right: RouteEvidenceSurfaceSample): number {
  return (
    right.mappedFieldCount +
      right.unresolvedFieldCount -
      (left.mappedFieldCount + left.unresolvedFieldCount) ||
    right.evidencePointerIds.length - left.evidencePointerIds.length ||
    left.surfaceId.localeCompare(right.surfaceId)
  );
}

function buildMaterializedViews(input: {
  consumerIndex: Tier2VocabConsumerIndexArtifact;
  sourceConsumerIndexPath: string;
  generatedAt: string;
  maxRouteSurfaceSamples: number;
  maxUnresolvedSamples: number;
  maxSourceSurfaceSamples: number;
}): Tier2VocabMaterializedViewsArtifact {
  const surfaceById = new Map(input.consumerIndex.surfaceRows.map((row) => [row.surfaceId, row]));
  const fieldsBySurfaceId = new Map<string, ConsumerFieldRow[]>();
  const unresolvedBySurfaceId = new Map<string, ConsumerUnresolvedRow[]>();

  for (const row of input.consumerIndex.fieldRows) {
    const rows = fieldsBySurfaceId.get(row.surfaceId) ?? [];
    rows.push(row);
    fieldsBySurfaceId.set(row.surfaceId, rows);
  }
  for (const row of input.consumerIndex.unresolvedRows) {
    const rows = unresolvedBySurfaceId.get(row.surfaceId) ?? [];
    rows.push(row);
    unresolvedBySurfaceId.set(row.surfaceId, rows);
  }

  const detectorFeatureRows = input.consumerIndex.fieldRows
    .map((row): DetectorFeatureRow => {
      const surface = surfaceById.get(row.surfaceId);
      const routeIds = routeIdsForField(row, surface);
      const featureUse = featureUseForKey(row.keyId);
      return {
        featureId: stableFeatureId(row, routeIds),
        featureUse,
        routeScope: routeIds.length > 0 ? "route_linked" : "source_context",
        routeIds,
        surfaceId: row.surfaceId,
        sourceId: row.sourceId,
        sourceGroup: row.sourceGroup,
        pageNumbers: row.pageNumbers,
        surfaceKind: row.surfaceKind,
        displayLabel: surface?.displayLabel ?? null,
        artifactPath: surface?.artifactPath ?? "",
        payloadSchemaId: surface?.payloadSchemaId ?? null,
        keyId: row.keyId,
        sourceFieldPath: row.sourceFieldPath,
        targetPayloadPath: row.targetPayloadPath,
        rawValue: row.rawValue,
        canonicalLeafId: row.canonicalLeafId,
        canonicalLeafLabel: row.canonicalLeafLabel,
        coarseFamily: row.coarseFamily,
        modifiers: row.modifiers,
        supportIds: row.evidence.supportIds,
        evidencePointerIds: row.evidence.evidencePointerIds,
        projectionInputCount: row.projectionInputCount,
      };
    })
    .sort(
      (left, right) =>
        left.featureUse.localeCompare(right.featureUse) ||
        left.keyId.localeCompare(right.keyId) ||
        left.canonicalLeafId.localeCompare(right.canonicalLeafId) ||
        left.surfaceId.localeCompare(right.surfaceId) ||
        left.featureId.localeCompare(right.featureId),
    );

  const featureRowsBySurfaceId = new Map<string, DetectorFeatureRow[]>();
  const featureUseCounts: Record<DetectorFeatureUse, number> = {
    claim_feature: 0,
    document_context_feature: 0,
    entity_feature: 0,
    event_or_treatment_feature: 0,
    metric_feature: 0,
    other_feature: 0,
  };
  for (const row of detectorFeatureRows) {
    const rows = featureRowsBySurfaceId.get(row.surfaceId) ?? [];
    rows.push(row);
    featureRowsBySurfaceId.set(row.surfaceId, rows);
    featureUseCounts[row.featureUse] += 1;
  }

  const routeAccumulator = new Map<
    string,
    {
      routeId: string;
      surfaceIds: Set<string>;
      mappedFieldCount: number;
      unresolvedFieldCount: number;
      sourceIds: Set<string>;
      sourcePageRefs: Map<string, { sourceId: string; sourceTitle: string | null; pageNumbers: Set<number> }>;
      sourceGroupCounts: Record<string, number>;
      surfaceKindCounts: Record<string, number>;
      keyCounts: Record<string, number>;
      coarseFamilyCounts: Record<string, number>;
      featureUseCounts: Record<DetectorFeatureUse, number>;
      supportIds: Set<string>;
      evidencePointerIds: Set<string>;
      samples: RouteEvidenceSurfaceSample[];
      timelineCandidateSurfaceCount: number;
      metricObservationSurfaceCount: number;
      treatmentSurfaceCount: number;
      claimSurfaceCount: number;
    }
  >();

  let routeLinkedSurfaceCount = 0;
  for (const surface of input.consumerIndex.surfaceRows) {
    if (surface.routeIds.length === 0) continue;
    routeLinkedSurfaceCount += 1;
    const fields = fieldsBySurfaceId.get(surface.surfaceId) ?? [];
    const unresolved = unresolvedBySurfaceId.get(surface.surfaceId) ?? [];
    const sample = routeBundleSampleFor({ surface, fields, unresolved });
    for (const routeId of surface.routeIds) {
      let route = routeAccumulator.get(routeId);
      if (route === undefined) {
        route = {
          routeId,
          surfaceIds: new Set<string>(),
          mappedFieldCount: 0,
          unresolvedFieldCount: 0,
          sourceIds: new Set<string>(),
          sourcePageRefs: new Map(),
          sourceGroupCounts: {},
          surfaceKindCounts: {},
          keyCounts: {},
          coarseFamilyCounts: {},
          featureUseCounts: {
            claim_feature: 0,
            document_context_feature: 0,
            entity_feature: 0,
            event_or_treatment_feature: 0,
            metric_feature: 0,
            other_feature: 0,
          },
          supportIds: new Set<string>(),
          evidencePointerIds: new Set<string>(),
          samples: [],
          timelineCandidateSurfaceCount: 0,
          metricObservationSurfaceCount: 0,
          treatmentSurfaceCount: 0,
          claimSurfaceCount: 0,
        };
        routeAccumulator.set(routeId, route);
      }
      route.surfaceIds.add(surface.surfaceId);
      route.mappedFieldCount += fields.length;
      route.unresolvedFieldCount += unresolved.length;
      if (surface.sourceId !== null) {
        route.sourceIds.add(surface.sourceId);
        const ref = route.sourcePageRefs.get(surface.sourceId) ?? {
          sourceId: surface.sourceId,
          sourceTitle: surface.sourceTitle,
          pageNumbers: new Set<number>(),
        };
        for (const page of surface.pageNumbers) ref.pageNumbers.add(page);
        route.sourcePageRefs.set(surface.sourceId, ref);
      }
      increment(route.sourceGroupCounts, surface.sourceGroup ?? "unknown_source_group");
      increment(route.surfaceKindCounts, surface.surfaceKind);
      for (const field of fields) {
        increment(route.keyCounts, field.keyId);
        increment(route.coarseFamilyCounts, field.coarseFamily);
      }
      for (const field of unresolved) {
        increment(route.keyCounts, field.keyId);
        if (field.coarseFamily !== null) increment(route.coarseFamilyCounts, field.coarseFamily);
      }
      for (const feature of featureRowsBySurfaceId.get(surface.surfaceId) ?? []) {
        route.featureUseCounts[feature.featureUse] += 1;
      }
      for (const supportId of sample.supportIds) route.supportIds.add(supportId);
      for (const pointerId of sample.evidencePointerIds) route.evidencePointerIds.add(pointerId);
      route.samples.push(sample);
      if (surface.surfaceKind === "event_candidate" || surface.surfaceKind === "service_change_candidate") {
        route.timelineCandidateSurfaceCount += 1;
      }
      if (surface.surfaceKind === "metric_observation") route.metricObservationSurfaceCount += 1;
      if (surface.surfaceKind === "treatment_component") route.treatmentSurfaceCount += 1;
      if (surface.surfaceKind === "claim" || surface.surfaceKind === "causal_claim") {
        route.claimSurfaceCount += 1;
      }
    }
  }

  const routeEvidenceBundles: RouteEvidenceBundle[] = [...routeAccumulator.values()]
    .map((route) => ({
      routeId: route.routeId,
      surfaceCount: route.surfaceIds.size,
      mappedFieldCount: route.mappedFieldCount,
      unresolvedFieldCount: route.unresolvedFieldCount,
      sourceCount: route.sourceIds.size,
      sourceIds: uniqueSorted([...route.sourceIds]),
      sourceGroupCounts: finalizeRecord(route.sourceGroupCounts),
      sourcePageRefs: [...route.sourcePageRefs.values()]
        .map((ref) => ({
          sourceId: ref.sourceId,
          sourceTitle: ref.sourceTitle,
          pageNumbers: [...ref.pageNumbers].sort((left, right) => left - right),
        }))
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
      surfaceKindCounts: finalizeRecord(route.surfaceKindCounts),
      keyCounts: finalizeRecord(route.keyCounts),
      coarseFamilyCounts: finalizeRecord(route.coarseFamilyCounts),
      featureUseCounts: route.featureUseCounts,
      timelineCandidateSurfaceCount: route.timelineCandidateSurfaceCount,
      metricObservationSurfaceCount: route.metricObservationSurfaceCount,
      treatmentSurfaceCount: route.treatmentSurfaceCount,
      claimSurfaceCount: route.claimSurfaceCount,
      supportIds: uniqueSorted([...route.supportIds]),
      evidencePointerIds: uniqueSorted([...route.evidencePointerIds]),
      evidencePointerCount: route.evidencePointerIds.size,
      sampleSurfaces: route.samples.sort(sortSurfaceSamples).slice(0, input.maxRouteSurfaceSamples),
    }))
    .sort(
      (left, right) =>
        right.surfaceCount - left.surfaceCount ||
        right.mappedFieldCount - left.mappedFieldCount ||
        left.routeId.localeCompare(right.routeId),
    );

  const unresolvedAccumulator = new Map<
    string,
    {
      keyId: string;
      decision: string;
      rawValue: string;
      reason: string;
      coarseFamily: string | null;
      surfaceIds: Set<string>;
      sourceIds: Set<string>;
      routeIds: Set<string>;
      surfaceKindCounts: Record<string, number>;
      supportIds: Set<string>;
      evidencePointerIds: Set<string>;
      rowCount: number;
      samples: UnresolvedReviewItem["sampleSurfaces"];
    }
  >();
  for (const row of input.consumerIndex.unresolvedRows) {
    const surface = surfaceById.get(row.surfaceId);
    const id = reviewItemId(row);
    const item = unresolvedAccumulator.get(id) ?? {
      keyId: row.keyId,
      decision: row.decision,
      rawValue: row.rawValue,
      reason: row.reason,
      coarseFamily: row.coarseFamily,
      surfaceIds: new Set<string>(),
      sourceIds: new Set<string>(),
      routeIds: new Set<string>(),
      surfaceKindCounts: {},
      supportIds: new Set<string>(),
      evidencePointerIds: new Set<string>(),
      rowCount: 0,
      samples: [],
    };
    item.rowCount += 1;
    item.surfaceIds.add(row.surfaceId);
    if (row.sourceId !== null) item.sourceIds.add(row.sourceId);
    for (const routeId of routeIdsForUnresolved(row, surface)) item.routeIds.add(routeId);
    increment(item.surfaceKindCounts, row.surfaceKind);
    for (const supportId of row.evidence.supportIds) item.supportIds.add(supportId);
    for (const pointerId of row.evidence.evidencePointerIds) item.evidencePointerIds.add(pointerId);
    if (surface !== undefined && item.samples.length < input.maxUnresolvedSamples) {
      item.samples.push({
        surfaceId: surface.surfaceId,
        surfaceKind: surface.surfaceKind,
        sourceId: surface.sourceId,
        sourceTitle: surface.sourceTitle,
        pageNumbers: surface.pageNumbers,
        displayLabel: surface.displayLabel,
        artifactPath: surface.artifactPath,
      });
    }
    unresolvedAccumulator.set(id, item);
  }
  const unresolvedReviewQueue: UnresolvedReviewItem[] = [...unresolvedAccumulator.entries()]
    .map(([id, item]) => ({
      reviewItemId: id,
      keyId: item.keyId,
      decision: item.decision,
      rawValue: item.rawValue,
      reason: item.reason,
      coarseFamily: item.coarseFamily,
      rowCount: item.rowCount,
      surfaceCount: item.surfaceIds.size,
      sourceCount: item.sourceIds.size,
      routeIds: uniqueSorted([...item.routeIds]),
      sourceIds: uniqueSorted([...item.sourceIds]),
      surfaceKindCounts: finalizeRecord(item.surfaceKindCounts),
      supportIds: uniqueSorted([...item.supportIds]),
      evidencePointerIds: uniqueSorted([...item.evidencePointerIds]),
      sampleSurfaces: item.samples.sort((left, right) => left.surfaceId.localeCompare(right.surfaceId)),
    }))
    .sort(
      (left, right) =>
        right.rowCount - left.rowCount ||
        right.surfaceCount - left.surfaceCount ||
        left.keyId.localeCompare(right.keyId) ||
        left.rawValue.localeCompare(right.rawValue),
    );

  const sourceSurfaceIds = new Map<string, ConsumerSurfaceRow[]>();
  for (const surface of input.consumerIndex.surfaceRows) {
    const rows = sourceSurfaceIds.get(sourceKey(surface.sourceId)) ?? [];
    rows.push(surface);
    sourceSurfaceIds.set(sourceKey(surface.sourceId), rows);
  }
  const sourceCoverageRows: SourceCoverageRow[] = input.consumerIndex.sourceRows
    .map((source) => {
      const surfaces = sourceSurfaceIds.get(source.sourceId) ?? [];
      const routeIds = uniqueSorted(surfaces.flatMap((surface) => surface.routeIds));
      const keyCounts: Record<string, number> = {};
      const unresolvedByDecision: Record<string, number> = {};
      const evidencePointerIds = new Set<string>();
      for (const surface of surfaces) {
        for (const field of fieldsBySurfaceId.get(surface.surfaceId) ?? []) {
          increment(keyCounts, field.keyId);
          for (const pointerId of field.evidence.evidencePointerIds) evidencePointerIds.add(pointerId);
        }
        for (const row of unresolvedBySurfaceId.get(surface.surfaceId) ?? []) {
          increment(keyCounts, row.keyId);
          increment(unresolvedByDecision, row.decision);
          for (const pointerId of row.evidence.evidencePointerIds) evidencePointerIds.add(pointerId);
        }
      }
      return {
        ...source,
        routeCount: routeIds.length,
        routeIds,
        keyCounts: finalizeRecord(keyCounts),
        unresolvedByDecision: finalizeRecord(unresolvedByDecision),
        evidencePointerIds: uniqueSorted([...evidencePointerIds]),
        evidencePointerCount: evidencePointerIds.size,
        sampleSurfaces: surfaces
          .slice()
          .sort(
            (left, right) =>
              right.mappedFieldCount +
                right.unresolvedFieldCount -
                (left.mappedFieldCount + left.unresolvedFieldCount) ||
              left.surfaceId.localeCompare(right.surfaceId),
          )
          .slice(0, input.maxSourceSurfaceSamples)
          .map((surface) => ({
            surfaceId: surface.surfaceId,
            surfaceKind: surface.surfaceKind,
            routeIds: surface.routeIds,
            pageNumbers: surface.pageNumbers,
            displayLabel: surface.displayLabel,
            artifactPath: surface.artifactPath,
          })),
      };
    })
    .sort(
      (left, right) =>
        right.routeCount - left.routeCount ||
        right.surfaceCount - left.surfaceCount ||
        left.sourceId.localeCompare(right.sourceId),
    );

  const routeLinkedDetectorFeatureRowCount = detectorFeatureRows.filter(
    (row) => row.routeScope === "route_linked",
  ).length;
  const deferredQaFlags = {
    taxonomyQaDeferred: true as const,
    fieldRowsWithNullStringCoarseFamily: input.consumerIndex.fieldRows.filter(
      (row) => row.coarseFamily === "null",
    ).length,
    fieldRowsWithOtherCoarseFamily: input.consumerIndex.fieldRows.filter(
      (row) => row.coarseFamily === "other",
    ).length,
    unresolvedRowsWithNullStringCoarseFamily: input.consumerIndex.unresolvedRows.filter(
      (row) => row.coarseFamily === "null",
    ).length,
    unresolvedRowsWithMissingCoarseFamily: input.consumerIndex.unresolvedRows.filter(
      (row) => row.coarseFamily === null,
    ).length,
    preserveRawUnresolvedRows: input.consumerIndex.unresolvedRows.filter(
      (row) => row.decision === "preserve_raw",
    ).length,
  };

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceConsumerIndexPath: input.sourceConsumerIndexPath,
    sourceConsumerIndexGeneratedAt: input.consumerIndex.generatedAt,
    summary: {
      consumerSurfaceRowCount: input.consumerIndex.surfaceRows.length,
      consumerFieldRowCount: input.consumerIndex.fieldRows.length,
      consumerUnresolvedRowCount: input.consumerIndex.unresolvedRows.length,
      routeEvidenceBundleCount: routeEvidenceBundles.length,
      routeLinkedSurfaceCount,
      detectorFeatureRowCount: detectorFeatureRows.length,
      routeLinkedDetectorFeatureRowCount,
      sourceContextDetectorFeatureRowCount:
        detectorFeatureRows.length - routeLinkedDetectorFeatureRowCount,
      unresolvedReviewItemCount: unresolvedReviewQueue.length,
      sourceCoverageRowCount: sourceCoverageRows.length,
      featureUseCounts,
      topRouteEvidenceBundles: routeEvidenceBundles.slice(0, 20).map((bundle) => ({
        routeId: bundle.routeId,
        surfaceCount: bundle.surfaceCount,
        mappedFieldCount: bundle.mappedFieldCount,
        unresolvedFieldCount: bundle.unresolvedFieldCount,
        sourceCount: bundle.sourceCount,
      })),
      deferredQaFlags,
      sourceConsumerIndexSummary: input.consumerIndex.summary,
    },
    routeEvidenceBundles,
    detectorFeatureRows,
    unresolvedReviewQueue,
    sourceCoverageRows,
  };
}

function renderMarkdown(artifact: Tier2VocabMaterializedViewsArtifact): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Vocab Materialized Views");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Route evidence bundles: ${artifact.summary.routeEvidenceBundleCount}`);
  lines.push(`- Route-linked surfaces: ${artifact.summary.routeLinkedSurfaceCount}`);
  lines.push(`- Detector feature rows: ${artifact.summary.detectorFeatureRowCount}`);
  lines.push(
    `- Route-linked detector feature rows: ${artifact.summary.routeLinkedDetectorFeatureRowCount}`,
  );
  lines.push(
    `- Source-context detector feature rows: ${artifact.summary.sourceContextDetectorFeatureRowCount}`,
  );
  lines.push(`- Unresolved review items: ${artifact.summary.unresolvedReviewItemCount}`);
  lines.push(`- Source coverage rows: ${artifact.summary.sourceCoverageRowCount}`);
  lines.push("");
  lines.push("## Feature Uses");
  lines.push("");
  lines.push("| Use | Rows |");
  lines.push("|---|---:|");
  for (const [use, count] of Object.entries(artifact.summary.featureUseCounts)) {
    lines.push(`| ${use} | ${count} |`);
  }
  lines.push("");
  lines.push("## Top Route Evidence Bundles");
  lines.push("");
  lines.push("| Route | Surfaces | Fields | Unresolved | Sources |");
  lines.push("|---|---:|---:|---:|---:|");
  for (const route of artifact.summary.topRouteEvidenceBundles) {
    lines.push(
      `| ${route.routeId} | ${route.surfaceCount} | ${route.mappedFieldCount} | ${route.unresolvedFieldCount} | ${route.sourceCount} |`,
    );
  }
  lines.push("");
  lines.push("## Top Unresolved Review Items");
  lines.push("");
  lines.push("| Key | Decision | Raw value | Rows | Surfaces | Routes |");
  lines.push("|---|---|---|---:|---:|---:|");
  for (const item of artifact.unresolvedReviewQueue.slice(0, 20)) {
    const rawValue = item.rawValue.replaceAll("|", "\\|");
    lines.push(
      `| ${item.keyId} | ${item.decision} | ${rawValue} | ${item.rowCount} | ${item.surfaceCount} | ${item.routeIds.length} |`,
    );
  }
  lines.push("");
  lines.push("## Deferred QA Flags");
  lines.push("");
  lines.push(
    `- Field rows with coarseFamily "null": ${artifact.summary.deferredQaFlags.fieldRowsWithNullStringCoarseFamily}`,
  );
  lines.push(
    `- Field rows with coarseFamily "other": ${artifact.summary.deferredQaFlags.fieldRowsWithOtherCoarseFamily}`,
  );
  lines.push(
    `- Unresolved rows with missing coarseFamily: ${artifact.summary.deferredQaFlags.unresolvedRowsWithMissingCoarseFamily}`,
  );
  lines.push(
    `- Preserve-raw unresolved rows: ${artifact.summary.deferredQaFlags.preserveRawUnresolvedRows}`,
  );
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This artifact is derived from the compact vocab consumer index.");
  lines.push("- It does not correct the deferred coarse-family taxonomy QA issues.");
  lines.push("- Route evidence bundles are materialized for route-addressed document surfaces.");
  lines.push("- Detector feature rows are extraction-vocabulary features, not final detector score vectors.");
  lines.push("- Use `artifactPath`, `supportIds`, and `evidencePointerIds` to reopen source proof.");
  return `${lines.join("\n")}\n`;
}

export async function buildTier2VocabMaterializedViews(
  args: BuildTier2VocabMaterializedViewsArgs,
): Promise<Tier2VocabMaterializedViewsArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceConsumerIndexPath = fromCliPath(args.consumerIndexPath);
  const consumerIndex = (await Bun.file(sourceConsumerIndexPath).json()) as Tier2VocabConsumerIndexArtifact;
  if (!Array.isArray(consumerIndex.surfaceRows)) {
    throw new Error(`Consumer index has no surfaceRows array: ${sourceConsumerIndexPath}`);
  }
  if (!Array.isArray(consumerIndex.fieldRows)) {
    throw new Error(`Consumer index has no fieldRows array: ${sourceConsumerIndexPath}`);
  }
  if (!Array.isArray(consumerIndex.unresolvedRows)) {
    throw new Error(`Consumer index has no unresolvedRows array: ${sourceConsumerIndexPath}`);
  }
  if (!Array.isArray(consumerIndex.sourceRows)) {
    throw new Error(`Consumer index has no sourceRows array: ${sourceConsumerIndexPath}`);
  }
  return buildMaterializedViews({
    consumerIndex,
    sourceConsumerIndexPath,
    generatedAt,
    maxRouteSurfaceSamples: args.maxRouteSurfaceSamples ?? 25,
    maxUnresolvedSamples: args.maxUnresolvedSamples ?? 8,
    maxSourceSurfaceSamples: args.maxSourceSurfaceSamples ?? 12,
  });
}

export async function runTier2VocabMaterializedViews(
  args: BuildTier2VocabMaterializedViewsArgs,
): Promise<{
  artifact: Tier2VocabMaterializedViewsArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2VocabMaterializedViews(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(defaultArtifactRootPath(), "docs", "tier2-vocab-materialized-views", "vocab-materialized-views.json"),
  );
  const markdownPath =
    args.markdownPath === undefined ? outputPath.replace(/\.json$/, ".md") : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? outputPath.replace(/\.json$/, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flag} requires a non-negative integer.`);
  }
  return parsed;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--consumer-index") {
      if (value === undefined) throw new Error("--consumer-index requires a value.");
      args.consumerIndexPath = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--markdown") {
      if (value === undefined) throw new Error("--markdown requires a value.");
      args.markdownPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else if (arg === "--max-route-surface-samples") {
      if (value === undefined) throw new Error("--max-route-surface-samples requires a value.");
      args.maxRouteSurfaceSamples = parsePositiveInteger(value, "--max-route-surface-samples");
      index += 1;
    } else if (arg === "--max-unresolved-samples") {
      if (value === undefined) throw new Error("--max-unresolved-samples requires a value.");
      args.maxUnresolvedSamples = parsePositiveInteger(value, "--max-unresolved-samples");
      index += 1;
    } else if (arg === "--max-source-surface-samples") {
      if (value === undefined) throw new Error("--max-source-surface-samples requires a value.");
      args.maxSourceSurfaceSamples = parsePositiveInteger(value, "--max-source-surface-samples");
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 vocab-materialized-views option: ${arg}`);
    }
  }
  return args;
}

export async function runTier2VocabMaterializedViewsFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.consumerIndexPath === undefined) {
    throw new Error("Provide --consumer-index.");
  }
  const result = await runTier2VocabMaterializedViews({
    consumerIndexPath: args.consumerIndexPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.maxRouteSurfaceSamples === undefined
      ? {}
      : { maxRouteSurfaceSamples: args.maxRouteSurfaceSamples }),
    ...(args.maxUnresolvedSamples === undefined ? {} : { maxUnresolvedSamples: args.maxUnresolvedSamples }),
    ...(args.maxSourceSurfaceSamples === undefined
      ? {}
      : { maxSourceSurfaceSamples: args.maxSourceSurfaceSamples }),
  });
  console.log(
    `tier2-vocab-materialized-views: routes=${result.artifact.summary.routeEvidenceBundleCount} features=${result.artifact.summary.detectorFeatureRowCount} unresolved=${result.artifact.summary.unresolvedReviewItemCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}
