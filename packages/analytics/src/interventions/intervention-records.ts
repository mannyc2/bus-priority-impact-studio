// Deterministic Tier 2 intervention-records synthesis policy.
//
// The post-LLM repair -> validate -> classify -> cluster -> dedupe core for the
// Tier 2 `docs tier2 intervention-records` step. Moved out of the pipeline tool
// (tools/pipeline-v2/.../_intervention-records.ts, and the stale `_shared.ts`
// duplicate) so the deterministic policy has a single, tested home. Pure: no
// fs / network / LLM. The tool keeps CLI, file IO, prompt/tool building,
// route-catalog bucketing, and LLM invocation, and imports this surface.
import { createHash } from "node:crypto";
import {
  DocumentMetricNameSchema,
  DocumentTreatmentTypeSchema,
  type Tier2DocumentEvidenceCandidate,
} from "@bp/domain/documents/candidates";
import {
  DocumentInterventionDatePrecisionSchema,
  type DocumentInterventionRecord,
  type DocumentInterventionRecordDraft,
  type DocumentInterventionRecordKind,
  type DocumentInterventionRecordsToolResponse,
  DocumentInterventionRecordsToolResponseSchema,
  DocumentInterventionServiceModeSchema,
  type DocumentInterventionStatus,
  DocumentInterventionStatusSchema,
  type Tier2InterventionRecordQualityIssueCode,
  type Tier2InterventionRecordQualityRepairCode,
} from "@bp/domain/documents/intervention-records";

// The persisted record shape is the canonical domain type; this alias preserves
// the original local name used throughout the moved policy below.
type Tier2DocumentInterventionRecord = DocumentInterventionRecord;

// Closed set of bucket kinds the policy reads off candidate buckets. Mirrors
// the tool-side `Tier2InterventionRecordsBucketKind`; the persisted record's
// `extraction.bucketKind` is a plain string in the domain schema.
export type Tier2InterventionRecordsBucketKind =
  | "single_call"
  | "per_route"
  | "source_wide"
  | "page_range";

// Minimal bucket contract the policy reads. The tool's richer
// `InterventionRecordsBucket` is structurally assignable to this.
export type InterventionRecordsBucketInput = {
  bucketId: string;
  bucketKind: Tier2InterventionRecordsBucketKind;
  candidates: Tier2DocumentEvidenceCandidate[];
};

// --- private utilities (copied from the pipeline's _shared.ts / _patterns.ts;
// kept private so the package never imports back into the tool) ---

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

function normalizeNumericText(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(value).replace(/0+$/, "").replace(/\.$/, "");
}

function numericQuoteVariants(value: number): string[] {
  const absolute = Math.abs(value);
  const variants = new Set<string>([
    normalizeNumericText(value),
    normalizeNumericText(absolute),
    absolute.toLocaleString("en-US"),
  ]);
  if (absolute >= 1_000_000) {
    const millions = absolute / 1_000_000;
    variants.add(`${normalizeNumericText(millions)} million`);
  }
  if (absolute >= 1_000 && absolute < 1_000_000) {
    const thousands = absolute / 1_000;
    variants.add(`${normalizeNumericText(thousands)} thousand`);
  }
  for (const [word, number] of Object.entries(NUMBER_WORDS)) {
    if (absolute === number) variants.add(word);
  }
  return [...variants].filter((variant) => variant.length > 0);
}

function quoteSupportsNumericValue(quote: string, value: number): boolean {
  const normalizedQuote = quote.toLowerCase().replace(/,/g, "");
  return numericQuoteVariants(value).some((variant) => {
    const normalizedVariant = variant.toLowerCase().replace(/,/g, "");
    const trailingBoundary = Number.isInteger(value)
      ? "(?!\\.\\d)(?=$|[^0-9a-z])"
      : "(?=$|[^0-9a-z])";
    return new RegExp(
      `(^|[^0-9a-z.])\\$?\\s*${escapeRegExp(normalizedVariant)}${trailingBoundary}`,
    ).test(normalizedQuote);
  });
}

// --- repair / validate / classify (post-LLM record processing) ---
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
      return value.map((item) => stripNullsDeep(item)).filter((item) => item !== undefined);
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
          if (
            typeof startVal === "string" &&
            startVal.length > 0 &&
            nestedObj["start"] === undefined
          ) {
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
        streets === undefined || (Array.isArray(streets) && streets.length === 0);
      if (streetsEmpty || Object.keys(corridorObj).length === 0) {
        delete record["corridor"];
      }
    }
    // Fix P1.6: coerce common statusHistory[].status synonyms before strict
    // parse. The model occasionally emits "implemented"/"in_progress"/etc.
    // which are not in the enum but obviously map to a real value.
    const statusHistoryRaw = record["statusHistory"];
    if (Array.isArray(statusHistoryRaw)) {
      record["statusHistory"] = statusHistoryRaw.map((rawEntry) => {
        if (rawEntry === null || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
          return rawEntry;
        }
        const entry = { ...(rawEntry as Record<string, unknown>) };
        const status = entry["status"];
        const statusKey = typeof status === "string" ? normalizeStatusSynonymKey(status) : null;
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
      const record = readAtPath(clone, path.slice(0, 2)) as Record<string, unknown> | undefined;
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
  if (filtered !== null && typeof filtered === "object" && !Array.isArray(filtered)) {
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
          code?: string;
          path: ReadonlyArray<string | number | symbol>;
          keys?: ReadonlyArray<string>;
        }>;
      };
    };

type RepairPath = ReadonlyArray<string | number>;

const TOOL_RESPONSE_KEYS = new Set(["sourceId", "interventionRecords", "unattachedCandidateIds"]);
const TOOL_RECORD_KEYS = new Set([
  "routes",
  "serviceMode",
  "primaryTreatments",
  "customTreatments",
  "corridor",
  "effectiveDate",
  "datePrecision",
  "statusHistory",
  "treatmentComponents",
  "metrics",
  "caveats",
  "notes",
]);
const STATUS_HISTORY_KEYS = new Set(["status", "asOfDate", "evidenceRefs"]);
const TREATMENT_COMPONENT_KEYS = new Set([
  "treatmentType",
  "customTreatmentType",
  "description",
  "evidenceRefs",
]);
const METRIC_KEYS = new Set([
  "metricName",
  "customMetricName",
  "valueNumeric",
  "valueQualifier",
  "unit",
  "baselinePeriod",
  "comparisonPeriod",
  "geographyScope",
  "methodology",
  "evidenceRefs",
]);
const PERIOD_KEYS = new Set(["start", "end"]);
const CAVEAT_KEYS = new Set(["description", "evidenceRefs"]);
const CORRIDOR_KEYS = new Set(["streets", "extentEndpoints", "intersections"]);
const EXTENT_ENDPOINT_KEYS = new Set(["start", "end"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unknownKeys(value: unknown, allowedKeys: ReadonlySet<string>): string[] {
  if (!isPlainRecord(value)) return [];
  return Object.keys(value).filter((key) => !allowedKeys.has(key));
}

function collectUnrecognizedKeyRemovals(
  root: unknown,
): Array<{ path: RepairPath; keys: ReadonlyArray<string> }> {
  const removals: Array<{ path: RepairPath; keys: ReadonlyArray<string> }> = [];
  const addRemoval = (value: unknown, path: RepairPath, allowedKeys: ReadonlySet<string>): void => {
    const keys = unknownKeys(value, allowedKeys);
    if (keys.length > 0) removals.push({ path, keys });
  };

  addRemoval(root, [], TOOL_RESPONSE_KEYS);
  if (!isPlainRecord(root)) return removals;
  const records = root["interventionRecords"];
  if (!Array.isArray(records)) return removals;

  for (const [recordIndex, rawRecord] of records.entries()) {
    const recordPath = ["interventionRecords", recordIndex] as const;
    addRemoval(rawRecord, recordPath, TOOL_RECORD_KEYS);
    if (!isPlainRecord(rawRecord)) continue;

    const corridor = rawRecord["corridor"];
    if (corridor !== undefined) {
      const corridorPath = [...recordPath, "corridor"];
      addRemoval(corridor, corridorPath, CORRIDOR_KEYS);
      if (isPlainRecord(corridor)) {
        addRemoval(
          corridor["extentEndpoints"],
          [...corridorPath, "extentEndpoints"],
          EXTENT_ENDPOINT_KEYS,
        );
      }
    }

    const statusHistory = rawRecord["statusHistory"];
    if (Array.isArray(statusHistory)) {
      for (const [statusIndex, statusEntry] of statusHistory.entries()) {
        addRemoval(statusEntry, [...recordPath, "statusHistory", statusIndex], STATUS_HISTORY_KEYS);
      }
    }

    const treatmentComponents = rawRecord["treatmentComponents"];
    if (Array.isArray(treatmentComponents)) {
      for (const [componentIndex, component] of treatmentComponents.entries()) {
        addRemoval(
          component,
          [...recordPath, "treatmentComponents", componentIndex],
          TREATMENT_COMPONENT_KEYS,
        );
      }
    }

    const metrics = rawRecord["metrics"];
    if (Array.isArray(metrics)) {
      for (const [metricIndex, metric] of metrics.entries()) {
        const metricPath = [...recordPath, "metrics", metricIndex];
        addRemoval(metric, metricPath, METRIC_KEYS);
        if (isPlainRecord(metric)) {
          addRemoval(metric["baselinePeriod"], [...metricPath, "baselinePeriod"], PERIOD_KEYS);
          addRemoval(metric["comparisonPeriod"], [...metricPath, "comparisonPeriod"], PERIOD_KEYS);
        }
      }
    }

    const caveats = rawRecord["caveats"];
    if (Array.isArray(caveats)) {
      for (const [caveatIndex, caveat] of caveats.entries()) {
        addRemoval(caveat, [...recordPath, "caveats", caveatIndex], CAVEAT_KEYS);
      }
    }
  }

  return removals;
}

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
    const parserInvalidPaths = parsed.error.issues
      .filter((issue) => issue.code === "invalid_value" || issue.code === "invalid_enum_value")
      .map((issue) =>
        issue.path.filter(
          (segment): segment is string | number =>
            typeof segment === "string" || typeof segment === "number",
        ),
      );
    const invalidPaths = [...parserInvalidPaths, ...collectInvalidEnumPaths(current)];
    // Fix P1.7: schema is .strict() so any model-emitted extra key fails
    // wholesale (e.g. metrics[].notes). Each unrecognized_keys issue gives
    // the parent path plus the offending key list; delete those keys.
    const parserUnrecognizedKeyRemovals = parsed.error.issues
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
    const unrecognizedKeyRemovals = [
      ...parserUnrecognizedKeyRemovals,
      ...collectUnrecognizedKeyRemovals(current),
    ];
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
const DOCUMENT_INTERVENTION_STATUSES = new Set<string>(DocumentInterventionStatusSchema.options);
const DOCUMENT_SERVICE_MODES = new Set<string>(DocumentInterventionServiceModeSchema.options);
const DOCUMENT_DATE_PRECISIONS = new Set<string>(DocumentInterventionDatePrecisionSchema.options);

function isKnownStringEnumValue(value: unknown, values: ReadonlySet<string>): boolean {
  return typeof value === "string" && values.has(value);
}

function collectInvalidEnumPaths(root: unknown): RepairPath[] {
  if (!isPlainRecord(root)) return [];
  const records = root["interventionRecords"];
  if (!Array.isArray(records)) return [];

  const paths: RepairPath[] = [];
  for (const [recordIndex, rawRecord] of records.entries()) {
    if (!isPlainRecord(rawRecord)) continue;
    const recordPath = ["interventionRecords", recordIndex] as const;

    if (
      rawRecord["serviceMode"] !== undefined &&
      !isKnownStringEnumValue(rawRecord["serviceMode"], DOCUMENT_SERVICE_MODES)
    ) {
      paths.push([...recordPath, "serviceMode"]);
    }
    if (
      rawRecord["datePrecision"] !== undefined &&
      !isKnownStringEnumValue(rawRecord["datePrecision"], DOCUMENT_DATE_PRECISIONS)
    ) {
      paths.push([...recordPath, "datePrecision"]);
    }

    const primaryTreatments = rawRecord["primaryTreatments"];
    if (Array.isArray(primaryTreatments)) {
      for (const [treatmentIndex, treatment] of primaryTreatments.entries()) {
        if (!isKnownStringEnumValue(treatment, DOCUMENT_TREATMENT_TYPES)) {
          paths.push([...recordPath, "primaryTreatments", treatmentIndex]);
        }
      }
    }

    const statusHistory = rawRecord["statusHistory"];
    if (Array.isArray(statusHistory)) {
      for (const [statusIndex, statusEntry] of statusHistory.entries()) {
        if (
          isPlainRecord(statusEntry) &&
          statusEntry["status"] !== undefined &&
          !isKnownStringEnumValue(statusEntry["status"], DOCUMENT_INTERVENTION_STATUSES)
        ) {
          paths.push([...recordPath, "statusHistory", statusIndex, "status"]);
        }
      }
    }

    const treatmentComponents = rawRecord["treatmentComponents"];
    if (Array.isArray(treatmentComponents)) {
      for (const [componentIndex, component] of treatmentComponents.entries()) {
        if (
          isPlainRecord(component) &&
          component["treatmentType"] !== undefined &&
          !isKnownStringEnumValue(component["treatmentType"], DOCUMENT_TREATMENT_TYPES)
        ) {
          paths.push([...recordPath, "treatmentComponents", componentIndex, "treatmentType"]);
        }
      }
    }

    const metrics = rawRecord["metrics"];
    if (Array.isArray(metrics)) {
      for (const [metricIndex, metric] of metrics.entries()) {
        if (
          isPlainRecord(metric) &&
          metric["metricName"] !== undefined &&
          !isKnownStringEnumValue(metric["metricName"], DOCUMENT_METRIC_NAMES)
        ) {
          paths.push([...recordPath, "metrics", metricIndex, "metricName"]);
        }
      }
    }
  }
  return paths;
}

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

function repairDraftLabelConflicts(draft: DocumentInterventionRecordDraft): {
  draft: DocumentInterventionRecordDraft;
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

function collectEvidenceRefs(draft: DocumentInterventionRecordDraft): string[] {
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
  draft: DocumentInterventionRecordDraft;
  recordCandidates: Tier2DocumentEvidenceCandidate[];
}): {
  statusHistory: DocumentInterventionRecordDraft["statusHistory"];
  coercedFromProposedOnly: boolean;
} {
  const existing = input.draft.statusHistory;
  const seenKeys = new Set(existing.map((entry) => `${entry.status}|${entry.asOfDate ?? ""}`));
  const inferred: DocumentInterventionRecordDraft["statusHistory"] = [];
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
  statusHistory: DocumentInterventionRecordDraft["statusHistory"];
  recordCandidates: Tier2DocumentEvidenceCandidate[];
}): DocumentInterventionRecordKind {
  // When every supporting candidate is proposed-only, the record is a
  // recommendation — overrides any leaked "implementing"/"complete" status
  // that may have slipped through from contradictory candidate fields.
  if (
    input.recordCandidates.length > 0 &&
    input.recordCandidates.every((candidate) => candidate.negativeEvidenceFlag === "proposed_only")
  ) {
    return "proposed";
  }
  const statuses = new Set(input.statusHistory.map((entry) => entry.status));
  if (statuses.has("complete") || statuses.has("monitoring") || statuses.has("implementing")) {
    return statuses.has("complete") || statuses.has("monitoring") ? "implemented" : "in_progress";
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
  statusHistory: DocumentInterventionRecordDraft["statusHistory"];
  candidateById: Map<string, Tier2DocumentEvidenceCandidate>;
}): {
  statusHistory: DocumentInterventionRecordDraft["statusHistory"];
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
  metric: DocumentInterventionRecordDraft["metrics"][number];
  candidateById: Map<string, Tier2DocumentEvidenceCandidate>;
}): {
  metric: DocumentInterventionRecordDraft["metrics"][number];
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
    .replace(/[.,;:!?()[\]{}"']/g, " ");
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
  corridor: NonNullable<DocumentInterventionRecordDraft["corridor"]>;
  supportingCandidates: Tier2DocumentEvidenceCandidate[];
}): {
  corridor: NonNullable<DocumentInterventionRecordDraft["corridor"]>;
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

function candidateHasTypedTreatmentField(candidate: Tier2DocumentEvidenceCandidate): boolean {
  const treatmentTypes = candidate.fields["treatmentTypes"];
  if (Array.isArray(treatmentTypes) && treatmentTypes.length > 0) return true;
  const customTreatmentType = candidate.fields["customTreatmentType"];
  if (typeof customTreatmentType === "string" && customTreatmentType.trim().length > 0) {
    return true;
  }
  return false;
}

function candidateHasTypedBusPriorityField(candidate: Tier2DocumentEvidenceCandidate): boolean {
  if (candidateHasTypedTreatmentField(candidate)) return true;
  const changeTypes = candidate.fields["changeTypes"];
  if (Array.isArray(changeTypes) && changeTypes.length > 0) return true;
  return false;
}

export function candidateHasBusPrioritySignal(candidate: Tier2DocumentEvidenceCandidate): boolean {
  if (candidateHasTypedBusPriorityField(candidate)) return true;
  return BUS_PRIORITY_QUOTE_SIGNAL.test(candidate.evidenceQuote);
}

// Audit fix: previous implementation short-circuited to false whenever the
// bus-priority regex matched, so quotes like "bus fare policy" passed (the
// bus regex matched "bus" before the fare pattern could reject). Run both
// checks: if the quote matches a fare/subway/unrelated pattern and the
// candidate doesn't carry a typed bus-priority field, reject it.
function candidateIsFareOrUnrelatedOnly(candidate: Tier2DocumentEvidenceCandidate): boolean {
  const text = candidateCombinedText(candidate);
  const farePatternMatch = FARE_OR_UNRELATED_ONLY_PATTERNS.some((pattern) => pattern.test(text));
  if (!farePatternMatch) return false;
  // A typed treatment component from Phase 2 is a strong bus-priority signal
  // (for example off-board fare collection on SBS). A service-change enum by
  // itself is weaker: subway route swaps and other non-bus service changes can
  // also look like route_modified/frequency_change, so changeTypes alone do not
  // override this unrelated-program filter.
  if (candidateHasTypedTreatmentField(candidate)) return false;
  return true;
}

function candidateIsNoChangeOrDeclinedOnly(candidate: Tier2DocumentEvidenceCandidate): boolean {
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

function candidateIsGenericToolkitOnly(candidate: Tier2DocumentEvidenceCandidate): boolean {
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

// --- evidence-overlap clustering / dedupe ---
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
          evidenceRefs: [...new Set([...existing.evidenceRefs, ...component.evidenceRefs])].sort(),
        });
      }
    }
  }

  const metricsByKey = new Map<string, Tier2DocumentInterventionRecord["metrics"][number]>();
  for (const record of input.records) {
    for (const metric of record.metrics) {
      const nameKey = metric.metricName ?? metric.customMetricName ?? "";
      const valueKey = metric.valueNumeric === undefined ? "" : String(metric.valueNumeric);
      const qualifierKey = metric.valueQualifier ?? "";
      const key = `${nameKey}|${valueKey}|${qualifierKey}`;
      const existing = metricsByKey.get(key);
      if (existing === undefined) {
        metricsByKey.set(key, metric);
      } else {
        metricsByKey.set(key, {
          ...existing,
          evidenceRefs: [...new Set([...existing.evidenceRefs, ...metric.evidenceRefs])].sort(),
        });
      }
    }
  }

  const caveatsByKey = new Map<string, Tier2DocumentInterventionRecord["caveats"][number]>();
  for (const record of input.records) {
    for (const caveat of record.caveats) {
      const key = caveat.description.toLowerCase();
      const existing = caveatsByKey.get(key);
      if (existing === undefined) {
        caveatsByKey.set(key, caveat);
      } else {
        caveatsByKey.set(key, {
          ...existing,
          evidenceRefs: [...new Set([...existing.evidenceRefs, ...caveat.evidenceRefs])].sort(),
        });
      }
    }
  }

  const firstDefined = <T>(
    getter: (record: Tier2DocumentInterventionRecord) => T | undefined,
  ): T | undefined => {
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
    .filter((candidate): candidate is Tier2DocumentEvidenceCandidate => candidate !== undefined);
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
      .filter((record): record is Tier2DocumentInterventionRecord => record !== undefined);
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

// --- top-level tool-args processing ---
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
  bucket: InterventionRecordsBucketInput;
  toolArgs: unknown;
  candidateExtractionRootName: string;
  candidateRootName: string;
  synthesisRootName: string;
}): ProcessInterventionRecordsToolArgsResult {
  const { patched: aliasRepairedArgs, repairedRecordIndices } = repairInterventionRecordsAliases(
    input.toolArgs,
  );
  const { patched: repairedToolArgs, recordIndicesWithStrippedEnums } = repairInvalidEnumValues(
    aliasRepairedArgs,
    (value) => DocumentInterventionRecordsToolResponseSchema.safeParse(value),
  );
  const parsed = DocumentInterventionRecordsToolResponseSchema.safeParse(repairedToolArgs);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => ({
      path: issue.path.join("."),
      code: issue.code ?? "validation_error",
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
    const modelEvidenceIds = collectEvidenceRefs(draft).filter((id) => validCandidateIds.has(id));
    const recordCandidates = modelEvidenceIds
      .map((id) => candidateById.get(id))
      .filter((candidate): candidate is Tier2DocumentEvidenceCandidate => candidate !== undefined);
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
      .map((metric) => validateMetricValueNumericSupport({ metric, candidateById }))
      .map(({ metric, unsupportedValueNumericRemoved }) => {
        if (unsupportedValueNumericRemoved) {
          if (
            !recordQualityIssues.includes("metric_value_numeric_not_supported_by_evidence_refs")
          ) {
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
    const evidenceIds = collectEvidenceRefs(finalDraft).filter((id) => validCandidateIds.has(id));
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
