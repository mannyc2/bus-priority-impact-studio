import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { routeIdToStudioSlug, StudioRouteIdentityPresentationSchema } from "@bp/domain/studio";
import {
  buildStudioInterventionsEvidenceArtifact,
  type StudioRouteEvidenceArtifact,
  StudioRouteEvidenceArtifactV1Schema,
  StudioRouteEvidenceArtifactV2Schema,
  type StudioRouteEvidenceBinding,
  type StudioRouteEvidenceBundle,
  type StudioRouteEvidenceBundleV2,
  type StudioRouteEvidenceCitation,
  StudioRouteEvidenceCitationSchema,
  type StudioRouteEvidenceIndex,
  StudioRouteEvidenceIndexV1Schema,
  StudioRouteEvidenceIndexV2Schema,
  type StudioRouteEvidenceIntervention,
  type StudioRouteEvidenceMetricClaim,
  type StudioRouteEvidenceProject,
  type StudioRouteEvidenceSourceGap,
  type StudioRouteEvidenceSourceV2,
  type StudioRouteEvidenceTimelineEvent,
  studioRouteEvidenceBundleKey,
} from "@bp/domain/studio/route-evidence";
import { type StudioRoute, StudioRoutesResponseSchema } from "@bp/domain/studio/routes";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { writeJson } from "../../lib/json.ts";
import {
  busRouteKeysFromText,
  busRouteKeysFromValue,
  type JsonObject,
  type JsonValue,
  loadMtaWikiCanonicalCorpus,
  loadMtaWikiCanonicalCorpusFromVerifiedRelease,
  type MtaWikiCanonicalCorpus,
  type MtaWikiCanonicalRecord,
  type MtaWikiEvidenceRef,
  type MtaWikiRouteAnchor,
  normalizeBusRouteKey,
  resolveMtaWikiRoot,
} from "../../lib/mta-wiki-canonical.ts";
import {
  readMtaWikiReleaseQuarantineStatus,
  resolveMtaWikiRelease,
} from "../../lib/mta-wiki-release.ts";
import {
  auditCurrentBusRoutesParity,
  loadMtaWikiRouteIdentities,
  type MtaWikiRouteIdentitySnapshot,
  type MtaWikiRouteRecordBinding,
} from "../../lib/mta-wiki-route-identities.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";

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
  primaryWikiRouteRecordId: string | null;
  routeIdentity: StudioRouteEvidenceBundleV2["routeIdentity"] | null;
  operationalBindings: Map<string, StudioRouteEvidenceBinding>;
  contextualBindings: Map<string, StudioRouteEvidenceBinding>;
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
  routesSha256?: string | undefined;
  output?: string | undefined;
  servingOutputDir?: string | undefined;
  wikiRelease?: string | undefined;
  wikiManifestSha256?: string | undefined;
  currentBusRoutesPath?: string | undefined;
  currentBusRoutesSha256?: string | undefined;
  currentBusRoutesEffectiveAsOfDate?: string | undefined;
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

const CanonicalRouteSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function routeEvidenceServingPath(routesDir: string, routeSlug: string): string {
  if (!CanonicalRouteSlugPattern.test(routeSlug)) {
    throw new Error(`Unsafe or noncanonical Tracker route slug ${JSON.stringify(routeSlug)}`);
  }
  const canonicalRoutesDir = resolve(routesDir);
  const routePath = resolve(canonicalRoutesDir, `${routeSlug}.json`);
  const fromRoutesDir = relative(canonicalRoutesDir, routePath);
  if (
    fromRoutesDir.length === 0 ||
    fromRoutesDir === ".." ||
    fromRoutesDir.startsWith(`..${sep}`) ||
    isAbsolute(fromRoutesDir)
  ) {
    throw new Error(`Tracker route slug escapes serving directory: ${routeSlug}`);
  }
  return routePath;
}

function assertInjectiveRouteServingIdentities(
  routes: readonly { routeId: string; routeSlug: string }[],
  routesDir = ".",
  requireCanonicalSlugs = false,
): void {
  const routeIds = new Set<string>();
  const routeSlugs = new Set<string>();
  const artifactKeys = new Set<string>();
  for (const route of routes) {
    if (routeIds.has(route.routeId)) {
      throw new Error(`Duplicate exact Tracker route identity ${route.routeId}`);
    }
    const canonicalSlug = routeIdToStudioSlug(route.routeId);
    if (requireCanonicalSlugs && route.routeSlug !== canonicalSlug) {
      throw new Error(
        "Tracker route " +
          route.routeId +
          " must use canonical slug " +
          canonicalSlug +
          ", received " +
          route.routeSlug,
      );
    }
    if (routeSlugs.has(route.routeSlug)) {
      throw new Error(`Tracker route slug collision ${route.routeSlug}`);
    }
    routeEvidenceServingPath(routesDir, route.routeSlug);
    const artifactKey = studioRouteEvidenceBundleKey(route.routeSlug);
    if (artifactKeys.has(artifactKey)) {
      throw new Error(`Tracker route evidence artifact-key collision ${artifactKey}`);
    }
    routeIds.add(route.routeId);
    routeSlugs.add(route.routeSlug);
    artifactKeys.add(artifactKey);
  }
}

function routeWorkFor(
  routes: readonly StudioRoute[],
  strictExactRoutes = false,
): {
  works: RouteWork[];
  byRouteKey: Map<string, RouteWork[]>;
  byGtfsRouteId: Map<string, RouteWork>;
} {
  assertInjectiveRouteServingIdentities(
    routes.map((route) => ({ routeId: route.routeId, routeSlug: route.slug })),
    ".",
    strictExactRoutes,
  );
  const works = routes
    .map((route) => ({
      route,
      primaryWikiRouteRecordId: null,
      routeIdentity: routeIdentityForWork(route),
      operationalBindings: new Map<string, StudioRouteEvidenceBinding>(),
      contextualBindings: new Map<string, StudioRouteEvidenceBinding>(),
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
    byGtfsRouteId.set(work.route.routeId, work);
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
  const citation = decodeSchemaStrict(StudioRouteEvidenceCitationSchema, {
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

function consumerRouteBinding(binding: MtaWikiRouteRecordBinding): StudioRouteEvidenceBinding {
  return {
    routeRecordId: binding.route_record_id,
    routeFamilyId: binding.route_family_id,
    datasetId: binding.dataset_id,
    componentFeedIds: [...binding.component_feed_ids],
    sourceRouteId: binding.source_route_id,
    gtfsRouteId: binding.gtfs_route_id,
    serviceVariant: binding.service_variant,
    identityScope: binding.identity_scope,
    serviceClass: binding.service_class,
    recordTemporalScope: binding.record_temporal_scope,
    projectable: binding.projectable,
    presentationPrimary: binding.presentation_primary,
    derivation: binding.derivation,
    evidenceIds: [...binding.evidence_ids],
    canonicalRecordFingerprint: binding.canonical_record_fingerprint,
  };
}

function routeIdentityForWork(
  route: StudioRoute,
): StudioRouteEvidenceBundleV2["routeIdentity"] | null {
  if (route.displayLabel === undefined || route.routeFamilyId === undefined) return null;
  return decodeSchemaStrict(StudioRouteIdentityPresentationSchema, {
    routeId: route.routeId,
    routeFamilyId: route.routeFamilyId,
    displayLabel: route.displayLabel,
    officialLongName: route.officialLongName ?? null,
    designationLiterals: [...(route.designationLiterals ?? [])],
    serviceModes: [...(route.serviceModes ?? [])],
    routeTypes: [...(route.routeTypes ?? [])],
    tripTypes: [...(route.tripTypes ?? [])],
  });
}

function materializeBundle(input: {
  work: RouteWork;
  sources: ReadonlyMap<string, MtaWikiCanonicalRecord>;
  relations: readonly RelationRecord[];
  sourceV2?: StudioRouteEvidenceSourceV2;
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
  const legacyWikiRouteIds = [...input.work.wikiRoutes.values()]
    .flatMap((record) => routeAliasesForWikiRoute(record))
    .flatMap((alias) => [...busRouteKeysFromText(alias)])
    .toSorted();
  const exactWikiRouteIds = [
    ...new Set(
      [...input.work.operationalBindings.values()].flatMap((binding) =>
        binding.sourceRouteId === null ? [] : [binding.sourceRouteId],
      ),
    ),
  ].toSorted();
  if (
    input.sourceV2 !== undefined &&
    exactWikiRouteIds.some((routeId) => routeId !== input.work.route.routeId)
  ) {
    throw new Error(
      `Named route ${input.work.route.routeId} contains a crossed exact operational binding`,
    );
  }

  const bundle = {
    routeId: input.work.route.routeId,
    routeSlug: input.work.route.slug,
    wikiRouteRecordId:
      input.sourceV2 === undefined
        ? (input.work.primaryWikiRouteRecordId ??
          [...input.work.wikiRoutes.keys()].toSorted()[0] ??
          null)
        : input.work.primaryWikiRouteRecordId,
    wikiRouteIds:
      input.sourceV2 === undefined ? [...new Set(legacyWikiRouteIds)] : exactWikiRouteIds,
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
  if (input.sourceV2 === undefined) return bundle;
  if (input.work.routeIdentity === null) {
    throw new Error(
      `Named route ${input.work.route.routeId} is missing exact identity presentation`,
    );
  }
  return {
    artifactKind: "bp.studio.route_evidence_bundle.v2",
    schemaVersion: 2,
    source: input.sourceV2,
    routeIdentity: input.work.routeIdentity,
    operationalBindings: [...input.work.operationalBindings.values()].toSorted((left, right) =>
      left.routeRecordId.localeCompare(right.routeRecordId),
    ),
    contextualBindings: [...input.work.contextualBindings.values()].toSorted((left, right) =>
      left.routeRecordId.localeCompare(right.routeRecordId),
    ),
    ...bundle,
  };
}

function isRouteEvidenceBundleV2(
  bundle: StudioRouteEvidenceBundle,
): bundle is StudioRouteEvidenceBundleV2 {
  return "artifactKind" in bundle && bundle.artifactKind === "bp.studio.route_evidence_bundle.v2";
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
  interventionsEvidenceIndexPath?: string | undefined;
}): Promise<{
  index: StudioRouteEvidenceIndex;
  indexPath: string;
  routeCount: number;
  interventionsEvidenceIndexPath: string;
}> {
  const routesDir = join(input.outputDir, "routes");
  await mkdir(routesDir, { recursive: true });
  assertInjectiveRouteServingIdentities(
    input.artifact.routes.map((route) => ({
      routeId: route.routeId,
      routeSlug: route.routeSlug,
    })),
    routesDir,
  );
  const routeRows: RouteEvidenceServingArtifactRow[] = [];

  for (const route of input.artifact.routes.toSorted((left, right) =>
    left.routeSlug.localeCompare(right.routeSlug),
  )) {
    assertBundleRecordsHaveCitations(route);
    const routePath = routeEvidenceServingPath(routesDir, route.routeSlug);
    const digest = jsonDigest(route);
    await writeJson(routePath, route);
    const row = {
      routeId: route.routeId,
      routeSlug: route.routeSlug,
      wikiRouteRecordId: route.wikiRouteRecordId,
      artifactName: "route_evidence" as const,
      artifactKey: studioRouteEvidenceBundleKey(route.routeSlug),
      contentType: "application/json" as const,
      byteLength: digest.byteLength,
      sha256: digest.sha256,
      coverage: route.coverage,
    };
    routeRows.push(
      isRouteEvidenceBundleV2(route)
        ? { ...row, bundleSchemaVersion: 2, routeIdentity: route.routeIdentity }
        : row,
    );
  }

  const summary = {
    routeCount: routeRows.length,
    matchedBusRouteCount: routeRows.filter((route) => route.wikiRouteRecordId !== null).length,
    citationCount: routeRows.reduce((sum, route) => sum + route.coverage.citationCount, 0),
    totalByteLength: routeRows.reduce((sum, route) => sum + route.byteLength, 0),
  };
  const index =
    input.artifact.artifactKind === "bp.studio.route_evidence.v2"
      ? decodeSchemaStrict(StudioRouteEvidenceIndexV2Schema, {
          artifactKind: "bp.studio.route_evidence_index.v2",
          schemaVersion: 2,
          generatedAt: input.artifact.generatedAt,
          sourceArtifactKey: input.sourceArtifactKey ?? defaultSourceArtifactKey,
          source: input.artifact.source,
          summary,
          routes: routeRows,
        })
      : decodeSchemaStrict(StudioRouteEvidenceIndexV1Schema, {
          artifactKind: "bp.studio.route_evidence_index.v1",
          schemaVersion: 1,
          generatedAt: input.artifact.generatedAt,
          sourceArtifactKey: input.sourceArtifactKey ?? defaultSourceArtifactKey,
          summary,
          routes: routeRows,
        });
  const indexPath = join(input.outputDir, "index.json");
  await writeJson(indexPath, index);

  // The citywide /interventions ledger reads this one artifact. It is built here,
  // offline, because assembling it per request meant reading every route bundle.
  const interventionsEvidenceIndexPath =
    input.interventionsEvidenceIndexPath ??
    resolve(input.outputDir, "..", "interventions", "evidence-index.json");
  await mkdir(dirname(interventionsEvidenceIndexPath), { recursive: true });
  await writeJson(
    interventionsEvidenceIndexPath,
    buildStudioInterventionsEvidenceArtifact({
      generatedAt: input.artifact.generatedAt,
      bundles: input.artifact.routes,
    }),
  );

  return { index, indexPath, routeCount: routeRows.length, interventionsEvidenceIndexPath };
}

export function buildStudioRouteEvidenceArtifact(input: {
  generatedAt: string;
  routes: readonly StudioRoute[];
  corpus: MtaWikiCanonicalCorpus;
  strictExactRoutes?: boolean;
  sourceV2?: StudioRouteEvidenceSourceV2;
  routeIdentitySnapshot?: MtaWikiRouteIdentitySnapshot;
}): StudioRouteEvidenceArtifact {
  const { works, byRouteKey, byGtfsRouteId } = routeWorkFor(
    input.routes,
    input.strictExactRoutes === true,
  );
  const matchedWikiRouteRecordIds = new Set<string>();
  const routeRecordsById = new Map(input.corpus.routes.map((route) => [route.record_id, route]));
  const hasRouteAnchors = input.strictExactRoutes === true || input.corpus.routeAnchors.length > 0;
  const routeBindingsById = new Map(
    (input.routeIdentitySnapshot?.record_bindings ?? []).map((binding) => [
      binding.route_record_id,
      binding,
    ]),
  );
  if (input.routeIdentitySnapshot !== undefined) {
    if (input.sourceV2 === undefined) {
      throw new Error("A named route identity snapshot requires v2 source provenance");
    }
    for (const binding of input.routeIdentitySnapshot.record_bindings) {
      if (binding.projectable) {
        if (
          binding.identity_scope !== "exact_service" ||
          binding.service_class !== "regular_mta_bus" ||
          binding.record_temporal_scope !== "current_description" ||
          binding.gtfs_route_id === null
        ) {
          throw new Error(
            `route binding ${binding.route_record_id}: only current exact regular bus records are operational`,
          );
        }
        continue;
      }
      const targets =
        binding.gtfs_route_id === null
          ? works.filter(
              (work) =>
                binding.route_family_id !== null &&
                work.routeIdentity?.routeFamilyId === binding.route_family_id,
            )
          : [byGtfsRouteId.get(binding.gtfs_route_id)].filter(
              (work): work is RouteWork => work !== undefined,
            );
      for (const target of targets) {
        target.contextualBindings.set(binding.route_record_id, consumerRouteBinding(binding));
      }
    }
  }

  if (hasRouteAnchors) {
    for (const anchor of input.corpus.routeAnchors) {
      if (anchor.gtfs_route_id === null) continue;
      const work = byGtfsRouteId.get(anchor.gtfs_route_id);
      if (work === undefined) continue;
      work.primaryWikiRouteRecordId = anchor.canonical_route_record_id;
      addAnchorAliasesToWork(work, anchor);
      for (const recordId of routeRecordIdsForAnchor(anchor)) {
        if (input.routeIdentitySnapshot !== undefined) {
          const binding = routeBindingsById.get(recordId);
          if (binding === undefined || !binding.projectable) {
            throw new Error(
              `MTA-wiki route anchor ${anchor.gtfs_route_id} lacks a projectable binding for ${recordId}.`,
            );
          }
          work.operationalBindings.set(recordId, consumerRouteBinding(binding));
        }
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

  const routes = works.map((work) =>
    materializeBundle({
      work,
      sources: sourceIndex,
      relations,
      ...(input.sourceV2 === undefined ? {} : { sourceV2: input.sourceV2 }),
    }),
  );
  const citationCount = routes.reduce((sum, route) => sum + route.citations.length, 0);
  const summary = {
    routeCount: routes.length,
    matchedBusRouteCount: routes.filter((route) => route.wikiRouteRecordId !== null).length,
    unmatchedWikiRouteCount,
    citationCount,
    omittedAmbiguousRecordCount: works.reduce(
      (sum, work) => sum + work.omittedAmbiguousRecordCount,
      0,
    ),
  };
  return input.sourceV2 === undefined
    ? decodeSchemaStrict(StudioRouteEvidenceArtifactV1Schema, {
        artifactKind: "bp.studio.route_evidence.v1",
        schemaVersion: 1,
        generatedAt: input.generatedAt,
        source: {
          kind: "mta-wiki-canonical-jsonl",
          mtaWikiRoot: input.corpus.root,
          canonicalRoot: input.corpus.canonicalRoot,
        },
        summary,
        routes,
      })
    : decodeSchemaStrict(StudioRouteEvidenceArtifactV2Schema, {
        artifactKind: "bp.studio.route_evidence.v2",
        schemaVersion: 2,
        generatedAt: input.generatedAt,
        source: input.sourceV2,
        summary,
        routes,
      });
}

function loadStudioRoutes(bytes: Uint8Array): readonly StudioRoute[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const routes = decodeSchemaStrict(StudioRoutesResponseSchema, JSON.parse(text) as unknown);
  return routes.routes;
}

function fixedGeneratedAt(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("generatedAt is required for a named MTA Wiki release");
  }
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.exec(value);
  const milliseconds = Date.parse(value);
  if (match === null || !Number.isFinite(milliseconds)) {
    throw new Error("generatedAt must be a fixed ISO-8601 UTC instant");
  }
  const canonical = new Date(milliseconds).toISOString();
  if (value !== canonical && value !== canonical.replace(".000Z", "Z")) {
    throw new Error("generatedAt must be a valid fixed ISO-8601 UTC instant");
  }
  return value;
}

function exactSortedRouteIds(values: readonly string[], label: string): string[] {
  if (values.some((value) => value.length === 0 || value !== value.trim())) {
    throw new Error(`${label} contains an invalid exact route ID`);
  }
  const sorted = [...values].toSorted();
  if (new Set(sorted).size !== sorted.length) {
    throw new Error(`${label} contains a duplicate exact route ID`);
  }
  return sorted;
}

function assertSameExactRouteUniverse(input: {
  left: readonly string[];
  leftLabel: string;
  right: readonly string[];
  rightLabel: string;
}): void {
  const left = exactSortedRouteIds(input.left, input.leftLabel);
  const right = exactSortedRouteIds(input.right, input.rightLabel);
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const leftOnly = left.filter((routeId) => !rightSet.has(routeId));
  const rightOnly = right.filter((routeId) => !leftSet.has(routeId));
  if (leftOnly.length > 0 || rightOnly.length > 0) {
    throw new Error(
      `${input.leftLabel}/${input.rightLabel} exact route universe mismatch: ` +
        `${input.leftLabel}-only [${leftOnly.join(",")}], ` +
        `${input.rightLabel}-only [${rightOnly.join(",")}]`,
    );
  }
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
  const trackerRouteInputBytes = await readFile(routesPath);
  const trackerRouteInputSha256 = createHash("sha256").update(trackerRouteInputBytes).digest("hex");
  let routes: readonly StudioRoute[] = loadStudioRoutes(trackerRouteInputBytes);
  let corpus: MtaWikiCanonicalCorpus;
  let sourceV2: StudioRouteEvidenceSourceV2 | undefined;
  let routeIdentitySnapshot: MtaWikiRouteIdentitySnapshot | undefined;
  let generatedAt = input.generatedAt ?? new Date().toISOString();
  if (input.wikiRelease !== undefined) {
    if (input.wikiManifestSha256 === undefined) {
      throw new Error("wikiManifestSha256 is required for a named MTA Wiki release");
    }
    if (
      input.routesSha256 === undefined ||
      input.currentBusRoutesPath === undefined ||
      input.currentBusRoutesSha256 === undefined ||
      input.currentBusRoutesEffectiveAsOfDate === undefined
    ) {
      throw new Error(
        "routesSha256, currentBusRoutesPath, currentBusRoutesSha256, and currentBusRoutesEffectiveAsOfDate are required for a named MTA Wiki release",
      );
    }
    if (!/^[0-9a-f]{64}$/u.test(input.routesSha256)) {
      throw new Error("routesSha256 must be a lowercase SHA-256 digest");
    }
    if (trackerRouteInputSha256 !== input.routesSha256) {
      throw new Error(
        `Tracker routes SHA-256 mismatch: expected ${input.routesSha256}, received ${trackerRouteInputSha256}`,
      );
    }
    generatedAt = fixedGeneratedAt(input.generatedAt);
    const mtaWikiRoot = resolveMtaWikiRoot(input.mtaWikiRoot);
    await Effect.runPromise(
      resolveMtaWikiRelease({
        mtaWikiRoot,
        wikiRelease: input.wikiRelease,
        wikiManifestSha256: input.wikiManifestSha256,
        output: outputPath,
      }),
    );
    await Effect.runPromise(
      resolveMtaWikiRelease({
        mtaWikiRoot,
        wikiRelease: input.wikiRelease,
        wikiManifestSha256: input.wikiManifestSha256,
        output: servingOutputDir,
      }),
    );
    const quarantineStatus = await Effect.runPromise(
      readMtaWikiReleaseQuarantineStatus({
        mtaWikiRoot,
        wikiRelease: input.wikiRelease,
        wikiManifestSha256: input.wikiManifestSha256,
      }),
    );
    if (quarantineStatus !== null) {
      throw new Error(
        `MTA Wiki release ${input.wikiRelease} is quarantined (${quarantineStatus.reasonCode}): ${quarantineStatus.reason}`,
      );
    }
    const routeIdentities = await loadMtaWikiRouteIdentities({
      mtaWikiRoot,
      wikiRelease: input.wikiRelease,
      wikiManifestSha256: input.wikiManifestSha256,
    });
    corpus = loadMtaWikiCanonicalCorpusFromVerifiedRelease({
      root: mtaWikiRoot,
      releaseDirectory: routeIdentities.releaseDirectory,
      wikiRelease: input.wikiRelease,
      files: routeIdentities.canonicalFiles,
      recordCounts: routeIdentities.recordCounts,
      routeAnchors: routeIdentities.anchors,
    });
    const parity = await auditCurrentBusRoutesParity({
      currentBusRoutesPath: fromCliPath(input.currentBusRoutesPath),
      expectedSha256: input.currentBusRoutesSha256,
      effectiveAsOfDate: input.currentBusRoutesEffectiveAsOfDate,
      snapshot: routeIdentities.snapshot,
    });
    if (!parity.parity.descriptorReconciled) {
      throw new Error(
        `Current Bus Routes descriptor mismatch for named release ${input.wikiRelease}: catalog-only [${parity.parity.catalogOnlyRouteIds.join(
          ",",
        )}], GTFS-only [${parity.parity.gtfsOnlyRouteIds.join(",")}]`,
      );
    }
    routeIdentitySnapshot = routeIdentities.snapshot;
    sourceV2 = {
      kind: "mta-wiki-immutable-release",
      wikiRelease: input.wikiRelease,
      manifestSha256: routeIdentities.manifestSha256,
      routeIdentitySha256: routeIdentities.routeIdentitySha256,
      routeAnchorSha256: routeIdentities.routeAnchorSha256,
      trackerRouteInputSha256,
      catalogParity: parity.parity,
    };
    const identitiesByRouteId = new Map(
      routeIdentities.snapshot.service_identities.map((identity) => [
        identity.gtfs_route_id,
        identity,
      ]),
    );
    const trackerRouteIds = routes.map((route) => route.routeId);
    const currentCatalogRouteIds = [...parity.designationsByRouteId.keys()];
    const currentGtfsBackedCatalogRouteIds = currentCatalogRouteIds.filter(
      (routeId) => !parity.parity.catalogOnlyRouteIds.includes(routeId),
    );
    const producerCatalogRouteIds = routeIdentities.snapshot.service_identities
      .filter((identity) => identity.catalog_in_effect === "yes")
      .map((identity) => identity.source_route_id);
    assertSameExactRouteUniverse({
      left: trackerRouteIds,
      leftLabel: "Tracker",
      right: currentGtfsBackedCatalogRouteIds,
      rightLabel: "GTFS-backed Current Bus Routes",
    });
    assertSameExactRouteUniverse({
      left: trackerRouteIds,
      leftLabel: "Tracker",
      right: producerCatalogRouteIds,
      rightLabel: "producer catalog-in-effect",
    });
    routes = routes.map((route) => {
      const identity = identitiesByRouteId.get(route.routeId);
      if (identity === undefined) {
        throw new Error("Missing exact producer identity for Tracker route " + route.routeId);
      }
      const designations = parity.designationsByRouteId.get(route.routeId);
      const routeTypes = [...(designations?.routeTypes ?? [])];
      const tripTypes = [...(designations?.tripTypes ?? [])];
      return {
        ...route,
        label: identity.display_label,
        routeSchemaVersion: 2 as const,
        routeFamilyId: identity.route_family_id,
        displayLabel: identity.display_label,
        officialLongName: identity.route_long_name,
        designationLiterals: [...identity.designation_literals],
        serviceModes: [...identity.normalized_service_modes],
        routeTypes,
        tripTypes,
        sbs: identity.normalized_service_modes.includes("sbs"),
      };
    });
  } else {
    corpus = await loadMtaWikiCanonicalCorpus(input.mtaWikiRoot);
  }
  const artifact = buildStudioRouteEvidenceArtifact({
    generatedAt,
    routes,
    corpus,
    ...(sourceV2 === undefined ? {} : { sourceV2 }),
    ...(routeIdentitySnapshot === undefined ? {} : { routeIdentitySnapshot }),
    strictExactRoutes: input.wikiRelease !== undefined,
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
  wikiManifestSha256: Schema.optionalKey(Schema.String).annotate({
    description: "Required exact manifest SHA-256 for a named MTA-wiki release.",
  }),
  currentBusRoutesPath: Schema.optionalKey(Schema.String).annotate({
    description: "Pinned official Current Bus Routes JSON path for a named release.",
  }),
  currentBusRoutesSha256: Schema.optionalKey(Schema.String).annotate({
    description: "Required exact Current Bus Routes SHA-256 for a named release.",
  }),
  currentBusRoutesEffectiveAsOfDate: Schema.optionalKey(Schema.String).annotate({
    description: "Required Current Bus Routes effective date (YYYY-MM-DD).",
  }),
  routesPath: Schema.optionalKey(Schema.String).annotate({
    description: "Studio routes.json path.",
  }),
  routesSha256: Schema.optionalKey(Schema.String).annotate({
    description: "Required exact SHA-256 of the pinned Studio routes.json input.",
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
