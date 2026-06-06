import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  type DocumentDiscoveryExtraction,
  DocumentDiscoveryExtractionSchema,
} from "@bp/domain/documents/discovery";
import { Glob } from "bun";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../../lib/paths.ts";
import { type CliOption, parseCliOptions, trueOption } from "./_shared.ts";

type CandidateType =
  | "entity"
  | "metric"
  | "event"
  | "table"
  | "claim"
  | "context_signal"
  | "review_question";

type DiscoveryInputSummary = {
  label: string;
  rootPath: string;
  extractionCount: number;
  invalidExtractionCount: number;
  sourceCount: number;
};

type CandidateRef = {
  inputLabel: string;
  extractionId: string;
  sourceId: string;
  sourceGroup: string;
  pageNumbers: number[];
  candidateType: CandidateType;
  candidateId: string;
};

type ClusterSummary = {
  clusterKey: string;
  canonicalFamily: string;
  displayLabel: string;
  count: number;
  sourceCount: number;
  sampleRefs: CandidateRef[];
  rawVariants: Array<{ value: string; count: number }>;
};

type VocabularyMapping = {
  canonicalFamily: string;
  count: number;
  sourceCount: number;
  rawValues: Array<{ value: string; count: number }>;
};

export type Tier2DiscoveryCurationAudit = {
  version: 1;
  generatedAt: string;
  inputRoots: DiscoveryInputSummary[];
  summary: {
    extractionCount: number;
    invalidExtractionCount: number;
    sourceCount: number;
    sourceGroupCount: number;
    validationIssueCount: number;
    candidateCounts: Record<CandidateType, number>;
    uniqueClusterCounts: Record<CandidateType, number>;
    duplicateClusterCounts: Record<CandidateType, number>;
  };
  coverage: {
    bySourceGroup: Array<{ sourceGroup: string; sourceCount: number; extractionCount: number }>;
    byDocumentMode: Array<{ documentModeRaw: string; extractionCount: number }>;
  };
  validationIssues: Array<{
    code: string;
    path: string;
    count: number;
    sampleMessages: string[];
  }>;
  normalizationSeed: {
    entityKindMappings: VocabularyMapping[];
    metricFamilyMappings: VocabularyMapping[];
    eventFamilyMappings: VocabularyMapping[];
    tableFamilyMappings: VocabularyMapping[];
    claimFamilyMappings: VocabularyMapping[];
    contextFamilyMappings: VocabularyMapping[];
    reviewQuestionFamilyMappings: VocabularyMapping[];
    evidencePolicy: {
      modelShouldSubmitBlockHash: false;
      modelShouldSubmitLineRange: true;
      runnerShouldFillBlockHash: true;
      rationale: string;
    };
  };
  dedupeSeed: {
    entities: ClusterSummary[];
    metrics: ClusterSummary[];
    events: ClusterSummary[];
    tables: ClusterSummary[];
    claims: ClusterSummary[];
    contextSignals: ClusterSummary[];
    reviewQuestions: ClusterSummary[];
  };
  nextCurationActions: string[];
};

type DiscoveryCurationCliArgs = {
  discoveryRoots?: string[];
  output?: string;
  markdown?: string;
  rules?: string;
  normalized?: string;
  topClusters?: number;
  canonicalPerWindow?: boolean;
  canonicalRootPriority?: string[];
};

type CandidateClusterInput = {
  clusterKey: string;
  canonicalFamily: string;
  displayLabel: string;
  rawVariant: string;
  ref: CandidateRef;
};

const MAX_RAW_VALUES_PER_MAPPING = 160;

export type Tier2DiscoveryManualCurationSeed = {
  version: 1;
  generatedAt: string;
  sourceAuditPath: string;
  evidencePolicy: Tier2DiscoveryCurationAudit["normalizationSeed"]["evidencePolicy"];
  approvedFamilyBuckets: {
    entities: string[];
    metrics: string[];
    claims: string[];
    tables: string[];
  };
  canonicalAliasSeeds: {
    entities: Array<{
      canonicalId: string;
      canonicalFamily: string;
      canonicalLabel: string;
      aliases: string[];
    }>;
    metrics: Array<{
      canonicalId: string;
      canonicalFamily: string;
      canonicalLabel: string;
      aliases: string[];
    }>;
  };
  reviewQueues: {
    unresolvedFamilyCounts: {
      entities: number;
      metrics: number;
      claims: number;
      tables: number;
    };
    highVolumeMetricFamilies: VocabularyMapping[];
    highVolumeOtherMetricValues: Array<{ value: string; count: number }>;
    highVolumeOtherEntityValues: Array<{ value: string; count: number }>;
    highVolumeOtherClaimValues: Array<{ value: string; count: number }>;
    highVolumeOtherTableValues: Array<{ value: string; count: number }>;
    highVolumeEntityClusters: ClusterSummary[];
    highVolumeClaimClusters: ClusterSummary[];
  };
  nextSchemaDecisions: string[];
};

export type Tier2DiscoveryNormalizedCandidateRow = {
  rowId: string;
  inputLabel: string;
  extractionId: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  candidateType: CandidateType;
  candidateId: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  clusterKey: string;
  evidenceRefs: Array<{
    blockId: string;
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    blockHash?: string;
    roleRaw?: string;
  }>;
  rawCandidate: unknown;
};

export type Tier2DiscoveryNormalizedCandidatesArtifact = {
  version: 1;
  generatedAt: string;
  sourceAuditPath: string;
  rowCount: number;
  summary: {
    byCandidateType: Record<CandidateType, number>;
    byCanonicalFamily: Record<
      CandidateType,
      Array<{ canonicalFamily: string; count: number; sourceCount: number }>
    >;
  };
  rows: Tier2DiscoveryNormalizedCandidateRow[];
};

const DEFAULT_DISCOVERY_ROOTS = [
  "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-deepseek-flash-budget5-v2",
  "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2/document-discovery-deepseek-flash-breadth-v1",
];

const DEFAULT_CANONICAL_ROOT_PRIORITY = [
  "document-discovery-pioneer-failure-retry-v1",
  "document-discovery-pioneer-resume-v2",
  "document-discovery-pioneer-resume-v1",
  "document-discovery-refactored-v1",
  "document-discovery-deepseek-flash-budget5-v2",
  "document-discovery-deepseek-flash-breadth-v1",
  "document-discovery-pioneer-capability-canary-v1",
  "document-discovery-pioneer-concurrency-smoke-v1",
  "document-discovery-pioneer-smoke-v1",
  "document-discovery-deepseek-flash-smoke-v5",
  "document-discovery-deepseek-flash-smoke-v3",
  "document-discovery-deepseek-flash-smoke-v2",
  "document-discovery-deepseek-flash-smoke",
];

type ExtractionWithLabel = {
  inputLabel: string;
  extraction: DocumentDiscoveryExtraction;
};

function sha256Hex(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function normalizedRowId(input: {
  inputLabel: string;
  extractionId: string;
  candidateType: CandidateType;
  candidateId: string;
}): string {
  return sha256Hex(
    [input.inputLabel, input.extractionId, input.candidateType, input.candidateId].join("|"),
  );
}

function evidenceRefsForRow(
  refs: DocumentDiscoveryExtraction["entities"][number]["evidenceRefs"],
): Tier2DiscoveryNormalizedCandidateRow["evidenceRefs"] {
  return refs.map((ref) => ({
    blockId: ref.blockId,
    pageNumber: ref.pageNumber,
    lineStart: ref.lineStart,
    lineEnd: ref.lineEnd,
    ...(ref.blockHash === undefined ? {} : { blockHash: ref.blockHash }),
    ...(ref.roleRaw === undefined ? {} : { roleRaw: ref.roleRaw }),
  }));
}

function normalizedRowBase(input: {
  inputLabel: string;
  extraction: DocumentDiscoveryExtraction;
  candidateType: CandidateType;
  candidateId: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  clusterKey: string;
  evidenceRefs: Tier2DiscoveryNormalizedCandidateRow["evidenceRefs"];
  rawCandidate: unknown;
}): Tier2DiscoveryNormalizedCandidateRow {
  return {
    rowId: normalizedRowId({
      inputLabel: input.inputLabel,
      extractionId: input.extraction.extractionId,
      candidateType: input.candidateType,
      candidateId: input.candidateId,
    }),
    inputLabel: input.inputLabel,
    extractionId: input.extraction.extractionId,
    sourceId: input.extraction.source.sourceId,
    sourceTitle: input.extraction.source.sourceTitle,
    sourceGroup: input.extraction.source.sourceGroup,
    pageNumbers: [...input.extraction.source.pageNumbers],
    candidateType: input.candidateType,
    candidateId: input.candidateId,
    canonicalFamily: input.canonicalFamily,
    rawFamily: input.rawFamily,
    displayLabel: input.displayLabel,
    clusterKey: input.clusterKey,
    evidenceRefs: input.evidenceRefs,
    rawCandidate: input.rawCandidate,
  };
}

function extractionWindowKey(extraction: DocumentDiscoveryExtraction): string {
  return `${extraction.source.sourceId}:${extraction.source.pageNumbers.join("-")}`;
}

function extractionCandidateCount(extraction: DocumentDiscoveryExtraction): number {
  return (
    extraction.entities.length +
    extraction.metrics.length +
    extraction.events.length +
    extraction.tables.length +
    extraction.claims.length +
    extraction.contextSignals.length +
    extraction.reviewQuestions.length
  );
}

function rootPriorityIndex(inputLabel: string, priority: string[]): number {
  const index = priority.findIndex(
    (label) => label === inputLabel || basename(label) === inputLabel,
  );
  return index === -1 ? priority.length : index;
}

function selectCanonicalExtractions(
  extractions: ExtractionWithLabel[],
  priority: string[],
): ExtractionWithLabel[] {
  const byWindow = new Map<string, ExtractionWithLabel[]>();
  for (const row of extractions) {
    const key = extractionWindowKey(row.extraction);
    const rows = byWindow.get(key) ?? [];
    rows.push(row);
    byWindow.set(key, rows);
  }
  return [...byWindow.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rows]) => {
      const selected = rows.toSorted((left, right) => {
        const priorityDelta =
          rootPriorityIndex(left.inputLabel, priority) -
          rootPriorityIndex(right.inputLabel, priority);
        if (priorityDelta !== 0) return priorityDelta;
        const validationDelta =
          left.extraction.validationIssues.length - right.extraction.validationIssues.length;
        if (validationDelta !== 0) return validationDelta;
        const candidateDelta =
          extractionCandidateCount(right.extraction) - extractionCandidateCount(left.extraction);
        if (candidateDelta !== 0) return candidateDelta;
        return (
          left.inputLabel.localeCompare(right.inputLabel) ||
          left.extraction.extractionId.localeCompare(right.extraction.extractionId)
        );
      })[0];
      if (selected === undefined) throw new Error("Canonical extraction group was empty.");
      return selected;
    });
}

function normalizedSummary(
  rows: Tier2DiscoveryNormalizedCandidateRow[],
): Tier2DiscoveryNormalizedCandidatesArtifact["summary"] {
  const byCandidateType: Record<CandidateType, number> = {
    entity: 0,
    metric: 0,
    event: 0,
    table: 0,
    claim: 0,
    context_signal: 0,
    review_question: 0,
  };
  const byFamily = new Map<CandidateType, Map<string, { count: number; sourceIds: Set<string> }>>();
  for (const row of rows) {
    byCandidateType[row.candidateType] += 1;
    const families = byFamily.get(row.candidateType) ?? new Map();
    const family = families.get(row.canonicalFamily) ?? { count: 0, sourceIds: new Set<string>() };
    family.count += 1;
    family.sourceIds.add(row.sourceId);
    families.set(row.canonicalFamily, family);
    byFamily.set(row.candidateType, families);
  }
  const byCanonicalFamily = Object.fromEntries(
    (Object.keys(byCandidateType) as CandidateType[]).map((candidateType) => {
      const rowsForType = [...(byFamily.get(candidateType)?.entries() ?? [])]
        .map(([canonicalFamily, value]) => ({
          canonicalFamily,
          count: value.count,
          sourceCount: value.sourceIds.size,
        }))
        .sort(
          (left, right) =>
            right.count - left.count || left.canonicalFamily.localeCompare(right.canonicalFamily),
        );
      return [candidateType, rowsForType];
    }),
  ) as Tier2DiscoveryNormalizedCandidatesArtifact["summary"]["byCanonicalFamily"];
  return { byCandidateType, byCanonicalFamily };
}

async function writeNormalizedCandidates(input: {
  rows: Tier2DiscoveryNormalizedCandidateRow[];
  generatedAt: string;
  auditPath: string;
  normalizedPath: string;
}): Promise<Tier2DiscoveryNormalizedCandidatesArtifact> {
  const artifact: Tier2DiscoveryNormalizedCandidatesArtifact = {
    version: 1,
    generatedAt: input.generatedAt,
    sourceAuditPath: input.auditPath,
    rowCount: input.rows.length,
    summary: normalizedSummary(input.rows),
    rows: input.rows,
  };
  await mkdir(dirname(input.normalizedPath), { recursive: true });
  await writeJson(input.normalizedPath, artifact);
  return artifact;
}

function cleanText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLabel(value: string | undefined): string {
  const cleaned = cleanText(value);
  return cleaned.length > 0 ? cleaned : "unknown";
}

function counterRows(counter: Map<string, number>): Array<{ value: string; count: number }> {
  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function topCounterRows(
  counter: Map<string, number>,
  limit: number,
): Array<{ value: string; count: number }> {
  return counterRows(counter).slice(0, limit);
}

function sourceCount(refs: CandidateRef[]): number {
  return new Set(refs.map((ref) => ref.sourceId)).size;
}

function refKey(ref: CandidateRef): string {
  return [
    ref.inputLabel,
    ref.extractionId,
    ref.sourceId,
    ref.pageNumbers.join("-"),
    ref.candidateType,
    ref.candidateId,
  ].join("|");
}

function addCounter(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value));
}

function containsBusRouteToken(text: string): boolean {
  return /\b[mbq]x?\d{1,3}\b/.test(text);
}

function canonicalEntityFamily(input: {
  kindHint: string | undefined;
  rawKind: string | undefined;
  rawText: string | undefined;
}): string {
  const kindText = compactLabel(`${input.kindHint ?? ""} ${input.rawKind ?? ""}`);
  const rawText = compactLabel(input.rawText);
  const fullText = compactLabel(`${kindText} ${input.rawText ?? ""}`);
  if (
    includesAny(fullText, ["lirr", "path", "nj transit", "amtrak", "commuter rail", "rail service"])
  ) {
    return "rail_service";
  }
  if (includesAny(fullText, ["subway", "transit line", "bus route pattern"])) return "transit_line";
  if (includesAny(kindText, ["bus route", "sbs route", "local bus", "express bus"]))
    return "bus_route";
  if (includesAny(kindText, ["community board", "cb "])) return "community_board";
  if (includesAny(kindText, ["program", "project", "capital project"])) return "program";
  if (includesAny(kindText, ["agency", "authority", "nyc dot", "mta", "nyct", "consultant"])) {
    return "agency";
  }
  if (includesAny(kindText, ["vehicle", "truck", "taxi", "car"])) return "vehicle_or_user_class";
  if (includesAny(kindText, ["pedestrian", "cyclist", "road user", "road_user_group"])) {
    return "vehicle_or_user_class";
  }
  if (
    includesAny(kindText, ["treatment", "bus lane", "queue jump", "signal", "turn restriction"])
  ) {
    return "treatment_or_design_element";
  }
  if (
    includesAny(kindText, ["design element", "curb", "lane", "sidewalk", "median", "bike lane"])
  ) {
    return "treatment_or_design_element";
  }
  if (includesAny(kindText, ["intersection", "corner"])) return "intersection";
  if (includesAny(kindText, ["corridor", "street segment", "segment endpoint"])) return "corridor";
  if (includesAny(kindText, ["station"])) return "station";
  if (includesAny(kindText, ["bus stop", "stop"])) return "stop";
  if (includesAny(kindText, ["borough", "city"])) return "borough";
  if (includesAny(kindText, ["neighborhood"])) return "neighborhood";
  if (includesAny(kindText, ["date", "year", "month"])) return "date_or_period";
  if (includesAny(kindText, ["time period", "hours", "am", "pm"])) return "time_period";
  if (includesAny(kindText, ["metric"])) return "metric_subject";
  if (includesAny(kindText, ["person"])) return "person";
  if (
    includesAny(kindText, [
      "landmark",
      "destination",
      "venue",
      "cultural destination",
      "point of interest",
    ])
  ) {
    return "place_or_destination";
  }
  if (includesAny(kindText, ["organization", "committee", "stakeholder", "outreach method"])) {
    return "public_engagement_actor";
  }
  if (
    includesAny(kindText, [
      "section heading",
      "agenda section",
      "drawing reference",
      "map symbol",
      "map legend",
    ])
  ) {
    return "document_metadata";
  }
  if (
    includesAny(kindText, ["infrastructure", "bridge", "building", "park", "tunnel", "material"])
  ) {
    return "infrastructure_or_asset";
  }
  if (
    includesAny(kindText, [
      "business type",
      "delivery service",
      "fare media",
      "service type",
      "technology",
    ])
  ) {
    return "domain_concept";
  }
  if (
    includesAny(kindText, [
      "business",
      "software",
      "concept",
      "acronym",
      "url",
      "existing condition",
    ])
  ) {
    return "domain_concept";
  }
  if (includesAny(kindText, ["direction"])) return "direction";
  if (includesAny(kindText, ["community feedback theme"])) return "public_feedback_theme";
  if (includesAny(kindText, ["data source"])) return "data_source";
  if (
    includesAny(kindText, [
      "document",
      "document title",
      "report title",
      "appendix",
      "section title",
    ])
  ) {
    return "document_metadata";
  }
  if (includesAny(kindText, ["map", "proposal number", "section subheading"]))
    return "document_metadata";
  if (includesAny(kindText, ["meeting", "event", "survey", "study"]))
    return "public_engagement_artifact";
  if (includesAny(kindText, ["government official", "staff role"]))
    return "public_engagement_actor";
  if (includesAny(kindText, ["address"])) return "street";
  if (includesAny(kindText, ["geography", "location", "administrative boundary"]))
    return "geography";
  if (includesAny(kindText, ["boundary", "country", "county", "geographic"])) return "geography";
  if (includesAny(kindText, ["entrance", "facility", "school"])) return "infrastructure_or_asset";
  if (includesAny(kindText, ["rider"])) return "vehicle_or_user_class";
  if (includesAny(kindText, ["policy", "designation"])) return "policy_or_designation";
  if (includesAny(kindText, ["regulation"])) return "policy_or_designation";
  if (
    includesAny(kindText, ["street", "avenue", "boulevard", "road", "place", "drive"]) ||
    includesAny(rawText, [" street", " avenue", " boulevard", " road", " place", " drive"])
  ) {
    return "street";
  }
  return "other";
}

function canonicalMetricFamily(labelRaw: string | undefined): string {
  const label = compactLabel(labelRaw);
  if (
    includesAny(label, [
      "design completion",
      "design review",
      "scoping start",
      "next cb",
      "sheet number",
      "plan scale",
      "project id",
      "station range",
      "drawing scale",
      "london congestion charge implementation year",
      "congestion pricing start year",
      "schedules to review",
      "installation timeline",
      "station limits",
    ])
  ) {
    return "document_or_project_metadata";
  }
  if (
    includesAny(label, ["bus speed", "average bus speeds", "bus speeds", "bus travel speeds"]) ||
    (containsBusRouteToken(label) && includesAny(label, ["average speed", "travel speed"]))
  ) {
    return "bus_speed";
  }
  if (includesAny(label, ["crawl speed", "speed limit", "advisory speed"])) return "traffic_speed";
  if (includesAny(label, ["average travel speed", "taxi trip"])) return "traffic_speed";
  if (
    includesAny(label, [
      "travel time",
      "running time",
      "runtime",
      "customer journey time",
      "faster in bus lane",
      "sbs routes speed advantage",
      "sbs speed improvement",
    ])
  ) {
    return "travel_time";
  }
  if (
    includesAny(label, [
      "ridership",
      "passenger",
      "boardings",
      "alightings",
      "total ons",
      "total offs",
      "on offs",
      "on bus",
      "customers",
      "riders",
      "people boarding",
      "busiest route rank",
      "ranking among manhattan crosstown",
    ])
  ) {
    return "ridership";
  }
  if (
    includesAny(label, [
      "bunching",
      "dwell time",
      "stopped in traffic",
      "late buses",
      "bus delay breakdown",
      "bus departure minutes",
      "at bus stop time",
      "bus moving time share",
      "in motion",
      "moving time",
      "late arrival",
      "on time performance",
      "reliability improvement",
      "red lights",
      "stopped at traffic lights",
    ])
  ) {
    return "reliability_or_dwell";
  }
  if (includesAny(label, ["headway", "wait", "frequency"])) return "service_frequency_or_wait";
  if (includesAny(label, ["minutes away", "stops away", "next bus", "real time bus arrival"]))
    return "realtime_arrival_info";
  if (
    includesAny(label, [
      "bus routes connected",
      "number of mta bus routes",
      "number of bus routes",
      "bus routes on",
      "local and express bus routes",
      "bus route connections",
      "number of corridors",
      "route connections",
      "number of express bus routes",
      "number of local bus routes",
      "sbs routes in operation",
    ])
  ) {
    return "route_inventory";
  }
  if (includesAny(label, ["subway lines connected", "subway lines", "transit lines connected"])) {
    return "transit_connection_inventory";
  }
  if (
    includesAny(label, [
      "bus stops",
      "number of bus stops",
      "bus stops to upgrade",
      "bus stop count",
      "bus stops with boarding islands",
      "bus bulbs",
      "bus pads",
      "bus stop capacity",
      "bus stop spacing",
      "new bus shelters",
      "number of buses accommodated at stop",
      "shelters installed",
      "stops per route",
      "stop locations",
      "stop spacing",
    ])
  ) {
    return "stop_inventory";
  }
  if (includesAny(label, ["vehicle speed", "vehicle speeds", "traffic speed"]))
    return "traffic_speed";
  if (includesAny(label, ["taxi speeds", "speed scale"])) return "traffic_speed";
  if (includesAny(label, ["vehicle volume", "traffic volume", "turning movement"])) {
    return "traffic_volume";
  }
  if (includesAny(label, ["through movement increase"])) return "traffic_volume";
  if (includesAny(label, ["bike volume", "bicycle volume"])) return "active_transport_volume";
  if (
    includesAny(label, [
      "injuries",
      "injury",
      "fatalities",
      "killed",
      "severely injured",
      "crash",
      "ksi",
      "incidents reduction",
      "total incidents",
    ])
  ) {
    return "safety_outcome";
  }
  if (
    includesAny(label, [
      "lane width",
      "sidewalk width",
      "parking lane width",
      "buffer width",
      "travel lane",
      "red paint area",
      "square footage",
      "area measurement",
      "bus stop dimensions",
      "bus stop width",
      "right of way width",
      "street width",
      "roadway width",
      "total width",
      "design dimensions",
      "corridor width",
      "left turn bay width",
      "median width",
      "pedestrian space width",
      "pavement marking",
      "bus stop area dimensions",
      "tree canopy radius",
      "tree pit dimensions",
    ])
  ) {
    return "street_design_dimension";
  }
  if (
    includesAny(label, [
      "pedestrian refuges",
      "street trees",
      "additional crossings",
      "crossings added",
      "street tree",
      "tree canopies",
      "pedestrian safety measures",
      "landscaped area",
      "median tips",
      "medians median tips",
      "intersections with pedestrian safety measures",
      "neckdowns",
      "pedestrian islands",
      "raised crosswalks",
      "shortened crossings",
      "sidewalk extensions",
      "priority intersections",
      "reconstructed medians",
      "median tips upgraded",
    ])
  ) {
    return "infrastructure_inventory";
  }
  if (
    includesAny(label, [
      "queue jump",
      "bus lane count",
      "bus lanes count",
      "offset bus lanes",
      "full block bus lanes",
      "bus lane on",
      "existing bus lane",
      "new bus lanes",
      "bus lane miles",
      "miles of bus lanes",
      "new sbs routes",
      "install 10 15 miles",
      "bus lanes installed",
      "median alignment bus lane",
      "physically separated bus lanes",
      "proposed left turn lanes",
      "sbs corridors",
      "proposed nsa",
    ])
  ) {
    return "treatment_inventory";
  }
  if (includesAny(label, ["distance from"])) return "extent_length";
  if (includesAny(label, ["corridor length", "bus stop length", "length"])) return "extent_length";
  if (
    includesAny(label, [
      "plan scale",
      "sheet number",
      "design start",
      "construction",
      "project id",
      "traffic analysis completion timeline",
      "year bus command center",
      "year bus service",
      "year of",
      "years bus lanes",
    ])
  ) {
    return "document_or_project_metadata";
  }
  if (
    includesAny(label, [
      "proposed hours",
      "hours of operation",
      "operating hours",
      "bus lane hours",
    ])
  ) {
    return "operating_hours";
  }
  if (includesAny(label, ["parking", "loading", "curb", "occupancy"])) return "curb_or_parking";
  if (
    includesAny(label, [
      "bus lane camera",
      "bus mounted cameras",
      "violation",
      "warning",
      "fine",
      "enforcement",
    ])
  ) {
    return "enforcement_or_violation";
  }
  if (includesAny(label, ["households", "mode share", "travel to work", "car ownership"])) {
    return "demographic_or_mode_share";
  }
  if (includesAny(label, ["median annual income", "non white residents", "latino", "hispanic"])) {
    return "demographic_or_mode_share";
  }
  if (
    includesAny(label, [
      "commute via",
      "transit walk bike",
      "car occupants",
      "job growth",
      "population growth",
      "population within",
      "residents in",
      "residents within",
      "residents with",
      "vehicle ownership",
      "pass share",
      "membership share",
      "workers relying on transit",
    ])
  ) {
    return "demographic_or_mode_share";
  }
  if (
    includesAny(label, [
      "customer satisfaction",
      "not familiar",
      "somewhat familiar",
      "familiar with project",
      "information cards distributed",
      "rider satisfaction",
    ])
  ) {
    return "public_feedback";
  }
  if (includesAny(label, ["faster bus service", "improved performance"]))
    return "performance_claim";
  if (
    includesAny(label, [
      "all electric buses",
      "number of buses mta plans",
      "buses serving study area",
      "buses serving the study area",
      "bus purchase",
      "number of all electric buses",
      "number of buses serving",
    ])
  ) {
    return "fleet_or_service_inventory";
  }
  if (includesAny(label, ["no standing"])) return "curb_or_parking";
  if (includesAny(label, ["scope", "environmental review"])) return "document_or_project_metadata";
  if (includesAny(label, ["fare", "base fare"])) return "fare_or_pricing";
  if (includesAny(label, ["survey", "respondent", "comment"])) return "public_feedback";
  if (includesAny(label, ["signal", "tsp"])) return "signal_priority";
  if (includesAny(label, ["cost", "dollar", "budget"])) return "cost_or_budget";
  return "other_metric";
}

function canonicalEventFamily(value: string | undefined): string {
  const text = compactLabel(value);
  if (includesAny(text, ["launch", "implemented", "complete", "service begins"])) {
    return "implementation_milestone";
  }
  if (includesAny(text, ["proposal", "proposed", "plan", "design"])) return "planned_intervention";
  if (includesAny(text, ["workshop", "meeting", "community board", "open house", "hearing"])) {
    return "public_engagement";
  }
  if (includesAny(text, ["evaluation", "report", "progress", "monitoring"]))
    return "evaluation_report";
  if (includesAny(text, ["enforcement", "restriction", "rule"])) return "regulatory_or_enforcement";
  if (includesAny(text, ["service change", "route change", "redesign"])) return "service_change";
  return "other_event";
}

function canonicalTableFamily(value: string | undefined): string {
  const text = compactLabel(value);
  if (includesAny(text, ["title block", "table of contents", "engineering title block"])) {
    return "document_metadata";
  }
  if (includesAny(text, ["pre post", "before after", "comparison", "comparative", "performance"])) {
    return "performance_comparison";
  }
  if (includesAny(text, ["bus speed", "speed by time", "speed data", "speed matrix"])) {
    return "performance_comparison";
  }
  if (includesAny(text, ["delay", "time allocation", "breakdown", "dwell time"])) {
    return "performance_comparison";
  }
  if (includesAny(text, ["cross section", "width", "dimension", "lane"])) {
    return "street_design_dimensions";
  }
  if (includesAny(text, ["curb design"])) return "street_design_dimensions";
  if (includesAny(text, ["legend", "symbol", "map"])) return "map_legend";
  if (includesAny(text, ["ridership", "service", "frequency", "headway"])) {
    return "service_or_ridership";
  }
  if (includesAny(text, ["route inventory"])) return "service_or_ridership";
  if (includesAny(text, ["bicycle volume"])) return "performance_comparison";
  if (includesAny(text, ["feature list", "project location", "image grid"]))
    return "document_metadata";
  if (includesAny(text, ["real time", "arrival board", "departure board", "sign display"])) {
    return "realtime_arrival_info";
  }
  if (includesAny(text, ["injury", "fatality", "crash", "safety"])) return "safety";
  if (includesAny(text, ["enforcement", "violations", "camera"])) return "enforcement";
  if (includesAny(text, ["cost", "budget"])) return "cost_or_budget";
  if (includesAny(text, ["demographic", "mode share", "mode split"]))
    return "public_or_demographic_context";
  if (includesAny(text, ["survey", "respondent", "comment"])) return "public_feedback";
  if (
    includesAny(text, ["timeline", "schedule", "milestone", "project status", "hours of operation"])
  )
    return "timeline";
  if (includesAny(text, ["entry", "exit", "turn"])) return "access_rule";
  return "other_table";
}

function canonicalClaimFamily(value: string | undefined): string {
  const text = compactLabel(value);
  if (includesAny(text, ["causal attribution", "caused", "attributed to"])) {
    return "causal_or_effect_claim";
  }
  if (
    includesAny(text, [
      "methodology",
      "methodological",
      "data source",
      "data limitation",
      "data sources",
    ])
  ) {
    return "methodology_or_source_note";
  }
  if (
    includesAny(text, [
      "cross reference",
      "page description",
      "technical description",
      "baseline metric",
      "data collection context",
      "data context",
      "data quality note",
      "disclaimer",
      "correction notice",
      "case study reference",
      "map legend description",
      "visualization legend",
      "target metric",
    ])
  ) {
    return "methodology_or_source_note";
  }
  if (
    includesAny(text, [
      "definition",
      "historical fact",
      "factual statement",
      "jurisdictional fact",
      "jurisdiction fact",
      "headline fact",
      "factual context",
    ])
  ) {
    return "factual_context";
  }
  if (includesAny(text, ["route listing", "connectivity", "routes served", "service connection"])) {
    return "service_connectivity";
  }
  if (
    includesAny(text, [
      "transit connection",
      "service description",
      "route inventory",
      "coverage claim",
      "route count statement",
      "service announcement",
      "service comparison",
    ])
  ) {
    return "service_connectivity";
  }
  if (includesAny(text, ["route streamlining", "service change", "alternative routing"])) {
    return "service_connectivity";
  }
  if (includesAny(text, ["fare policy", "policy statement", "policy", "bus lane operation"])) {
    return "policy_or_operations_statement";
  }
  if (
    includesAny(text, [
      "operational description",
      "enforcement mechanism",
      "enforcement method",
      "regulation detail",
      "operational change",
      "operational practice",
      "operational rationale",
    ])
  ) {
    return "policy_or_operations_statement";
  }
  if (
    includesAny(text, [
      "accessibility inventory",
      "curb regulation inventory",
      "infrastructure description",
      "accessibility deficiency",
      "feature enumeration",
      "infrastructure deployment",
      "material specification",
      "route safety feature",
      "technology description",
    ])
  ) {
    return "infrastructure_inventory";
  }
  if (includesAny(text, ["feature description", "construction specification"])) {
    return "infrastructure_inventory";
  }
  if (includesAny(text, ["business quote", "community quote"])) return "public_feedback";
  if (
    includesAny(text, [
      "outreach method",
      "outreach commitment",
      "partnership",
      "agency role",
      "advocacy position",
      "public complaint",
      "public question",
      "resident",
      "stakeholder request",
      "expert opinion",
    ])
  ) {
    return "public_feedback";
  }
  if (includesAny(text, ["agency response", "action commitment", "implementation action"])) {
    return "implementation_or_planning";
  }
  if (
    includesAny(text, ["planning statement", "implementation statement", "implementation fact"])
  ) {
    return "implementation_or_planning";
  }
  if (
    includesAny(text, [
      "implementation constraint",
      "implementation gap",
      "planned expansion",
      "study recommendation",
      "program description",
      "planning rationale",
      "agency commitment",
      "capacity response",
      "coordination statement",
      "development announcement",
      "expansion commitment",
      "expansion target",
      "future plan",
      "future plan claim",
      "implementation challenge",
      "implementation date",
      "implementation detail",
      "implementation outcome",
      "implementation readiness",
      "implementation requirement",
      "ongoing coordination",
      "planned change",
      "planned deployment",
      "planned implementation",
      "planned service conversion",
      "planning identification",
      "process description",
      "program commitment",
      "project approach",
      "project statement",
      "project maintenance",
    ])
  ) {
    return "implementation_or_planning";
  }
  if (
    includesAny(text, [
      "before after",
      "before_after",
      "speed comparison",
      "ridership statistic",
      "bus volume statement",
      "comparative ridership",
      "observed trend",
      "trend claim",
      "safety trend",
    ])
  ) {
    return "performance_observation";
  }
  if (
    includesAny(text, [
      "ridership volume",
      "high ridership",
      "ridership across",
      "delay breakdown",
      "safety statistic",
      "crash incident",
      "crash report",
      "crash safety summary",
      "statistical fact",
      "time allocation breakdown",
      "traffic impact",
      "ridership claim",
      "ridership comparison",
      "ridership evidence",
      "ridership fact",
      "ridership ranking",
      "ridership statement",
      "ridership summary",
      "ridership trend",
    ])
  ) {
    return "performance_observation";
  }
  if (
    includesAny(text, [
      "value statement",
      "efficiency argument",
      "stated purpose",
      "project rationale",
    ])
  ) {
    return "expected_benefit";
  }
  if (
    includesAny(text, [
      "challenge being addressed",
      "challenge statement",
      "constraint",
      "traffic congestion location",
      "traffic concern",
      "pedestrian safety concern",
    ])
  ) {
    return "problem_statement";
  }
  if (
    includesAny(text, [
      "demographic profile",
      "equity claim",
      "equity justification",
      "growth context",
    ])
  ) {
    return "public_feedback";
  }
  if (includesAny(text, ["directional pattern", "headline fact", "factual context"])) {
    return "factual_context";
  }
  if (includesAny(text, ["problem", "issue", "need"])) return "problem_statement";
  if (includesAny(text, ["existing", "current", "condition"])) return "existing_condition";
  if (includesAny(text, ["proposal", "proposed", "design", "treatment", "improvement"])) {
    return "proposed_treatment";
  }
  if (includesAny(text, ["benefit", "expected", "goal", "objective"])) return "expected_benefit";
  if (includesAny(text, ["finding", "observation", "performance", "result"])) {
    return "performance_observation";
  }
  if (includesAny(text, ["timeline", "status", "milestone", "launch"])) return "timeline_or_status";
  if (includesAny(text, ["restriction", "rule", "turn", "regulatory"])) {
    return "regulatory_restriction";
  }
  if (includesAny(text, ["community", "feedback", "comment"])) return "public_feedback";
  if (includesAny(text, ["scope", "corridor", "project description", "project extent"]))
    return "project_scope";
  if (includesAny(text, ["project feature", "project inventory"]))
    return "infrastructure_inventory";
  if (includesAny(text, ["qualification", "usage description"]))
    return "methodology_or_source_note";
  if (includesAny(text, ["regulation clarification"])) return "policy_or_operations_statement";
  if (includesAny(text, ["vehicle ownership statistic"])) return "public_feedback";
  return "other_claim";
}

function canonicalContextFamily(value: string | undefined): string {
  const text = compactLabel(value);
  if (includesAny(text, ["document purpose", "summary", "context"])) return "document_context";
  if (includesAny(text, ["curb", "parking", "loading"])) return "curb_context";
  if (includesAny(text, ["safety", "crash", "injury"])) return "safety_context";
  if (includesAny(text, ["traffic", "congestion", "speed"])) return "traffic_context";
  if (includesAny(text, ["community", "feedback", "equity"])) return "public_or_equity_context";
  if (includesAny(text, ["service", "ridership", "route"])) return "transit_service_context";
  return "other_context";
}

function canonicalQuestionFamily(value: string | undefined): string {
  const text = compactLabel(value);
  if (includesAny(text, ["missing metadata", "date", "publication"])) return "metadata_gap";
  if (includesAny(text, ["missing content", "additional pages"])) return "source_gap";
  if (includesAny(text, ["validation", "verify", "confirm"])) return "validation_question";
  if (includesAny(text, ["research", "study", "causal", "forecast"])) return "research_question";
  return "other_question";
}

async function readExtractionFile(path: string): Promise<{
  extraction: DocumentDiscoveryExtraction | null;
  invalid: boolean;
  path: string;
}> {
  const parsed = DocumentDiscoveryExtractionSchema.safeParse(await Bun.file(path).json());
  if (!parsed.success) {
    return { extraction: null, invalid: true, path };
  }
  return { extraction: parsed.data, invalid: false, path };
}

async function loadDiscoveryRoot(rootPath: string): Promise<{
  label: string;
  summary: DiscoveryInputSummary;
  extractions: DocumentDiscoveryExtraction[];
}> {
  const label = basename(rootPath);
  const glob = new Glob("**/document-discovery.json");
  const extractions: DocumentDiscoveryExtraction[] = [];
  let invalidExtractionCount = 0;
  for await (const relativePath of glob.scan(rootPath)) {
    const result = await readExtractionFile(join(rootPath, relativePath));
    if (result.invalid) {
      invalidExtractionCount += 1;
      continue;
    }
    if (result.extraction !== null) extractions.push(result.extraction);
  }
  return {
    label,
    summary: {
      label,
      rootPath,
      extractionCount: extractions.length,
      invalidExtractionCount,
      sourceCount: new Set(extractions.map((extraction) => extraction.source.sourceId)).size,
    },
    extractions,
  };
}

function addMapping(
  mappings: Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>,
  canonicalFamily: string,
  rawValue: string,
  ref: CandidateRef,
): void {
  const current = mappings.get(canonicalFamily) ?? { raw: new Map<string, number>(), refs: [] };
  addCounter(current.raw, rawValue);
  current.refs.push(ref);
  mappings.set(canonicalFamily, current);
}

function mappingRows(
  mappings: Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>,
): VocabularyMapping[] {
  return [...mappings.entries()]
    .map(([canonicalFamily, value]) => ({
      canonicalFamily,
      count: value.refs.length,
      sourceCount: sourceCount(value.refs),
      rawValues: counterRows(value.raw).slice(0, MAX_RAW_VALUES_PER_MAPPING),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.canonicalFamily.localeCompare(right.canonicalFamily),
    );
}

function addCluster(
  clusters: Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >,
  input: CandidateClusterInput,
): void {
  const cluster = clusters.get(input.clusterKey) ?? {
    canonicalFamily: input.canonicalFamily,
    displayLabel: input.displayLabel,
    raw: new Map<string, number>(),
    refs: new Map<string, CandidateRef>(),
  };
  addCounter(cluster.raw, input.rawVariant);
  cluster.refs.set(refKey(input.ref), input.ref);
  clusters.set(input.clusterKey, cluster);
}

function clusterRows(
  clusters: Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >,
  limit: number,
): ClusterSummary[] {
  return [...clusters.entries()]
    .map(([clusterKey, value]) => {
      const refs = [...value.refs.values()];
      return {
        clusterKey,
        canonicalFamily: value.canonicalFamily,
        displayLabel: value.displayLabel,
        count: refs.length,
        sourceCount: sourceCount(refs),
        sampleRefs: refs.slice(0, 8),
        rawVariants: counterRows(value.raw).slice(0, 20),
      };
    })
    .sort(
      (left, right) => right.count - left.count || left.clusterKey.localeCompare(right.clusterKey),
    )
    .slice(0, limit);
}

function renderMarkdown(audit: Tier2DiscoveryCurationAudit): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Discovery Curation Audit");
  lines.push("");
  lines.push(`Generated: ${audit.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Extractions: ${audit.summary.extractionCount}`);
  lines.push(`- Sources: ${audit.summary.sourceCount}`);
  lines.push(`- Validation issues: ${audit.summary.validationIssueCount}`);
  lines.push(
    `- Candidate counts: ${Object.entries(audit.summary.candidateCounts)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
  );
  lines.push("");
  lines.push("## Coverage By Source Group");
  lines.push("");
  lines.push("| Source group | Sources | Extractions |");
  lines.push("|---|---:|---:|");
  for (const row of audit.coverage.bySourceGroup) {
    lines.push(`| ${row.sourceGroup} | ${row.sourceCount} | ${row.extractionCount} |`);
  }
  lines.push("");
  lines.push("## Top Validation Issues");
  lines.push("");
  lines.push("| Count | Code | Path | Example |");
  lines.push("|---:|---|---|---|");
  for (const issue of audit.validationIssues.slice(0, 15)) {
    lines.push(
      `| ${issue.count} | ${issue.code} | ${issue.path} | ${(issue.sampleMessages[0] ?? "").replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  lines.push("## Normalization Seed");
  lines.push("");
  const mappingSections: Array<[string, VocabularyMapping[]]> = [
    ["Entity kinds", audit.normalizationSeed.entityKindMappings],
    ["Metric families", audit.normalizationSeed.metricFamilyMappings],
    ["Event families", audit.normalizationSeed.eventFamilyMappings],
    ["Table families", audit.normalizationSeed.tableFamilyMappings],
    ["Claim families", audit.normalizationSeed.claimFamilyMappings],
  ];
  for (const [title, rows] of mappingSections) {
    lines.push(`### ${title}`);
    lines.push("");
    lines.push("| Canonical family | Count | Sources | Top raw values |");
    lines.push("|---|---:|---:|---|");
    for (const row of rows.slice(0, 15)) {
      const raw = row.rawValues
        .slice(0, 5)
        .map((value) => `${value.value} (${value.count})`)
        .join("; ");
      lines.push(
        `| ${row.canonicalFamily} | ${row.count} | ${row.sourceCount} | ${raw.replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Dedupe Pressure");
  lines.push("");
  const clusterSections: Array<[string, ClusterSummary[]]> = [
    ["Entities", audit.dedupeSeed.entities],
    ["Metrics", audit.dedupeSeed.metrics],
    ["Events", audit.dedupeSeed.events],
    ["Tables", audit.dedupeSeed.tables],
    ["Claims", audit.dedupeSeed.claims],
  ];
  for (const [title, rows] of clusterSections) {
    lines.push(`### ${title}`);
    lines.push("");
    lines.push("| Count | Sources | Family | Label |");
    lines.push("|---:|---:|---|---|");
    for (const row of rows.slice(0, 15)) {
      lines.push(
        `| ${row.count} | ${row.sourceCount} | ${row.canonicalFamily} | ${row.displayLabel.replace(/\|/g, "/")} |`,
      );
    }
    lines.push("");
  }
  lines.push("## Next Curation Actions");
  lines.push("");
  for (const action of audit.nextCurationActions) {
    lines.push(`- ${action}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildManualCurationSeed(input: {
  audit: Tier2DiscoveryCurationAudit;
  sourceAuditPath: string;
}): Tier2DiscoveryManualCurationSeed {
  const otherMetricValues =
    input.audit.normalizationSeed.metricFamilyMappings.find(
      (row) => row.canonicalFamily === "other_metric",
    )?.rawValues ?? [];
  const otherEntityValues =
    input.audit.normalizationSeed.entityKindMappings.find((row) => row.canonicalFamily === "other")
      ?.rawValues ?? [];
  const otherClaimValues =
    input.audit.normalizationSeed.claimFamilyMappings.find(
      (row) => row.canonicalFamily === "other_claim",
    )?.rawValues ?? [];
  const otherTableValues =
    input.audit.normalizationSeed.tableFamilyMappings.find(
      (row) => row.canonicalFamily === "other_table",
    )?.rawValues ?? [];
  return {
    version: 1,
    generatedAt: input.audit.generatedAt,
    sourceAuditPath: input.sourceAuditPath,
    evidencePolicy: input.audit.normalizationSeed.evidencePolicy,
    approvedFamilyBuckets: {
      entities: input.audit.normalizationSeed.entityKindMappings
        .filter((row) => row.canonicalFamily !== "other")
        .map((row) => row.canonicalFamily),
      metrics: input.audit.normalizationSeed.metricFamilyMappings
        .filter((row) => row.canonicalFamily !== "other_metric")
        .map((row) => row.canonicalFamily),
      claims: input.audit.normalizationSeed.claimFamilyMappings
        .filter((row) => row.canonicalFamily !== "other_claim")
        .map((row) => row.canonicalFamily),
      tables: input.audit.normalizationSeed.tableFamilyMappings
        .filter((row) => row.canonicalFamily !== "other_table")
        .map((row) => row.canonicalFamily),
    },
    canonicalAliasSeeds: {
      entities: [
        {
          canonicalId: "agency:mta",
          canonicalFamily: "agency",
          canonicalLabel: "MTA",
          aliases: ["MTA", "MTA New York City Transit", "NYCT", "New York City Transit"],
        },
        {
          canonicalId: "agency:nyc_dot",
          canonicalFamily: "agency",
          canonicalLabel: "NYC DOT",
          aliases: ["NYC DOT", "NYCDOT", "NEW YORK CITY DOT", "DOT"],
        },
        {
          canonicalId: "program:better_buses",
          canonicalFamily: "program",
          canonicalLabel: "Better Buses",
          aliases: ["BETTERBUSES", "Better Buses"],
        },
        {
          canonicalId: "program:select_bus_service",
          canonicalFamily: "program",
          canonicalLabel: "Select Bus Service",
          aliases: ["Select Bus Service", "SBS"],
        },
        {
          canonicalId: "program:vision_zero",
          canonicalFamily: "program",
          canonicalLabel: "Vision Zero",
          aliases: ["Vision Zero"],
        },
        {
          canonicalId: "program:14th_street_transit_truck_priority_pilot",
          canonicalFamily: "program",
          canonicalLabel: "14th Street Transit & Truck Priority Pilot Project",
          aliases: [
            "14th Street Transit & Truck Priority Pilot Project",
            "14th Street Transit and Truck Priority Pilot Project",
          ],
        },
      ],
      metrics: [
        {
          canonicalId: "metric:ridership_boardings",
          canonicalFamily: "ridership",
          canonicalLabel: "Boardings",
          aliases: ["Total Ons", "Ons", "Boardings", "People boarding"],
        },
        {
          canonicalId: "metric:ridership_alightings",
          canonicalFamily: "ridership",
          canonicalLabel: "Alightings",
          aliases: ["Total Offs", "Offs", "Alightings"],
        },
        {
          canonicalId: "metric:bus_speed",
          canonicalFamily: "bus_speed",
          canonicalLabel: "Bus speed",
          aliases: ["Bus Speed", "Average bus speeds", "Average bus speed"],
        },
        {
          canonicalId: "metric:travel_time",
          canonicalFamily: "travel_time",
          canonicalLabel: "Travel time",
          aliases: ["Travel Time", "Bus travel time", "Customer Journey Time"],
        },
        {
          canonicalId: "metric:tsp_intersection_count",
          canonicalFamily: "signal_priority",
          canonicalLabel: "TSP intersection count",
          aliases: ["Transit Signal Priority", "TSP intersections"],
        },
      ],
    },
    reviewQueues: {
      unresolvedFamilyCounts: {
        entities:
          input.audit.normalizationSeed.entityKindMappings.find(
            (row) => row.canonicalFamily === "other",
          )?.count ?? 0,
        metrics:
          input.audit.normalizationSeed.metricFamilyMappings.find(
            (row) => row.canonicalFamily === "other_metric",
          )?.count ?? 0,
        claims:
          input.audit.normalizationSeed.claimFamilyMappings.find(
            (row) => row.canonicalFamily === "other_claim",
          )?.count ?? 0,
        tables:
          input.audit.normalizationSeed.tableFamilyMappings.find(
            (row) => row.canonicalFamily === "other_table",
          )?.count ?? 0,
      },
      highVolumeMetricFamilies: input.audit.normalizationSeed.metricFamilyMappings.slice(0, 20),
      highVolumeOtherMetricValues: otherMetricValues,
      highVolumeOtherEntityValues: otherEntityValues,
      highVolumeOtherClaimValues: otherClaimValues,
      highVolumeOtherTableValues: otherTableValues,
      highVolumeEntityClusters: input.audit.dedupeSeed.entities.slice(0, 40),
      highVolumeClaimClusters: input.audit.dedupeSeed.claims.slice(0, 40),
    },
    nextSchemaDecisions: [
      "Represent OCR evidence as sourceId, pageNumber, blockId, optional lineStart/lineEnd, and runner-filled blockHash/sourceContentHash.",
      "Keep document-claimed metrics separate from deterministic analytics metrics; the same table can inform a detector packet without being treated as measured AVL/GTFS truth.",
      "Allow bus, subway, PATH, LIRR, NJ Transit, and Amtrak entities, but normalize bus routes separately from rail/transit lines.",
      "Store raw metric labels/values/units exactly, then attach canonical metric family and optional normalized numeric value only when deterministic parsing is safe.",
      "Deduplicate by canonical family plus normalized text and source-aware evidence refs; preserve repeated claims across documents as corroboration rather than dropping them.",
    ],
  };
}

async function writeManualCurationSeed(input: {
  audit: Tier2DiscoveryCurationAudit;
  auditPath: string;
  rulesPath: string;
}): Promise<Tier2DiscoveryManualCurationSeed> {
  const seed = buildManualCurationSeed({
    audit: input.audit,
    sourceAuditPath: input.auditPath,
  });
  await mkdir(dirname(input.rulesPath), { recursive: true });
  await writeJson(input.rulesPath, seed);
  return seed;
}

export async function buildTier2DiscoveryCurationAudit(args: {
  discoveryRoots: string[];
  output: string;
  markdown?: string;
  rules?: string;
  normalized?: string;
  generatedAt?: string;
  topClusters?: number;
  canonicalPerWindow?: boolean;
  canonicalRootPriority?: string[];
}): Promise<Tier2DiscoveryCurationAudit> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const topClusters = args.topClusters ?? 50;
  const loaded = [];
  for (const root of args.discoveryRoots) {
    loaded.push(await loadDiscoveryRoot(root));
  }
  const allExtractionsWithLabel: ExtractionWithLabel[] = loaded.flatMap((input) =>
    input.extractions.map((extraction) => ({ inputLabel: input.label, extraction })),
  );
  const extractionsWithLabel =
    args.canonicalPerWindow === true
      ? selectCanonicalExtractions(
          allExtractionsWithLabel,
          args.canonicalRootPriority ?? DEFAULT_CANONICAL_ROOT_PRIORITY,
        )
      : allExtractionsWithLabel;
  const sourcesByGroup = new Map<string, Set<string>>();
  const extractionsByGroup = new Map<string, number>();
  const documentModes = new Map<string, number>();
  const validationIssueGroups = new Map<
    string,
    { code: string; path: string; count: number; sampleMessages: Set<string> }
  >();

  const candidateCounts: Record<CandidateType, number> = {
    entity: 0,
    metric: 0,
    event: 0,
    table: 0,
    claim: 0,
    context_signal: 0,
    review_question: 0,
  };
  const entityMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();
  const metricMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();
  const eventMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();
  const tableMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();
  const claimMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();
  const contextMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();
  const questionMappings = new Map<string, { raw: Map<string, number>; refs: CandidateRef[] }>();

  const entityClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const metricClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const eventClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const tableClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const claimClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const contextClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const questionClusters = new Map<
    string,
    {
      canonicalFamily: string;
      displayLabel: string;
      raw: Map<string, number>;
      refs: Map<string, CandidateRef>;
    }
  >();
  const normalizedRows: Tier2DiscoveryNormalizedCandidateRow[] = [];

  for (const { inputLabel, extraction } of extractionsWithLabel) {
    const sourceGroup = extraction.source.sourceGroup;
    const sourceSet = sourcesByGroup.get(sourceGroup) ?? new Set<string>();
    sourceSet.add(extraction.source.sourceId);
    sourcesByGroup.set(sourceGroup, sourceSet);
    addCounter(extractionsByGroup, sourceGroup);
    addCounter(documentModes, extraction.pageProfile.documentModeRaw ?? "unknown");

    for (const issue of extraction.validationIssues) {
      const key = `${issue.code}|${issue.path}`;
      const group = validationIssueGroups.get(key) ?? {
        code: issue.code,
        path: issue.path,
        count: 0,
        sampleMessages: new Set<string>(),
      };
      group.count += 1;
      if (group.sampleMessages.size < 3) group.sampleMessages.add(issue.message);
      validationIssueGroups.set(key, group);
    }

    const baseRef = {
      inputLabel,
      extractionId: extraction.extractionId,
      sourceId: extraction.source.sourceId,
      sourceGroup,
      pageNumbers: extraction.source.pageNumbers,
    };

    for (const entity of extraction.entities) {
      candidateCounts.entity += 1;
      const ref = { ...baseRef, candidateType: "entity" as const, candidateId: entity.entityId };
      const family = canonicalEntityFamily({
        kindHint: entity.kindHint,
        rawKind: entity.rawKind,
        rawText: entity.rawText,
      });
      const raw = `${entity.kindHint ?? "no_hint"} :: ${entity.rawKind}`;
      const clusterKey = `${family}|${compactLabel(entity.rawText)}`;
      addMapping(entityMappings, family, raw, ref);
      addCluster(entityClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: entity.rawText,
        rawVariant: raw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "entity",
          candidateId: entity.entityId,
          canonicalFamily: family,
          rawFamily: raw,
          displayLabel: entity.rawText,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(entity.evidenceRefs),
          rawCandidate: entity,
        }),
      );
    }

    for (const metric of extraction.metrics) {
      candidateCounts.metric += 1;
      const ref = { ...baseRef, candidateType: "metric" as const, candidateId: metric.metricId };
      const family = canonicalMetricFamily(
        `${metric.labelRaw} ${metric.subjectRaw ?? ""} ${metric.unitRaw ?? ""}`,
      );
      const clusterKey = `${family}|${compactLabel(metric.labelRaw)}|${compactLabel(metric.unitRaw)}|${compactLabel(metric.subjectRaw)}`;
      addMapping(metricMappings, family, metric.labelRaw, ref);
      addCluster(metricClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: metric.labelRaw,
        rawVariant: metric.labelRaw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "metric",
          candidateId: metric.metricId,
          canonicalFamily: family,
          rawFamily: metric.labelRaw,
          displayLabel: metric.labelRaw,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(metric.evidenceRefs),
          rawCandidate: metric,
        }),
      );
    }

    for (const event of extraction.events) {
      candidateCounts.event += 1;
      const ref = { ...baseRef, candidateType: "event" as const, candidateId: event.eventId };
      const raw = event.familyRaw;
      const family = canonicalEventFamily(`${event.familyRaw} ${event.statusRaw ?? ""}`);
      const clusterKey = `${family}|${compactLabel(event.familyRaw)}|${compactLabel(event.dateRaw)}|${compactLabel(event.locationRaw)}`;
      addMapping(eventMappings, family, raw, ref);
      addCluster(eventClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: event.nameRaw ?? event.familyRaw,
        rawVariant: raw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "event",
          candidateId: event.eventId,
          canonicalFamily: family,
          rawFamily: raw,
          displayLabel: event.nameRaw ?? event.familyRaw,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(event.evidenceRefs),
          rawCandidate: event,
        }),
      );
    }

    for (const table of extraction.tables) {
      candidateCounts.table += 1;
      const ref = { ...baseRef, candidateType: "table" as const, candidateId: table.tableId };
      const family = canonicalTableFamily(`${table.tableKindRaw} ${table.titleRaw ?? ""}`);
      const clusterKey = `${family}|${compactLabel(table.tableKindRaw)}|${compactLabel(table.headerTextsRaw.join(" "))}`;
      addMapping(tableMappings, family, table.tableKindRaw, ref);
      addCluster(tableClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: table.titleRaw ?? table.tableKindRaw,
        rawVariant: table.tableKindRaw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "table",
          candidateId: table.tableId,
          canonicalFamily: family,
          rawFamily: table.tableKindRaw,
          displayLabel: table.titleRaw ?? table.tableKindRaw,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(table.evidenceRefs),
          rawCandidate: table,
        }),
      );
    }

    for (const claim of extraction.claims) {
      candidateCounts.claim += 1;
      const ref = { ...baseRef, candidateType: "claim" as const, candidateId: claim.claimId };
      const family = canonicalClaimFamily(`${claim.claimKindRaw} ${claim.claimText}`);
      const clusterKey = `${family}|${compactLabel(claim.claimText)}`;
      addMapping(claimMappings, family, claim.claimKindRaw, ref);
      addCluster(claimClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: claim.claimText,
        rawVariant: claim.claimKindRaw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "claim",
          candidateId: claim.claimId,
          canonicalFamily: family,
          rawFamily: claim.claimKindRaw,
          displayLabel: claim.claimText,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(claim.evidenceRefs),
          rawCandidate: claim,
        }),
      );
    }

    for (const signal of extraction.contextSignals) {
      candidateCounts.context_signal += 1;
      const ref = {
        ...baseRef,
        candidateType: "context_signal" as const,
        candidateId: signal.contextId,
      };
      const family = canonicalContextFamily(`${signal.contextKindRaw} ${signal.signalText}`);
      const clusterKey = `${family}|${compactLabel(signal.signalText)}`;
      addMapping(contextMappings, family, signal.contextKindRaw, ref);
      addCluster(contextClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: signal.signalText,
        rawVariant: signal.contextKindRaw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "context_signal",
          candidateId: signal.contextId,
          canonicalFamily: family,
          rawFamily: signal.contextKindRaw,
          displayLabel: signal.signalText,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(signal.evidenceRefs),
          rawCandidate: signal,
        }),
      );
    }

    for (const question of extraction.reviewQuestions) {
      candidateCounts.review_question += 1;
      const ref = {
        ...baseRef,
        candidateType: "review_question" as const,
        candidateId: question.questionId,
      };
      const family = canonicalQuestionFamily(`${question.questionKindRaw} ${question.question}`);
      const clusterKey = `${family}|${compactLabel(question.question)}`;
      addMapping(questionMappings, family, question.questionKindRaw, ref);
      addCluster(questionClusters, {
        clusterKey,
        canonicalFamily: family,
        displayLabel: question.question,
        rawVariant: question.questionKindRaw,
        ref,
      });
      normalizedRows.push(
        normalizedRowBase({
          inputLabel,
          extraction,
          candidateType: "review_question",
          candidateId: question.questionId,
          canonicalFamily: family,
          rawFamily: question.questionKindRaw,
          displayLabel: question.question,
          clusterKey,
          evidenceRefs: evidenceRefsForRow(question.evidenceRefs),
          rawCandidate: question,
        }),
      );
    }
  }

  const clusterMaps: Record<CandidateType, Map<string, unknown>> = {
    entity: entityClusters as Map<string, unknown>,
    metric: metricClusters as Map<string, unknown>,
    event: eventClusters as Map<string, unknown>,
    table: tableClusters as Map<string, unknown>,
    claim: claimClusters as Map<string, unknown>,
    context_signal: contextClusters as Map<string, unknown>,
    review_question: questionClusters as Map<string, unknown>,
  };
  const uniqueClusterCounts = Object.fromEntries(
    Object.entries(clusterMaps).map(([key, value]) => [key, value.size]),
  ) as Record<CandidateType, number>;

  const duplicateClusterCounts = {
    entity: clusterRows(entityClusters, Number.MAX_SAFE_INTEGER).filter((row) => row.count > 1)
      .length,
    metric: clusterRows(metricClusters, Number.MAX_SAFE_INTEGER).filter((row) => row.count > 1)
      .length,
    event: clusterRows(eventClusters, Number.MAX_SAFE_INTEGER).filter((row) => row.count > 1)
      .length,
    table: clusterRows(tableClusters, Number.MAX_SAFE_INTEGER).filter((row) => row.count > 1)
      .length,
    claim: clusterRows(claimClusters, Number.MAX_SAFE_INTEGER).filter((row) => row.count > 1)
      .length,
    context_signal: clusterRows(contextClusters, Number.MAX_SAFE_INTEGER).filter(
      (row) => row.count > 1,
    ).length,
    review_question: clusterRows(questionClusters, Number.MAX_SAFE_INTEGER).filter(
      (row) => row.count > 1,
    ).length,
  };

  const validationIssues = [...validationIssueGroups.values()]
    .map((issue) => ({
      code: issue.code,
      path: issue.path,
      count: issue.count,
      sampleMessages: [...issue.sampleMessages],
    }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));

  const audit: Tier2DiscoveryCurationAudit = {
    version: 1,
    generatedAt,
    inputRoots: loaded.map((input) => input.summary),
    summary: {
      extractionCount: extractionsWithLabel.length,
      invalidExtractionCount: loaded.reduce(
        (sum, input) => sum + input.summary.invalidExtractionCount,
        0,
      ),
      sourceCount: new Set(extractionsWithLabel.map(({ extraction }) => extraction.source.sourceId))
        .size,
      sourceGroupCount: sourcesByGroup.size,
      validationIssueCount: validationIssues.reduce((sum, issue) => sum + issue.count, 0),
      candidateCounts,
      uniqueClusterCounts,
      duplicateClusterCounts,
    },
    coverage: {
      bySourceGroup: [...sourcesByGroup.entries()]
        .map(([sourceGroup, sources]) => ({
          sourceGroup,
          sourceCount: sources.size,
          extractionCount: extractionsByGroup.get(sourceGroup) ?? 0,
        }))
        .sort((left, right) => right.extractionCount - left.extractionCount),
      byDocumentMode: topCounterRows(documentModes, 40).map((row) => ({
        documentModeRaw: row.value,
        extractionCount: row.count,
      })),
    },
    validationIssues,
    normalizationSeed: {
      entityKindMappings: mappingRows(entityMappings),
      metricFamilyMappings: mappingRows(metricMappings),
      eventFamilyMappings: mappingRows(eventMappings),
      tableFamilyMappings: mappingRows(tableMappings),
      claimFamilyMappings: mappingRows(claimMappings),
      contextFamilyMappings: mappingRows(contextMappings),
      reviewQuestionFamilyMappings: mappingRows(questionMappings),
      evidencePolicy: {
        modelShouldSubmitBlockHash: false,
        modelShouldSubmitLineRange: true,
        runnerShouldFillBlockHash: true,
        rationale:
          "Discovery validation shows repeated block-hash mismatches even when blockId/page refs are otherwise useful. The normalized final submit tool should ask for blockId and line range, then have the runner attach canonical hashes from the block index.",
      },
    },
    dedupeSeed: {
      entities: clusterRows(entityClusters, topClusters),
      metrics: clusterRows(metricClusters, topClusters),
      events: clusterRows(eventClusters, topClusters),
      tables: clusterRows(tableClusters, topClusters),
      claims: clusterRows(claimClusters, topClusters),
      contextSignals: clusterRows(contextClusters, topClusters),
      reviewQuestions: clusterRows(questionClusters, topClusters),
    },
    nextCurationActions: [
      "Promote the evidence policy into the final normalized extraction schema: model submits blockId/line range, runner fills blockHash.",
      "Review metricFamilyMappings and split document-claimed metrics from deterministic analytics metrics before using them in detector packets.",
      "Use dedupeSeed.entities and dedupeSeed.claims to design record-level clustering keys; do not dedupe solely on route or source.",
      "Treat sourceGroup-specific page modes separately: SBS launch flyers, capital-project decks, and bus-priority presentations produce different normalized records.",
      "Run a small held-out final-schema extraction after manually approving the normalization mappings.",
    ],
  };

  await mkdir(dirname(args.output), { recursive: true });
  await writeJson(args.output, audit);
  if (args.markdown !== undefined) {
    await mkdir(dirname(args.markdown), { recursive: true });
    await Bun.write(args.markdown, renderMarkdown(audit));
  }
  if (args.rules !== undefined) {
    await writeManualCurationSeed({ audit, auditPath: args.output, rulesPath: args.rules });
  }
  if (args.normalized !== undefined) {
    await writeNormalizedCandidates({
      rows: normalizedRows,
      generatedAt,
      auditPath: args.output,
      normalizedPath: args.normalized,
    });
  }
  return audit;
}

function parseDiscoveryCurationCliArgs(args: string[]): DiscoveryCurationCliArgs {
  return parseCliOptions<DiscoveryCurationCliArgs>(args, {}, [
    {
      flags: ["--discovery-root", "--root"],
      apply: (output, value) => {
        if (value === undefined) return;
        output.discoveryRoots = [...(output.discoveryRoots ?? []), fromCliPath(value)];
      },
    },
    {
      flags: ["--discovery-roots", "--roots"],
      apply: (output, value) => {
        if (value === undefined) return;
        output.discoveryRoots = value
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .map(fromCliPath);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.output = fromCliPath(value);
      },
    },
    {
      flags: ["--markdown"],
      apply: (output, value) => {
        if (value !== undefined) output.markdown = fromCliPath(value);
      },
    },
    {
      flags: ["--rules"],
      apply: (output, value) => {
        if (value !== undefined) output.rules = fromCliPath(value);
      },
    },
    {
      flags: ["--normalized", "--normalized-output"],
      apply: (output, value) => {
        if (value !== undefined) output.normalized = fromCliPath(value);
      },
    },
    {
      flags: ["--top-clusters"],
      apply: (output, value) => {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("--top-clusters must be a positive integer.");
        }
        output.topClusters = parsed;
      },
    },
    trueOption(["--canonical-per-window"], (output) => {
      output.canonicalPerWindow = true;
    }),
    {
      flags: ["--canonical-root-priority"],
      apply: (output, value) => {
        if (value === undefined) return;
        output.canonicalRootPriority = value
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
      },
    },
  ] satisfies CliOption<DiscoveryCurationCliArgs>[]);
}

export async function buildTier2DiscoveryCurationAuditFromCli(args: string[]) {
  const parsed = parseDiscoveryCurationCliArgs(args);
  const artifactRoot = defaultArtifactRootPath();
  const defaultBase = join(artifactRoot, "docs", "tier2-full-corpus-2026-05-24-pass2");
  const roots = parsed.discoveryRoots ?? DEFAULT_DISCOVERY_ROOTS.map((root) => fromRepoRoot(root));
  const output = parsed.output ?? join(defaultBase, "document-discovery-curation-audit-v1.json");
  const markdown = parsed.markdown ?? join(defaultBase, "document-discovery-curation-audit-v1.md");
  const rules = parsed.rules ?? join(defaultBase, "document-discovery-curation-rules-v1.json");
  const normalized =
    parsed.normalized ?? join(defaultBase, "document-discovery-normalized-candidates-v1.json");
  const audit = await buildTier2DiscoveryCurationAudit({
    discoveryRoots: roots,
    output,
    markdown,
    rules,
    normalized,
    ...(parsed.topClusters === undefined ? {} : { topClusters: parsed.topClusters }),
    ...(parsed.canonicalPerWindow === undefined
      ? {}
      : { canonicalPerWindow: parsed.canonicalPerWindow }),
    ...(parsed.canonicalRootPriority === undefined
      ? {}
      : { canonicalRootPriority: parsed.canonicalRootPriority }),
  });
  return {
    version: audit.version,
    generatedAt: audit.generatedAt,
    outputPath: output,
    markdownPath: markdown,
    rulesPath: rules,
    normalizedPath: normalized,
    summary: audit.summary,
    coverage: audit.coverage.bySourceGroup,
    topNextCurationActions: audit.nextCurationActions,
  };
}
