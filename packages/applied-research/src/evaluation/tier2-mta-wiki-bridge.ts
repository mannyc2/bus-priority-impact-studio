type JsonRecord = Record<string, unknown>;

export type MtaWikiCanonicalRecord = {
  record_id: string;
  record_kind: string;
  source_id?: string;
  source_ids?: string[];
  record_aliases?: string[];
  local_observation_id?: string;
  local_observation_ids?: string[];
  display_name?: string;
  raw_text?: string;
  payload?: JsonRecord;
  evidence_refs?: JsonRecord[];
  truth_status?: string;
  review_state?: string;
  generated_at?: string;
};

export type MtaWikiBridgeCanonicalInputs = {
  sources: readonly MtaWikiCanonicalRecord[];
  routes: readonly MtaWikiCanonicalRecord[];
  projects: readonly MtaWikiCanonicalRecord[];
  events: readonly MtaWikiCanonicalRecord[];
  treatmentComponents: readonly MtaWikiCanonicalRecord[];
  relations: readonly MtaWikiCanonicalRecord[];
};

export type MtaWikiBridgeEvidencePreview = {
  recordId: string;
  recordKind: string;
  evidenceId: string | null;
  sourcePath: string | null;
  pageNumber: number | null;
  quote: string | null;
};

export type MtaWikiBridgeReviewGroup = {
  groupId: string;
  sourceId: string;
  sourceLabel: string;
  routeIds: string[];
  projectIds: string[];
  eventIds: string[];
  treatmentComponentIds: string[];
  relationIds: string[];
  firstDate: string | null;
  lastDate: string | null;
  reviewStateCounts: Record<string, number>;
  truthStatusCounts: Record<string, number>;
  evidenceRefCount: number;
  evidencePreviews: MtaWikiBridgeEvidencePreview[];
  promotionReadiness: {
    status: "needs_manual_review";
    reasons: string[];
  };
};

export type MtaWikiTier2BridgeArtifact = {
  version: 1;
  mtaWikiCanonicalBridge: true;
  generatedAt: string;
  mtaWikiRoot: string | null;
  canonicalRoot: string | null;
  outputPath: string | null;
  inputs: {
    sourceCount: number;
    routeCount: number;
    projectCount: number;
    eventCount: number;
    treatmentComponentCount: number;
    relationCount: number;
  };
  summary: {
    externalCorpus: "mta-wiki";
    publicPromotionStatus: "not_ready";
    sourceCount: number;
    routeCount: number;
    projectCount: number;
    eventCount: number;
    treatmentComponentCount: number;
    relationCount: number;
    interventionCandidateRecordCount: number;
    reviewGroupCount: number;
    reviewGroupsWithRoutes: number;
    reviewGroupsWithoutRoutes: number;
    eventReviewStateCounts: Record<string, number>;
    treatmentComponentReviewStateCounts: Record<string, number>;
    projectReviewStateCounts: Record<string, number>;
    canonicalFactTruthStatusCounts: Record<string, number>;
    promotionBlockers: string[];
  };
  reviewGroups: MtaWikiBridgeReviewGroup[];
  nextActions: string[];
};

export type Tier2SourceQueueForMtaWikiAlignment = {
  generatedAt?: string;
  summary?: {
    sourceCount?: number;
  };
  items: Array<{
    queueRef: string;
    sourceId: string;
    sourceTitle: string | null;
    reviewLane: string;
    priority: string;
    routeIds: string[];
  }>;
};

export type MtaWikiTier2SourceAlignmentRow = {
  queueRef: string;
  queueSourceId: string;
  queueSourceTitle: string | null;
  reviewLane: string;
  priority: string;
  queueRouteIds: string[];
  mtaWikiGroupId: string;
  mtaWikiSourceId: string;
  mtaWikiSourceLabel: string;
  alignmentKind: "exact_normalized_source_key";
  alignmentKeys: string[];
  mtaWikiRouteIds: string[];
  projectIds: string[];
  eventIds: string[];
  treatmentComponentIds: string[];
  relationIds: string[];
  candidateRecordCount: number;
  evidenceRefCount: number;
  promotionReadiness: MtaWikiBridgeReviewGroup["promotionReadiness"];
};

export type MtaWikiTier2SourceAlignmentArtifact = {
  artifactKind: "bp.tier2_mta_wiki_source_alignment.v1";
  schemaVersion: 1;
  generatedAt: string;
  sourceQueuePath: string | null;
  sourceQueueGeneratedAt: string | null;
  mtaWikiBridgePath: string | null;
  mtaWikiBridgeGeneratedAt: string | null;
  summary: {
    queueSourceCount: number;
    mtaWikiReviewGroupCount: number;
    exactAlignedSourceCount: number;
    exactAlignedReviewGroupCount: number;
    unalignedQueueSourceCount: number;
    unalignedMtaWikiReviewGroupCount: number;
    alignedInterventionCandidateRecordCount: number;
    alignedEvidenceRefCount: number;
    publicPromotionStatus: "not_ready";
    promotionBlockers: string[];
  };
  policy: {
    alignmentRule: string;
    publicPromotionRule: string;
  };
  alignedSources: MtaWikiTier2SourceAlignmentRow[];
  unalignedQueueSources: Array<{
    queueRef: string;
    sourceId: string;
    sourceTitle: string | null;
    reviewLane: string;
    priority: string;
  }>;
  unalignedMtaWikiReviewGroups: Array<{
    groupId: string;
    sourceId: string;
    sourceLabel: string;
    routeIds: string[];
    candidateRecordCount: number;
    evidenceRefCount: number;
  }>;
  nextActions: string[];
};

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const text = stringValue(item);
        return text === null ? [] : [text];
      })
    : [];
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizedSourceKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/^source[_-]/u, "")
    .replace(/[^a-z0-9]/gu, "");
}

function queueSourceAlignmentKeys(sourceId: string): string[] {
  const prefixes = [
    "nyc_dot_bus_priority_document_pdf_",
    "nyc_dot_select_bus_service_pdf_",
    "mta_info_pdf_",
    "mta_info_article_",
  ];
  const keys = [sourceId];
  for (const prefix of prefixes) {
    if (sourceId.startsWith(prefix)) keys.push(sourceId.slice(prefix.length));
  }
  return sorted(keys.map(normalizedSourceKey).filter((key) => key.length > 0));
}

function mtaWikiGroupAlignmentKeys(group: MtaWikiBridgeReviewGroup): string[] {
  return sorted(
    [group.sourceId, group.sourceLabel]
      .map(normalizedSourceKey)
      .filter((key) => key.length > 0),
  );
}

function countBy(values: Iterable<string | null | undefined>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value === undefined || value === null || value.length === 0 ? "unknown" : value;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function incrementCount(counts: Record<string, number>, key: string | null | undefined): void {
  const normalized = key === undefined || key === null || key.length === 0 ? "unknown" : key;
  counts[normalized] = (counts[normalized] ?? 0) + 1;
}

function sourceIdsFor(record: MtaWikiCanonicalRecord): string[] {
  return sorted([
    ...stringArray(record.source_ids),
    ...(stringValue(record.source_id) !== null ? [stringValue(record.source_id)!] : []),
  ]);
}

function payload(record: MtaWikiCanonicalRecord): JsonRecord {
  return asRecord(record.payload);
}

function evidenceRefs(record: MtaWikiCanonicalRecord): JsonRecord[] {
  return Array.isArray(record.evidence_refs)
    ? record.evidence_refs.map((item) => asRecord(item))
    : [];
}

function normalizeRouteId(value: string): string | null {
  const withoutDecorators = value
    .trim()
    .toUpperCase()
    .replace(/\bSELECT BUS SERVICE\b/gu, "")
    .replace(/\bSBS\b/gu, "")
    .replace(/\bLOCAL\b/gu, "")
    .replace(/\bLIMITED\b/gu, "")
    .replace(/\bLTD\b/gu, "")
    .replace(/\+/gu, "")
    .replace(/-/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const match = withoutDecorators.match(/\b(?:BX|BM|B|M|Q|S|SIM|X)\d{1,3}[A-Z]?\b/u);
  return match?.[0] ?? null;
}

function routeLabelFromRouteRecord(record: MtaWikiCanonicalRecord): string | null {
  const rowPayload = payload(record);
  return (
    stringValue(rowPayload["route_id"]) ??
    stringValue(rowPayload["route_label"]) ??
    stringValue(rowPayload["route"]) ??
    null
  );
}

function buildRouteRecordLookup(routes: readonly MtaWikiCanonicalRecord[]): Map<string, string> {
  const byRecordId = new Map<string, string>();
  for (const route of routes) {
    const label = routeLabelFromRouteRecord(route);
    const normalized = label === null ? null : normalizeRouteId(label);
    if (normalized === null) continue;
    for (const id of [
      route.record_id,
      ...stringArray(route.record_aliases),
      ...stringArray(route.local_observation_ids),
      ...(stringValue(route.local_observation_id) !== null
        ? [stringValue(route.local_observation_id)!]
        : []),
    ]) {
      byRecordId.set(id, normalized);
    }
  }
  return byRecordId;
}

function routeIdsFromPayloadRecord(record: MtaWikiCanonicalRecord): string[] {
  const rowPayload = payload(record);
  const routeId = stringValue(rowPayload["route_id"]);
  const routeLabel = stringValue(rowPayload["route_label"]);
  const route = stringValue(rowPayload["route"]);
  const routeValues = [
    ...stringArray(rowPayload["routes"]),
    ...stringArray(rowPayload["route_ids"]),
    ...stringArray(rowPayload["routeIds"]),
    ...stringArray(rowPayload["routes_served"]),
    ...stringArray(rowPayload["related_existing_routes"]),
    ...(routeId !== null ? [routeId] : []),
    ...(routeLabel !== null ? [routeLabel] : []),
    ...(route !== null ? [route] : []),
  ];
  return sorted(routeValues.flatMap((value) => normalizeRouteId(value) ?? []));
}

function routeIdsFromRelation(
  relation: MtaWikiCanonicalRecord,
  routeLookup: Map<string, string>,
): string[] {
  const rowPayload = payload(relation);
  const ids = [
    stringValue(rowPayload["subject_id"]),
    stringValue(rowPayload["object_id"]),
    stringValue(rowPayload["subject_local_observation_id"]),
    stringValue(rowPayload["object_local_observation_id"]),
  ].flatMap((value) => (value === null ? [] : [value]));
  const routes: string[] = [];
  for (const id of ids) {
    const route = routeLookup.get(id);
    if (route !== undefined) routes.push(route);
  }
  return sorted(routes);
}

function projectIdsFromRelation(relation: MtaWikiCanonicalRecord): string[] {
  const rowPayload = payload(relation);
  return [
    stringValue(rowPayload["subject_id"]),
    stringValue(rowPayload["object_id"]),
    stringValue(rowPayload["subject_local_observation_id"]),
    stringValue(rowPayload["object_local_observation_id"]),
  ].flatMap((value) => (value !== null && value.startsWith("project_") ? [value] : []));
}

function candidateDate(record: MtaWikiCanonicalRecord): string | null {
  const rowPayload = payload(record);
  const normalized = asRecord(rowPayload["date_text_normalized"]);
  return (
    stringValue(rowPayload["date_normalized"]) ??
    stringValue(normalized["normalized_date"]) ??
    stringValue(rowPayload["effective_date"]) ??
    stringValue(rowPayload["date_text"]) ??
    null
  );
}

function sourceLabel(source: MtaWikiCanonicalRecord | undefined, sourceId: string): string {
  if (source === undefined) return sourceId;
  const rowPayload = payload(source);
  return (
    stringValue(source.display_name) ??
    stringValue(rowPayload["title"]) ??
    stringValue(rowPayload["name"]) ??
    stringValue(rowPayload["source_title"]) ??
    sourceId
  );
}

function evidencePreview(
  record: MtaWikiCanonicalRecord,
  ref: JsonRecord,
): MtaWikiBridgeEvidencePreview {
  return {
    recordId: record.record_id,
    recordKind: record.record_kind,
    evidenceId: stringValue(ref["evidence_id"]),
    sourcePath: stringValue(ref["source_path"]),
    pageNumber: typeof ref["page_number"] === "number" ? ref["page_number"] : null,
    quote: stringValue(ref["source_quote"]),
  };
}

type MutableReviewGroup = {
  sourceId: string;
  routeIds: Set<string>;
  projectIds: Set<string>;
  eventIds: Set<string>;
  treatmentComponentIds: Set<string>;
  relationIds: Set<string>;
  dates: Set<string>;
  reviewStateCounts: Record<string, number>;
  truthStatusCounts: Record<string, number>;
  evidenceRefCount: number;
  evidencePreviews: MtaWikiBridgeEvidencePreview[];
};

function createMutableGroup(sourceId: string): MutableReviewGroup {
  return {
    sourceId,
    routeIds: new Set(),
    projectIds: new Set(),
    eventIds: new Set(),
    treatmentComponentIds: new Set(),
    relationIds: new Set(),
    dates: new Set(),
    reviewStateCounts: {},
    truthStatusCounts: {},
    evidenceRefCount: 0,
    evidencePreviews: [],
  };
}

function addEvidencePreviews(group: MutableReviewGroup, record: MtaWikiCanonicalRecord): void {
  const refs = evidenceRefs(record);
  group.evidenceRefCount += refs.length;
  for (const ref of refs) {
    if (group.evidencePreviews.length >= 6) return;
    group.evidencePreviews.push(evidencePreview(record, ref));
  }
}

function addCandidateRecord(group: MutableReviewGroup, record: MtaWikiCanonicalRecord): void {
  incrementCount(group.reviewStateCounts, record.review_state);
  incrementCount(group.truthStatusCounts, record.truth_status);
  for (const route of routeIdsFromPayloadRecord(record)) group.routeIds.add(route);
  const date = candidateDate(record);
  if (date !== null) group.dates.add(date);
  if (record.record_kind === "project") group.projectIds.add(record.record_id);
  if (record.record_kind === "event") group.eventIds.add(record.record_id);
  if (record.record_kind === "treatment_component") {
    group.treatmentComponentIds.add(record.record_id);
  }
  addEvidencePreviews(group, record);
}

function promotionBlockersForSummary(input: {
  eventReviewStateCounts: Record<string, number>;
  treatmentComponentReviewStateCounts: Record<string, number>;
  projectReviewStateCounts: Record<string, number>;
}): string[] {
  const blockers: string[] = [];
  const unreviewed =
    (input.eventReviewStateCounts["unreviewed"] ?? 0) +
    (input.treatmentComponentReviewStateCounts["unreviewed"] ?? 0) +
    (input.projectReviewStateCounts["unreviewed"] ?? 0);
  if (unreviewed > 0) {
    blockers.push(
      `${unreviewed.toLocaleString("en-US")} mta-wiki intervention candidate record(s) are still review_state=unreviewed.`,
    );
  }
  blockers.push(
    "mta-wiki identity/canonicalization review is not the same contract as Bus Studio publishable intervention disposition.",
  );
  blockers.push(
    "Project/event/treatment rows must be collapsed into bp.document_intervention_record.v1 records before promotion.",
  );
  return blockers;
}

function nextActionsForBridge(summary: MtaWikiTier2BridgeArtifact["summary"]): string[] {
  return [
    "Review the mta-wiki bridge groups and promote source-backed projects/events/treatments into bp.document_intervention_record.v1 records.",
    "Record explicit manual dispositions for every promoted or rejected record before generating intervention-publishable-v1.json.",
    summary.reviewGroupsWithoutRoutes > 0
      ? "Resolve route links for source groups without route IDs before using them for route-level Studio timelines."
      : "All mta-wiki review groups currently have at least one route link; preserve that in the reviewed corpus.",
  ];
}

export function buildMtaWikiTier2BridgeArtifact(input: {
  generatedAt: string;
  mtaWikiRoot?: string | null;
  canonicalRoot?: string | null;
  outputPath?: string | null;
  canonical: MtaWikiBridgeCanonicalInputs;
}): MtaWikiTier2BridgeArtifact {
  const sourceById = new Map<string, MtaWikiCanonicalRecord>();
  for (const source of input.canonical.sources) {
    for (const sourceId of [source.record_id, ...sourceIdsFor(source)]) {
      sourceById.set(sourceId, source);
    }
  }

  const routeLookup = buildRouteRecordLookup(input.canonical.routes);
  const groups = new Map<string, MutableReviewGroup>();
  const ensureGroup = (sourceId: string): MutableReviewGroup => {
    const existing = groups.get(sourceId);
    if (existing !== undefined) return existing;
    const created = createMutableGroup(sourceId);
    groups.set(sourceId, created);
    return created;
  };

  for (const record of [
    ...input.canonical.projects,
    ...input.canonical.events,
    ...input.canonical.treatmentComponents,
  ]) {
    for (const sourceId of sourceIdsFor(record)) addCandidateRecord(ensureGroup(sourceId), record);
  }

  for (const relation of input.canonical.relations) {
    const routeIds = routeIdsFromRelation(relation, routeLookup);
    const projectIds = projectIdsFromRelation(relation);
    if (routeIds.length === 0 && projectIds.length === 0) continue;
    for (const sourceId of sourceIdsFor(relation)) {
      const group = ensureGroup(sourceId);
      group.relationIds.add(relation.record_id);
      for (const routeId of routeIds) group.routeIds.add(routeId);
      for (const projectId of projectIds) group.projectIds.add(projectId);
      addEvidencePreviews(group, relation);
    }
  }

  const reviewGroups = [...groups.values()]
    .filter(
      (group) =>
        group.projectIds.size + group.eventIds.size + group.treatmentComponentIds.size > 0,
    )
    .map((group): MtaWikiBridgeReviewGroup => {
      const dates = sorted(group.dates);
      const reasons = [
        "source-stated facts need explicit Bus Studio intervention review",
        "not yet collapsed to bp.document_intervention_record.v1",
      ];
      if (group.routeIds.size === 0) reasons.push("route linkage missing or ambiguous");
      return {
        groupId: `mta_wiki:${group.sourceId}`,
        sourceId: group.sourceId,
        sourceLabel: sourceLabel(sourceById.get(group.sourceId), group.sourceId),
        routeIds: sorted(group.routeIds),
        projectIds: sorted(group.projectIds),
        eventIds: sorted(group.eventIds),
        treatmentComponentIds: sorted(group.treatmentComponentIds),
        relationIds: sorted(group.relationIds),
        firstDate: dates[0] ?? null,
        lastDate: dates[dates.length - 1] ?? null,
        reviewStateCounts: Object.fromEntries(
          Object.entries(group.reviewStateCounts).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
        truthStatusCounts: Object.fromEntries(
          Object.entries(group.truthStatusCounts).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
        evidenceRefCount: group.evidenceRefCount,
        evidencePreviews: group.evidencePreviews,
        promotionReadiness: {
          status: "needs_manual_review",
          reasons,
        },
      };
    })
    .sort((left, right) => {
      const routeDelta = right.routeIds.length - left.routeIds.length;
      if (routeDelta !== 0) return routeDelta;
      const candidateDelta =
        right.projectIds.length +
        right.eventIds.length +
        right.treatmentComponentIds.length -
        (left.projectIds.length + left.eventIds.length + left.treatmentComponentIds.length);
      if (candidateDelta !== 0) return candidateDelta;
      return left.sourceId.localeCompare(right.sourceId);
    });

  const eventReviewStateCounts = countBy(input.canonical.events.map((record) => record.review_state));
  const treatmentComponentReviewStateCounts = countBy(
    input.canonical.treatmentComponents.map((record) => record.review_state),
  );
  const projectReviewStateCounts = countBy(
    input.canonical.projects.map((record) => record.review_state),
  );
  const canonicalFactTruthStatusCounts = countBy(
    [
      ...input.canonical.projects,
      ...input.canonical.events,
      ...input.canonical.treatmentComponents,
    ].map((record) => record.truth_status),
  );

  const summary: MtaWikiTier2BridgeArtifact["summary"] = {
    externalCorpus: "mta-wiki",
    publicPromotionStatus: "not_ready",
    sourceCount: input.canonical.sources.length,
    routeCount: input.canonical.routes.length,
    projectCount: input.canonical.projects.length,
    eventCount: input.canonical.events.length,
    treatmentComponentCount: input.canonical.treatmentComponents.length,
    relationCount: input.canonical.relations.length,
    interventionCandidateRecordCount:
      input.canonical.projects.length +
      input.canonical.events.length +
      input.canonical.treatmentComponents.length,
    reviewGroupCount: reviewGroups.length,
    reviewGroupsWithRoutes: reviewGroups.filter((group) => group.routeIds.length > 0).length,
    reviewGroupsWithoutRoutes: reviewGroups.filter((group) => group.routeIds.length === 0).length,
    eventReviewStateCounts,
    treatmentComponentReviewStateCounts,
    projectReviewStateCounts,
    canonicalFactTruthStatusCounts,
    promotionBlockers: promotionBlockersForSummary({
      eventReviewStateCounts,
      treatmentComponentReviewStateCounts,
      projectReviewStateCounts,
    }),
  };

  return {
    version: 1,
    mtaWikiCanonicalBridge: true,
    generatedAt: input.generatedAt,
    mtaWikiRoot: input.mtaWikiRoot ?? null,
    canonicalRoot: input.canonicalRoot ?? null,
    outputPath: input.outputPath ?? null,
    inputs: {
      sourceCount: input.canonical.sources.length,
      routeCount: input.canonical.routes.length,
      projectCount: input.canonical.projects.length,
      eventCount: input.canonical.events.length,
      treatmentComponentCount: input.canonical.treatmentComponents.length,
      relationCount: input.canonical.relations.length,
    },
    summary,
    reviewGroups,
    nextActions: nextActionsForBridge(summary),
  };
}

export function buildMtaWikiTier2SourceAlignmentArtifact(input: {
  generatedAt: string;
  sourceQueue: Tier2SourceQueueForMtaWikiAlignment;
  sourceQueuePath?: string | null;
  mtaWikiBridge: MtaWikiTier2BridgeArtifact;
  mtaWikiBridgePath?: string | null;
}): MtaWikiTier2SourceAlignmentArtifact {
  const groupsByKey = new Map<string, MtaWikiBridgeReviewGroup[]>();
  for (const group of input.mtaWikiBridge.reviewGroups) {
    for (const key of mtaWikiGroupAlignmentKeys(group)) {
      const existing = groupsByKey.get(key);
      if (existing === undefined) groupsByKey.set(key, [group]);
      else existing.push(group);
    }
  }

  const matchedGroupIds = new Set<string>();
  const alignedSources: MtaWikiTier2SourceAlignmentRow[] = [];
  const unalignedQueueSources: MtaWikiTier2SourceAlignmentArtifact["unalignedQueueSources"] = [];

  for (const item of input.sourceQueue.items) {
    const itemKeys = queueSourceAlignmentKeys(item.sourceId);
    const matches = new Map<string, { group: MtaWikiBridgeReviewGroup; keys: Set<string> }>();
    for (const key of itemKeys) {
      for (const group of groupsByKey.get(key) ?? []) {
        const existing = matches.get(group.groupId);
        if (existing === undefined) {
          matches.set(group.groupId, { group, keys: new Set([key]) });
        } else {
          existing.keys.add(key);
        }
      }
    }
    if (matches.size === 0) {
      unalignedQueueSources.push({
        queueRef: item.queueRef,
        sourceId: item.sourceId,
        sourceTitle: item.sourceTitle,
        reviewLane: item.reviewLane,
        priority: item.priority,
      });
      continue;
    }
    for (const { group, keys } of matches.values()) {
      matchedGroupIds.add(group.groupId);
      alignedSources.push({
        queueRef: item.queueRef,
        queueSourceId: item.sourceId,
        queueSourceTitle: item.sourceTitle,
        reviewLane: item.reviewLane,
        priority: item.priority,
        queueRouteIds: sorted(item.routeIds),
        mtaWikiGroupId: group.groupId,
        mtaWikiSourceId: group.sourceId,
        mtaWikiSourceLabel: group.sourceLabel,
        alignmentKind: "exact_normalized_source_key",
        alignmentKeys: sorted(keys),
        mtaWikiRouteIds: group.routeIds,
        projectIds: group.projectIds,
        eventIds: group.eventIds,
        treatmentComponentIds: group.treatmentComponentIds,
        relationIds: group.relationIds,
        candidateRecordCount:
          group.projectIds.length + group.eventIds.length + group.treatmentComponentIds.length,
        evidenceRefCount: group.evidenceRefCount,
        promotionReadiness: group.promotionReadiness,
      });
    }
  }

  alignedSources.sort(
    (left, right) =>
      left.queueRef.localeCompare(right.queueRef) ||
      left.mtaWikiGroupId.localeCompare(right.mtaWikiGroupId),
  );
  unalignedQueueSources.sort((left, right) => left.queueRef.localeCompare(right.queueRef));

  const unalignedMtaWikiReviewGroups = input.mtaWikiBridge.reviewGroups
    .filter((group) => !matchedGroupIds.has(group.groupId))
    .map((group) => ({
      groupId: group.groupId,
      sourceId: group.sourceId,
      sourceLabel: group.sourceLabel,
      routeIds: group.routeIds,
      candidateRecordCount:
        group.projectIds.length + group.eventIds.length + group.treatmentComponentIds.length,
      evidenceRefCount: group.evidenceRefCount,
    }))
    .sort((left, right) => left.groupId.localeCompare(right.groupId));

  const alignedInterventionCandidateRecordCount = alignedSources.reduce(
    (sum, row) => sum + row.candidateRecordCount,
    0,
  );
  const alignedEvidenceRefCount = alignedSources.reduce(
    (sum, row) => sum + row.evidenceRefCount,
    0,
  );

  return {
    artifactKind: "bp.tier2_mta_wiki_source_alignment.v1",
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceQueuePath: input.sourceQueuePath ?? null,
    sourceQueueGeneratedAt: stringValue(input.sourceQueue.generatedAt),
    mtaWikiBridgePath: input.mtaWikiBridgePath ?? input.mtaWikiBridge.outputPath,
    mtaWikiBridgeGeneratedAt: input.mtaWikiBridge.generatedAt,
    summary: {
      queueSourceCount: input.sourceQueue.items.length,
      mtaWikiReviewGroupCount: input.mtaWikiBridge.reviewGroups.length,
      exactAlignedSourceCount: new Set(alignedSources.map((row) => row.queueSourceId)).size,
      exactAlignedReviewGroupCount: matchedGroupIds.size,
      unalignedQueueSourceCount: unalignedQueueSources.length,
      unalignedMtaWikiReviewGroupCount: unalignedMtaWikiReviewGroups.length,
      alignedInterventionCandidateRecordCount,
      alignedEvidenceRefCount,
      publicPromotionStatus: "not_ready",
      promotionBlockers: [
        "mta-wiki source alignment is review context, not reviewed intervention records",
        "aligned project/event/treatment rows must still be collapsed into bp.document_intervention_record.v1 records",
        "source receipt closure still requires valid reviewed records or explicit source disposition receipts",
      ],
    },
    policy: {
      alignmentRule:
        "Queue sources align to mta-wiki review groups only when a source id matches after removing known Bus Studio prefixes and punctuation.",
      publicPromotionRule:
        "Do not publish facts from this alignment. It only routes external mta-wiki context into the Tier 2 source review workflow.",
    },
    alignedSources,
    unalignedQueueSources,
    unalignedMtaWikiReviewGroups,
    nextActions: [
      "Use aligned mta-wiki groups as context while authoring reviewed bp.document_intervention_record.v1 records for matching queue sources.",
      "Keep unaligned mta-wiki groups in a separate review lane until a reviewer maps them to a Tier 2 source or rejects them.",
      "Rerun the source receipt closure audit after reviewed records or source disposition receipts are written.",
    ],
  };
}

export function renderMtaWikiTier2SourceAlignmentMarkdown(
  artifact: MtaWikiTier2SourceAlignmentArtifact,
): string {
  const lines = [
    "# mta-wiki Tier 2 Source Alignment",
    "",
    `Generated: ${artifact.generatedAt}`,
    "",
    "## Summary",
    "",
    `- public promotion status: \`${artifact.summary.publicPromotionStatus}\``,
    `- queue sources: ${artifact.summary.queueSourceCount}`,
    `- mta-wiki review groups: ${artifact.summary.mtaWikiReviewGroupCount}`,
    `- exact aligned queue sources: ${artifact.summary.exactAlignedSourceCount}`,
    `- exact aligned mta-wiki groups: ${artifact.summary.exactAlignedReviewGroupCount}`,
    `- unaligned queue sources: ${artifact.summary.unalignedQueueSourceCount}`,
    `- unaligned mta-wiki groups: ${artifact.summary.unalignedMtaWikiReviewGroupCount}`,
    `- aligned candidate records: ${artifact.summary.alignedInterventionCandidateRecordCount}`,
    `- aligned evidence refs: ${artifact.summary.alignedEvidenceRefCount}`,
    "",
    "Promotion blockers:",
    ...artifact.summary.promotionBlockers.map((blocker) => `- ${blocker}`),
    "",
    "## Aligned Sources",
    "",
    "| Queue | Source | mta-wiki source | Routes | Candidates | Evidence refs |",
    "| --- | --- | --- | ---: | ---: | ---: |",
  ];

  for (const row of artifact.alignedSources.slice(0, 75)) {
    lines.push(
      [
        `\`${row.queueRef}\``,
        `\`${row.queueSourceId}\``,
        `\`${row.mtaWikiSourceId}\``,
        row.mtaWikiRouteIds.length,
        row.candidateRecordCount,
        row.evidenceRefCount,
      ].join(" | "),
    );
  }
  if (artifact.alignedSources.length > 75) {
    lines.push(`| ... ${artifact.alignedSources.length - 75} more alignment(s) | - | - | - | - | - |`);
  }

  lines.push("", "## Next Actions", "");
  for (const action of artifact.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return lines.join("\n");
}

export function renderMtaWikiTier2BridgeMarkdown(
  artifact: MtaWikiTier2BridgeArtifact,
): string {
  const lines = [
    "# mta-wiki Tier 2 Bridge",
    "",
    `Generated: ${artifact.generatedAt}`,
    `mta-wiki root: \`${artifact.mtaWikiRoot ?? "unknown"}\``,
    `Canonical root: \`${artifact.canonicalRoot ?? "unknown"}\``,
    "",
    "## Summary",
    "",
    `- public promotion status: \`${artifact.summary.publicPromotionStatus}\``,
    `- sources: ${artifact.summary.sourceCount}`,
    `- routes: ${artifact.summary.routeCount}`,
    `- projects: ${artifact.summary.projectCount}`,
    `- events: ${artifact.summary.eventCount}`,
    `- treatment components: ${artifact.summary.treatmentComponentCount}`,
    `- relations: ${artifact.summary.relationCount}`,
    `- intervention candidate records: ${artifact.summary.interventionCandidateRecordCount}`,
    `- review groups: ${artifact.summary.reviewGroupCount}`,
    `- review groups with routes: ${artifact.summary.reviewGroupsWithRoutes}`,
    `- review groups without routes: ${artifact.summary.reviewGroupsWithoutRoutes}`,
    "",
    "Promotion blockers:",
    ...artifact.summary.promotionBlockers.map((blocker) => `- ${blocker}`),
    "",
    "## Review Groups",
    "",
    "| Source | Routes | Projects | Events | Treatments | Evidence Refs | Readiness |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];

  for (const group of artifact.reviewGroups.slice(0, 50)) {
    lines.push(
      [
        `\`${group.sourceId}\``,
        group.routeIds.length,
        group.projectIds.length,
        group.eventIds.length,
        group.treatmentComponentIds.length,
        group.evidenceRefCount,
        group.promotionReadiness.status,
      ].join(" | "),
    );
  }
  if (artifact.reviewGroups.length > 50) {
    lines.push(`| ... ${artifact.reviewGroups.length - 50} more group(s) | - | - | - | - | - | - |`);
  }

  lines.push("", "## Next Actions", "");
  for (const action of artifact.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return lines.join("\n");
}
