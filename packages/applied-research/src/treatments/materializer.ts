export const ROUTE_TREATMENT_SUMMARY_SCHEMA_VERSION = 1;

export const ROUTE_TREATMENT_TYPES = [
  "bus_lane",
  "busway",
  "automated_bus_lane_enforcement",
  "transit_signal_priority",
  "select_bus_service",
  "queue_jump",
  "stop_change",
  "route_redesign",
  "all_door_boarding",
  "off_board_fare_collection",
  "capital_project_milestone",
  "custom_treatment",
] as const;

export const DEFAULT_ROUTE_TREATMENT_TYPES = ROUTE_TREATMENT_TYPES;

export type RouteTreatmentType = (typeof ROUTE_TREATMENT_TYPES)[number];

export type RouteTreatmentStatus =
  | "current_confirmed"
  | "implemented"
  | "historical_confirmed"
  | "planned"
  | "proposed"
  | "under_consideration"
  | "candidate"
  | "source_gap"
  | "not_found"
  | "not_applicable";

export type DatePrecision = "day" | "month" | "season" | "year" | "range" | "unknown";

export type GeographyScope = "route" | "corridor" | "segment" | "intersection" | "source_only";

export type RouteTreatmentEvidenceLabel =
  | "deterministic_source"
  | "reviewed_document"
  | "historical_snapshot"
  | "aggregate_source_gap"
  | "candidate_inferred"
  | "not_found";

export type RouteTreatmentConfidence = "high" | "medium" | "low";

export type RouteTreatmentSourceGapKind =
  | "current_inventory_missing"
  | "implementation_date_missing"
  | "route_mapping_missing"
  | "intersection_geometry_missing"
  | "evaluation_missing"
  | "status_currentness_unknown";

export type RouteTreatmentSummaryRow = {
  routeId: string;
  month: string;
  treatmentType: RouteTreatmentType;
  rawTreatmentType: string | null;
  status: RouteTreatmentStatus;
  statusAsOf: string | null;
  effectiveDate: string | null;
  datePrecision: DatePrecision;
  geographyScope: GeographyScope;
  sourceRefs: string[];
  evidenceLabel: RouteTreatmentEvidenceLabel;
  confidence: RouteTreatmentConfidence;
  caveats: string[];
  methodLimitations: string[];
  relatedEventIds: string[];
};

export type SegmentTreatmentSummaryRow = RouteTreatmentSummaryRow & {
  segmentId: string;
  directionId: string | null;
  segmentOrder: number | null;
  matchMethod:
    | "route_level"
    | "route_shape_overlap"
    | "segment_endpoint_text_match"
    | "intersection_geometry"
    | "source_only"
    | "not_matched";
  overlapShare: number | null;
};

export type RouteTreatmentSourceGapRow = {
  routeId: string | null;
  month: string;
  treatmentType: RouteTreatmentType;
  gapKind: RouteTreatmentSourceGapKind;
  sourceRefs: string[];
  publicStatement: string;
  blocksClaims: string[];
};

export type RouteTreatmentEvidenceInput = {
  routeId: string;
  month?: string | null;
  treatmentType: string;
  rawTreatmentType?: string | null;
  status: RouteTreatmentStatus;
  statusAsOf?: string | null;
  effectiveDate?: string | null;
  datePrecision?: DatePrecision | null;
  geographyScope?: GeographyScope | null;
  sourceRefs?: readonly string[];
  evidenceLabel: RouteTreatmentEvidenceLabel;
  confidence?: RouteTreatmentConfidence | null;
  caveats?: readonly string[];
  methodLimitations?: readonly string[];
  relatedEventIds?: readonly string[];
};

export type RouteTreatmentArtifactSource = {
  dbPath: string;
  artifactPath: string;
  summaryPath: string | null;
  routeUniverse: "local_route_catalog";
  checkedTreatmentTypes: RouteTreatmentType[];
  localMissingTables: string[];
  inputs: {
    routeCatalogRowCount: number;
    sourceEvidenceRowCount: number;
    sourceGapRowCount: number;
    segmentTreatmentRowCount: number;
    publishableInterventionCount: number;
  };
};

export type RouteTreatmentSummaryValidationIssue = {
  severity: "info" | "warn" | "fail";
  code: string;
  message: string;
};

export type RouteTreatmentSummaryArtifact = {
  artifactKind: "route_treatment_summary";
  schemaVersion: typeof ROUTE_TREATMENT_SUMMARY_SCHEMA_VERSION;
  generatedAt: string;
  month: string;
  source: RouteTreatmentArtifactSource;
  summary: {
    routeCount: number;
    checkedTreatmentTypeCount: number;
    routeTreatmentRowCount: number;
    routeTreatmentCoverageShare: number;
    routeWithPositiveEvidenceCount: number;
    routeWithSourceGapCount: number;
    segmentTreatmentRowCount: number;
    sourceGapRowCount: number;
    statusCounts: Record<RouteTreatmentStatus, number>;
    treatmentTypeCounts: Record<RouteTreatmentType, number>;
    evidenceLabelCounts: Record<RouteTreatmentEvidenceLabel, number>;
    confidenceCounts: Record<RouteTreatmentConfidence, number>;
  };
  routeTreatmentRows: RouteTreatmentSummaryRow[];
  segmentTreatmentRows: SegmentTreatmentSummaryRow[];
  sourceGapRows: RouteTreatmentSourceGapRow[];
  validation: {
    status: "pass" | "warn" | "fail";
    issues: RouteTreatmentSummaryValidationIssue[];
  };
};

export type RouteTreatmentSummaryInput = {
  month: string;
  routeIds: readonly string[];
  evidenceRows: readonly RouteTreatmentEvidenceInput[];
  sourceGapRows?: readonly RouteTreatmentSourceGapRow[];
  segmentTreatmentRows?: readonly SegmentTreatmentSummaryRow[];
  generatedAt: string;
  dbPath: string;
  artifactPath: string;
  summaryPath?: string | null;
  localMissingTables?: readonly string[];
  publishableInterventionCount?: number;
  checkedTreatmentTypes?: readonly RouteTreatmentType[];
  includeNoDataRows?: boolean;
  includeTspCurrentInventorySourceGap?: boolean;
};

export type RouteTreatmentAceRow = {
  route_id: string;
  program: string;
  implementation_date: string;
};

export type RouteTreatmentBriefSummaryRow = {
  route_id: string;
  month: string;
  bus_lane_matched_lane_count: number;
  ace_active?: number | boolean | null;
};

export type RouteTreatmentInterventionEventRow = {
  event_id: string;
  route_id: string;
  intervention_type: string;
  source_id: string;
  program: string;
  implementation_date: string;
  implementation_month: string;
  event_status: string;
  description: string;
};

export type RouteTreatmentTier2EventRow = {
  event_id: string;
  route_id: string;
  candidate_id: string;
  source_id: string;
  source_title: string | null;
  source_url: string | null;
  intervention_type: string;
  implementation_date: string;
  implementation_month: string;
  date_precision: string;
  event_status: string;
  validation_state: string;
  duplicate_review_state: string;
  promotion_state: string;
};

export type PublishableInterventionLike = {
  recordId?: unknown;
  sourceId?: unknown;
  status?: unknown;
  routes?: unknown;
  primaryTreatments?: unknown;
  customTreatments?: unknown;
  effectiveDate?: unknown;
  datePrecision?: unknown;
  timelineLayer?: unknown;
  treatmentComponents?: unknown;
  evidenceCandidateIds?: unknown;
  evidencePreviews?: unknown;
  caveats?: unknown;
};

const TREATMENT_TYPE_ALIASES: Record<string, RouteTreatmentType> = {
  able: "automated_bus_lane_enforcement",
  ace: "automated_bus_lane_enforcement",
  all_door_boarding: "all_door_boarding",
  automated_bus_lane_enforcement: "automated_bus_lane_enforcement",
  bus_lane: "bus_lane",
  bus_lane_infrastructure: "bus_lane",
  bus_lanes: "bus_lane",
  bus_priority_lane: "bus_lane",
  busway: "busway",
  busway_or_transitway: "busway",
  camera_enforcement: "automated_bus_lane_enforcement",
  capital_project_milestone: "capital_project_milestone",
  curbside_bus_lane: "bus_lane",
  dedicated_bus_lane: "bus_lane",
  documented_bus_priority_intervention: "custom_treatment",
  off_board_fare_collection: "off_board_fare_collection",
  offset_or_curbside_bus_lane: "bus_lane",
  queue_jump: "queue_jump",
  route_redesign: "route_redesign",
  route_redesign_or_service_pattern: "route_redesign",
  select_bus_service: "select_bus_service",
  signal_priority: "transit_signal_priority",
  stop_change: "stop_change",
  stop_consolidation: "stop_change",
  transit_signal_priority: "transit_signal_priority",
  tsp: "transit_signal_priority",
};

const STATUS_ALIASES: Record<string, RouteTreatmentStatus> = {
  active: "current_confirmed",
  candidate: "candidate",
  completed: "implemented",
  current: "current_confirmed",
  current_confirmed: "current_confirmed",
  defer: "candidate",
  future: "planned",
  historical: "historical_confirmed",
  historical_confirmed: "historical_confirmed",
  implemented: "implemented",
  in_progress: "under_consideration",
  missing: "source_gap",
  not_applicable: "not_applicable",
  not_found: "not_found",
  planned: "planned",
  proposed: "proposed",
  source_gap: "source_gap",
  under_consideration: "under_consideration",
};

const STATUS_RANK: Record<RouteTreatmentStatus, number> = {
  current_confirmed: 800,
  implemented: 700,
  historical_confirmed: 650,
  planned: 500,
  proposed: 400,
  under_consideration: 350,
  candidate: 300,
  source_gap: 200,
  not_found: 100,
  not_applicable: 0,
};

const CONFIDENCE_RANK: Record<RouteTreatmentConfidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const DATE_PRECISION_RANK: Record<DatePrecision, number> = {
  day: 6,
  month: 5,
  season: 4,
  year: 3,
  range: 2,
  unknown: 1,
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[\s/-]+/g, "_");
}

function monthIndex(month: string): number | null {
  const match = month.match(/^(\d{4})-(\d{2})/);
  if (match === null) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(monthNumber)) return null;
  return year * 12 + monthNumber - 1;
}

function isoMonthFromDateLike(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.length === 0) return null;
  const match = value.match(/^(\d{4})-(\d{2})/);
  return match === null ? null : `${match[1]}-${match[2]}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function normalizeRouteId(routeId: string): string {
  return routeId.trim().toUpperCase();
}

function canonicalRouteId(
  routeId: string,
  routeUniverse: ReadonlySet<string>,
): string | null {
  const normalized = normalizeRouteId(routeId);
  if (normalized.length === 0) return null;
  if (routeUniverse.size === 0 || routeUniverse.has(normalized)) return normalized;
  const withoutPlus = normalized.replace(/\+$/u, "");
  if (routeUniverse.has(withoutPlus)) return withoutPlus;
  if (!normalized.endsWith("+") && routeUniverse.has(`${normalized}+`)) return `${normalized}+`;
  const q20Branch = normalized.match(/^Q20[AB]$/u);
  if (q20Branch !== null && routeUniverse.has("Q20")) return "Q20";
  const expressVariant = normalized.match(/^(SIM[0-9]+)X$/u);
  if (expressVariant !== null && routeUniverse.has(expressVariant[1]!)) return expressVariant[1]!;
  return null;
}

function routeTreatmentKey(
  row: Pick<RouteTreatmentSummaryRow, "routeId" | "month" | "treatmentType" | "geographyScope">,
): string {
  return [row.routeId, row.month, row.treatmentType, row.geographyScope].join("|");
}

function countBy<T extends string>(values: readonly T[], universe: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(universe.map((value) => [value, 0])) as Record<T, number>;
  for (const value of values) counts[value] += 1;
  return counts;
}

function confidenceForStatus(status: RouteTreatmentStatus): RouteTreatmentConfidence {
  if (status === "current_confirmed" || status === "implemented") return "high";
  if (status === "not_found" || status === "source_gap" || status === "candidate") return "low";
  return "medium";
}

function normalizeDatePrecision(value: unknown): DatePrecision {
  if (
    value === "day" ||
    value === "month" ||
    value === "season" ||
    value === "year" ||
    value === "range" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

function positiveEvidenceStatus(status: RouteTreatmentStatus): boolean {
  return (
    status === "current_confirmed" ||
    status === "implemented" ||
    status === "historical_confirmed" ||
    status === "planned" ||
    status === "proposed" ||
    status === "under_consideration" ||
    status === "candidate"
  );
}

function rowFromEvidence(input: {
  evidence: RouteTreatmentEvidenceInput;
  defaultMonth: string;
  routeUniverse: ReadonlySet<string>;
}): RouteTreatmentSummaryRow | null {
  const routeId = canonicalRouteId(input.evidence.routeId, input.routeUniverse);
  if (routeId === null) return null;
  const treatmentType = normalizeRouteTreatmentType(input.evidence.treatmentType);
  const status = normalizeRouteTreatmentStatus(input.evidence.status);
  return {
    routeId,
    month: input.evidence.month ?? input.defaultMonth,
    treatmentType,
    rawTreatmentType: input.evidence.rawTreatmentType ?? input.evidence.treatmentType,
    status,
    statusAsOf: input.evidence.statusAsOf ?? input.defaultMonth,
    effectiveDate: input.evidence.effectiveDate ?? null,
    datePrecision: input.evidence.datePrecision ?? "unknown",
    geographyScope: input.evidence.geographyScope ?? "route",
    sourceRefs: uniqueSorted([...(input.evidence.sourceRefs ?? [])]),
    evidenceLabel: input.evidence.evidenceLabel,
    confidence: input.evidence.confidence ?? confidenceForStatus(status),
    caveats: uniqueSorted([...(input.evidence.caveats ?? [])]),
    methodLimitations: uniqueSorted([...(input.evidence.methodLimitations ?? [])]),
    relatedEventIds: uniqueSorted([...(input.evidence.relatedEventIds ?? [])]),
  };
}

function betterRouteTreatmentRow(
  left: RouteTreatmentSummaryRow,
  right: RouteTreatmentSummaryRow,
): RouteTreatmentSummaryRow {
  const leftScore =
    STATUS_RANK[left.status] * 100 + CONFIDENCE_RANK[left.confidence] * 10 + DATE_PRECISION_RANK[left.datePrecision];
  const rightScore =
    STATUS_RANK[right.status] * 100 + CONFIDENCE_RANK[right.confidence] * 10 + DATE_PRECISION_RANK[right.datePrecision];
  const winner = rightScore > leftScore ? right : left;
  const loser = winner === left ? right : left;
  return {
    ...winner,
    rawTreatmentType: winner.rawTreatmentType ?? loser.rawTreatmentType,
    sourceRefs: uniqueSorted([...winner.sourceRefs, ...loser.sourceRefs]),
    caveats: uniqueSorted([...winner.caveats, ...loser.caveats]),
    methodLimitations: uniqueSorted([...winner.methodLimitations, ...loser.methodLimitations]),
    relatedEventIds: uniqueSorted([...winner.relatedEventIds, ...loser.relatedEventIds]),
  };
}

function noDataEvidence(input: {
  routeId: string;
  month: string;
  treatmentType: RouteTreatmentType;
}): RouteTreatmentEvidenceInput {
  const isTsp = input.treatmentType === "transit_signal_priority";
  return {
    routeId: input.routeId,
    month: input.month,
    treatmentType: input.treatmentType,
    status: isTsp ? "source_gap" : "not_found",
    statusAsOf: input.month,
    datePrecision: "unknown",
    geographyScope: "route",
    sourceRefs: [
      isTsp
        ? "source_gap:tsp_current_route_intersection_inventory"
        : `source_family:${input.treatmentType}:checked_inputs`,
    ],
    evidenceLabel: isTsp ? "aggregate_source_gap" : "not_found",
    confidence: "low",
    caveats: [
      isTsp
        ? "Current public route/intersection-level TSP inventory is missing, so absence of route evidence is not proof that no TSP exists."
        : "No positive treatment evidence was found in checked deterministic and reviewed-document inputs; this is not proof the treatment does not exist.",
    ],
    methodLimitations: [
      isTsp
        ? "Aggregate TSP counts do not disclose current route/intersection locations."
        : "Checked inputs are local deterministic sources and reviewed Tier 2 records, not a full regulatory inventory.",
    ],
  };
}

function tspCurrentInventorySourceGap(routeId: string, month: string): RouteTreatmentSourceGapRow {
  return {
    routeId,
    month,
    treatmentType: "transit_signal_priority",
    gapKind: "current_inventory_missing",
    sourceRefs: ["source_gap:tsp_current_route_intersection_inventory"],
    publicStatement:
      "Current public route/intersection-level Transit Signal Priority inventory is not available, so current TSP status cannot be confirmed from public data alone.",
    blocksClaims: [
      "current_confirmed transit signal priority by route",
      "intersection-level TSP coverage",
      "absence of TSP on routes without historical/planned evidence",
    ],
  };
}

function validationStatus(
  issues: readonly RouteTreatmentSummaryValidationIssue[],
): "pass" | "warn" | "fail" {
  if (issues.some((issue) => issue.severity === "fail")) return "fail";
  if (issues.some((issue) => issue.severity === "warn")) return "warn";
  return "pass";
}

export function normalizeRouteTreatmentType(value: string): RouteTreatmentType {
  const normalized = normalizeText(value);
  return TREATMENT_TYPE_ALIASES[normalized] ?? "custom_treatment";
}

export function normalizeRouteTreatmentStatus(value: string): RouteTreatmentStatus {
  const normalized = normalizeText(value);
  return STATUS_ALIASES[normalized] ?? "candidate";
}

export function mergeRouteTreatmentRows(
  rows: readonly RouteTreatmentSummaryRow[],
): RouteTreatmentSummaryRow[] {
  const byKey = new Map<string, RouteTreatmentSummaryRow>();
  for (const row of rows) {
    const key = routeTreatmentKey(row);
    const existing = byKey.get(key);
    byKey.set(key, existing === undefined ? row : betterRouteTreatmentRow(existing, row));
  }
  return [...byKey.values()].sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) ||
      left.treatmentType.localeCompare(right.treatmentType) ||
      left.geographyScope.localeCompare(right.geographyScope),
  );
}

export function routeTreatmentSourceRowsFromAce(input: {
  rows: readonly RouteTreatmentAceRow[];
  month: string;
}): RouteTreatmentEvidenceInput[] {
  const releaseIndex = monthIndex(input.month) ?? Number.POSITIVE_INFINITY;
  return input.rows.map((row) => {
    const implementationMonth = isoMonthFromDateLike(row.implementation_date);
    const implementationIndex = monthIndex(implementationMonth ?? "");
    const status =
      implementationIndex !== null && implementationIndex <= releaseIndex ? "current_confirmed" : "planned";
    return {
      routeId: row.route_id,
      month: input.month,
      treatmentType: "automated_bus_lane_enforcement",
      status,
      statusAsOf: input.month,
      effectiveDate: row.implementation_date,
      datePrecision: "day",
      geographyScope: "route",
      sourceRefs: [`local_ace_route:${row.route_id}:${row.program}:${row.implementation_date}`],
      evidenceLabel: "deterministic_source",
      confidence: "high",
      caveats: [`${row.program} route evidence is deterministic route-level enforcement state.`],
      relatedEventIds: [`ace:${row.route_id}:${row.program}:${row.implementation_date.slice(0, 10)}`],
    };
  });
}

export function routeTreatmentSourceRowsFromRouteBriefSummaries(input: {
  rows: readonly RouteTreatmentBriefSummaryRow[];
  month: string;
}): RouteTreatmentEvidenceInput[] {
  return input.rows
    .filter((row) => row.bus_lane_matched_lane_count > 0)
    .map((row) => ({
      routeId: row.route_id,
      month: input.month,
      treatmentType: "bus_lane",
      status: "current_confirmed",
      statusAsOf: input.month,
      datePrecision: "unknown",
      geographyScope: "route",
      sourceRefs: [`local_route_brief_summary:${row.route_id}:${input.month}:bus_lane_overlap`],
      evidenceLabel: "deterministic_source",
      confidence: "medium",
      caveats: [
        `${row.bus_lane_matched_lane_count.toLocaleString("en-US")} matched DOT bus-lane segment(s) overlap the route shape.`,
      ],
      methodLimitations: [
        "Route-shape overlap is treatment context; it is not audited lane mileage or proof the treatment covers every slow segment.",
      ],
    }));
}

export function routeTreatmentSourceRowsFromInterventionEvents(input: {
  rows: readonly RouteTreatmentInterventionEventRow[];
  month: string;
}): RouteTreatmentEvidenceInput[] {
  return input.rows.map((row) => ({
    routeId: row.route_id,
    month: input.month,
    treatmentType: row.intervention_type,
    rawTreatmentType: row.intervention_type,
    status: normalizeRouteTreatmentStatus(row.event_status),
    statusAsOf: input.month,
    effectiveDate: row.implementation_date,
    datePrecision: row.implementation_date.length >= 10 ? "day" : "month",
    geographyScope: "route",
    sourceRefs: [`local_intervention_event:${row.event_id}`, `source:${row.source_id}`],
    evidenceLabel: row.source_id.includes("tier2") ? "reviewed_document" : "deterministic_source",
    confidence: row.event_status === "source_gap" ? "low" : "medium",
    caveats: [row.description],
    relatedEventIds: [row.event_id],
  }));
}

export function routeTreatmentSourceRowsFromTier2Events(input: {
  rows: readonly RouteTreatmentTier2EventRow[];
  month: string;
}): RouteTreatmentEvidenceInput[] {
  return input.rows
    .filter((row) => row.validation_state !== "invalid" && row.promotion_state !== "rejected")
    .map((row) => ({
      routeId: row.route_id,
      month: input.month,
      treatmentType: row.intervention_type,
      rawTreatmentType: row.intervention_type,
      status: normalizeRouteTreatmentStatus(row.event_status),
      statusAsOf: input.month,
      effectiveDate: row.implementation_date,
      datePrecision: normalizeDatePrecision(row.date_precision),
      geographyScope: "route",
      sourceRefs: [
        `local_tier2_intervention_event:${row.event_id}`,
        `candidate:${row.candidate_id}`,
        `source:${row.source_id}`,
      ],
      evidenceLabel: "reviewed_document",
      confidence: row.duplicate_review_state === "accepted" ? "high" : "medium",
      caveats: [
        row.source_title === null
          ? `Tier 2 document event from ${row.source_id}.`
          : `Tier 2 document event from ${row.source_title}.`,
      ],
      relatedEventIds: [row.event_id],
    }));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function routeTreatmentSourceRowsFromPublishableInterventions(input: {
  rows: readonly PublishableInterventionLike[];
  month: string;
}): RouteTreatmentEvidenceInput[] {
  const output: RouteTreatmentEvidenceInput[] = [];
  for (const row of input.rows) {
    const routes = stringArray(row.routes);
    const treatmentTypes = [
      ...stringArray(row.primaryTreatments),
      ...stringArray(row.customTreatments).map(() => "custom_treatment"),
    ];
    const firstTreatment = treatmentTypes[0] ?? "custom_treatment";
    const status = normalizeRouteTreatmentStatus(textValue(row.status) ?? "candidate");
    const sourceId = textValue(row.sourceId) ?? "tier2_publishable";
    const recordId = textValue(row.recordId) ?? "unknown";
    const evidenceIds = stringArray(row.evidenceCandidateIds);
    const datePrecision = normalizeDatePrecision(row.datePrecision);
    const effectiveDate = textValue(row.effectiveDate);
    for (const routeId of routes) {
      output.push({
        routeId,
        month: input.month,
        treatmentType: firstTreatment,
        rawTreatmentType: firstTreatment,
        status,
        statusAsOf: input.month,
        effectiveDate,
        datePrecision,
        geographyScope: "route",
        sourceRefs: [`publishable_intervention:${recordId}`, `source:${sourceId}`, ...evidenceIds.map((id) => `candidate:${id}`)],
        evidenceLabel: "reviewed_document",
        confidence: row.timelineLayer === "canonical_milestone" ? "high" : "medium",
        caveats: ["Reviewed Tier 2 publishable intervention record."],
        relatedEventIds: [recordId],
      });
    }
  }
  return output;
}

export function buildRouteTreatmentSummaryArtifact(
  input: RouteTreatmentSummaryInput,
): RouteTreatmentSummaryArtifact {
  const checkedTreatmentTypes = [...(input.checkedTreatmentTypes ?? DEFAULT_ROUTE_TREATMENT_TYPES)];
  const routeIds = uniqueSorted(input.routeIds.map(normalizeRouteId));
  const routeUniverse = new Set(routeIds);
  const sourceGapRows = [...(input.sourceGapRows ?? [])];
  if (input.includeTspCurrentInventorySourceGap !== false) {
    sourceGapRows.push(...routeIds.map((routeId) => tspCurrentInventorySourceGap(routeId, input.month)));
  }

  const rows: RouteTreatmentSummaryRow[] = [];
  const skippedEvidenceRouteIds = new Set<string>();
  for (const evidence of input.evidenceRows) {
    const row = rowFromEvidence({ evidence, defaultMonth: input.month, routeUniverse });
    if (row !== null) {
      rows.push(row);
    } else {
      const routeId = normalizeRouteId(evidence.routeId);
      if (routeId.length > 0) skippedEvidenceRouteIds.add(routeId);
    }
  }
  for (const gap of sourceGapRows) {
    if (gap.routeId === null) continue;
    const routeId = canonicalRouteId(gap.routeId, routeUniverse);
    if (routeId === null) continue;
    rows.push({
      routeId,
      month: gap.month,
      treatmentType: gap.treatmentType,
      rawTreatmentType: gap.treatmentType,
      status: "source_gap",
      statusAsOf: gap.month,
      effectiveDate: null,
      datePrecision: "unknown",
      geographyScope: "route",
      sourceRefs: uniqueSorted(gap.sourceRefs),
      evidenceLabel: "aggregate_source_gap",
      confidence: "low",
      caveats: [gap.publicStatement],
      methodLimitations: gap.blocksClaims,
      relatedEventIds: [],
    });
  }

  const existingKeys = new Set(rows.map(routeTreatmentKey));
  if (input.includeNoDataRows !== false) {
    for (const routeId of routeIds) {
      for (const treatmentType of checkedTreatmentTypes) {
        const key = [routeId, input.month, treatmentType, "route"].join("|");
        if (existingKeys.has(key)) continue;
        const row = rowFromEvidence({
          evidence: noDataEvidence({ routeId, month: input.month, treatmentType }),
          defaultMonth: input.month,
          routeUniverse,
        });
        if (row !== null) rows.push(row);
      }
    }
  }

  const routeTreatmentRows = mergeRouteTreatmentRows(rows);
  const segmentTreatmentRows = [...(input.segmentTreatmentRows ?? [])].sort(
    (left, right) =>
      left.routeId.localeCompare(right.routeId) ||
      left.segmentId.localeCompare(right.segmentId) ||
      left.treatmentType.localeCompare(right.treatmentType),
  );
  const issues: RouteTreatmentSummaryValidationIssue[] = [];
  if (routeIds.length === 0) {
    issues.push({
      severity: "fail",
      code: "route_catalog_empty",
      message: "No route catalog rows were available; treatment coverage cannot be interpreted.",
    });
  }
  if (segmentTreatmentRows.length === 0) {
    issues.push({
      severity: "warn",
      code: "segment_treatment_rows_not_built",
      message: "Segment treatment rows are not built in this artifact slice yet.",
    });
  }
  for (const tableName of input.localMissingTables ?? []) {
    issues.push({
      severity: tableName === "local_route_catalog" ? "fail" : "warn",
      code: "local_table_missing",
      message: `Local table ${tableName} was not available to the treatment materializer.`,
    });
  }
  if (skippedEvidenceRouteIds.size > 0) {
    const sample = [...skippedEvidenceRouteIds].sort().slice(0, 12).join(", ");
    issues.push({
      severity: "warn",
      code: "non_catalog_evidence_route_ids_skipped",
      message: `${skippedEvidenceRouteIds.size.toLocaleString("en-US")} source route id(s) were not in the current route catalog and could not be safely aliased: ${sample}.`,
    });
  }

  const positiveRoutes = new Set(
    routeTreatmentRows
      .filter((row) => positiveEvidenceStatus(row.status))
      .map((row) => row.routeId),
  );
  const sourceGapRoutes = new Set(
    routeTreatmentRows.filter((row) => row.status === "source_gap").map((row) => row.routeId),
  );
  const expectedRouteTreatmentRows = routeIds.length * checkedTreatmentTypes.length;

  return {
    artifactKind: "route_treatment_summary",
    schemaVersion: ROUTE_TREATMENT_SUMMARY_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    month: input.month,
    source: {
      dbPath: input.dbPath,
      artifactPath: input.artifactPath,
      summaryPath: input.summaryPath ?? null,
      routeUniverse: "local_route_catalog",
      checkedTreatmentTypes,
      localMissingTables: [...(input.localMissingTables ?? [])],
      inputs: {
        routeCatalogRowCount: routeIds.length,
        sourceEvidenceRowCount: input.evidenceRows.length,
        sourceGapRowCount: sourceGapRows.length,
        segmentTreatmentRowCount: segmentTreatmentRows.length,
        publishableInterventionCount: input.publishableInterventionCount ?? 0,
      },
    },
    summary: {
      routeCount: routeIds.length,
      checkedTreatmentTypeCount: checkedTreatmentTypes.length,
      routeTreatmentRowCount: routeTreatmentRows.length,
      routeTreatmentCoverageShare:
        expectedRouteTreatmentRows === 0 ? 0 : routeTreatmentRows.length / expectedRouteTreatmentRows,
      routeWithPositiveEvidenceCount: positiveRoutes.size,
      routeWithSourceGapCount: sourceGapRoutes.size,
      segmentTreatmentRowCount: segmentTreatmentRows.length,
      sourceGapRowCount: sourceGapRows.length,
      statusCounts: countBy(
        routeTreatmentRows.map((row) => row.status),
        Object.keys(STATUS_RANK) as RouteTreatmentStatus[],
      ),
      treatmentTypeCounts: countBy(
        routeTreatmentRows.map((row) => row.treatmentType),
        ROUTE_TREATMENT_TYPES,
      ),
      evidenceLabelCounts: countBy(
        routeTreatmentRows.map((row) => row.evidenceLabel),
        [
          "deterministic_source",
          "reviewed_document",
          "historical_snapshot",
          "aggregate_source_gap",
          "candidate_inferred",
          "not_found",
        ],
      ),
      confidenceCounts: countBy(
        routeTreatmentRows.map((row) => row.confidence),
        ["high", "medium", "low"],
      ),
    },
    routeTreatmentRows,
    segmentTreatmentRows,
    sourceGapRows: sourceGapRows.sort(
      (left, right) =>
        (left.routeId ?? "").localeCompare(right.routeId ?? "") ||
        left.treatmentType.localeCompare(right.treatmentType) ||
        left.gapKind.localeCompare(right.gapKind),
    ),
    validation: {
      status: validationStatus(issues),
      issues,
    },
  };
}

export function routeTreatmentSummaryMarkdown(artifact: RouteTreatmentSummaryArtifact): string {
  const lines = [
    `# Route Treatment Summary (${artifact.month})`,
    "",
    `Generated: ${artifact.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Routes: ${artifact.summary.routeCount.toLocaleString("en-US")}`,
    `- Checked treatment types: ${artifact.summary.checkedTreatmentTypeCount.toLocaleString("en-US")}`,
    `- Route treatment rows: ${artifact.summary.routeTreatmentRowCount.toLocaleString("en-US")}`,
    `- Positive-evidence routes: ${artifact.summary.routeWithPositiveEvidenceCount.toLocaleString("en-US")}`,
    `- Source-gap routes: ${artifact.summary.routeWithSourceGapCount.toLocaleString("en-US")}`,
    `- Segment treatment rows: ${artifact.summary.segmentTreatmentRowCount.toLocaleString("en-US")}`,
    "",
    "## Status Counts",
    "",
    ...Object.entries(artifact.summary.statusCounts).map(
      ([status, count]) => `- ${status}: ${count.toLocaleString("en-US")}`,
    ),
    "",
    "## Treatment Counts",
    "",
    ...Object.entries(artifact.summary.treatmentTypeCounts).map(
      ([treatmentType, count]) => `- ${treatmentType}: ${count.toLocaleString("en-US")}`,
    ),
    "",
    "## Validation",
    "",
    `Status: ${artifact.validation.status}`,
    "",
    ...artifact.validation.issues.map(
      (issue) => `- ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`,
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
