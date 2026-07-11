import { Effect } from "effect";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
  STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE,
  type StudioRouteEvidenceArtifact,
  StudioRouteEvidenceArtifactSchema,
  type StudioRouteEvidenceBundle,
  type StudioRouteEvidenceCitation,
  StudioRouteEvidenceCitationSchema,
  type StudioRouteEvidenceIndex,
  StudioRouteEvidenceIndexSchema,
  type StudioRouteEvidenceIntervention,
  type StudioRouteEvidenceMetricClaim,
  type StudioRouteEvidenceProject,
  type StudioRouteEvidenceSourceGap,
  type StudioRouteEvidenceTimelineEvent,
  studioRouteEvidenceBundleKey,
} from "@bp/domain/studio/route-evidence";
import { type StudioRoute, StudioRoutesResponseSchema } from "@bp/domain/studio/routes";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import {
  busRouteKeysFromText,
  busRouteKeysFromValue,
  type JsonObject,
  type JsonValue,
  loadMtaWikiCanonicalCorpus,
  type MtaWikiCanonicalCorpus,
  type MtaWikiCanonicalRecord,
  type MtaWikiEvidenceRef,
  type MtaWikiRouteAnchor,
  normalizeBusRouteKey,
} from "../../lib/mta-wiki-canonical.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const defaultRoutesPath = fromRepoRoot("data/artifacts/studio/v1/routes.json");
const defaultOutputPath = fromRepoRoot("data/artifacts/studio/v2/wiki/route-evidence.json");
const defaultSourceArtifactKey = "studio/v2/wiki/route-evidence.json";

const relationFamiliesForProjectHop = new Set([
  "treatment_context",
  "timeline_context",
  "metric_context",
  "claim_context",
]);

const directRouteFactFamilies = new Set([
  "treatment_context",
  "timeline_context",
  "metric_context",
  "claim_context",
]);

const unsupportedRelationEndpointPrefixes = new Set([
  "claim",
  "corridor",
  "entity",
  "source",
  "table",
]);

type RouteEvidenceRecordKind =
  | "event"
  | "metric_claim"
  | "project"
  | "source_gap"
  | "treatment_component";

type RouteWork = {
  route: StudioRoute;
  wikiRoutes: Map<string, MtaWikiCanonicalRecord>;
  aliases: Set<string>;
  timeline: Map<string, MtaWikiCanonicalRecord>;
  interventions: Map<string, MtaWikiCanonicalRecord>;
  metricClaims: Map<string, MtaWikiCanonicalRecord>;
  projects: Map<string, MtaWikiCanonicalRecord>;
  sourceGaps: Map<string, MtaWikiCanonicalRecord>;
  citations: Map<string, StudioRouteEvidenceCitation>;
  omittedAmbiguousRecordCount: number;
};

type RelationRecord = {
  record: MtaWikiCanonicalRecord;
  relationFamily: string | null;
  relationKind: string | null;
  subjectId: string | null;
  objectId: string | null;
};

export type RunStudioImportMtaWikiRouteEvidenceInput = {
  mtaWikiRoot?: string | undefined;
  routesPath?: string | undefined;
  output?: string | undefined;
  servingOutputDir?: string | undefined;
  wikiRelease?: string | undefined;
  generatedAt?: string | undefined;
  minMatchedRoutes?: number | undefined;
  writeServingArtifacts?: boolean | undefined;
};

type RouteEvidenceServingArtifactRow = StudioRouteEvidenceIndex["routes"][number];

function textValue(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function scalarValue(value: JsonValue | undefined): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return null;
}

function stringValues(value: JsonValue | undefined): string[] {
  if (typeof value === "string") return value.trim().length > 0 ? [value] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => stringValues(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((item) => stringValues(item));
  }
  return [];
}

function payloadText(record: MtaWikiCanonicalRecord, key: string): string | null {
  return textValue(record.payload?.[key]);
}

function payloadScalar(
  record: MtaWikiCanonicalRecord,
  key: string,
): string | number | boolean | null {
  return scalarValue(record.payload?.[key]);
}

function routeAliasesForWikiRoute(record: MtaWikiCanonicalRecord): string[] {
  const aliases = new Set<string>();
  const add = (value: JsonValue | undefined): void => {
    for (const alias of stringValues(value)) aliases.add(alias);
  };
  if (record.display_name !== undefined) aliases.add(record.display_name);
  add(record.payload?.["route_id"]);
  add(record.payload?.["route_label"]);
  add(record.payload?.["route_name"]);
  add(record.payload?.["route"]);
  add(record.payload?.["routes"]);
  add(record.payload?.["aliases"]);
  const merged = record.payload?.["_merged_field_values"];
  if (typeof merged === "object" && merged !== null && !Array.isArray(merged)) {
    add(merged["route_id"]);
    add(merged["route_label"]);
    add(merged["route_name"]);
    add(merged["routes"]);
  }
  return [...aliases].toSorted();
}

function routeKeysForWikiRoute(record: MtaWikiCanonicalRecord): Set<string> {
  const keys = new Set<string>();
  for (const alias of routeAliasesForWikiRoute(record)) {
    for (const key of busRouteKeysFromText(alias)) keys.add(key);
  }
  return keys;
}

function routeKeysForStudioRoute(route: StudioRoute): Set<string> {
  const keys = new Set<string>();
  for (const value of [route.routeId, route.label]) {
    for (const key of busRouteKeysFromText(value)) keys.add(key);
  }
  const normalized = normalizeBusRouteKey(route.routeId);
  if (normalized !== null) keys.add(normalized);
  return keys;
}

function exactGtfsRouteKey(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9+]/gu, "");
  return normalized.length === 0 ? null : normalized;
}

function allRecords(corpus: MtaWikiCanonicalCorpus): MtaWikiCanonicalRecord[] {
  return [
    ...corpus.routes,
    ...corpus.projects,
    ...corpus.events,
    ...corpus.metricClaims,
    ...corpus.relations,
    ...corpus.treatmentComponents,
    ...corpus.sourceGaps,
    ...corpus.sources,
  ];
}

function recordsById(corpus: MtaWikiCanonicalCorpus): Map<string, MtaWikiCanonicalRecord> {
  return new Map(allRecords(corpus).map((record) => [record.record_id, record]));
}

function sourceLookupKeys(record: MtaWikiCanonicalRecord): string[] {
  const keys = new Set<string>();
  keys.add(record.record_id);
  if (record.record_id.startsWith("source_")) {
    const sourceId = record.record_id.slice("source_".length);
    keys.add(sourceId);
    keys.add(sourceId.replaceAll("-", "_"));
    keys.add(sourceId.replaceAll("_", "-"));
  }
  if (record.source_id !== undefined) keys.add(record.source_id);
  for (const sourceId of record.source_ids ?? []) keys.add(sourceId);
  for (const ref of record.evidence_refs ?? []) {
    const sourceId = textValue(ref.source_id);
    if (sourceId !== null) keys.add(sourceId);
  }
  return [...keys];
}

function sourcesById(corpus: MtaWikiCanonicalCorpus): Map<string, MtaWikiCanonicalRecord> {
  const index = new Map<string, MtaWikiCanonicalRecord>();
  for (const source of corpus.sources) {
    for (const key of sourceLookupKeys(source)) index.set(key, source);
  }
  return index;
}

function routeWorkFor(routes: readonly StudioRoute[]): {
  works: RouteWork[];
  byRouteKey: Map<string, RouteWork[]>;
  byGtfsRouteId: Map<string, RouteWork>;
} {
  const works = routes
    .map((route) => ({
      route,
      wikiRoutes: new Map<string, MtaWikiCanonicalRecord>(),
      aliases: new Set<string>(),
      timeline: new Map<string, MtaWikiCanonicalRecord>(),
      interventions: new Map<string, MtaWikiCanonicalRecord>(),
      metricClaims: new Map<string, MtaWikiCanonicalRecord>(),
      projects: new Map<string, MtaWikiCanonicalRecord>(),
      sourceGaps: new Map<string, MtaWikiCanonicalRecord>(),
      citations: new Map<string, StudioRouteEvidenceCitation>(),
      omittedAmbiguousRecordCount: 0,
    }))
    .toSorted((left, right) => left.route.routeId.localeCompare(right.route.routeId));
  const byRouteKey = new Map<string, RouteWork[]>();
  const byGtfsRouteId = new Map<string, RouteWork>();
  for (const work of works) {
    for (const key of routeKeysForStudioRoute(work.route)) {
      const existing = byRouteKey.get(key) ?? [];
      existing.push(work);
      byRouteKey.set(key, existing);
    }
    const routeIdKey = exactGtfsRouteKey(work.route.routeId);
    if (routeIdKey !== null) byGtfsRouteId.set(routeIdKey, work);
  }
  return { works, byRouteKey, byGtfsRouteId };
}

function relationRecord(record: MtaWikiCanonicalRecord): RelationRecord {
  return {
    record,
    relationFamily: textValue(record.payload?.["relation_family"]),
    relationKind: textValue(record.payload?.["relation_kind"]),
    subjectId: textValue(record.payload?.["subject_id"]),
    objectId: textValue(record.payload?.["object_id"]),
  };
}

function routeRecordKind(
  record: MtaWikiCanonicalRecord | undefined,
): RouteEvidenceRecordKind | null {
  if (record === undefined) return null;
  if (record.record_kind === "event") return "event";
  if (record.record_kind === "metric_claim") return "metric_claim";
  if (record.record_kind === "project") return "project";
  if (record.record_kind === "source_gap") return "source_gap";
  if (record.record_kind === "treatment_component") return "treatment_component";
  return null;
}

function shouldCountMissingRelationEndpoint(recordId: string): boolean {
  const prefixBoundary = recordId.indexOf("_");
  const prefix = prefixBoundary === -1 ? recordId : recordId.slice(0, prefixBoundary);
  return !unsupportedRelationEndpointPrefixes.has(prefix);
}

function addRecordToRoute(work: RouteWork, record: MtaWikiCanonicalRecord | undefined): void {
  if (record === undefined) {
    work.omittedAmbiguousRecordCount += 1;
    return;
  }
  switch (routeRecordKind(record)) {
    case "event":
      work.timeline.set(record.record_id, record);
      break;
    case "metric_claim":
      work.metricClaims.set(record.record_id, record);
      break;
    case "project":
      work.projects.set(record.record_id, record);
      break;
    case "source_gap":
      work.sourceGaps.set(record.record_id, record);
      break;
    case "treatment_component":
      work.interventions.set(record.record_id, record);
      break;
    case null:
      break;
  }
}

function relationOtherEndpoint(
  relation: RelationRecord,
  endpointIds: ReadonlySet<string>,
): string | null {
  if (relation.subjectId !== null && endpointIds.has(relation.subjectId)) {
    return relation.objectId;
  }
  if (relation.objectId !== null && endpointIds.has(relation.objectId)) {
    return relation.subjectId;
  }
  return null;
}

function addCitationForRef(input: {
  citations: Map<string, StudioRouteEvidenceCitation>;
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>;
  ref: MtaWikiEvidenceRef;
}): string | null {
  const evidenceId = textValue(input.ref.evidence_id);
  const sourceId = textValue(input.ref.source_id) ?? evidenceId?.split("#")[0] ?? null;
  const blockId = textValue(input.ref.block_id) ?? evidenceId?.split("#")[1] ?? null;
  if (sourceId === null || blockId === null) return null;
  const key = `${sourceId}#${blockId}`;
  if (input.citations.has(key)) return key;

  const source = input.sources.get(sourceId);
  const pageNumberValue = input.ref.page_number;
  const pageNumber = typeof pageNumberValue === "number" ? pageNumberValue : undefined;
  const sourcePath = textValue(input.ref.source_path) ?? `raw/sources/${sourceId}/blocks.jsonl`;
  const sourcePayload = source?.payload;
  const citation = StudioRouteEvidenceCitationSchema.parse({
    key,
    sourceId,
    blockId,
    evidenceId: evidenceId ?? key,
    sourcePath,
    ...(pageNumber === undefined ? {} : { pageNumber }),
    ...(textValue(input.ref.text_sha256) === null
      ? {}
      : { textSha256: textValue(input.ref.text_sha256) }),
    ...((textValue(sourcePayload?.["title"]) ?? source?.display_name)
      ? { sourceTitle: textValue(sourcePayload?.["title"]) ?? source?.display_name }
      : {}),
    ...(textValue(sourcePayload?.["publisher"]) === null
      ? {}
      : { publisher: textValue(sourcePayload?.["publisher"]) }),
    ...(textValue(sourcePayload?.["source_url"]) === null
      ? {}
      : { sourceUrl: textValue(sourcePayload?.["source_url"]) }),
    ...(publishedDateForSource(sourcePayload) === null
      ? {}
      : { publishedDate: publishedDateForSource(sourcePayload) }),
  });
  input.citations.set(key, citation);
  return key;
}

function publishedDateForSource(payload: JsonObject | undefined): string | null {
  return (
    textValue(payload?.["published_date_normalized"]) ??
    textValue(payload?.["publication_date_normalized"]) ??
    textValue(payload?.["document_date_normalized"]) ??
    textValue(payload?.["date_normalized"]) ??
    textValue(payload?.["date_text"]) ??
    textValue(payload?.["date"])
  );
}

function citationKeysForRecord(input: {
  work: RouteWork;
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>;
  record: MtaWikiCanonicalRecord;
}): string[] {
  const keys = new Set<string>();
  for (const ref of input.record.evidence_refs ?? []) {
    const key = addCitationForRef({ citations: input.work.citations, sources: input.sources, ref });
    if (key !== null) keys.add(key);
  }
  return [...keys].toSorted();
}

function timelineEventFor(
  work: RouteWork,
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>,
  record: MtaWikiCanonicalRecord,
): StudioRouteEvidenceTimelineEvent {
  return {
    recordId: record.record_id,
    recordKind: record.record_kind,
    citationKeys: citationKeysForRecord({ work, sources, record }),
    eventKind: payloadText(record, "event_kind"),
    eventFamily: payloadText(record, "event_family"),
    lifecyclePhase: payloadText(record, "lifecycle_phase"),
    title: payloadText(record, "event_name") ?? record.display_name ?? null,
    description: payloadText(record, "description"),
    dateText: payloadText(record, "date_text") ?? payloadText(record, "date"),
    dateNormalized:
      payloadText(record, "date_normalized") ?? payloadText(record, "event_date_normalized"),
    datePrecision: payloadText(record, "date_precision"),
  };
}

function interventionFor(
  work: RouteWork,
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>,
  relations: readonly RelationRecord[],
  record: MtaWikiCanonicalRecord,
): StudioRouteEvidenceIntervention {
  const routeProjectIds = new Set(work.projects.keys());
  const projectRecordIds = relations
    .flatMap((relation) => {
      if (relation.relationFamily !== "treatment_context") return [];
      if (relation.subjectId === record.record_id && relation.objectId !== null) {
        return routeProjectIds.has(relation.objectId) ? [relation.objectId] : [];
      }
      if (relation.objectId === record.record_id && relation.subjectId !== null) {
        return routeProjectIds.has(relation.subjectId) ? [relation.subjectId] : [];
      }
      return [];
    })
    .toSorted();
  return {
    recordId: record.record_id,
    recordKind: record.record_kind,
    citationKeys: citationKeysForRecord({ work, sources, record }),
    treatmentKind: payloadText(record, "treatment_kind") ?? payloadText(record, "component_kind"),
    treatmentFamily: payloadText(record, "treatment_family"),
    title: payloadText(record, "label") ?? payloadText(record, "treatment_kind"),
    description: payloadText(record, "description"),
    locations: [
      ...new Set([
        ...stringValues(record.payload?.["locations"]),
        ...stringValues(record.payload?.["location_text"]),
        ...stringValues(record.payload?.["normalized_location"]),
      ]),
    ].toSorted(),
    projectRecordIds,
  };
}

function metricClaimFor(
  work: RouteWork,
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>,
  record: MtaWikiCanonicalRecord,
): StudioRouteEvidenceMetricClaim {
  return {
    recordId: record.record_id,
    recordKind: record.record_kind,
    citationKeys: citationKeysForRecord({ work, sources, record }),
    metricName: payloadText(record, "metric_name"),
    rawValue: payloadScalar(record, "raw_value") ?? payloadScalar(record, "raw_value_text"),
    value: payloadScalar(record, "value"),
    unit: payloadText(record, "unit"),
    period: payloadText(record, "period") ?? payloadText(record, "time_period"),
    scope: payloadText(record, "scope"),
    description: payloadText(record, "description"),
  };
}

function projectFor(
  work: RouteWork,
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>,
  record: MtaWikiCanonicalRecord,
): StudioRouteEvidenceProject {
  return {
    recordId: record.record_id,
    recordKind: record.record_kind,
    citationKeys: citationKeysForRecord({ work, sources, record }),
    projectName: payloadText(record, "project_name") ?? payloadText(record, "name"),
    projectFamily: payloadText(record, "project_family"),
    projectType: payloadText(record, "project_type"),
    status: payloadText(record, "status") ?? payloadText(record, "document_time_status"),
    description: payloadText(record, "description"),
    location: payloadText(record, "location"),
    routesServed: stringValues(record.payload?.["routes_served"]).toSorted(),
  };
}

function sourceGapFor(
  work: RouteWork,
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>,
  record: MtaWikiCanonicalRecord,
): StudioRouteEvidenceSourceGap {
  return {
    recordId: record.record_id,
    recordKind: record.record_kind,
    citationKeys: citationKeysForRecord({ work, sources, record }),
    gapKind: payloadText(record, "gap_kind") ?? payloadText(record, "gap_kind_normalized"),
    gapText: payloadText(record, "gap_text"),
    missingInformation: payloadText(record, "missing_information"),
    description: payloadText(record, "description"),
  };
}

function directPayloadRouteKeys(record: MtaWikiCanonicalRecord): Set<string> {
  return busRouteKeysFromValue(record.payload as JsonValue | undefined);
}

function routeRecordIdsForAnchor(anchor: MtaWikiRouteAnchor): string[] {
  return [
    ...new Set([
      ...(anchor.canonical_route_record_id === null ? [] : [anchor.canonical_route_record_id]),
      ...anchor.variant_record_ids,
    ]),
  ].toSorted();
}

function addWikiRouteToWork(work: RouteWork, wikiRoute: MtaWikiCanonicalRecord): void {
  work.wikiRoutes.set(wikiRoute.record_id, wikiRoute);
  for (const alias of routeAliasesForWikiRoute(wikiRoute)) work.aliases.add(alias);
}

function addAnchorAliasesToWork(work: RouteWork, anchor: MtaWikiRouteAnchor): void {
  if (anchor.gtfs_route_id !== null) work.aliases.add(anchor.gtfs_route_id);
  for (const alias of anchor.aliases) work.aliases.add(alias);
}

function materializeBundle(input: {
  work: RouteWork;
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>;
  relations: readonly RelationRecord[];
}): StudioRouteEvidenceBundle {
  const timeline = [...input.work.timeline.values()]
    .map((record) => timelineEventFor(input.work, input.sources, record))
    .toSorted(
      (left, right) =>
        (left.dateNormalized ?? left.dateText ?? "").localeCompare(
          right.dateNormalized ?? right.dateText ?? "",
        ) || left.recordId.localeCompare(right.recordId),
    );
  const interventions = [...input.work.interventions.values()]
    .map((record) => interventionFor(input.work, input.sources, input.relations, record))
    .toSorted((left, right) => left.recordId.localeCompare(right.recordId));
  const metricClaims = [...input.work.metricClaims.values()]
    .map((record) => metricClaimFor(input.work, input.sources, record))
    .toSorted((left, right) => left.recordId.localeCompare(right.recordId));
  const projects = [...input.work.projects.values()]
    .map((record) => projectFor(input.work, input.sources, record))
    .toSorted((left, right) => left.recordId.localeCompare(right.recordId));
  const sourceGaps = [...input.work.sourceGaps.values()]
    .map((record) => sourceGapFor(input.work, input.sources, record))
    .toSorted((left, right) => left.recordId.localeCompare(right.recordId));
  const citations = [...input.work.citations.values()].toSorted((left, right) =>
    left.key.localeCompare(right.key),
  );
  const wikiRouteIds = [...input.work.wikiRoutes.values()]
    .flatMap((record) => routeAliasesForWikiRoute(record))
    .flatMap((alias) => [...busRouteKeysFromText(alias)])
    .toSorted();

  return {
    routeId: input.work.route.routeId,
    routeSlug: input.work.route.slug,
    wikiRouteRecordId: [...input.work.wikiRoutes.keys()].toSorted()[0] ?? null,
    wikiRouteIds: [...new Set(wikiRouteIds)],
    wikiAliases: [...input.work.aliases].toSorted(),
    coverage: {
      timelineCount: timeline.length,
      interventionCount: interventions.length,
      metricClaimCount: metricClaims.length,
      projectCount: projects.length,
      sourceGapCount: sourceGaps.length,
      citationCount: citations.length,
    },
    timeline,
    interventions,
    metricClaims,
    projects,
    sourceGaps,
    citations,
  };
}

function jsonDigest(value: unknown): { byteLength: number; sha256: string } {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  return {
    byteLength: Buffer.byteLength(body, "utf8"),
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

function evidenceCitationKeyCounts(bundle: StudioRouteEvidenceBundle): number[] {
  return [
    ...bundle.timeline,
    ...bundle.interventions,
    ...bundle.metricClaims,
    ...bundle.projects,
    ...bundle.sourceGaps,
  ].map((record) => record.citationKeys.length);
}

function assertBundleRecordsHaveCitations(bundle: StudioRouteEvidenceBundle): void {
  if (evidenceCitationKeyCounts(bundle).some((count) => count === 0)) {
    throw new Error(
      `Route evidence bundle ${bundle.routeId} contains wiki-derived rows without citations.`,
    );
  }
}

export async function writeStudioRouteEvidenceServingArtifacts(input: {
  artifact: StudioRouteEvidenceArtifact;
  outputDir: string;
  sourceArtifactKey?: string | undefined;
}): Promise<{ index: StudioRouteEvidenceIndex; indexPath: string; routeCount: number }> {
  const routesDir = join(input.outputDir, "routes");
  await mkdir(routesDir, { recursive: true });
  const routeRows: RouteEvidenceServingArtifactRow[] = [];

  for (const route of input.artifact.routes.toSorted((left, right) =>
    left.routeSlug.localeCompare(right.routeSlug),
  )) {
    assertBundleRecordsHaveCitations(route);
    const routePath = join(routesDir, `${route.routeSlug}.json`);
    const digest = jsonDigest(route);
    await writeJson(routePath, route);
    routeRows.push({
      routeId: route.routeId,
      routeSlug: route.routeSlug,
      wikiRouteRecordId: route.wikiRouteRecordId,
      artifactName: STUDIO_ROUTE_EVIDENCE_ARTIFACT_NAME,
      artifactKey: studioRouteEvidenceBundleKey(route.routeSlug),
      contentType: STUDIO_ROUTE_EVIDENCE_CONTENT_TYPE,
      byteLength: digest.byteLength,
      sha256: digest.sha256,
      coverage: route.coverage,
    });
  }

  const index = StudioRouteEvidenceIndexSchema.parse({
    artifactKind: "bp.studio.route_evidence_index.v1",
    schemaVersion: 1,
    generatedAt: input.artifact.generatedAt,
    sourceArtifactKey: input.sourceArtifactKey ?? defaultSourceArtifactKey,
    summary: {
      routeCount: routeRows.length,
      matchedBusRouteCount: routeRows.filter((route) => route.wikiRouteRecordId !== null).length,
      citationCount: routeRows.reduce((sum, route) => sum + route.coverage.citationCount, 0),
      totalByteLength: routeRows.reduce((sum, route) => sum + route.byteLength, 0),
    },
    routes: routeRows,
  });
  const indexPath = join(input.outputDir, "index.json");
  await writeJson(indexPath, index);
  return { index, indexPath, routeCount: routeRows.length };
}

export function buildStudioRouteEvidenceArtifact(input: {
  generatedAt: string;
  routes: readonly StudioRoute[];
  corpus: MtaWikiCanonicalCorpus;
}): StudioRouteEvidenceArtifact {
  const { works, byRouteKey, byGtfsRouteId } = routeWorkFor(input.routes);
  const matchedWikiRouteRecordIds = new Set<string>();
  const routeRecordsById = new Map(input.corpus.routes.map((route) => [route.record_id, route]));
  const hasRouteAnchors = input.corpus.routeAnchors.length > 0;

  if (hasRouteAnchors) {
    for (const anchor of input.corpus.routeAnchors) {
      const routeIdKey = exactGtfsRouteKey(anchor.gtfs_route_id);
      if (routeIdKey === null) continue;
      const work = byGtfsRouteId.get(routeIdKey);
      if (work === undefined) continue;
      addAnchorAliasesToWork(work, anchor);
      for (const recordId of routeRecordIdsForAnchor(anchor)) {
        const wikiRoute = routeRecordsById.get(recordId);
        if (wikiRoute === undefined) {
          throw new Error(
            `MTA-wiki route anchor ${anchor.gtfs_route_id} references missing route record ${recordId}.`,
          );
        }
        addWikiRouteToWork(work, wikiRoute);
        matchedWikiRouteRecordIds.add(recordId);
      }
    }
  } else {
    for (const wikiRoute of input.corpus.routes) {
      const routeKeys = routeKeysForWikiRoute(wikiRoute);
      const matchedWorks = new Set<RouteWork>();
      for (const routeKey of routeKeys) {
        for (const work of byRouteKey.get(routeKey) ?? []) matchedWorks.add(work);
      }
      if (matchedWorks.size === 0) continue;
      matchedWikiRouteRecordIds.add(wikiRoute.record_id);
      for (const work of matchedWorks) addWikiRouteToWork(work, wikiRoute);
    }
  }
  const unmatchedWikiRouteCount = input.corpus.routes.length - matchedWikiRouteRecordIds.size;

  const recordIndex = recordsById(input.corpus);
  const sourceIndex = sourcesById(input.corpus);
  const relations = input.corpus.relations.map(relationRecord);
  const factRecords = [
    ...input.corpus.projects,
    ...input.corpus.events,
    ...input.corpus.metricClaims,
    ...input.corpus.treatmentComponents,
    ...input.corpus.sourceGaps,
  ];

  if (!hasRouteAnchors) {
    for (const record of factRecords) {
      for (const routeKey of directPayloadRouteKeys(record)) {
        for (const work of byRouteKey.get(routeKey) ?? []) addRecordToRoute(work, record);
      }
    }
  }

  for (const work of works) {
    const wikiRouteIds = new Set(work.wikiRoutes.keys());
    for (const relation of relations) {
      const otherId = relationOtherEndpoint(relation, wikiRouteIds);
      if (otherId === null) continue;
      if (
        relation.relationFamily !== "route_scope" &&
        !directRouteFactFamilies.has(relation.relationFamily ?? "")
      ) {
        continue;
      }
      const otherRecord = recordIndex.get(otherId);
      if (otherRecord === undefined) {
        if (shouldCountMissingRelationEndpoint(otherId)) work.omittedAmbiguousRecordCount += 1;
        continue;
      }
      addRecordToRoute(work, otherRecord);
    }

    const projectIds = new Set(work.projects.keys());
    for (const relation of relations) {
      if (!relationFamiliesForProjectHop.has(relation.relationFamily ?? "")) continue;
      const otherId = relationOtherEndpoint(relation, projectIds);
      if (otherId === null) continue;
      const otherRecord = recordIndex.get(otherId);
      if (otherRecord === undefined) {
        if (shouldCountMissingRelationEndpoint(otherId)) work.omittedAmbiguousRecordCount += 1;
        continue;
      }
      addRecordToRoute(work, otherRecord);
    }
  }

  const routes = works.map((work) => materializeBundle({ work, sources: sourceIndex, relations }));
  const citationCount = routes.reduce((sum, route) => sum + route.citations.length, 0);
  return StudioRouteEvidenceArtifactSchema.parse({
    artifactKind: "bp.studio.route_evidence.v1",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    source: {
      kind: "mta-wiki-canonical-jsonl",
      mtaWikiRoot: input.corpus.root,
      canonicalRoot: input.corpus.canonicalRoot,
    },
    summary: {
      routeCount: routes.length,
      matchedBusRouteCount: routes.filter((route) => route.wikiRouteRecordId !== null).length,
      unmatchedWikiRouteCount,
      citationCount,
      omittedAmbiguousRecordCount: works.reduce(
        (sum, work) => sum + work.omittedAmbiguousRecordCount,
        0,
      ),
    },
    routes,
  });
}

async function loadStudioRoutes(path: string): Promise<readonly StudioRoute[]> {
  const routes = await readJsonArtifact(path, StudioRoutesResponseSchema);
  return routes.routes;
}

export async function runStudioImportMtaWikiRouteEvidence(
  input: RunStudioImportMtaWikiRouteEvidenceInput,
): Promise<StudioRouteEvidenceArtifact> {
  const routesPath =
    input.routesPath === undefined ? defaultRoutesPath : fromCliPath(input.routesPath);
  const outputPath = input.output === undefined ? defaultOutputPath : fromCliPath(input.output);
  const servingOutputDir =
    input.servingOutputDir === undefined
      ? dirname(outputPath)
      : fromCliPath(input.servingOutputDir);
  const routes = await loadStudioRoutes(routesPath);
  const corpus = await loadMtaWikiCanonicalCorpus(input.mtaWikiRoot, {
    wikiRelease: input.wikiRelease,
  });
  const artifact = buildStudioRouteEvidenceArtifact({
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    routes,
    corpus,
  });
  const minMatchedRoutes = input.minMatchedRoutes ?? 1;
  if (artifact.summary.matchedBusRouteCount < minMatchedRoutes) {
    throw new Error(
      `Expected at least ${minMatchedRoutes} matched route(s), found ${artifact.summary.matchedBusRouteCount}.`,
    );
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  if (input.writeServingArtifacts ?? true) {
    await writeStudioRouteEvidenceServingArtifacts({
      artifact,
      outputDir: servingOutputDir,
      sourceArtifactKey: defaultSourceArtifactKey,
    });
  }
  return artifact;
}

const optionsSchema = Schema.Struct({
  mtaWikiRoot: Schema.optionalKey(Schema.String).annotate({
    description: "Path to the mta-wiki repo root.",
  }),
  wikiRelease: Schema.optionalKey(Schema.String).annotate({
    description: "MTA-wiki release id under data/exports/releases/<id>.",
  }),
  routesPath: Schema.optionalKey(Schema.String).annotate({
    description: "Studio routes.json path.",
  }),
  output: Schema.optionalKey(Schema.String).annotate({
    description: "Output route evidence JSON artifact path.",
  }),
  servingOutputDir: Schema.optionalKey(Schema.String).annotate({
    description: "Directory for per-route route evidence artifacts and index.json.",
  }),
  writeServingArtifacts: arg
    .boolean()
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(true)))
    .annotate({ description: "Write per-route serving artifacts and the wiki evidence index." }),
  generatedAt: Schema.optionalKey(Schema.String),
  minMatchedRoutes: arg
    .positiveInt()
    .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
    .annotate({
      description: "Fail if fewer than this many Bus routes match MTA-wiki route records.",
    }),
});

const commandOutputSchema = Schema.Struct({
  outputPath: Schema.String,
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  matchedBusRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  unmatchedWikiRouteCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  citationCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  omittedAmbiguousRecordCount: Schema.Number.check(Schema.isInt()).check(
    Schema.isGreaterThanOrEqualTo(0),
  ),
  servingRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  servingIndexPath: Schema.String,
});

export default defineCommand({
  path: ["studio", "import-mta-wiki-route-evidence"],
  summary: "Import MTA-wiki canonical JSONL into source-backed route evidence bundles.",
  input: { options: optionsSchema },
  output: commandOutputSchema,
  async run({ input }) {
    const outputPath =
      input.options.output === undefined ? defaultOutputPath : fromCliPath(input.options.output);
    const artifact = await runStudioImportMtaWikiRouteEvidence(input.options);
    const servingOutputDir =
      input.options.servingOutputDir === undefined
        ? dirname(outputPath)
        : fromCliPath(input.options.servingOutputDir);
    return {
      outputPath,
      routeCount: artifact.summary.routeCount,
      matchedBusRouteCount: artifact.summary.matchedBusRouteCount,
      unmatchedWikiRouteCount: artifact.summary.unmatchedWikiRouteCount,
      citationCount: artifact.summary.citationCount,
      omittedAmbiguousRecordCount: artifact.summary.omittedAmbiguousRecordCount,
      servingRouteCount: input.options.writeServingArtifacts ? artifact.summary.routeCount : 0,
      servingIndexPath: join(servingOutputDir, "index.json"),
    };
  },
});
