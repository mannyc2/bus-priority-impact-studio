import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  type StudioRouteEvidenceArtifact,
  StudioRouteEvidenceArtifactSchema,
  type StudioRouteEvidenceBundle,
  type StudioRouteEvidenceCitation,
  StudioRouteEvidenceCitationSchema,
  type StudioRouteEvidenceIntervention,
  type StudioRouteEvidenceMetricClaim,
  type StudioRouteEvidenceProject,
  type StudioRouteEvidenceSourceGap,
  type StudioRouteEvidenceTimelineEvent,
} from "@bp/domain/studio/route-evidence";
import { type StudioRoute, StudioRoutesResponseSchema } from "@bp/domain/studio/routes";
import { arg, defineCommand, z } from "@liche/core";
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
  normalizeBusRouteKey,
} from "../../lib/mta-wiki-canonical.ts";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";

const defaultRoutesPath = fromRepoRoot("data/artifacts/studio/v1/routes.json");
const defaultOutputPath = fromRepoRoot("data/artifacts/studio/v2/wiki/route-evidence.json");

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
  generatedAt?: string | undefined;
  minMatchedRoutes?: number | undefined;
};

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

function routeWorkFor(routes: readonly StudioRoute[]): {
  works: RouteWork[];
  byRouteKey: Map<string, RouteWork[]>;
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
  for (const work of works) {
    for (const key of routeKeysForStudioRoute(work.route)) {
      const existing = byRouteKey.get(key) ?? [];
      existing.push(work);
      byRouteKey.set(key, existing);
    }
  }
  return { works, byRouteKey };
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
      work.omittedAmbiguousRecordCount += 1;
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

export function buildStudioRouteEvidenceArtifact(input: {
  generatedAt: string;
  routes: readonly StudioRoute[];
  corpus: MtaWikiCanonicalCorpus;
}): StudioRouteEvidenceArtifact {
  const { works, byRouteKey } = routeWorkFor(input.routes);
  let unmatchedWikiRouteCount = 0;

  for (const wikiRoute of input.corpus.routes) {
    const routeKeys = routeKeysForWikiRoute(wikiRoute);
    const matchedWorks = new Set<RouteWork>();
    for (const routeKey of routeKeys) {
      for (const work of byRouteKey.get(routeKey) ?? []) matchedWorks.add(work);
    }
    if (matchedWorks.size === 0) {
      unmatchedWikiRouteCount += 1;
      continue;
    }
    for (const work of matchedWorks) {
      work.wikiRoutes.set(wikiRoute.record_id, wikiRoute);
      for (const alias of routeAliasesForWikiRoute(wikiRoute)) work.aliases.add(alias);
    }
  }

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

  for (const record of factRecords) {
    for (const routeKey of directPayloadRouteKeys(record)) {
      for (const work of byRouteKey.get(routeKey) ?? []) addRecordToRoute(work, record);
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
        work.omittedAmbiguousRecordCount += 1;
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
        work.omittedAmbiguousRecordCount += 1;
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
  const routes = await loadStudioRoutes(routesPath);
  const corpus = await loadMtaWikiCanonicalCorpus(input.mtaWikiRoot);
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
  return artifact;
}

const optionsSchema = z.object({
  mtaWikiRoot: z.string().optional().describe("Path to the mta-wiki repo root."),
  routesPath: z.string().optional().describe("Studio routes.json path."),
  output: z.string().optional().describe("Output route evidence JSON artifact path."),
  generatedAt: z.string().optional(),
  minMatchedRoutes: arg
    .positiveInt()
    .default(1)
    .describe("Fail if fewer than this many Bus routes match MTA-wiki route records."),
});

const commandOutputSchema = z.object({
  outputPath: z.string(),
  routeCount: z.number().int().nonnegative(),
  matchedBusRouteCount: z.number().int().nonnegative(),
  unmatchedWikiRouteCount: z.number().int().nonnegative(),
  citationCount: z.number().int().nonnegative(),
  omittedAmbiguousRecordCount: z.number().int().nonnegative(),
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
    return {
      outputPath,
      routeCount: artifact.summary.routeCount,
      matchedBusRouteCount: artifact.summary.matchedBusRouteCount,
      unmatchedWikiRouteCount: artifact.summary.unmatchedWikiRouteCount,
      citationCount: artifact.summary.citationCount,
      omittedAmbiguousRecordCount: artifact.summary.omittedAmbiguousRecordCount,
    };
  },
});
