// Tier 2 Phase 3 intervention-records synthesis step, extracted from the former
// _shared.ts monolith during the per-step decomposition. Holds the DeepSeek
// client wrapper, prompt/tool/system-prompt, the post-LLM
// repair/validate/cluster/dedupe helper set, and the CLI entry point. Imports
// shared types, schemas, LLM HTTP clients, route/numeric patterns, and
// path/IO/CLI helpers from the core module; the core module never imports back
// here at runtime, keeping the DAG acyclic.
import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  dedupeInterventionRecordsByEvidenceOverlap,
  processInterventionRecordsToolArgs,
} from "@bp/analytics/interventions";
import type { Tier2DocumentEvidenceCandidate } from "@bp/domain/documents/candidates";
import {
  DocumentInterventionRecordsToolResponseSchema,
  type Tier2InterventionRecordQualityIssueCode,
  type Tier2InterventionRecordQualityRepairCode,
} from "@bp/domain/documents/intervention-records";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../../lib/paths.ts";
import {
  callDeepSeekToolCallViaPi,
  type OpenRouterCallResult,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import { expandRouteMention } from "./_patterns.ts";
import {
  artifactKey,
  type CliOption,
  DEFAULT_TEXT_MODEL,
  defaultFetch,
  extractToolCallArguments,
  type FetchLike,
  latestDocsRunId,
  missingToolCallErrorMessage,
  normalizeOcrArtifactRootName,
  parseCliOptions,
  parseSourceIds,
  recordQualityIssueCounts,
  recordQualityRepairCounts,
  runArtifactRoot,
  type Tier2DocumentInterventionRecord,
  type Tier2OcrMarkdownCandidateExtraction,
  trueOption,
} from "./_shared.ts";

const INTERVENTION_RECORDS_TOOL_NAME = "record_tier2_document_intervention_records";
const INTERVENTION_RECORDS_PROMPT_VERSION = "intervention-records-v2";
const DEFAULT_INTERVENTION_RECORDS_ROOT_NAME = "intervention-records";
const DEFAULT_INTERVENTION_RECORDS_MAX_TOKENS = 32768;

export type Tier2InterventionRecordsExtraction = {
  version: 1;
  runId: string;
  generatedAt: string;
  ocrMarkdownCandidateExtractionPath: string;
  outputPath: string | null;
  provider: "openrouter";
  model: string;
  serviceTier: "flex" | "priority";
  maxTokens: number;
  synthesisRootName: string;
  promptVersion: string;
  execute: boolean;
  summary: {
    selectedSourceCount: number;
    extractedSourceCount: number;
    failedSourceCount: number;
    reusedExistingSourceCount: number;
    recordCount: number;
    unattachedCandidateCount: number;
    droppedNoInterventionEvidenceCount: number;
    recordQualityIssueCounts: Record<Tier2InterventionRecordQualityIssueCode, number>;
    recordQualityRepairCounts: Record<Tier2InterventionRecordQualityRepairCode, number>;
  };
  sources: Tier2InterventionRecordsSource[];
  documentInterventionRecords: Tier2DocumentInterventionRecord[];
};

export type Tier2InterventionRecordsBucketKind =
  | "single_call"
  | "per_route"
  | "source_wide"
  | "page_range";

export type Tier2InterventionRecordsBucketSummary = {
  bucketId: string;
  bucketKind: Tier2InterventionRecordsBucketKind;
  status: "extracted" | "failed";
  candidateCount: number;
  recordCount: number;
  estimatedPromptChars: number;
  unattachedCandidateCount?: number;
  droppedNoInterventionEvidenceCount?: number;
  responseArtifactKey?: string | null;
  toolCallArtifactKey?: string | null;
  errorArtifactKey?: string | null;
  error?: string | null;
};

export type Tier2InterventionRecordsSource = {
  sourceId: string;
  status: "extracted" | "failed" | "skipped";
  candidateCount: number;
  recordCount: number;
  unattachedCandidateCount: number;
  droppedNoInterventionEvidenceCount: number;
  reusedExisting: boolean;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  errorArtifactKey: string | null;
  error: string | null;
  buckets: Tier2InterventionRecordsBucketSummary[];
};

type ExtractTier2InterventionRecordsArgs = {
  ocrMarkdownCandidateExtractionPath: string;
  outputPath?: string;
  generatedAt?: string;
  synthesisRootName?: string;
  model?: string;
  serviceTier?: "flex" | "priority";
  maxTokens?: number;
  sourceIds?: string[];
  limitSources?: number;
  routeCatalogPath?: string;
  execute?: boolean;
  fetcher?: FetchLike;
  apiKey?: string;
};

const DEFAULT_INTERVENTION_RECORDS_ROUTE_CATALOG_PATH = fromRepoRoot(
  "data/raw/network/current_bus_routes.json",
);

const INTERVENTION_RECORDS_SYSTEM_PROMPT = [
  "You are synthesizing Tier 2 evidence candidates into canonical intervention records for Bus Priority Impact Studio.",
  "Each input candidate already carries a verbatim source quote and was extracted from one source document. Group candidates that describe the same discrete change to bus service into one intervention record.",
  "Every record's claims must trace back to specific candidateIds via evidenceRefs. Do not invent facts beyond what the candidates say.",
  "A source can produce zero, one, or several records: zero if the candidates describe no actionable intervention (pure methodology paper, opinion piece); several if the source covers separate changes (e.g. an SBS launch and a later RTPI install).",
  "Treatment-component candidates, metric candidates, project-status candidates, service-change candidates, treatment maps, and corridor-defining quotes typically belong inside one of the records.",
  "Tables, figures, methodology, source_gap, caveat, and review_question candidates either attach as evidence to a specific record component (e.g. a metric's evidenceRefs) or land in unattachedCandidateIds when they don't belong to any record.",
  'Every record must populate statusHistory with at least one observation. When candidates carry an explicit status (e.g. fields.implementationStatus: "proposed", fields.status: "complete"), emit a matching statusHistory entry pointing at the supporting candidateId. When candidates disagree (one says "implementing", another says "complete"), emit both as separate entries with their respective evidence.',
  'If every supporting candidate is flagged proposed-only (negativeEvidenceFlag: "proposed_only" or fields.implementationStatus: "proposed"), the record represents a recommendation; reflect that with a statusHistory entry whose status is "proposed".',
  'If all cited evidence is proposed-only, recommendation-only, or future-tense, the record\'s statusHistory must be "proposed" only — do not promote it to "implementing" or "complete" unless a separate non-proposed candidate explicitly states the intervention was implemented or completed.',
  "Do not create records for context-only mentions. A record requires the source to describe a specific change to bus service. Routes mentioned only as context (worst-performer rankings, performance tables, fare-policy descriptions, network statistics, ridership counts) are not records on their own — place those candidates in unattachedCandidateIds or attach them as evidence to a record that does describe an intervention.",
  "Do not create bus-priority intervention records for fare policy, fare enforcement, subway accessibility, station improvements, or other unrelated agency programs unless the cited evidence directly ties them to a bus-priority or bus-service intervention.",
  "Only populate corridor.extentEndpoints when a supporting candidate quote explicitly names the start and end points. Do not infer endpoints from route descriptions, general geography, or the route catalog. If unsure, omit extentEndpoints and keep only corridor.streets.",
  "The pipeline chunks large route-redesign sources before this call. Within the provided candidate bucket, return every discrete intervention record supported by the evidence, but do not duplicate one intervention across multiple records.",
  "Use nested period objects: baselinePeriod: { start, end } and comparisonPeriod: { start, end }, never flat baselinePeriodStart/comparisonPeriodStart.",
  "Omit optional fields when the source does not supply the information. Do not emit empty strings or empty objects as placeholders.",
].join("\n");

function interventionRecordsTool(): Record<string, unknown> {
  const responseSchema = toProjectJsonSchema(DocumentInterventionRecordsToolResponseSchema);
  if (
    responseSchema === null ||
    typeof responseSchema !== "object" ||
    Array.isArray(responseSchema)
  ) {
    throw new Error(
      "DocumentInterventionRecordsToolResponseSchema did not produce an object schema.",
    );
  }
  const { $schema: _ignored, ...parameters } = responseSchema as Record<string, unknown>;
  return {
    type: "function",
    function: {
      name: INTERVENTION_RECORDS_TOOL_NAME,
      description:
        "Record per-source intervention records synthesized from a source's evidence candidates. Each record carries its supporting candidateIds via evidenceRefs; do not invent IDs.",
      parameters,
    },
  };
}

function buildInterventionRecordsPrompt(input: {
  source: { sourceId: string; title: string; publisher: string; sourceGroup: string };
  candidates: Tier2DocumentEvidenceCandidate[];
  routeCatalogSnippet: string | null;
}): string {
  const candidatesForModel = input.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    candidateType: candidate.candidateType,
    factClassification: candidate.factClassification,
    negativeEvidenceFlag: candidate.negativeEvidenceFlag,
    routeMentions: candidate.routeMentions,
    corridorMentions: candidate.corridorMentions,
    evidencePageRefs: candidate.evidencePageRefs,
    evidenceQuote: candidate.evidenceQuote,
    summary: candidate.summary,
    fields: candidate.fields,
  }));
  return [
    `Source ID: ${input.source.sourceId}`,
    `Title: ${input.source.title}`,
    `Publisher: ${input.source.publisher}`,
    `Source group: ${input.source.sourceGroup}`,
    `Candidate count: ${input.candidates.length}`,
    "",
    ...(input.routeCatalogSnippet === null ? [] : [input.routeCatalogSnippet, ""]),
    "Evidence candidates (JSON, one entry per line):",
    ...candidatesForModel.map((candidate) => JSON.stringify(candidate)),
  ].join("\n");
}

// Exported for request-shape characterization tests (see callOpenRouterPageMarkdownOcr).
// Routes the DeepSeek text-only forced tool call through the pi harness; the
// returned `{response, body}` is synthesized so the consumer below is unchanged.
export async function callDeepSeekInterventionRecords(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  source: { sourceId: string; title: string; publisher: string; sourceGroup: string };
  candidates: Tier2DocumentEvidenceCandidate[];
  routeCatalogSnippet: string | null;
  fetcher: FetchLike;
}): Promise<OpenRouterCallResult> {
  const tool = interventionRecordsTool()["function"] as {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  return callDeepSeekToolCallViaPi({
    apiKey: input.apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    toolName: INTERVENTION_RECORDS_TOOL_NAME,
    messages: [
      { role: "system", content: INTERVENTION_RECORDS_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildInterventionRecordsPrompt({
          source: input.source,
          candidates: input.candidates,
          routeCatalogSnippet: input.routeCatalogSnippet,
        }),
      },
    ],
    tools: [tool],
    fetcher: input.fetcher,
  });
}

function interventionRecordsSourceRoot(input: {
  runRoot: string;
  sourceId: string;
  sourceIndex: number;
  synthesisRootName: string;
}): string {
  return join(
    input.runRoot,
    input.synthesisRootName,
    "sources",
    `${String(input.sourceIndex + 1).padStart(4, "0")}_${input.sourceId}`,
  );
}

function interventionRecordsSourcePaths(input: { sourceRoot: string; bucketId?: string }): {
  responsePath: string;
  toolCallPath: string;
  errorPath: string;
  bucketRoot: string;
} {
  if (input.bucketId !== undefined) {
    const bucketRoot = join(input.sourceRoot, "buckets", input.bucketId);
    return {
      responsePath: join(bucketRoot, "openrouter-response.json"),
      toolCallPath: join(bucketRoot, "intervention-records-tool-call.json"),
      errorPath: join(bucketRoot, "error.json"),
      bucketRoot,
    };
  }
  return {
    responsePath: join(input.sourceRoot, "openrouter-response.json"),
    toolCallPath: join(input.sourceRoot, "intervention-records-tool-call.json"),
    errorPath: join(input.sourceRoot, "error.json"),
    bucketRoot: input.sourceRoot,
  };
}

// Route catalog injection (Step 2). Loads the MTA bus route catalog and
// builds a focused snippet for only the routes the candidates name, so the
// model can sanity-check route/corridor pairings without paying for the
// whole catalog every call.

type RouteCatalogEntry = {
  routeId: string;
  longName: string | null;
  description: string | null;
};

type RouteCatalogRow = {
  route_id?: unknown;
  route_long_name?: unknown;
  route_description?: unknown;
  in_effect?: unknown;
};

async function loadRouteCatalog(path: string): Promise<Map<string, RouteCatalogEntry>> {
  const raw = (await Bun.file(path).json()) as { rows?: RouteCatalogRow[] };
  const catalog = new Map<string, RouteCatalogEntry>();
  for (const row of raw.rows ?? []) {
    if (row.in_effect !== "true" && row.in_effect !== true) continue;
    const routeId = typeof row.route_id === "string" ? row.route_id : null;
    if (routeId === null) continue;
    if (catalog.has(routeId)) continue;
    catalog.set(routeId, {
      routeId,
      longName: typeof row.route_long_name === "string" ? row.route_long_name : null,
      description: typeof row.route_description === "string" ? row.route_description : null,
    });
  }
  return catalog;
}

function buildRouteCatalogSnippet(input: {
  catalog: Map<string, RouteCatalogEntry>;
  candidates: Tier2DocumentEvidenceCandidate[];
}): string | null {
  const mentioned = new Set<string>();
  for (const candidate of input.candidates) {
    for (const mention of candidate.routeMentions) {
      for (const routeId of expandRouteMention(mention)) {
        mentioned.add(routeId);
      }
    }
  }
  if (mentioned.size === 0) return null;
  const entries: string[] = [];
  for (const routeId of [...mentioned].sort()) {
    const entry = input.catalog.get(routeId);
    if (entry === undefined) {
      const possibleVariants = [...input.catalog.keys()]
        .filter((candidateRouteId) => candidateRouteId.startsWith(routeId))
        .slice(0, 4);
      const variantNote =
        possibleVariants.length > 0
          ? ` Possible current variants: ${possibleVariants.join(", ")}.`
          : "";
      entries.push(
        `- ${routeId}: not found in MTA route catalog (may be historical/proposed; verify before assigning a corridor).${variantNote}`,
      );
      continue;
    }
    const long = entry.longName ?? "";
    const desc = entry.description ?? "";
    const corridorBlurb = [long, desc].filter((part) => part.length > 0).join(" — ");
    entries.push(`- ${routeId}: ${corridorBlurb || "no corridor on file"}`);
  }
  return [
    "Route reference (use to sanity-check route/corridor pairings; flag in notes if a record's corridor does not match the route's actual service area):",
    ...entries,
  ].join("\n");
}

// Fix 1: route-aware chunking constants and helpers.
const PHASE3_SINGLE_CALL_TOKEN_BUDGET = 60_000;
const PHASE3_CHARS_PER_TOKEN = 4;
const PHASE3_PROMPT_CHAR_BUDGET = PHASE3_SINGLE_CALL_TOKEN_BUDGET * PHASE3_CHARS_PER_TOKEN;
const PHASE3_MULTI_ROUTE_MAX_FANOUT = 4;
const PHASE3_PAGE_RANGE_OVERLAP = 2;
const PHASE3_ROUTE_HEAVY_DISTINCT_ROUTE_THRESHOLD = 20;
const PHASE3_ROUTE_HEAVY_SERVICE_CHANGE_THRESHOLD = 20;

const SOURCE_WIDE_CANDIDATE_TYPES: ReadonlySet<string> = new Set([
  "document_table_candidate",
  "document_map_extent_candidate",
  "document_methodology_candidate",
  "document_source_gap_candidate",
  "review_question_candidate",
  "document_evidence_link_candidate",
]);

function normalizedRoutesForBucketing(candidate: Tier2DocumentEvidenceCandidate): string[] {
  const normalized = new Set<string>();
  for (const mention of candidate.routeMentions) {
    for (const routeId of expandRouteMention(mention)) {
      normalized.add(routeId);
    }
  }
  return [...normalized].sort();
}

function isRouteHeavyServiceChangeSource(candidates: Tier2DocumentEvidenceCandidate[]): boolean {
  const routes = new Set<string>();
  let routeScopedServiceChangeCount = 0;
  for (const candidate of candidates) {
    if (candidate.candidateType !== "document_service_change_candidate") {
      continue;
    }
    const candidateRoutes = normalizedRoutesForBucketing(candidate);
    if (candidateRoutes.length === 0) {
      continue;
    }
    routeScopedServiceChangeCount += 1;
    for (const routeId of candidateRoutes) {
      routes.add(routeId);
    }
  }
  return (
    routeScopedServiceChangeCount >= PHASE3_ROUTE_HEAVY_SERVICE_CHANGE_THRESHOLD &&
    routes.size >= PHASE3_ROUTE_HEAVY_DISTINCT_ROUTE_THRESHOLD
  );
}

function candidateOrderKey(candidate: Tier2DocumentEvidenceCandidate): string {
  const minPage =
    candidate.evidencePageRefs.length > 0
      ? Math.min(...candidate.evidencePageRefs)
      : Number.POSITIVE_INFINITY;
  const pageToken =
    minPage === Number.POSITIVE_INFINITY ? "9999999" : String(minPage).padStart(7, "0");
  return `${pageToken}|${candidate.candidateId}`;
}

function sortCandidatesForBucket(
  candidates: Tier2DocumentEvidenceCandidate[],
): Tier2DocumentEvidenceCandidate[] {
  return [...candidates].sort((a, b) => candidateOrderKey(a).localeCompare(candidateOrderKey(b)));
}

function estimateBucketPromptChars(input: {
  source: { sourceId: string; title: string; publisher: string; sourceGroup: string };
  candidates: Tier2DocumentEvidenceCandidate[];
  routeCatalogSnippet: string | null;
}): number {
  return (
    INTERVENTION_RECORDS_SYSTEM_PROMPT.length +
    buildInterventionRecordsPrompt({
      source: input.source,
      candidates: input.candidates,
      routeCatalogSnippet: input.routeCatalogSnippet,
    }).length
  );
}

export type InterventionRecordsBucket = {
  bucketId: string;
  bucketKind: Tier2InterventionRecordsBucketKind;
  candidates: Tier2DocumentEvidenceCandidate[];
  estimatedPromptChars: number;
};

export function splitBucketByPageRange(input: {
  baseBucketId: string;
  candidates: Tier2DocumentEvidenceCandidate[];
  source: { sourceId: string; title: string; publisher: string; sourceGroup: string };
  routeCatalog: Map<string, RouteCatalogEntry>;
}): InterventionRecordsBucket[] {
  const sorted = sortCandidatesForBucket(input.candidates);
  const charsForCandidates = (candidates: Tier2DocumentEvidenceCandidate[]): number => {
    const snippet = buildRouteCatalogSnippet({
      catalog: input.routeCatalog,
      candidates,
    });
    return estimateBucketPromptChars({
      source: input.source,
      candidates,
      routeCatalogSnippet: snippet,
    });
  };
  const chunks: Tier2DocumentEvidenceCandidate[][] = [];
  let current: Tier2DocumentEvidenceCandidate[] = [];
  for (const candidate of sorted) {
    // Fix P1.2 (single-candidate guard): a candidate whose own prompt body
    // exceeds the budget cannot fit in any chunk. Fail loudly so callers
    // know to narrow the source manually rather than silently emitting an
    // over-budget bucket that the LLM will truncate.
    const soloChars = charsForCandidates([candidate]);
    if (soloChars > PHASE3_PROMPT_CHAR_BUDGET) {
      throw new Error(
        `Phase 3 bucket ${input.baseBucketId}: candidate ${candidate.candidateId} estimated ${soloChars} chars exceeds budget ${PHASE3_PROMPT_CHAR_BUDGET}.`,
      );
    }
    const tentativeChars = charsForCandidates([...current, candidate]);
    if (tentativeChars <= PHASE3_PROMPT_CHAR_BUDGET) {
      current = [...current, candidate];
      continue;
    }
    chunks.push(current);
    // Fix P1.2 (seed guard): seed the next chunk with overlap + new
    // candidate, shrinking overlap until the seed fits under budget. If
    // overlap shrinks to zero the new candidate stands alone (already
    // guaranteed to fit by the solo check above).
    let overlapCount = Math.min(PHASE3_PAGE_RANGE_OVERLAP, current.length);
    while (overlapCount > 0) {
      const seed = [...current.slice(current.length - overlapCount), candidate];
      if (charsForCandidates(seed) <= PHASE3_PROMPT_CHAR_BUDGET) {
        current = seed;
        break;
      }
      overlapCount -= 1;
    }
    if (overlapCount === 0) {
      current = [candidate];
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks.map((chunkCandidates, chunkIndex) => ({
    bucketId: `${input.baseBucketId}:p${String(chunkIndex + 1).padStart(2, "0")}`,
    bucketKind: "page_range" as const,
    candidates: chunkCandidates,
    estimatedPromptChars: charsForCandidates(chunkCandidates),
  }));
}

export function buildInterventionRecordsBuckets(input: {
  sourceId: string;
  source: { sourceId: string; title: string; publisher: string; sourceGroup: string };
  candidates: Tier2DocumentEvidenceCandidate[];
  routeCatalog: Map<string, RouteCatalogEntry>;
}): InterventionRecordsBucket[] {
  const sortedAll = sortCandidatesForBucket(input.candidates);
  const wholeSourceSnippet = buildRouteCatalogSnippet({
    catalog: input.routeCatalog,
    candidates: sortedAll,
  });
  const wholeSourceChars = estimateBucketPromptChars({
    source: input.source,
    candidates: sortedAll,
    routeCatalogSnippet: wholeSourceSnippet,
  });
  const forceRouteAwareBuckets = isRouteHeavyServiceChangeSource(sortedAll);
  if (wholeSourceChars <= PHASE3_PROMPT_CHAR_BUDGET && !forceRouteAwareBuckets) {
    return [
      {
        bucketId: `${input.sourceId}:single_call`,
        bucketKind: "single_call",
        candidates: sortedAll,
        estimatedPromptChars: wholeSourceChars,
      },
    ];
  }

  const perRouteCandidates = new Map<string, Tier2DocumentEvidenceCandidate[]>();
  const sourceWideCandidates: Tier2DocumentEvidenceCandidate[] = [];
  for (const candidate of sortedAll) {
    if (SOURCE_WIDE_CANDIDATE_TYPES.has(candidate.candidateType)) {
      sourceWideCandidates.push(candidate);
      continue;
    }
    const routes = normalizedRoutesForBucketing(candidate);
    if (routes.length === 0 || routes.length >= 5) {
      sourceWideCandidates.push(candidate);
      continue;
    }
    const fanoutRoutes = routes.slice(0, PHASE3_MULTI_ROUTE_MAX_FANOUT);
    for (const routeId of fanoutRoutes) {
      const list = perRouteCandidates.get(routeId) ?? [];
      list.push(candidate);
      perRouteCandidates.set(routeId, list);
    }
  }

  const buckets: InterventionRecordsBucket[] = [];
  const routeBucketEntries = [...perRouteCandidates.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  for (const [routeId, routeCandidates] of routeBucketEntries) {
    const sortedRouteCandidates = sortCandidatesForBucket(routeCandidates);
    const baseBucketId = `${input.sourceId}:per_route:${routeId}`;
    const snippet = buildRouteCatalogSnippet({
      catalog: input.routeCatalog,
      candidates: sortedRouteCandidates,
    });
    const chars = estimateBucketPromptChars({
      source: input.source,
      candidates: sortedRouteCandidates,
      routeCatalogSnippet: snippet,
    });
    if (chars <= PHASE3_PROMPT_CHAR_BUDGET) {
      buckets.push({
        bucketId: baseBucketId,
        bucketKind: "per_route",
        candidates: sortedRouteCandidates,
        estimatedPromptChars: chars,
      });
      continue;
    }
    buckets.push(
      ...splitBucketByPageRange({
        baseBucketId,
        candidates: sortedRouteCandidates,
        source: input.source,
        routeCatalog: input.routeCatalog,
      }),
    );
  }

  if (sourceWideCandidates.length > 0) {
    const sortedSourceWide = sortCandidatesForBucket(sourceWideCandidates);
    const baseBucketId = `${input.sourceId}:source_wide`;
    const snippet = buildRouteCatalogSnippet({
      catalog: input.routeCatalog,
      candidates: sortedSourceWide,
    });
    const chars = estimateBucketPromptChars({
      source: input.source,
      candidates: sortedSourceWide,
      routeCatalogSnippet: snippet,
    });
    if (chars <= PHASE3_PROMPT_CHAR_BUDGET) {
      buckets.push({
        bucketId: baseBucketId,
        bucketKind: "source_wide",
        candidates: sortedSourceWide,
        estimatedPromptChars: chars,
      });
    } else {
      buckets.push(
        ...splitBucketByPageRange({
          baseBucketId,
          candidates: sortedSourceWide,
          source: input.source,
          routeCatalog: input.routeCatalog,
        }),
      );
    }
  }

  return buckets;
}

type BucketRunResult =
  | {
      status: "extracted";
      records: Tier2DocumentInterventionRecord[];
      unattachedCandidateIds: string[];
      droppedNoEvidenceCount: number;
      responsePath: string;
      toolCallPath: string;
      errorPath: null;
    }
  | {
      status: "failed";
      records: [];
      unattachedCandidateIds: [];
      droppedNoEvidenceCount: 0;
      responsePath: string | null;
      toolCallPath: string | null;
      errorPath: string;
      error: string;
    };

export async function runInterventionRecordsBucket(input: {
  apiKey: string;
  model: string;
  maxTokens: number;
  sourceRoot: string;
  bucket: InterventionRecordsBucket;
  isOnlyBucket: boolean;
  source: { sourceId: string; title: string; publisher: string; sourceGroup: string };
  candidateExtractionRootName: string;
  candidateRootName: string;
  synthesisRootName: string;
  routeCatalog: Map<string, RouteCatalogEntry>;
  fetcher: FetchLike;
}): Promise<BucketRunResult> {
  const sourceId = input.source.sourceId;
  const paths = interventionRecordsSourcePaths({
    sourceRoot: input.sourceRoot,
    ...(input.isOnlyBucket ? {} : { bucketId: input.bucket.bucketId }),
  });
  await mkdir(paths.bucketRoot, { recursive: true });
  try {
    const routeCatalogSnippet = buildRouteCatalogSnippet({
      catalog: input.routeCatalog,
      candidates: input.bucket.candidates,
    });
    const openRouter = await callDeepSeekInterventionRecords({
      apiKey: input.apiKey,
      model: input.model,
      maxTokens: input.maxTokens,
      source: input.source,
      candidates: input.bucket.candidates,
      routeCatalogSnippet,
      fetcher: input.fetcher,
    });
    await writeJson(paths.responsePath, openRouter.body);
    const providerErrorMessage = openRouterErrorMessage(openRouter.body);
    if (!openRouter.response.ok || providerErrorMessage !== null) {
      const httpErrorMessage = `DeepSeek HTTP ${openRouter.response.status} ${openRouter.response.statusText}`;
      const message =
        providerErrorMessage === null
          ? httpErrorMessage
          : openRouter.response.ok
            ? `DeepSeek provider error: ${providerErrorMessage}`
            : `${httpErrorMessage}: ${providerErrorMessage}`;
      await writeJson(paths.errorPath, {
        reason: "deepseek_provider_error",
        httpStatus: openRouter.response.status,
        statusText: openRouter.response.statusText,
        message,
      });
      return {
        status: "failed",
        records: [],
        unattachedCandidateIds: [],
        droppedNoEvidenceCount: 0,
        responsePath: paths.responsePath,
        toolCallPath: null,
        errorPath: paths.errorPath,
        error: message,
      };
    }
    const toolArgs = extractToolCallArguments(openRouter.body, INTERVENTION_RECORDS_TOOL_NAME);
    if (toolArgs === null) {
      throw new Error(
        missingToolCallErrorMessage({
          responseJson: openRouter.body,
          toolName: INTERVENTION_RECORDS_TOOL_NAME,
          maxTokens: input.maxTokens,
        }),
      );
    }
    await writeJson(paths.toolCallPath, toolArgs);
    const processed = processInterventionRecordsToolArgs({
      sourceId,
      bucket: input.bucket,
      toolArgs,
      candidateExtractionRootName: input.candidateExtractionRootName,
      candidateRootName: input.candidateRootName,
      synthesisRootName: input.synthesisRootName,
    });
    if (processed.status === "failed") {
      await writeJson(paths.errorPath, {
        reason: "schema_validation_failed",
        issues: processed.issues,
      });
      return {
        status: "failed",
        records: [],
        unattachedCandidateIds: [],
        droppedNoEvidenceCount: 0,
        responsePath: paths.responsePath,
        toolCallPath: paths.toolCallPath,
        errorPath: paths.errorPath,
        error: processed.error,
      };
    }
    await unlink(paths.errorPath).catch(() => undefined);
    return {
      status: "extracted",
      records: processed.records,
      unattachedCandidateIds: processed.unattachedCandidateIds,
      droppedNoEvidenceCount: processed.droppedNoEvidenceCount,
      responsePath: paths.responsePath,
      toolCallPath: paths.toolCallPath,
      errorPath: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(paths.errorPath, { reason: "openrouter_call_failed", message });
    return {
      status: "failed",
      records: [],
      unattachedCandidateIds: [],
      droppedNoEvidenceCount: 0,
      responsePath: null,
      toolCallPath: null,
      errorPath: paths.errorPath,
      error: message,
    };
  }
}

export async function extractTier2DocumentInterventionRecords(
  args: ExtractTier2InterventionRecordsArgs,
): Promise<Tier2InterventionRecordsExtraction> {
  const candidateExtraction = (await Bun.file(
    args.ocrMarkdownCandidateExtractionPath,
  ).json()) as Tier2OcrMarkdownCandidateExtraction;
  const runRoot = dirname(args.ocrMarkdownCandidateExtractionPath);
  const model = args.model ?? process.env["DEEPSEEK_TEXT_MODEL"] ?? DEFAULT_TEXT_MODEL;
  const serviceTier = args.serviceTier ?? "flex";
  const maxTokens = args.maxTokens ?? DEFAULT_INTERVENTION_RECORDS_MAX_TOKENS;
  const synthesisRootName = normalizeOcrArtifactRootName({
    value: args.synthesisRootName,
    defaultName: DEFAULT_INTERVENTION_RECORDS_ROOT_NAME,
    flagName: "--synthesis-root",
  });
  const execute = args.execute ?? false;
  const fetcher = args.fetcher ?? defaultFetch;
  const apiKey = args.apiKey ?? process.env["DEEPSEEK_API_KEY"];
  if (execute && (apiKey === undefined || apiKey === "")) {
    throw new Error("DEEPSEEK_API_KEY is required for docs:intervention-records --execute.");
  }
  const routeCatalogPath = args.routeCatalogPath ?? DEFAULT_INTERVENTION_RECORDS_ROUTE_CATALOG_PATH;
  const routeCatalog = (await Bun.file(routeCatalogPath).exists())
    ? await loadRouteCatalog(routeCatalogPath)
    : new Map<string, RouteCatalogEntry>();

  const candidatesBySourceId = new Map<string, Tier2DocumentEvidenceCandidate[]>();
  for (const candidate of candidateExtraction.documentEvidenceCandidates) {
    if (candidate.validationState === "rejected") continue;
    const list = candidatesBySourceId.get(candidate.sourceRef.sourceId) ?? [];
    list.push(candidate);
    candidatesBySourceId.set(candidate.sourceRef.sourceId, list);
  }
  const sourceFilter = new Set(args.sourceIds ?? []);
  const sourceIds = [...candidatesBySourceId.keys()]
    .filter((sourceId) => sourceFilter.size === 0 || sourceFilter.has(sourceId))
    .slice(0, args.limitSources ?? Number.POSITIVE_INFINITY);

  const sources: Tier2InterventionRecordsSource[] = [];
  const documentInterventionRecords: Tier2DocumentInterventionRecord[] = [];

  for (let sourceIndex = 0; sourceIndex < sourceIds.length; sourceIndex += 1) {
    const sourceId = sourceIds[sourceIndex];
    if (sourceId === undefined) continue;
    const candidates = candidatesBySourceId.get(sourceId) ?? [];
    const sourceMeta = candidates[0]?.sourceRef;
    const sourceRoot = interventionRecordsSourceRoot({
      runRoot,
      sourceId,
      sourceIndex,
      synthesisRootName,
    });
    if (!execute) {
      sources.push({
        sourceId,
        status: "skipped",
        candidateCount: candidates.length,
        recordCount: 0,
        unattachedCandidateCount: 0,
        droppedNoInterventionEvidenceCount: 0,
        reusedExisting: false,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        errorArtifactKey: null,
        error: null,
        buckets: [],
      });
      continue;
    }
    if (sourceMeta === undefined) {
      sources.push({
        sourceId,
        status: "failed",
        candidateCount: 0,
        recordCount: 0,
        unattachedCandidateCount: 0,
        droppedNoInterventionEvidenceCount: 0,
        reusedExisting: false,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        errorArtifactKey: null,
        error: "No sourceRef found in candidates.",
        buckets: [],
      });
      continue;
    }
    await mkdir(sourceRoot, { recursive: true });
    const sourcePromptMeta = {
      sourceId,
      title: sourceMeta.title,
      publisher: sourceMeta.publisher,
      sourceGroup: sourceMeta.sourceGroup,
    };
    // Fix 1: build per-route / source-wide buckets (or a single bucket when
    // the source is small enough to fit one call).
    const buckets = buildInterventionRecordsBuckets({
      sourceId,
      source: sourcePromptMeta,
      candidates,
      routeCatalog,
    });
    const isSingleBucket = buckets.length === 1;
    const aggregatedRecords: Tier2DocumentInterventionRecord[] = [];
    const aggregatedUnattachedCandidateIds = new Set<string>();
    const bucketSummaries: Tier2InterventionRecordsBucketSummary[] = [];
    let sourceDroppedRecordCount = 0;
    let firstResponsePath: string | null = null;
    let firstToolCallPath: string | null = null;
    let firstErrorPath: string | null = null;
    let firstError: string | null = null;
    let anyExtracted = false;
    for (const bucket of buckets) {
      const result = await runInterventionRecordsBucket({
        apiKey: apiKey as string,
        model,
        maxTokens,
        sourceRoot,
        bucket,
        isOnlyBucket: isSingleBucket,
        source: sourcePromptMeta,
        candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
        candidateRootName: candidateExtraction.candidateRootName,
        synthesisRootName,
        routeCatalog,
        fetcher,
      });
      bucketSummaries.push({
        bucketId: bucket.bucketId,
        bucketKind: bucket.bucketKind,
        status: result.status,
        candidateCount: bucket.candidates.length,
        recordCount: result.records.length,
        estimatedPromptChars: bucket.estimatedPromptChars,
        unattachedCandidateCount: result.unattachedCandidateIds.length,
        droppedNoInterventionEvidenceCount: result.droppedNoEvidenceCount,
        responseArtifactKey:
          result.responsePath === null ? null : artifactKey(result.responsePath, runRoot),
        toolCallArtifactKey:
          result.toolCallPath === null ? null : artifactKey(result.toolCallPath, runRoot),
        errorArtifactKey: result.errorPath === null ? null : artifactKey(result.errorPath, runRoot),
        error: result.status === "failed" ? result.error : null,
      });
      if (result.status === "extracted") {
        anyExtracted = true;
        aggregatedRecords.push(...result.records);
        for (const id of result.unattachedCandidateIds) {
          aggregatedUnattachedCandidateIds.add(id);
        }
        sourceDroppedRecordCount += result.droppedNoEvidenceCount;
        if (firstResponsePath === null) firstResponsePath = result.responsePath;
        if (firstToolCallPath === null) firstToolCallPath = result.toolCallPath;
      } else {
        if (firstErrorPath === null) firstErrorPath = result.errorPath;
        if (firstError === null) firstError = result.error;
      }
    }
    if (!anyExtracted) {
      sources.push({
        sourceId,
        status: "failed",
        candidateCount: candidates.length,
        recordCount: 0,
        unattachedCandidateCount: 0,
        droppedNoInterventionEvidenceCount: 0,
        reusedExisting: false,
        responseArtifactKey: null,
        toolCallArtifactKey: null,
        errorArtifactKey: firstErrorPath === null ? null : artifactKey(firstErrorPath, runRoot),
        error: firstError ?? "all_buckets_failed",
        buckets: bucketSummaries,
      });
      continue;
    }
    // Fix 8: collapse records that share evidence candidates across buckets.
    const candidateById = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate]),
    );
    const dedupedRecords = dedupeInterventionRecordsByEvidenceOverlap({
      records: aggregatedRecords,
      sourceId,
      candidateById,
      candidateExtractionRootName: candidateExtraction.pageMarkdownRootName,
      candidateRootName: candidateExtraction.candidateRootName,
      synthesisRootName,
    });
    documentInterventionRecords.push(...dedupedRecords);
    sources.push({
      sourceId,
      status: "extracted",
      candidateCount: candidates.length,
      recordCount: dedupedRecords.length,
      unattachedCandidateCount: aggregatedUnattachedCandidateIds.size,
      droppedNoInterventionEvidenceCount: sourceDroppedRecordCount,
      reusedExisting: false,
      responseArtifactKey:
        firstResponsePath === null ? null : artifactKey(firstResponsePath, runRoot),
      toolCallArtifactKey:
        firstToolCallPath === null ? null : artifactKey(firstToolCallPath, runRoot),
      errorArtifactKey: firstErrorPath === null ? null : artifactKey(firstErrorPath, runRoot),
      // Source-level error is null when the source extracted (any bucket
      // succeeded). Per-bucket errors remain visible via the buckets[]
      // summary and the per-bucket error.json artifact.
      error: null,
      buckets: bucketSummaries,
    });
  }

  const artifact: Tier2InterventionRecordsExtraction = {
    version: 1,
    runId: candidateExtraction.runId,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    ocrMarkdownCandidateExtractionPath: args.ocrMarkdownCandidateExtractionPath,
    outputPath: args.outputPath ?? null,
    provider: "openrouter",
    model,
    serviceTier,
    maxTokens,
    synthesisRootName,
    promptVersion: INTERVENTION_RECORDS_PROMPT_VERSION,
    execute,
    summary: {
      selectedSourceCount: sourceIds.length,
      extractedSourceCount: sources.filter((source) => source.status === "extracted").length,
      failedSourceCount: sources.filter((source) => source.status === "failed").length,
      reusedExistingSourceCount: sources.filter((source) => source.reusedExisting).length,
      recordCount: documentInterventionRecords.length,
      unattachedCandidateCount: sources.reduce(
        (sum, source) => sum + source.unattachedCandidateCount,
        0,
      ),
      droppedNoInterventionEvidenceCount: sources.reduce(
        (sum, source) => sum + source.droppedNoInterventionEvidenceCount,
        0,
      ),
      recordQualityIssueCounts: recordQualityIssueCounts({
        records: documentInterventionRecords,
        droppedNoInterventionEvidenceCount: sources.reduce(
          (sum, source) => sum + source.droppedNoInterventionEvidenceCount,
          0,
        ),
      }),
      recordQualityRepairCounts: recordQualityRepairCounts(documentInterventionRecords),
    },
    sources,
    documentInterventionRecords,
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

type InterventionRecordsCliArgs = {
  ocrMarkdownCandidateExtractionPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  synthesisRootName?: string;
  model?: string;
  serviceTier?: "flex" | "priority";
  maxTokens?: number;
  sourceIds?: string[];
  limitSources?: number;
  routeCatalogPath?: string;
  execute?: boolean;
};

function parseInterventionRecordsCliArgs(args: string[]): InterventionRecordsCliArgs {
  const options: CliOption<InterventionRecordsCliArgs>[] = [
    {
      flags: ["--markdown-candidate-extraction"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.ocrMarkdownCandidateExtractionPath = fromCliPath(value);
        }
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--run-id"],
      apply: (output, value) => {
        if (value !== undefined) output.runId = value;
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--synthesis-root"],
      apply: (output, value) => {
        if (value !== undefined) output.synthesisRootName = value;
      },
    },
    {
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--service-tier"],
      apply: (output, value) => {
        if (value === "flex" || value === "priority") {
          output.serviceTier = value;
          return;
        }
        throw new Error("--service-tier must be flex or priority.");
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        output.maxTokens = Number(value);
      },
    },
    {
      flags: ["--source-ids"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        if (parsed !== undefined) output.sourceIds = parsed;
      },
    },
    {
      flags: ["--source-id"],
      apply: (output, value) => {
        const parsed = parseSourceIds(value);
        output.sourceIds = [...(output.sourceIds ?? []), ...(parsed ?? [])];
      },
    },
    {
      flags: ["--limit-sources"],
      apply: (output, value) => {
        output.limitSources = Number(value);
      },
    },
    {
      flags: ["--route-catalog"],
      apply: (output, value) => {
        if (value !== undefined) output.routeCatalogPath = fromCliPath(value);
      },
    },
    trueOption<InterventionRecordsCliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(args, {}, options);
}

async function resolveInterventionRecordsPaths(
  args: InterventionRecordsCliArgs,
): Promise<{ ocrMarkdownCandidateExtractionPath: string; outputPath: string }> {
  if (args.ocrMarkdownCandidateExtractionPath !== undefined) {
    const dir = dirname(args.ocrMarkdownCandidateExtractionPath);
    return {
      ocrMarkdownCandidateExtractionPath: args.ocrMarkdownCandidateExtractionPath,
      outputPath: args.outputPath ?? join(dir, "intervention-records.json"),
    };
  }
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --markdown-candidate-extraction.");
  }
  const baseDir = runArtifactRoot(artifactRoot, runId);
  return {
    ocrMarkdownCandidateExtractionPath: join(baseDir, "ocr-markdown-candidates.json"),
    outputPath: args.outputPath ?? join(baseDir, "intervention-records.json"),
  };
}

export async function extractTier2DocumentInterventionRecordsFromCli(
  args: string[],
): Promise<Tier2InterventionRecordsExtraction> {
  const parsed = parseInterventionRecordsCliArgs(args);
  const paths = await resolveInterventionRecordsPaths(parsed);
  return extractTier2DocumentInterventionRecords({
    ...paths,
    ...(parsed.synthesisRootName !== undefined
      ? { synthesisRootName: parsed.synthesisRootName }
      : {}),
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.serviceTier !== undefined ? { serviceTier: parsed.serviceTier } : {}),
    ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
    ...(parsed.limitSources !== undefined ? { limitSources: parsed.limitSources } : {}),
    ...(parsed.routeCatalogPath !== undefined ? { routeCatalogPath: parsed.routeCatalogPath } : {}),
    execute: parsed.execute ?? false,
  });
}
