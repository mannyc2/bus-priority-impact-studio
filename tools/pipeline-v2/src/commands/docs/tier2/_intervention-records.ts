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
  DocumentInterventionRecordsToolResponseSchema,
  DocumentMetricNameSchema,
  DocumentTreatmentTypeSchema,
  toProjectJsonSchema,
  type DocumentInterventionRecordKind,
  type DocumentInterventionRecordsToolResponse,
  type DocumentInterventionStatus,
} from "@bp/domain";
import { defaultArtifactRootPath, fromCliPath, fromRepoRoot } from "../../../lib/paths.ts";
import { writeJson } from "../../../lib/json.ts";
import {
  callDeepSeekToolCallViaPi,
  openRouterErrorMessage,
  type OpenRouterCallResult,
} from "./_llm-clients.ts";
import { expandRouteMention, quoteSupportsNumericValue } from "./_patterns.ts";
import {
  artifactKey,
  DEFAULT_TEXT_MODEL,
  defaultFetch,
  extractToolCallArguments,
  latestDocsRunId,
  missingToolCallErrorMessage,
  normalizeOcrArtifactRootName,
  parseCliOptions,
  parseSourceIds,
  recordQualityIssueCounts,
  recordQualityRepairCounts,
  runArtifactRoot,
  shortHash,
  trueOption,
  type CliOption,
  type FetchLike,
  type Tier2DocumentEvidenceCandidate,
  type Tier2DocumentInterventionRecord,
  type Tier2InterventionRecordQualityIssueCode,
  type Tier2InterventionRecordQualityRepairCode,
  type Tier2OcrMarkdownCandidateExtraction,
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
  "Every record must populate statusHistory with at least one observation. When candidates carry an explicit status (e.g. fields.implementationStatus: \"proposed\", fields.status: \"complete\"), emit a matching statusHistory entry pointing at the supporting candidateId. When candidates disagree (one says \"implementing\", another says \"complete\"), emit both as separate entries with their respective evidence.",
  "If every supporting candidate is flagged proposed-only (negativeEvidenceFlag: \"proposed_only\" or fields.implementationStatus: \"proposed\"), the record represents a recommendation; reflect that with a statusHistory entry whose status is \"proposed\".",
  "If all cited evidence is proposed-only, recommendation-only, or future-tense, the record's statusHistory must be \"proposed\" only — do not promote it to \"implementing\" or \"complete\" unless a separate non-proposed candidate explicitly states the intervention was implemented or completed.",
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
    throw new Error("DocumentInterventionRecordsToolResponseSchema did not produce an object schema.");
  }
  const { ["$schema"]: _ignored, ...parameters } = responseSchema as Record<string, unknown>;
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

function interventionRecordsSourcePaths(input: {
  sourceRoot: string;
  bucketId?: string;
}): {
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

function recordIdForDraft(input: {
  sourceId: string;
  routes: readonly string[];
  primaryTreatments: readonly string[];
  effectiveDate: string | undefined;
  index: number;
}): string {
  return `document_intervention:${input.sourceId}:${shortHash(
    [
      ...input.routes,
      ...input.primaryTreatments,
      input.effectiveDate ?? "",
      String(input.index),
    ].join("|"),
  )}`;
}

// Phase 3 schema-alias repair. The model occasionally emits flat period
// fields (`baselinePeriodStart`, `comparisonPeriodEnd`) instead of the
// nested period objects the schema requires. Rewrite those narrow aliases
// before strict parse so the response is not rejected wholesale; any other
// unknown field still fails parse so we keep field-name discipline.
export function repairInterventionRecordsAliases(toolArgs: unknown): {
  patched: unknown;
  repairedRecordIndices: number[];
} {
  if (toolArgs === null || typeof toolArgs !== "object" || Array.isArray(toolArgs)) {
    return { patched: toolArgs, repairedRecordIndices: [] };
  }
  const root = { ...(toolArgs as Record<string, unknown>) };
  const records = root["interventionRecords"];
  if (!Array.isArray(records)) {
    return { patched: root, repairedRecordIndices: [] };
  }
  const repairedRecordIndices: number[] = [];
  const periodAliases: Array<{ start: string; end: string; nested: string }> = [
    { start: "baselinePeriodStart", end: "baselinePeriodEnd", nested: "baselinePeriod" },
    { start: "comparisonPeriodStart", end: "comparisonPeriodEnd", nested: "comparisonPeriod" },
  ];
  // Fix P1.4: Zod's `.optional()` accepts undefined but not null, so when
  // the model emits `corridor.extentEndpoints: null` (Jamaica audit, 2026-05-27)
  // the strict parse fails wholesale. Strip null values everywhere — they
  // mean "no value", which matches `optional` semantics.
  const stripNullsDeep = (value: unknown): unknown => {
    if (value === null) return undefined;
    if (Array.isArray(value)) {
      // Fix (audit follow-up): filter out null/undefined array elements so
      // things like `customTreatments: [null]` don't fail strict parse on
      // the schema's `z.string().min(1)` element constraint.
      return value
        .map((item) => stripNullsDeep(item))
        .filter((item) => item !== undefined);
    }
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
        const stripped = stripNullsDeep(raw);
        if (stripped !== undefined) {
          out[key] = stripped;
        }
      }
      return out;
    }
    return value;
  };
  const patchedRecords = records.map((rawRecord, recordIndex) => {
    if (rawRecord === null || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
      return rawRecord;
    }
    const record = stripNullsDeep(rawRecord) as Record<string, unknown>;
    let recordRepaired = false;
    const metrics = record["metrics"];
    if (Array.isArray(metrics)) {
      record["metrics"] = metrics.map((rawMetric) => {
        if (rawMetric === null || typeof rawMetric !== "object" || Array.isArray(rawMetric)) {
          return rawMetric;
        }
        const metric = { ...(rawMetric as Record<string, unknown>) };
        for (const alias of periodAliases) {
          const startVal = metric[alias.start];
          const endVal = metric[alias.end];
          if (startVal === undefined && endVal === undefined) continue;
          const existingNested = metric[alias.nested];
          const nestedObj: Record<string, unknown> =
            existingNested !== null &&
            typeof existingNested === "object" &&
            !Array.isArray(existingNested)
              ? { ...(existingNested as Record<string, unknown>) }
              : {};
          if (typeof startVal === "string" && startVal.length > 0 && nestedObj["start"] === undefined) {
            nestedObj["start"] = startVal;
          }
          if (typeof endVal === "string" && endVal.length > 0 && nestedObj["end"] === undefined) {
            nestedObj["end"] = endVal;
          }
          if (Object.keys(nestedObj).length > 0) {
            metric[alias.nested] = nestedObj;
          }
          delete metric[alias.start];
          delete metric[alias.end];
          recordRepaired = true;
        }
        return metric;
      });
    }
    // Fix P1.6: corridor structural cleanup. The schema requires
    // `corridor.streets: z.array(z.string().min(1))` and rejects empty
    // strings inside `extentEndpoints`. The model occasionally emits
    // `corridor: {}` or `extentEndpoints: { start: "" }` instead of
    // omitting the field; drop those so the strict parse succeeds.
    const corridor = record["corridor"];
    if (corridor !== null && typeof corridor === "object" && !Array.isArray(corridor)) {
      const corridorObj = corridor as Record<string, unknown>;
      const endpointsRaw = corridorObj["extentEndpoints"];
      if (
        endpointsRaw !== null &&
        typeof endpointsRaw === "object" &&
        !Array.isArray(endpointsRaw)
      ) {
        const endpoints = endpointsRaw as Record<string, unknown>;
        const start = endpoints["start"];
        const end = endpoints["end"];
        const startEmpty = typeof start !== "string" || start.length === 0;
        const endEmpty = typeof end !== "string" || end.length === 0;
        if (startEmpty || endEmpty) {
          delete corridorObj["extentEndpoints"];
        }
      }
      const streets = corridorObj["streets"];
      const streetsEmpty =
        streets === undefined ||
        (Array.isArray(streets) && streets.length === 0);
      if (streetsEmpty || Object.keys(corridorObj).length === 0) {
        delete record["corridor"];
      }
    }
    // Fix P1.6: coerce common statusHistory[].status synonyms before strict
    // parse. The model occasionally emits "implemented"/"in_progress"/etc.
    // which are not in the enum but obviously map to a real value.
    const statusHistoryRaw = record["statusHistory"];
    if (Array.isArray(statusHistoryRaw)) {
      record["statusHistory"] = statusHistoryRaw
        .map((rawEntry) => {
          if (rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
            return rawEntry;
          }
          const entry = { ...(rawEntry as Record<string, unknown>) };
          const status = entry["status"];
          const statusKey =
            typeof status === "string" ? normalizeStatusSynonymKey(status) : null;
          if (statusKey !== null && STATUS_SYNONYM_MAP[statusKey] !== undefined) {
            entry["status"] = STATUS_SYNONYM_MAP[statusKey];
          }
          return entry;
        });
    }
    if (recordRepaired) {
      repairedRecordIndices.push(recordIndex);
    }
    return record;
  });
  root["interventionRecords"] = patchedRecords;
  return { patched: root, repairedRecordIndices };
}

const STATUS_SYNONYM_MAP: Record<string, string> = {
  implemented: "complete",
  in_progress: "implementing",
  in_design: "planning",
  designed: "planning",
  design: "planning",
  designing: "planning",
  construction: "implementing",
  under_construction: "implementing",
  built: "complete",
  finished: "complete",
  ongoing: "implementing",
  paused: "planning",
  on_hold: "planning",
};

function normalizeStatusSynonymKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Fix P1.5 (audit follow-up): iteratively repair invalid enum values from
// the parsed tool args. The model occasionally invents enum members (e.g.
// emits `treatmentType: "frequency_increase"` or a serviceMode outside the
// schema's vocabulary). Each invalid_value error reports the offending
// path. Demote known enum paths to their custom-label counterparts so the
// label survives downstream review:
//   - treatmentComponents[].treatmentType  -> customTreatmentType
//   - metrics[].metricName                 -> customMetricName
//   - primaryTreatments[N]                 -> customTreatments[]
//   - serviceMode / datePrecision          -> deleted (no custom counterpart)
// After repairs, drop treatmentComponents / metrics that have neither
// canonical nor custom type — they're indistinguishable noise.
function readAtPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
  let node: unknown = root;
  for (const segment of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string | number, unknown>)[segment];
  }
  return node;
}

function applyEnumPatches(
  root: unknown,
  paths: ReadonlyArray<ReadonlyArray<string | number>>,
): unknown {
  const clone = structuredClone(root);
  for (const path of paths) {
    if (path.length === 0) continue;
    const last = path[path.length - 1];
    const parent = readAtPath(clone, path.slice(0, -1));
    if (last === undefined || parent === null || typeof parent !== "object") continue;
    const invalidValue = readAtPath(clone, path);

    const isTreatmentTypePath =
      path.length === 5 &&
      path[0] === "interventionRecords" &&
      typeof path[1] === "number" &&
      path[2] === "treatmentComponents" &&
      typeof path[3] === "number" &&
      last === "treatmentType";
    const isMetricNamePath =
      path.length === 5 &&
      path[0] === "interventionRecords" &&
      typeof path[1] === "number" &&
      path[2] === "metrics" &&
      typeof path[3] === "number" &&
      last === "metricName";
    const isPrimaryTreatmentElementPath =
      path.length === 4 &&
      path[0] === "interventionRecords" &&
      typeof path[1] === "number" &&
      path[2] === "primaryTreatments" &&
      typeof last === "number";
    const isStatusHistoryStatusPath =
      path.length === 5 &&
      path[0] === "interventionRecords" &&
      typeof path[1] === "number" &&
      path[2] === "statusHistory" &&
      typeof path[3] === "number" &&
      last === "status";

    if (isTreatmentTypePath && typeof invalidValue === "string") {
      const component = parent as Record<string, unknown>;
      if (
        typeof component["customTreatmentType"] !== "string" ||
        (component["customTreatmentType"] as string).length === 0
      ) {
        component["customTreatmentType"] = invalidValue;
      }
      delete component[String(last)];
      continue;
    }

    if (isMetricNamePath && typeof invalidValue === "string") {
      const metric = parent as Record<string, unknown>;
      if (
        typeof metric["customMetricName"] !== "string" ||
        (metric["customMetricName"] as string).length === 0
      ) {
        metric["customMetricName"] = invalidValue;
      }
      delete metric[String(last)];
      continue;
    }

    if (isPrimaryTreatmentElementPath && typeof invalidValue === "string") {
      const record = readAtPath(clone, path.slice(0, 2)) as
        | Record<string, unknown>
        | undefined;
      if (record !== undefined) {
        const existing = record["customTreatments"];
        if (Array.isArray(existing)) {
          if (!existing.includes(invalidValue)) existing.push(invalidValue);
        } else {
          record["customTreatments"] = [invalidValue];
        }
      }
      if (Array.isArray(parent) && typeof last === "number") {
        (parent as unknown[])[last] = undefined;
      }
      continue;
    }

    if (isStatusHistoryStatusPath) {
      // statusHistory[].status is required, no custom counterpart. Drop the
      // statusHistory entry rather than emit one with no status. (Synonyms
      // were already mapped pre-parse — if the value reaches here it isn't
      // recognizable.)
      const statusHistoryArray = readAtPath(clone, path.slice(0, -2));
      const entryIndex = path[3];
      if (Array.isArray(statusHistoryArray) && typeof entryIndex === "number") {
        (statusHistoryArray as unknown[])[entryIndex] = undefined;
      }
      continue;
    }

    // Fallback: no custom counterpart — delete the field (object key) or
    // mark for filtering (array element).
    if (Array.isArray(parent) && typeof last === "number") {
      (parent as unknown[])[last] = undefined;
    } else {
      delete (parent as Record<string, unknown>)[String(last)];
    }
  }

  // Pass 1: filter undefined out of arrays.
  const filterUndefined = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.filter((v) => v !== undefined).map((v) => filterUndefined(v));
    }
    if (value !== null && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        obj[key] = filterUndefined(obj[key]);
      }
      return obj;
    }
    return value;
  };
  const filtered = filterUndefined(clone);

  // Pass 2: drop treatmentComponents and metrics that have neither a
  // canonical nor a custom label after repair — they are unlabeled
  // noise and should not survive into the corpus.
  if (
    filtered !== null &&
    typeof filtered === "object" &&
    !Array.isArray(filtered)
  ) {
    const records = (filtered as Record<string, unknown>)["interventionRecords"];
    if (Array.isArray(records)) {
      for (const rawRecord of records) {
        if (rawRecord === null || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
          continue;
        }
        const record = rawRecord as Record<string, unknown>;
        const treatmentComponents = record["treatmentComponents"];
        if (Array.isArray(treatmentComponents)) {
          record["treatmentComponents"] = treatmentComponents.filter((component) => {
            if (component === null || typeof component !== "object" || Array.isArray(component)) {
              return true;
            }
            const c = component as Record<string, unknown>;
            const hasType =
              typeof c["treatmentType"] === "string" && (c["treatmentType"] as string).length > 0;
            const hasCustomType =
              typeof c["customTreatmentType"] === "string" &&
              (c["customTreatmentType"] as string).length > 0;
            return hasType || hasCustomType;
          });
        }
        const metrics = record["metrics"];
        if (Array.isArray(metrics)) {
          record["metrics"] = metrics.filter((metric) => {
            if (metric === null || typeof metric !== "object" || Array.isArray(metric)) {
              return true;
            }
            const m = metric as Record<string, unknown>;
            const hasName =
              typeof m["metricName"] === "string" && (m["metricName"] as string).length > 0;
            const hasCustomName =
              typeof m["customMetricName"] === "string" &&
              (m["customMetricName"] as string).length > 0;
            return hasName || hasCustomName;
          });
        }
      }
    }
  }
  return filtered;
}

type EnumRepairParseResult =
  | { success: true }
  | {
      success: false;
      error: {
        issues: ReadonlyArray<{
          code: string;
          path: ReadonlyArray<string | number | symbol>;
          keys?: ReadonlyArray<string>;
        }>;
      };
    };

function stripUnrecognizedKeys(
  root: unknown,
  removals: ReadonlyArray<{ path: ReadonlyArray<string | number>; keys: ReadonlyArray<string> }>,
): unknown {
  const clone = structuredClone(root);
  for (const removal of removals) {
    const parent = readAtPath(clone, removal.path);
    if (parent === null || typeof parent !== "object" || Array.isArray(parent)) continue;
    const parentObj = parent as Record<string, unknown>;
    for (const key of removal.keys) {
      delete parentObj[key];
    }
  }
  return clone;
}

export function repairInvalidEnumValues(
  toolArgs: unknown,
  schemaParse: (value: unknown) => EnumRepairParseResult,
  maxIterations = 6,
): {
  patched: unknown;
  recordIndicesWithStrippedEnums: Set<number>;
} {
  let current = toolArgs;
  const recordIndicesWithStrippedEnums = new Set<number>();
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const parsed = schemaParse(current);
    if (parsed.success) {
      return { patched: current, recordIndicesWithStrippedEnums };
    }
    const invalidPaths = parsed.error.issues
      .filter((issue) => issue.code === "invalid_value" || issue.code === "invalid_enum_value")
      .map((issue) =>
        issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
      );
    // Fix P1.7: schema is .strict() so any model-emitted extra key fails
    // wholesale (e.g. metrics[].notes). Each unrecognized_keys issue gives
    // the parent path plus the offending key list; delete those keys.
    const unrecognizedKeyRemovals = parsed.error.issues
      .filter(
        (issue): issue is typeof issue & { keys: ReadonlyArray<string> } =>
          issue.code === "unrecognized_keys" && Array.isArray(issue.keys),
      )
      .map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
        keys: issue.keys,
      }));
    if (invalidPaths.length === 0 && unrecognizedKeyRemovals.length === 0) {
      return { patched: current, recordIndicesWithStrippedEnums };
    }
    for (const path of invalidPaths) {
      if (path[0] === "interventionRecords" && typeof path[1] === "number") {
        recordIndicesWithStrippedEnums.add(path[1]);
      }
    }
    for (const removal of unrecognizedKeyRemovals) {
      if (removal.path[0] === "interventionRecords" && typeof removal.path[1] === "number") {
        recordIndicesWithStrippedEnums.add(removal.path[1]);
      }
    }
    if (invalidPaths.length > 0) {
      current = applyEnumPatches(current, invalidPaths);
    }
    if (unrecognizedKeyRemovals.length > 0) {
      current = stripUnrecognizedKeys(current, unrecognizedKeyRemovals);
    }
  }
  return { patched: current, recordIndicesWithStrippedEnums };
}

const DOCUMENT_METRIC_NAMES = new Set<string>(DocumentMetricNameSchema.options);
const DOCUMENT_TREATMENT_TYPES = new Set<string>(DocumentTreatmentTypeSchema.options);

function normalizeCustomLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canonicalMetricLabel(value: string): string | null {
  const normalized = normalizeCustomLabel(value);
  return DOCUMENT_METRIC_NAMES.has(normalized) ? normalized : null;
}

function canonicalTreatmentLabel(value: string): string | null {
  const normalized = normalizeCustomLabel(value);
  return DOCUMENT_TREATMENT_TYPES.has(normalized) ? normalized : null;
}

function repairDraftLabelConflicts(
  draft: import("@bp/domain").DocumentInterventionRecordDraft,
): {
  draft: import("@bp/domain").DocumentInterventionRecordDraft;
  repaired: boolean;
} {
  let repaired = false;
  const treatmentComponents = draft.treatmentComponents.map((component) => {
    if (component.treatmentType === undefined || component.customTreatmentType === undefined) {
      return component;
    }
    repaired = true;
    const customAsCanonical = canonicalTreatmentLabel(component.customTreatmentType);
    if (customAsCanonical !== null) {
      const { customTreatmentType: _customTreatmentType, ...rest } = component;
      void _customTreatmentType;
      return {
        ...rest,
        treatmentType: customAsCanonical as typeof component.treatmentType,
      };
    }
    const { treatmentType: _treatmentType, ...rest } = component;
    void _treatmentType;
    return rest;
  });
  const metrics = draft.metrics.map((metric) => {
    if (metric.metricName === undefined || metric.customMetricName === undefined) {
      return metric;
    }
    repaired = true;
    const customAsCanonical = canonicalMetricLabel(metric.customMetricName);
    if (customAsCanonical !== null) {
      const { customMetricName: _customMetricName, ...rest } = metric;
      void _customMetricName;
      return {
        ...rest,
        metricName: customAsCanonical as typeof metric.metricName,
      };
    }
    const { metricName: _metricName, ...rest } = metric;
    void _metricName;
    return rest;
  });
  if (!repaired) {
    return { draft, repaired: false };
  }
  return {
    draft: {
      ...draft,
      treatmentComponents,
      metrics,
    },
    repaired: true,
  };
}

function collectEvidenceRefs(draft: import("@bp/domain").DocumentInterventionRecordDraft): string[] {
  const refs = new Set<string>();
  for (const obs of draft.statusHistory) {
    for (const id of obs.evidenceRefs) refs.add(id);
  }
  for (const component of draft.treatmentComponents) {
    for (const id of component.evidenceRefs) refs.add(id);
  }
  for (const metric of draft.metrics) {
    for (const id of metric.evidenceRefs) refs.add(id);
  }
  for (const caveat of draft.caveats) {
    for (const id of caveat.evidenceRefs) refs.add(id);
  }
  return [...refs];
}

// ---------------------------------------------------------------------------
// Phase 3 deterministic post-processing helpers.
//
// The LLM is responsible for the semantic work — clustering candidates and
// writing prose descriptions. These helpers handle the parts that have
// straightforward rules:
//   - back-fill statusHistory from candidate `fields.implementationStatus` /
//     `fields.status` when the model dropped it
//   - infer recordKind (implemented / in_progress / proposed) from the
//     statusHistory plus candidate-level negativeEvidenceFlag values
// ---------------------------------------------------------------------------

function isDocumentInterventionStatus(value: unknown): value is DocumentInterventionStatus {
  return (
    value === "proposed" ||
    value === "planning" ||
    value === "implementing" ||
    value === "monitoring" ||
    value === "complete" ||
    value === "canceled" ||
    value === "superseded"
  );
}

function statusFromCandidateFields(
  fields: Record<string, unknown> | undefined,
): DocumentInterventionStatus | null {
  if (fields === undefined) return null;
  const status = fields["status"];
  if (isDocumentInterventionStatus(status)) return status;
  const implementationStatus = fields["implementationStatus"];
  if (implementationStatus === "proposed") return "proposed";
  if (implementationStatus === "planned") return "planning";
  if (implementationStatus === "implemented") return "complete";
  return null;
}

function stringField(fields: Record<string, unknown> | undefined, key: string): string | null {
  if (fields === undefined) return null;
  const value = fields[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function backfillStatusHistory(input: {
  draft: import("@bp/domain").DocumentInterventionRecordDraft;
  recordCandidates: Tier2DocumentEvidenceCandidate[];
}): {
  statusHistory: import("@bp/domain").DocumentInterventionRecordDraft["statusHistory"];
  coercedFromProposedOnly: boolean;
} {
  const existing = input.draft.statusHistory;
  const seenKeys = new Set(
    existing.map((entry) => `${entry.status}|${entry.asOfDate ?? ""}`),
  );
  const inferred: import("@bp/domain").DocumentInterventionRecordDraft["statusHistory"] = [];
  let coercedFromProposedOnly = false;
  for (const candidate of input.recordCandidates) {
    const rawStatus = statusFromCandidateFields(candidate.fields);
    if (rawStatus === null) continue;
    // Fix P1.1: never backfill a non-proposed status from a candidate whose
    // negativeEvidenceFlag is proposed_only — those fields are stale.
    let status: DocumentInterventionStatus = rawStatus;
    if (
      candidate.negativeEvidenceFlag === "proposed_only" &&
      (status === "implementing" ||
        status === "planning" ||
        status === "complete" ||
        status === "monitoring")
    ) {
      status = "proposed";
      coercedFromProposedOnly = true;
    }
    const asOfDate = stringField(candidate.fields, "statusAsOfDate") ?? undefined;
    const key = `${status}|${asOfDate ?? ""}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    inferred.push({
      status,
      ...(asOfDate === undefined ? {} : { asOfDate }),
      evidenceRefs: [candidate.candidateId],
    });
  }
  return {
    statusHistory: [...existing, ...inferred],
    coercedFromProposedOnly,
  };
}

export function inferRecordKind(input: {
  statusHistory: import("@bp/domain").DocumentInterventionRecordDraft["statusHistory"];
  recordCandidates: Tier2DocumentEvidenceCandidate[];
}): DocumentInterventionRecordKind {
  // When every supporting candidate is proposed-only, the record is a
  // recommendation — overrides any leaked "implementing"/"complete" status
  // that may have slipped through from contradictory candidate fields.
  if (
    input.recordCandidates.length > 0 &&
    input.recordCandidates.every(
      (candidate) => candidate.negativeEvidenceFlag === "proposed_only",
    )
  ) {
    return "proposed";
  }
  const statuses = new Set(input.statusHistory.map((entry) => entry.status));
  if (
    statuses.has("complete") ||
    statuses.has("monitoring") ||
    statuses.has("implementing")
  ) {
    return statuses.has("complete") || statuses.has("monitoring")
      ? "implemented"
      : "in_progress";
  }
  if (statuses.has("planning") || statuses.has("canceled") || statuses.has("superseded")) {
    return "in_progress";
  }
  if (
    statuses.size === 1 &&
    statuses.has("proposed") &&
    input.recordCandidates.every(
      (candidate) =>
        candidate.negativeEvidenceFlag === "proposed_only" ||
        statusFromCandidateFields(candidate.fields) === "proposed",
    )
  ) {
    return "proposed";
  }
  if (statuses.has("proposed")) {
    return "proposed";
  }
  // No status anywhere — default to proposed so consumers err on the side of
  // not surfacing as an implemented intervention.
  return "proposed";
}

// Fix 2 (in-place sanitize): for each status observation, when every
// referenced candidate is `negativeEvidenceFlag === "proposed_only"`, coerce
// non-terminal or process statuses (planning/implementing/monitoring/complete)
// to "proposed".
// Returns the (possibly rewritten) history and whether any coercion happened.
export function sanitizeStatusHistoryForProposedOnly(input: {
  statusHistory: import("@bp/domain").DocumentInterventionRecordDraft["statusHistory"];
  candidateById: Map<string, Tier2DocumentEvidenceCandidate>;
}): {
  statusHistory: import("@bp/domain").DocumentInterventionRecordDraft["statusHistory"];
  coerced: boolean;
} {
  let coerced = false;
  const sanitized = input.statusHistory.map((entry) => {
    if (
      entry.status !== "planning" &&
      entry.status !== "implementing" &&
      entry.status !== "monitoring" &&
      entry.status !== "complete"
    ) {
      return entry;
    }
    const refs = entry.evidenceRefs.length > 0 ? entry.evidenceRefs : [];
    if (refs.length === 0) return entry;
    const allProposedOnly = refs.every((id) => {
      const candidate = input.candidateById.get(id);
      return candidate !== undefined && candidate.negativeEvidenceFlag === "proposed_only";
    });
    if (!allProposedOnly) return entry;
    coerced = true;
    return { ...entry, status: "proposed" as DocumentInterventionStatus };
  });
  return { statusHistory: sanitized, coerced };
}

// Fix 3: drop metric.valueNumeric when no supporting candidate's evidence
// (quote text or fields.valueNumeric) backs that exact number. Reuses the
// Phase 2 `quoteSupportsNumericValue` helper for substring matching with
// numeric variants (commas, %, decimals).
export function validateMetricValueNumericSupport(input: {
  metric: import("@bp/domain").DocumentInterventionRecordDraft["metrics"][number];
  candidateById: Map<string, Tier2DocumentEvidenceCandidate>;
}): {
  metric: import("@bp/domain").DocumentInterventionRecordDraft["metrics"][number];
  unsupportedValueNumericRemoved: boolean;
} {
  if (input.metric.valueNumeric === undefined) {
    return { metric: input.metric, unsupportedValueNumericRemoved: false };
  }
  const supportingCandidates = input.metric.evidenceRefs
    .map((id) => input.candidateById.get(id))
    .filter((candidate): candidate is Tier2DocumentEvidenceCandidate => candidate !== undefined);
  const targetValue = input.metric.valueNumeric;
  const targetUnit =
    typeof input.metric.unit === "string" && input.metric.unit.length > 0
      ? input.metric.unit.trim().toLowerCase()
      : null;
  const supported = supportingCandidates.some((candidate) => {
    if (quoteSupportsNumericValue(candidate.evidenceQuote, targetValue)) {
      return true;
    }
    const fieldValue = candidate.fields["valueNumeric"];
    if (typeof fieldValue !== "number" || !Object.is(fieldValue, targetValue)) {
      return false;
    }
    // Fix P2.4: when matching a typed valueNumeric field, the unit must
    // also match (both undefined counts as a match). Otherwise we'd accept
    // "23 minutes" as backing for "23 percent".
    const fieldUnitRaw = candidate.fields["unit"];
    const fieldUnit =
      typeof fieldUnitRaw === "string" && fieldUnitRaw.length > 0
        ? fieldUnitRaw.trim().toLowerCase()
        : null;
    return fieldUnit === targetUnit;
  });
  if (supported) {
    return { metric: input.metric, unsupportedValueNumericRemoved: false };
  }
  const { valueNumeric: _droppedValueNumeric, ...rest } = input.metric;
  void _droppedValueNumeric;
  return { metric: rest, unsupportedValueNumericRemoved: true };
}

// Fix 4: drop corridor.extentEndpoints if either start or end isn't found
// as a normalized substring in any supporting candidate's quote. Keeps
// corridor.streets and corridor.intersections.
const CORRIDOR_SUFFIX_EXPANSIONS: Array<[RegExp, string]> = [
  [/\bst\b\.?/g, "street"],
  [/\bave\b\.?/g, "avenue"],
  [/\bav\b\.?/g, "avenue"],
  [/\bblvd\b\.?/g, "boulevard"],
  [/\brd\b\.?/g, "road"],
  [/\bpkwy\b\.?/g, "parkway"],
  [/\bpl\b\.?/g, "place"],
  [/\bdr\b\.?/g, "drive"],
  [/\bln\b\.?/g, "lane"],
  [/\bctr\b\.?/g, "center"],
  [/\bbway\b\.?/g, "broadway"],
  [/\bbridge\b/g, "bridge"],
];

export function normalizeCorridorText(value: string): string {
  let normalized = value
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[.,;:!?()\[\]{}"']/g, " ");
  for (const [pattern, replacement] of CORRIDOR_SUFFIX_EXPANSIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}

function corridorEndpointSupported(endpoint: string, supportingText: string): boolean {
  const target = normalizeCorridorText(endpoint);
  if (target.length === 0) return false;
  return supportingText.includes(target);
}

export function validateCorridorExtentEndpoints(input: {
  corridor: NonNullable<import("@bp/domain").DocumentInterventionRecordDraft["corridor"]>;
  supportingCandidates: Tier2DocumentEvidenceCandidate[];
}): {
  corridor: NonNullable<import("@bp/domain").DocumentInterventionRecordDraft["corridor"]>;
  unsupportedEndpointsRemoved: boolean;
} {
  if (input.corridor.extentEndpoints === undefined) {
    return { corridor: input.corridor, unsupportedEndpointsRemoved: false };
  }
  const joinedSupportText = input.supportingCandidates
    .map((candidate) => normalizeCorridorText(candidate.evidenceQuote))
    .join(" | ");
  const startOk = corridorEndpointSupported(
    input.corridor.extentEndpoints.start,
    joinedSupportText,
  );
  const endOk = corridorEndpointSupported(input.corridor.extentEndpoints.end, joinedSupportText);
  if (startOk && endOk) {
    return { corridor: input.corridor, unsupportedEndpointsRemoved: false };
  }
  const { extentEndpoints: _droppedEndpoints, ...rest } = input.corridor;
  void _droppedEndpoints;
  return { corridor: rest, unsupportedEndpointsRemoved: true };
}

// Fix 7: drop records whose supporting candidates contain no direct
// intervention evidence. Metrics, claims, caveats, methodology, tables alone
// cannot stand up a record. A record needs at least one candidate that
// describes a treatment, service change, implementation status (not just
// plan-publication milestones), or a custom treatment tied to bus service.
const INTERVENTION_EVIDENCE_CANDIDATE_TYPES: ReadonlySet<string> = new Set([
  "document_treatment_component_candidate",
  "document_service_change_candidate",
]);

// Fix P2.5: a candidate is bus-priority-relevant if it carries a typed
// treatment/service-change enum value (the enums are all bus-priority by
// construction) OR its quote mentions an unambiguous bus-priority signal
// (bus, route, SBS, busway, lane, headway, frequency, stop, transit
// signal priority). Pure fare-policy, subway accessibility, or other
// unrelated-program quotes fail this check.
const BUS_PRIORITY_QUOTE_SIGNAL =
  /\b(bus(?:es|way|ways)?|sbs|select bus service|brt|tsp|transit signal priority|bus lane|busway|all[- ]door boarding|off[- ]board fare|queue jump|bus bulb|bus stop|bus shelter|bus only|bus[- ]priority|frequency|headway|route\s+(?:[a-z]{1,3}\d{1,3}|m\d{1,3}|q\d{1,3}|b\d{1,3}|bx\d{1,3}|s\d{1,3})|[mqbs]\d{1,3}|bx\d{1,3})\b/i;

const FARE_OR_UNRELATED_ONLY_PATTERNS: RegExp[] = [
  /\bfare(?:\s+(?:policy|enforcement|evasion|capping|collection|payment|box|gate))?\b/i,
  /\bomny\b/i,
  /\bmetro[- ]card\b/i,
  /\bsubway\s+(?:network|service|route|routes|station|stations|accessibility|elevator|escalator|stair|platform|signal|signals|line|lines|change|changes)\b/i,
  /\b(?:e|f|m|r)(?:\s*,\s*(?:e|f|m|r))*\s+(?:line|lines)\b/i,
  /\bf\/m\s+swap\b/i,
  /\baccessib(?:le|ility)\b/i,
  /\belevator|escalator\b/i,
];

const NO_CHANGE_OR_DECLINED_ONLY_PATTERNS: RegExp[] = [
  /\b(?:would|will)\s+not\s+(?:change|see|receive|get|be\s+increased|be\s+implemented)\b/i,
  /\bnot\s+planned\s+for\s+implementation\b/i,
  /\bnot\s+adopted\b/i,
  /\b(?:would|will)\s+(?:remain|continue)\s+(?:at\s+)?existing\b/i,
  /\bremain\s+at\s+existing\s+levels\b/i,
  /\b(?:would|will)\s+(?:be\s+)?maintain(?:ed)?\b/i,
  /\bmaintain\s+(?:its\s+|the\s+)?existing\s+(?:routing|route|service|trips|connection|connections)\b/i,
  /\b(?:would|will)\s+continue\s+to\s+(?:serve|connect|do\s+so)\b/i,
  /\bretain(?:ed|s|ing)?\s+(?:its\s+|the\s+)?existing\s+(?:routing|route|service|trips|connection|connections)\b/i,
  /\bdeclin(?:e|ed|ing)\b.{0,160}\b(?:reroute|routing|service|change|request|comment)\b/i,
  /\blogistically\s+challenging\b/i,
];

const GENERIC_TOOLKIT_PATTERNS: RegExp[] = [
  /\bfeatures?\s+include\b/i,
  /\bmeans\s+that\b/i,
  /\bare\s+(?:travel lanes|locations)\b/i,
  /\ban\s+important\s+aspect\s+of\s+sbs\s+design\b/i,
  /\benhanced\s+road\s+markings\s+will\s+increase\b/i,
  /\bminimum\s+bus\s+stop\s+spacing\s+allows\b/i,
  /\bselect\s+bus\s+service\s+routes\s+have\s+a\s+simple\s+route\s+pattern\b/i,
  /\binstalled\s+at\s+all\s+select\s+bus\s+service\s+stations\b/i,
  /\bupgraded\s+signage\s+on\s+all\s+routes\b/i,
  /\buses\s+gps\s+to\s+track\b/i,
];

function candidateCombinedText(candidate: Tier2DocumentEvidenceCandidate): string {
  return `${candidate.summary ?? ""}\n${candidate.evidenceQuote ?? ""}`;
}

function candidateHasTypedTreatmentField(
  candidate: Tier2DocumentEvidenceCandidate,
): boolean {
  const treatmentTypes = candidate.fields["treatmentTypes"];
  if (Array.isArray(treatmentTypes) && treatmentTypes.length > 0) return true;
  const customTreatmentType = candidate.fields["customTreatmentType"];
  if (typeof customTreatmentType === "string" && customTreatmentType.trim().length > 0) {
    return true;
  }
  return false;
}

function candidateHasTypedBusPriorityField(
  candidate: Tier2DocumentEvidenceCandidate,
): boolean {
  if (candidateHasTypedTreatmentField(candidate)) return true;
  const changeTypes = candidate.fields["changeTypes"];
  if (Array.isArray(changeTypes) && changeTypes.length > 0) return true;
  return false;
}

export function candidateHasBusPrioritySignal(
  candidate: Tier2DocumentEvidenceCandidate,
): boolean {
  if (candidateHasTypedBusPriorityField(candidate)) return true;
  return BUS_PRIORITY_QUOTE_SIGNAL.test(candidate.evidenceQuote);
}

// Audit fix: previous implementation short-circuited to false whenever the
// bus-priority regex matched, so quotes like "bus fare policy" passed (the
// bus regex matched "bus" before the fare pattern could reject). Run both
// checks: if the quote matches a fare/subway/unrelated pattern and the
// candidate doesn't carry a typed bus-priority field, reject it.
function candidateIsFareOrUnrelatedOnly(
  candidate: Tier2DocumentEvidenceCandidate,
): boolean {
  const text = candidateCombinedText(candidate);
  const farePatternMatch = FARE_OR_UNRELATED_ONLY_PATTERNS.some((pattern) =>
    pattern.test(text),
  );
  if (!farePatternMatch) return false;
  // A typed treatment component from Phase 2 is a strong bus-priority signal
  // (for example off-board fare collection on SBS). A service-change enum by
  // itself is weaker: subway route swaps and other non-bus service changes can
  // also look like route_modified/frequency_change, so changeTypes alone do not
  // override this unrelated-program filter.
  if (candidateHasTypedTreatmentField(candidate)) return false;
  return true;
}

function candidateIsNoChangeOrDeclinedOnly(
  candidate: Tier2DocumentEvidenceCandidate,
): boolean {
  if (candidateHasTypedTreatmentField(candidate)) return false;
  const text = candidateCombinedText(candidate);
  return NO_CHANGE_OR_DECLINED_ONLY_PATTERNS.some((pattern) => pattern.test(text));
}

function candidateHasProjectAnchor(candidate: Tier2DocumentEvidenceCandidate): boolean {
  if ((candidate.routeMentions ?? []).length > 0) return true;
  if ((candidate.corridorMentions ?? []).length > 0) return true;
  for (const fieldName of [
    "effectiveDate",
    "startDate",
    "endDate",
    "statusAsOfDate",
    "implementationDate",
  ]) {
    const value = candidate.fields[fieldName];
    if (typeof value === "string" && value.trim().length > 0) return true;
  }
  return false;
}

function candidateIsGenericToolkitOnly(
  candidate: Tier2DocumentEvidenceCandidate,
): boolean {
  if (candidateHasProjectAnchor(candidate)) return false;
  const text = candidateCombinedText(candidate);
  if (
    !/\b(?:select\s+bus\s+service|sbs|bus\s+lanes?|bus\s+bulbs?|off[- ]board\s+fare|transit\s+signal\s+priority|real[- ]time\s+arrival|bus\s+shelters?)\b/i.test(
      text,
    )
  ) {
    return false;
  }
  return GENERIC_TOOLKIT_PATTERNS.some((pattern) => pattern.test(text));
}

export function recordHasInterventionEvidence(
  recordCandidates: Tier2DocumentEvidenceCandidate[],
): boolean {
  // Step 1: structural eligibility — at least one candidate of the right
  // type, and not a plan-publication-only project status.
  const structurallyEligible = recordCandidates.filter((candidate) => {
    if (INTERVENTION_EVIDENCE_CANDIDATE_TYPES.has(candidate.candidateType)) {
      return true;
    }
    if (candidate.candidateType === "document_project_status_candidate") {
      const issues = candidate.extraction.qualityIssues ?? [];
      return !issues.includes("project_status_is_document_milestone");
    }
    return false;
  });
  if (structurallyEligible.length === 0) return false;
  if (structurallyEligible.every(candidateIsGenericToolkitOnly)) return false;
  // Fix P2.5: a candidate qualifies the record when it carries a bus-priority
  // signal AND is not predominantly about fare policy, subway accessibility,
  // no-change/comment-response text, or unrelated agency programs. These checks
  // run independently because typed service-change enums alone are not enough to
  // prove a discrete bus intervention.
  return structurallyEligible.some(
    (candidate) =>
      candidateHasBusPrioritySignal(candidate) &&
      !candidateIsFareOrUnrelatedOnly(candidate) &&
      !candidateIsNoChangeOrDeclinedOnly(candidate) &&
      !candidateIsGenericToolkitOnly(candidate),
  );
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

function normalizedRoutesForBucketing(
  candidate: Tier2DocumentEvidenceCandidate,
): string[] {
  const normalized = new Set<string>();
  for (const mention of candidate.routeMentions) {
    for (const routeId of expandRouteMention(mention)) {
      normalized.add(routeId);
    }
  }
  return [...normalized].sort();
}

function isRouteHeavyServiceChangeSource(
  candidates: Tier2DocumentEvidenceCandidate[],
): boolean {
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
  return [...candidates].sort((a, b) =>
    candidateOrderKey(a).localeCompare(candidateOrderKey(b)),
  );
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
  const charsForCandidates = (
    candidates: Tier2DocumentEvidenceCandidate[],
  ): number => {
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

// Fix 8: cluster records that share at least one evidenceCandidateId via
// union-find, then merge each cluster into one record. Records with no
// overlap pass through unchanged.
type DedupableRecord = Tier2DocumentInterventionRecord;

// Fix P1.3: two records are merge-compatible when, in addition to sharing
// an evidence candidate, they share at least two independent identifying
// signals. This prevents unrelated route-bucket records from collapsing just
// because they both cite a shared source_wide methodology/table candidate and
// happen to share one loose attribute such as route or treatment.
export function recordsAreClusterCompatible(
  a: Tier2DocumentInterventionRecord,
  b: Tier2DocumentInterventionRecord,
): boolean {
  const intersects = <T>(left: readonly T[], right: readonly T[]): boolean => {
    if (left.length === 0 || right.length === 0) return false;
    const set = new Set<T>(left);
    return right.some((value) => set.has(value));
  };
  const shareRoute = intersects(a.routes, b.routes);
  const sharePrimaryTreatment = intersects(a.primaryTreatments, b.primaryTreatments);
  const aCustom = a.customTreatments ?? [];
  const bCustom = b.customTreatments ?? [];
  const shareCustomTreatment = intersects(aCustom, bCustom);
  const shareTreatment = sharePrimaryTreatment || shareCustomTreatment;
  const aStreets = (a.corridor?.streets ?? []).map(normalizeCorridorText);
  const bStreets = (b.corridor?.streets ?? []).map(normalizeCorridorText);
  const shareStreet = intersects(aStreets, bStreets);
  const shareEffectiveDate =
    a.effectiveDate !== undefined &&
    b.effectiveDate !== undefined &&
    a.effectiveDate === b.effectiveDate;
  return [shareRoute, shareTreatment, shareStreet, shareEffectiveDate].filter(Boolean).length >= 2;
}

function unionFindClusters(records: DedupableRecord[]): number[][] {
  const parent = records.map((_, index) => index);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) {
      const next = parent[root];
      if (next === undefined) break;
      root = next;
    }
    let cursor = i;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      if (next === undefined) break;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  };
  const byCandidate = new Map<string, number[]>();
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record === undefined) continue;
    for (const candidateId of record.evidenceCandidateIds) {
      const list = byCandidate.get(candidateId) ?? [];
      list.push(i);
      byCandidate.set(candidateId, list);
    }
  }
  // Fix P1.3: union two records only if they share an evidence candidate
  // AND are compatible. Without a compatibility gate, two route-bucket
  // records that happen to cite the same source_wide methodology candidate
  // would be merged even though they describe different interventions.
  for (const indices of byCandidate.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a += 1) {
      for (let b = a + 1; b < indices.length; b += 1) {
        const ai = indices[a];
        const bi = indices[b];
        if (ai === undefined || bi === undefined) continue;
        const ra = records[ai];
        const rb = records[bi];
        if (ra === undefined || rb === undefined) continue;
        if (recordsAreClusterCompatible(ra, rb)) {
          union(ai, bi);
        }
      }
    }
  }
  const clusterByRoot = new Map<number, number[]>();
  for (let i = 0; i < records.length; i += 1) {
    const root = find(i);
    const list = clusterByRoot.get(root) ?? [];
    list.push(i);
    clusterByRoot.set(root, list);
  }
  return [...clusterByRoot.values()];
}

export function mergeRecordCluster(input: {
  records: Tier2DocumentInterventionRecord[];
  sourceId: string;
  candidateById: Map<string, Tier2DocumentEvidenceCandidate>;
  clusterIndex: number;
  candidateExtractionRootName: string;
  candidateRootName: string;
  synthesisRootName: string;
}): Tier2DocumentInterventionRecord {
  const primary = input.records[0];
  if (primary === undefined) {
    throw new Error("mergeRecordCluster called with empty records array");
  }

  const sortedUnique = <T extends string>(values: readonly T[]): T[] =>
    [...new Set(values)].sort() as T[];

  const evidenceCandidateIds = sortedUnique(
    input.records.flatMap((record) => record.evidenceCandidateIds),
  );
  const routes = sortedUnique(input.records.flatMap((record) => record.routes));
  const primaryTreatments = sortedUnique(
    input.records.flatMap(
      (record) => record.primaryTreatments,
    ) as Tier2DocumentInterventionRecord["primaryTreatments"],
  );
  const customTreatments = sortedUnique(
    input.records.flatMap((record) => record.customTreatments ?? []),
  );

  const statusHistoryByKey = new Map<
    string,
    Tier2DocumentInterventionRecord["statusHistory"][number]
  >();
  for (const record of input.records) {
    for (const entry of record.statusHistory) {
      const refsKey = [...entry.evidenceRefs].sort().join(",");
      const key = `${entry.status}|${entry.asOfDate ?? ""}|${refsKey}`;
      if (!statusHistoryByKey.has(key)) {
        statusHistoryByKey.set(key, entry);
      }
    }
  }

  // Fix P2.6: when collapsing duplicate components / metrics / caveats,
  // union their evidenceRefs so the merged record retains every supporting
  // candidate, not only the first record's refs.
  const treatmentComponentsByKey = new Map<
    string,
    Tier2DocumentInterventionRecord["treatmentComponents"][number]
  >();
  for (const record of input.records) {
    for (const component of record.treatmentComponents) {
      const key = `${component.treatmentType ?? ""}|${component.customTreatmentType ?? ""}|${component.description.toLowerCase()}`;
      const existing = treatmentComponentsByKey.get(key);
      if (existing === undefined) {
        treatmentComponentsByKey.set(key, component);
      } else {
        treatmentComponentsByKey.set(key, {
          ...existing,
          evidenceRefs: [
            ...new Set([...existing.evidenceRefs, ...component.evidenceRefs]),
          ].sort(),
        });
      }
    }
  }

  const metricsByKey = new Map<
    string,
    Tier2DocumentInterventionRecord["metrics"][number]
  >();
  for (const record of input.records) {
    for (const metric of record.metrics) {
      const nameKey = metric.metricName ?? metric.customMetricName ?? "";
      const valueKey =
        metric.valueNumeric === undefined ? "" : String(metric.valueNumeric);
      const qualifierKey = metric.valueQualifier ?? "";
      const key = `${nameKey}|${valueKey}|${qualifierKey}`;
      const existing = metricsByKey.get(key);
      if (existing === undefined) {
        metricsByKey.set(key, metric);
      } else {
        metricsByKey.set(key, {
          ...existing,
          evidenceRefs: [
            ...new Set([...existing.evidenceRefs, ...metric.evidenceRefs]),
          ].sort(),
        });
      }
    }
  }

  const caveatsByKey = new Map<
    string,
    Tier2DocumentInterventionRecord["caveats"][number]
  >();
  for (const record of input.records) {
    for (const caveat of record.caveats) {
      const key = caveat.description.toLowerCase();
      const existing = caveatsByKey.get(key);
      if (existing === undefined) {
        caveatsByKey.set(key, caveat);
      } else {
        caveatsByKey.set(key, {
          ...existing,
          evidenceRefs: [
            ...new Set([...existing.evidenceRefs, ...caveat.evidenceRefs]),
          ].sort(),
        });
      }
    }
  }

  const firstDefined = <T,>(getter: (record: Tier2DocumentInterventionRecord) => T | undefined): T | undefined => {
    for (const record of input.records) {
      const value = getter(record);
      if (value !== undefined) return value;
    }
    return undefined;
  };

  const corridor = firstDefined((record) => record.corridor);
  const serviceMode = firstDefined((record) => record.serviceMode);
  const effectiveDate = firstDefined((record) => record.effectiveDate);
  const datePrecision = firstDefined((record) => record.datePrecision);
  const notes = firstDefined((record) => record.notes);

  const mergedStatusHistory = [...statusHistoryByKey.values()];
  const mergedRecordCandidates = evidenceCandidateIds
    .map((id) => input.candidateById.get(id))
    .filter(
      (candidate): candidate is Tier2DocumentEvidenceCandidate => candidate !== undefined,
    );
  const recordKind = inferRecordKind({
    statusHistory: mergedStatusHistory,
    recordCandidates: mergedRecordCandidates,
  });
  const recordId = recordIdForDraft({
    sourceId: input.sourceId,
    routes,
    primaryTreatments,
    effectiveDate,
    index: input.clusterIndex,
  });

  const mergedQualityIssues = sortedUnique(
    input.records.flatMap((record) => record.extraction.qualityIssues ?? []),
  );
  const mergedQualityRepairsRaw = input.records.flatMap(
    (record) => record.extraction.qualityRepairs ?? [],
  );
  const mergedQualityRepairsSet = new Set<string>(mergedQualityRepairsRaw);
  if (input.records.length > 1) {
    mergedQualityRepairsSet.add("phase3_record_merged_from_route_buckets");
  }
  const mergedQualityRepairs = sortedUnique([...mergedQualityRepairsSet]);

  // Fix P2.6: capture every participating bucketId, not only the primary's.
  // Multi-bucket records get a comma-separated, sorted bucketId so audits
  // can trace the merge back to its sources.
  const mergedBucketIds = sortedUnique(
    input.records
      .map((record) => record.extraction.bucketId)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  );
  const mergedBucketId = mergedBucketIds.join(",");
  const distinctBucketKinds = sortedUnique(
    input.records
      .map((record) => record.extraction.bucketKind)
      .filter((kind): kind is Tier2InterventionRecordsBucketKind => kind !== undefined),
  );
  const mergedBucketKind: Tier2InterventionRecordsBucketKind | undefined =
    distinctBucketKinds.length === 1 ? distinctBucketKinds[0] : "per_route";

  const merged: Tier2DocumentInterventionRecord = {
    ...primary,
    recordId,
    sourceId: input.sourceId,
    recordKind,
    routes,
    primaryTreatments,
    ...(customTreatments.length > 0 ? { customTreatments } : {}),
    ...(corridor === undefined ? {} : { corridor }),
    ...(serviceMode === undefined ? {} : { serviceMode }),
    ...(effectiveDate === undefined ? {} : { effectiveDate }),
    ...(datePrecision === undefined ? {} : { datePrecision }),
    statusHistory: mergedStatusHistory,
    treatmentComponents: [...treatmentComponentsByKey.values()],
    metrics: [...metricsByKey.values()],
    caveats: [...caveatsByKey.values()],
    ...(notes === undefined ? {} : { notes }),
    evidenceCandidateIds,
    extraction: {
      candidateExtractionRootName: input.candidateExtractionRootName,
      candidateRootName: input.candidateRootName,
      synthesisRootName: input.synthesisRootName,
      ...(mergedQualityIssues.length > 0 ? { qualityIssues: mergedQualityIssues } : {}),
      ...(mergedQualityRepairs.length > 0 ? { qualityRepairs: mergedQualityRepairs } : {}),
      ...(mergedBucketId.length > 0 ? { bucketId: mergedBucketId } : {}),
      ...(mergedBucketKind === undefined ? {} : { bucketKind: mergedBucketKind }),
    },
  };
  return merged;
}

export function dedupeInterventionRecordsByEvidenceOverlap(input: {
  records: Tier2DocumentInterventionRecord[];
  sourceId: string;
  candidateById: Map<string, Tier2DocumentEvidenceCandidate>;
  candidateExtractionRootName: string;
  candidateRootName: string;
  synthesisRootName: string;
}): Tier2DocumentInterventionRecord[] {
  if (input.records.length < 2) return input.records;
  const clusters = unionFindClusters(input.records);
  const orderedClusters = clusters
    .map((indices) => [...indices].sort((a, b) => a - b))
    .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  const merged: Tier2DocumentInterventionRecord[] = [];
  for (let clusterIndex = 0; clusterIndex < orderedClusters.length; clusterIndex += 1) {
    const indices = orderedClusters[clusterIndex];
    if (indices === undefined || indices.length === 0) continue;
    const clusterRecords = indices
      .map((i) => input.records[i])
      .filter(
        (record): record is Tier2DocumentInterventionRecord => record !== undefined,
      );
    if (clusterRecords.length === 1) {
      const single = clusterRecords[0];
      if (single !== undefined) merged.push(single);
      continue;
    }
    merged.push(
      mergeRecordCluster({
        records: clusterRecords,
        sourceId: input.sourceId,
        candidateById: input.candidateById,
        clusterIndex,
        candidateExtractionRootName: input.candidateExtractionRootName,
        candidateRootName: input.candidateRootName,
        synthesisRootName: input.synthesisRootName,
      }),
    );
  }
  return merged;
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

type InterventionRecordsSchemaIssue = {
  path: string;
  code: string;
  message: string;
};

export type ProcessInterventionRecordsToolArgsResult =
  | {
      status: "extracted";
      records: Tier2DocumentInterventionRecord[];
      unattachedCandidateIds: string[];
      droppedNoEvidenceCount: number;
    }
  | {
      status: "failed";
      records: [];
      unattachedCandidateIds: [];
      droppedNoEvidenceCount: 0;
      error: "schema_validation_failed";
      issues: InterventionRecordsSchemaIssue[];
    };

export function processInterventionRecordsToolArgs(input: {
  sourceId: string;
  bucket: InterventionRecordsBucket;
  toolArgs: unknown;
  candidateExtractionRootName: string;
  candidateRootName: string;
  synthesisRootName: string;
}): ProcessInterventionRecordsToolArgsResult {
  const { patched: aliasRepairedArgs, repairedRecordIndices } =
    repairInterventionRecordsAliases(input.toolArgs);
  const { patched: repairedToolArgs, recordIndicesWithStrippedEnums } =
    repairInvalidEnumValues(aliasRepairedArgs, (value) =>
      DocumentInterventionRecordsToolResponseSchema.safeParse(value),
    );
  const parsed = DocumentInterventionRecordsToolResponseSchema.safeParse(repairedToolArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
    return {
      status: "failed",
      records: [],
      unattachedCandidateIds: [],
      droppedNoEvidenceCount: 0,
      error: "schema_validation_failed",
      issues,
    };
  }

  const sourceId = input.sourceId;
  const response: DocumentInterventionRecordsToolResponse = parsed.data;
  const validCandidateIds = new Set(
    input.bucket.candidates.map((candidate) => candidate.candidateId),
  );
  const candidateById = new Map(
    input.bucket.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const repairedRecordIndexSet = new Set(repairedRecordIndices);
  const persistedRecords: Tier2DocumentInterventionRecord[] = [];
  let droppedNoEvidenceCount = 0;
  for (let recordIndex = 0; recordIndex < response.interventionRecords.length; recordIndex += 1) {
    const draft = response.interventionRecords[recordIndex];
    if (draft === undefined) continue;
    const modelEvidenceIds = collectEvidenceRefs(draft).filter((id) =>
      validCandidateIds.has(id),
    );
    const recordCandidates = modelEvidenceIds
      .map((id) => candidateById.get(id))
      .filter(
        (candidate): candidate is Tier2DocumentEvidenceCandidate => candidate !== undefined,
      );
    if (!recordHasInterventionEvidence(recordCandidates)) {
      droppedNoEvidenceCount += 1;
      continue;
    }
    const recordQualityIssues: Tier2InterventionRecordQualityIssueCode[] = [];
    const recordQualityRepairs: Tier2InterventionRecordQualityRepairCode[] = [];
    if (repairedRecordIndexSet.has(recordIndex)) {
      recordQualityRepairs.push("phase3_record_schema_alias_repaired");
    }
    if (recordIndicesWithStrippedEnums.has(recordIndex)) {
      recordQualityRepairs.push("phase3_record_invalid_enum_stripped");
    }
    const sanitizedFromModel = sanitizeStatusHistoryForProposedOnly({
      statusHistory: draft.statusHistory,
      candidateById,
    });
    const draftWithSanitizedHistory = {
      ...draft,
      statusHistory: sanitizedFromModel.statusHistory,
    };
    const labelRepair = repairDraftLabelConflicts(draftWithSanitizedHistory);
    if (labelRepair.repaired) {
      recordQualityRepairs.push("phase3_record_label_conflict_repaired");
    }
    const backfillResult = backfillStatusHistory({
      draft: labelRepair.draft,
      recordCandidates,
    });
    // Defense in depth: sanitize again after backfill in case a status
    // observation was added that references a proposed-only candidate.
    const sanitizedAfterBackfill = sanitizeStatusHistoryForProposedOnly({
      statusHistory: backfillResult.statusHistory,
      candidateById,
    });
    const finalStatusHistory = sanitizedAfterBackfill.statusHistory;
    if (
      sanitizedFromModel.coerced ||
      backfillResult.coercedFromProposedOnly ||
      sanitizedAfterBackfill.coerced
    ) {
      recordQualityRepairs.push("status_history_coerced_to_proposed_only");
    }
    const repairedMetrics = labelRepair.draft.metrics
      .map((metric) =>
        validateMetricValueNumericSupport({ metric, candidateById }),
      )
      .map(({ metric, unsupportedValueNumericRemoved }) => {
        if (unsupportedValueNumericRemoved) {
          if (!recordQualityIssues.includes("metric_value_numeric_not_supported_by_evidence_refs")) {
            recordQualityIssues.push("metric_value_numeric_not_supported_by_evidence_refs");
          }
        }
        return metric;
      })
      .filter((metric) => {
        return (
          metric.valueNumeric !== undefined ||
          (typeof metric.valueQualifier === "string" && metric.valueQualifier.length > 0) ||
          (typeof metric.methodology === "string" && metric.methodology.length > 0)
        );
      });
    let repairedCorridor = labelRepair.draft.corridor;
    if (repairedCorridor !== undefined && repairedCorridor.extentEndpoints !== undefined) {
      const supportingCandidates = collectEvidenceRefs(labelRepair.draft)
        .map((id) => candidateById.get(id))
        .filter(
          (candidate): candidate is Tier2DocumentEvidenceCandidate => candidate !== undefined,
        );
      const corridorCheck = validateCorridorExtentEndpoints({
        corridor: repairedCorridor,
        supportingCandidates,
      });
      repairedCorridor = corridorCheck.corridor;
      if (corridorCheck.unsupportedEndpointsRemoved) {
        recordQualityIssues.push("corridor_extent_endpoints_not_supported_by_evidence");
      }
    }
    const finalDraft = {
      ...labelRepair.draft,
      statusHistory: finalStatusHistory,
      metrics: repairedMetrics,
      ...(repairedCorridor === undefined ? {} : { corridor: repairedCorridor }),
    };
    const recordKind = inferRecordKind({
      statusHistory: finalStatusHistory,
      recordCandidates,
    });
    const evidenceIds = collectEvidenceRefs(finalDraft).filter((id) =>
      validCandidateIds.has(id),
    );
    const recordId = recordIdForDraft({
      sourceId,
      routes: finalDraft.routes,
      primaryTreatments: finalDraft.primaryTreatments,
      effectiveDate: finalDraft.effectiveDate,
      index: recordIndex,
    });
    persistedRecords.push({
      ...finalDraft,
      recordId,
      sourceId,
      recordKind,
      evidenceCandidateIds: evidenceIds,
      extraction: {
        candidateExtractionRootName: input.candidateExtractionRootName,
        candidateRootName: input.candidateRootName,
        synthesisRootName: input.synthesisRootName,
        ...(recordQualityIssues.length > 0 ? { qualityIssues: recordQualityIssues } : {}),
        ...(recordQualityRepairs.length > 0 ? { qualityRepairs: recordQualityRepairs } : {}),
        bucketId: input.bucket.bucketId,
        bucketKind: input.bucket.bucketKind,
      },
    });
  }
  return {
    status: "extracted",
    records: persistedRecords,
    unattachedCandidateIds: response.unattachedCandidateIds,
    droppedNoEvidenceCount,
  };
}

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
  const routeCatalogPath =
    args.routeCatalogPath ?? DEFAULT_INTERVENTION_RECORDS_ROUTE_CATALOG_PATH;
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
        errorArtifactKey:
          result.errorPath === null ? null : artifactKey(result.errorPath, runRoot),
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
    ...(parsed.synthesisRootName !== undefined ? { synthesisRootName: parsed.synthesisRootName } : {}),
    ...(parsed.model !== undefined ? { model: parsed.model } : {}),
    ...(parsed.serviceTier !== undefined ? { serviceTier: parsed.serviceTier } : {}),
    ...(parsed.maxTokens !== undefined ? { maxTokens: parsed.maxTokens } : {}),
    ...(parsed.sourceIds !== undefined ? { sourceIds: parsed.sourceIds } : {}),
    ...(parsed.limitSources !== undefined ? { limitSources: parsed.limitSources } : {}),
    ...(parsed.routeCatalogPath !== undefined ? { routeCatalogPath: parsed.routeCatalogPath } : {}),
    execute: parsed.execute ?? false,
  });
}
