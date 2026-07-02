// biome-ignore-all lint/suspicious/noImplicitAnyLet: Legacy Tier 2 command code is pending plan 024 deletion; dynamic accumulator shape is unchanged.
import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { type CliOption, parseCliOptions } from "./_shared.ts";

const ARTIFACT_KIND = "bp.tier2_raw_field_graduation_plan.v1";
const PROMPT_VERSION = "tier2-raw-field-graduation-v1";
const DEFAULT_MAX_VALUES_PER_KEY = 750;
const DEFAULT_EXAMPLES_PER_VALUE = 4;

type GraduationMode = "llm_vocab_map";
type RawFieldDisposition =
  | "llm_vocab_candidate"
  | "deterministic_catalog_or_parser"
  | "preserve_source_wording"
  | "review_only";

type GraduationKeySpec = {
  id: string;
  tier: "core" | "secondary";
  targetPayloadPath: string;
  sourceFieldPaths: readonly string[];
  mode: GraduationMode;
  description: string;
};

const GRADUATION_KEYS: readonly GraduationKeySpec[] = [
  {
    id: "entityKind",
    tier: "core",
    targetPayloadPath: "canonicalPayload.entityKind",
    sourceFieldPaths: ["rawPayload.entityKind", "rawPayload.entityKindRaw", "rawPayload.rawKind"],
    mode: "llm_vocab_map",
    description:
      "Entity type vocabulary such as street, bus route, agency, corridor, or treatment.",
  },
  {
    id: "entityRole",
    tier: "core",
    targetPayloadPath: "canonicalPayload.entityRole",
    sourceFieldPaths: [
      "rawPayload.entityRole",
      "rawPayload.entityRoleRaw",
      "rawPayload.role",
      "rawPayload.roleRaw",
    ],
    mode: "llm_vocab_map",
    description: "Role a mentioned entity plays in the source surface.",
  },
  {
    id: "metricFamily",
    tier: "core",
    targetPayloadPath: "canonicalPayload.metricFamily",
    sourceFieldPaths: [
      "rawPayload.metricLabel",
      "rawPayload.metricLabelRaw",
      "rawPayload.metricName",
      "rawPayload.metricNameRaw",
      "rawPayload.labelRaw",
    ],
    mode: "llm_vocab_map",
    description: "Metric label/name family used for detector and brief grouping.",
  },
  {
    id: "metricSubjectFamily",
    tier: "core",
    targetPayloadPath: "canonicalPayload.metricSubjectFamily",
    sourceFieldPaths: [
      "rawPayload.subject",
      "rawPayload.subjectRaw",
      "rawPayload.metricSubject",
      "rawPayload.metricSubjectRaw",
    ],
    mode: "llm_vocab_map",
    description: "The phenomenon or object measured by a metric.",
  },
  {
    id: "metricUnit",
    tier: "core",
    targetPayloadPath: "canonicalPayload.metricUnit",
    sourceFieldPaths: [
      "rawPayload.unit",
      "rawPayload.unitRaw",
      "rawPayload.metricUnit",
      "rawPayload.metricUnitRaw",
    ],
    mode: "llm_vocab_map",
    description: "Metric units and unit-like count labels.",
  },
  {
    id: "claimKind",
    tier: "core",
    targetPayloadPath: "canonicalPayload.claimKind",
    sourceFieldPaths: ["rawPayload.claimKind", "rawPayload.claimKindRaw"],
    mode: "llm_vocab_map",
    description:
      "Claim family for descriptive, problem, treatment, feedback, and performance claims.",
  },
  {
    id: "claimResearchUseTag",
    tier: "core",
    targetPayloadPath: "canonicalPayload.researchUseTags",
    sourceFieldPaths: ["rawPayload.researchUseTags", "rawPayload.researchUseTagsRaw"],
    mode: "llm_vocab_map",
    description:
      "Research-use tags that connect claims/questions to downstream detectors and briefs.",
  },
  {
    id: "eventFamily",
    tier: "core",
    targetPayloadPath: "canonicalPayload.eventFamily",
    sourceFieldPaths: [
      "rawPayload.eventFamily",
      "rawPayload.eventFamilyRaw",
      "rawPayload.family",
      "rawPayload.familyRaw",
      "rawPayload.eventKind",
      "rawPayload.eventKindRaw",
      "rawPayload.eventType",
      "rawPayload.eventTypeRaw",
    ],
    mode: "llm_vocab_map",
    description:
      "High-level event family such as outreach, implementation, planning, or service launch.",
  },
  {
    id: "eventSubtype",
    tier: "core",
    targetPayloadPath: "canonicalPayload.eventSubtype",
    sourceFieldPaths: [
      "rawPayload.eventSubtype",
      "rawPayload.eventSubtypeRaw",
      "rawPayload.subtypeRaw",
    ],
    mode: "llm_vocab_map",
    description:
      "Event subtype such as board presentation, bus-lane installation, or design workshop.",
  },
  {
    id: "eventTreatmentFamily",
    tier: "secondary",
    targetPayloadPath: "canonicalPayload.treatmentFamily",
    sourceFieldPaths: [
      "rawPayload.treatment",
      "rawPayload.treatmentRaw",
      "rawPayload.treatmentType",
      "rawPayload.treatmentTypeRaw",
      "rawPayload.eventTreatmentRaw",
    ],
    mode: "llm_vocab_map",
    description: "Treatment or intervention family mentioned by event/service/treatment surfaces.",
  },
  {
    id: "tableKind",
    tier: "core",
    targetPayloadPath: "canonicalPayload.tableKind",
    sourceFieldPaths: ["rawPayload.tableKind", "rawPayload.tableKindRaw"],
    mode: "llm_vocab_map",
    description:
      "Table semantic family such as map legend, ridership table, or before/after comparison.",
  },
  {
    id: "contextKind",
    tier: "core",
    targetPayloadPath: "canonicalPayload.contextKind",
    sourceFieldPaths: ["rawPayload.contextKind", "rawPayload.contextKindRaw"],
    mode: "llm_vocab_map",
    description:
      "Context-signal family such as section heading, presentation context, timeline, or geography.",
  },
  {
    id: "questionKind",
    tier: "core",
    targetPayloadPath: "canonicalPayload.questionKind",
    sourceFieldPaths: ["rawPayload.questionKind", "rawPayload.questionKindRaw"],
    mode: "llm_vocab_map",
    description:
      "Review-question family such as missing detail, data gap, design detail, or clarification.",
  },
] as const;

type SurfaceRef = {
  artifactPath: string;
  sourceId?: string;
  sourceGroup?: string;
  pageNumbers?: number[];
  surfaceId?: string;
  surfaceKind: string;
  payloadSchemaId?: string;
  displayLabel?: string;
};

type ValueExample = SurfaceRef & {
  sourceFieldPath: string;
};

type ValueCounter = {
  value: string;
  count: number;
  sourceFieldCounts: Map<string, number>;
  surfaceKindCounts: Map<string, number>;
  examples: ValueExample[];
};

type GraduationValue = {
  value: string;
  count: number;
  sourceFieldCounts: Record<string, number>;
  surfaceKindCounts: Record<string, number>;
  examples: ValueExample[];
};

type GraduationKeyStats = {
  id: string;
  tier: "core" | "secondary";
  targetPayloadPath: string;
  sourceFieldPaths: string[];
  mode: GraduationMode;
  description: string;
  instanceCount: number;
  distinctValueCount: number;
  repeatedDistinctValueCount: number;
  placeholderValueCount: number;
  omittedValueCount: number;
  topValues: GraduationValue[];
  llmBatch: {
    keyId: string;
    targetPayloadPath: string;
    instruction: string;
    values: GraduationValue[];
  };
};

type RawFieldStats = {
  fieldPath: string;
  disposition: RawFieldDisposition;
  graduationKeyId?: string;
  reason: string;
  instanceCount: number;
  distinctValueCount: number;
  repeatedDistinctValueCount: number;
  topValues: GraduationValue[];
};

export type Tier2RawFieldGraduationPlan = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  promptVersion: typeof PROMPT_VERSION;
  sourceRoots: string[];
  sourceCanonicalMergePaths: string[];
  safetyPolicy: {
    rawPayloadMutationAllowed: false;
    projectionMode: "additive_canonical_payload";
    unresolvedBehavior: "preserve_raw_and_emit_unresolved";
    llmRuntimeUse: "design_time_only";
  };
  summary: {
    artifactCount: number;
    acceptedSurfaceCount: number;
    surfaceKindCounts: Record<string, number>;
    graduationKeyCount: number;
    coreGraduationKeyCount: number;
    secondaryGraduationKeyCount: number;
    rawFieldCount: number;
    llmVocabularyCandidateFieldCount: number;
    deterministicFieldCount: number;
    preserveRawFieldCount: number;
    reviewOnlyFieldCount: number;
    totalGraduationInstances: number;
    totalGraduationDistinctValues: number;
  };
  graduationKeys: GraduationKeyStats[];
  rawFieldInventory: RawFieldStats[];
  projectionContract: {
    keep: string[];
    add: string[];
    neverInferWithLlm: string[];
  };
};

export type Tier2RawFieldGraduationLlmBatchArtifact = {
  artifactKind: "bp.tier2_raw_field_graduation_llm_batches.v1";
  schemaVersion: 1;
  generatedAt: string;
  sourcePlanPath: string;
  promptVersion: typeof PROMPT_VERSION;
  safetyPolicy: Tier2RawFieldGraduationPlan["safetyPolicy"];
  batches: Array<{
    keyId: string;
    tier: "core" | "secondary";
    targetPayloadPath: string;
    sourceFieldPaths: string[];
    instruction: string;
    values: Array<{
      value: string;
      count: number;
      sourceFieldCounts: Record<string, number>;
      surfaceKindCounts: Record<string, number>;
      exampleLabels: string[];
    }>;
  }>;
};

export type RunTier2RawFieldGraduationArgs = {
  roots?: readonly string[];
  canonicalMergePath?: string;
  outputPath?: string;
  markdownPath?: string;
  llmBatchOutputPath?: string;
  generatedAt?: string;
  maxValuesPerKey?: number;
  examplesPerValue?: number;
};

type CliArgs = {
  roots?: string[];
  canonicalMergePath?: string;
  outputPath?: string;
  markdownPath?: string;
  llmBatchOutputPath?: string;
  generatedAt?: string;
  maxValuesPerKey?: number;
  examplesPerValue?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function normalizeValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

function primitiveValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => primitiveValues(item));
  const normalized = normalizeValue(value);
  return normalized === null ? [] : [normalized];
}

function pathValues(root: unknown, path: string): string[] {
  let values: unknown[] = [root];
  for (const part of path.split(".")) {
    const next: unknown[] = [];
    for (const value of values) {
      if (!isRecord(value)) continue;
      const child = value[part];
      if (child === undefined) continue;
      if (Array.isArray(child)) next.push(...child);
      else next.push(child);
    }
    values = next;
  }
  return values.flatMap((value) => primitiveValues(value));
}

async function findArtifactPaths(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && basename(path) === "artifact.json") {
        out.push(path);
      }
    }
  }
  await visit(root);
  return out.sort();
}

function artifactPathValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? fromCliPath(value) : null;
}

async function readCanonicalMergeArtifactPaths(path: string): Promise<string[]> {
  const raw = await Bun.file(path).json();
  if (!isRecord(raw)) throw new Error(`Canonical merge artifact is not an object: ${path}`);
  const canonicalArtifacts = Array.isArray(raw["canonicalArtifacts"])
    ? raw["canonicalArtifacts"]
    : [];
  const paths = canonicalArtifacts.flatMap((item) => {
    if (!isRecord(item)) return [];
    const artifactPath = artifactPathValue(item["artifactPath"]);
    return artifactPath === null ? [] : [artifactPath];
  });
  if (paths.length === 0) {
    throw new Error(
      `Canonical merge artifact has no canonicalArtifacts[].artifactPath entries: ${path}`,
    );
  }
  return paths;
}

function mapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function increment(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function addValue(input: {
  counters: Map<string, ValueCounter>;
  value: string;
  sourceFieldPath: string;
  surface: SurfaceRef;
  examplesPerValue: number;
}) {
  const counter = input.counters.get(input.value) ?? {
    value: input.value,
    count: 0,
    sourceFieldCounts: new Map<string, number>(),
    surfaceKindCounts: new Map<string, number>(),
    examples: [],
  };
  counter.count += 1;
  increment(counter.sourceFieldCounts, input.sourceFieldPath);
  increment(counter.surfaceKindCounts, input.surface.surfaceKind);
  if (counter.examples.length < input.examplesPerValue) {
    counter.examples.push({ ...input.surface, sourceFieldPath: input.sourceFieldPath });
  }
  input.counters.set(input.value, counter);
}

function counterValues(counters: Map<string, ValueCounter>, limit: number): GraduationValue[] {
  return [...counters.values()]
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value))
    .slice(0, limit)
    .map((counter) => ({
      value: counter.value,
      count: counter.count,
      sourceFieldCounts: mapToRecord(counter.sourceFieldCounts),
      surfaceKindCounts: mapToRecord(counter.surfaceKindCounts),
      examples: counter.examples,
    }));
}

function isPlaceholder(value: string): boolean {
  return /^(unknown|unspecified|none|n\/a|na|not specified|not_applicable|null)$/i.test(
    value.trim(),
  );
}

const sourcePathToGraduationKey = new Map(
  GRADUATION_KEYS.flatMap((key) => key.sourceFieldPaths.map((path) => [path, key.id] as const)),
);

function classifyRawField(
  fieldPath: string,
): Pick<RawFieldStats, "disposition" | "graduationKeyId" | "reason"> {
  const graduationKeyId = sourcePathToGraduationKey.get(fieldPath);
  if (graduationKeyId !== undefined) {
    return {
      disposition: "llm_vocab_candidate",
      graduationKeyId,
      reason: "Category-like raw field covered by the 12-key vocabulary graduation set.",
    };
  }
  const compact = fieldPath.toLowerCase();
  if (/(route|routeids|subjectroute)/.test(compact)) {
    return {
      disposition: "deterministic_catalog_or_parser",
      reason:
        "Route mentions must resolve through the route lookup/catalog validator while preserving raw wording.",
    };
  }
  if (/(date|period|time|year|month)/.test(compact)) {
    return {
      disposition: "deterministic_catalog_or_parser",
      reason: "Dates and periods should parse through deterministic date/precision logic.",
    };
  }
  if (/(value|numeric|amount|count)/.test(compact)) {
    return {
      disposition: "deterministic_catalog_or_parser",
      reason:
        "Metric values should parse numerically or remain source-stated values, not be LLM-normalized.",
    };
  }
  if (/(status|authority|truthstatus|publicationwording|direction|priority)/.test(compact)) {
    return {
      disposition: "deterministic_catalog_or_parser",
      reason: "Small governed enums should use strict maps and validator feedback.",
    };
  }
  if (
    /(geography|location|street|corridor|borough|area|entitytext|entityname|crossstreet|subwayline|servedarea)/.test(
      compact,
    )
  ) {
    return {
      disposition: "deterministic_catalog_or_parser",
      reason:
        "Geography/entity mentions should resolve through catalogs or gazetteers while preserving raw text.",
    };
  }
  if (
    /(claimtext|rawtext|evidencetext|description|title|header|row|semanticnotes|questiontext|signaltext|name)/.test(
      compact,
    )
  ) {
    return {
      disposition: "preserve_source_wording",
      reason:
        "This is source wording or table/text content, so canonicalization would lose evidence detail.",
    };
  }
  return {
    disposition: "review_only",
    reason:
      "Raw field is not part of the current graduated vocabulary and needs corpus review before automation.",
  };
}

function walkRawFields(input: {
  root: unknown;
  prefix: string;
  surface: SurfaceRef;
  countersByPath: Map<string, Map<string, ValueCounter>>;
  examplesPerValue: number;
}) {
  if (!isRecord(input.root)) return;
  for (const [key, value] of Object.entries(input.root)) {
    const path = `${input.prefix}.${key}`;
    if (key.includes("Raw")) {
      const counters = input.countersByPath.get(path) ?? new Map<string, ValueCounter>();
      for (const rawValue of primitiveValues(value)) {
        addValue({
          counters,
          value: rawValue,
          sourceFieldPath: path,
          surface: input.surface,
          examplesPerValue: input.examplesPerValue,
        });
      }
      input.countersByPath.set(path, counters);
    }
    if (isRecord(value)) {
      walkRawFields({
        root: value,
        prefix: path,
        surface: input.surface,
        countersByPath: input.countersByPath,
        examplesPerValue: input.examplesPerValue,
      });
    }
  }
}

function surfaceRef(input: {
  artifactPath: string;
  artifact: Record<string, unknown>;
  surface: Record<string, unknown>;
}): SurfaceRef {
  const source = isRecord(input.artifact["source"]) ? input.artifact["source"] : {};
  const ref: SurfaceRef = {
    artifactPath: input.artifactPath,
    surfaceKind:
      typeof input.surface["surfaceKind"] === "string" ? input.surface["surfaceKind"] : "unknown",
  };
  if (typeof source["sourceId"] === "string") ref.sourceId = source["sourceId"];
  if (typeof source["sourceGroup"] === "string") ref.sourceGroup = source["sourceGroup"];
  if (Array.isArray(source["pageNumbers"])) {
    ref.pageNumbers = source["pageNumbers"].filter(
      (page): page is number => typeof page === "number",
    );
  }
  if (typeof input.surface["surfaceId"] === "string") ref.surfaceId = input.surface["surfaceId"];
  if (typeof input.surface["payloadSchemaId"] === "string") {
    ref.payloadSchemaId = input.surface["payloadSchemaId"];
  }
  if (typeof input.surface["displayLabel"] === "string")
    ref.displayLabel = input.surface["displayLabel"];
  return ref;
}

function renderMarkdown(plan: Tier2RawFieldGraduationPlan): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Raw Field Graduation Plan");
  lines.push("");
  lines.push(`Generated: ${plan.generatedAt}`);
  lines.push("");
  lines.push("## Safety");
  lines.push("");
  lines.push("- Raw payloads are preserved.");
  lines.push("- Canonical fields are additive.");
  lines.push(
    "- LLM use is design-time vocabulary synthesis only; runtime resolution is deterministic map lookup.",
  );
  lines.push("- Unmapped values stay raw and enter unresolved review.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Artifacts: ${plan.summary.artifactCount}`);
  lines.push(`- Accepted surfaces: ${plan.summary.acceptedSurfaceCount}`);
  lines.push(
    `- Graduation keys: ${plan.summary.graduationKeyCount} (${plan.summary.coreGraduationKeyCount} core, ${plan.summary.secondaryGraduationKeyCount} secondary)`,
  );
  lines.push(`- Raw fields: ${plan.summary.rawFieldCount}`);
  lines.push(`- LLM vocab candidate fields: ${plan.summary.llmVocabularyCandidateFieldCount}`);
  lines.push(`- Deterministic/catalog fields: ${plan.summary.deterministicFieldCount}`);
  lines.push(`- Preserve-source fields: ${plan.summary.preserveRawFieldCount}`);
  lines.push(`- Review-only fields: ${plan.summary.reviewOnlyFieldCount}`);
  lines.push("");
  lines.push("## Graduation Keys");
  lines.push("");
  lines.push("| Key | Tier | Instances | Distinct | Repeated | Target |");
  lines.push("|---|---|---:|---:|---:|---|");
  for (const key of plan.graduationKeys) {
    lines.push(
      `| ${key.id} | ${key.tier} | ${key.instanceCount} | ${key.distinctValueCount} | ${key.repeatedDistinctValueCount} | ${key.targetPayloadPath} |`,
    );
  }
  lines.push("");
  lines.push("## Top Raw Fields");
  lines.push("");
  lines.push("| Field | Disposition | Instances | Distinct | Reason |");
  lines.push("|---|---|---:|---:|---|");
  for (const field of plan.rawFieldInventory.slice(0, 40)) {
    lines.push(
      `| ${field.fieldPath} | ${field.disposition} | ${field.instanceCount} | ${field.distinctValueCount} | ${field.reason.replace(/\|/g, "/")} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function buildLlmBatchArtifact(input: {
  plan: Tier2RawFieldGraduationPlan;
  sourcePlanPath: string;
}): Tier2RawFieldGraduationLlmBatchArtifact {
  return {
    artifactKind: "bp.tier2_raw_field_graduation_llm_batches.v1",
    schemaVersion: 1,
    generatedAt: input.plan.generatedAt,
    sourcePlanPath: input.sourcePlanPath,
    promptVersion: PROMPT_VERSION,
    safetyPolicy: input.plan.safetyPolicy,
    batches: input.plan.graduationKeys.map((key) => ({
      keyId: key.id,
      tier: key.tier,
      targetPayloadPath: key.targetPayloadPath,
      sourceFieldPaths: key.sourceFieldPaths,
      instruction: key.llmBatch.instruction,
      values: key.llmBatch.values.map((value) => ({
        value: value.value,
        count: value.count,
        sourceFieldCounts: value.sourceFieldCounts,
        surfaceKindCounts: value.surfaceKindCounts,
        exampleLabels: value.examples
          .map((example) => example.displayLabel)
          .filter((label): label is string => label !== undefined)
          .slice(0, 4),
      })),
    })),
  };
}

export async function buildTier2RawFieldGraduationPlan(
  args: RunTier2RawFieldGraduationArgs,
): Promise<Tier2RawFieldGraduationPlan> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const maxValuesPerKey = args.maxValuesPerKey ?? DEFAULT_MAX_VALUES_PER_KEY;
  const examplesPerValue = args.examplesPerValue ?? DEFAULT_EXAMPLES_PER_VALUE;
  const sourceRoots = (args.roots ?? []).map((root) => fromCliPath(root));
  const sourceCanonicalMergePaths =
    args.canonicalMergePath === undefined ? [] : [fromCliPath(args.canonicalMergePath)];
  if (sourceRoots.length === 0 && sourceCanonicalMergePaths.length === 0) {
    throw new Error("Provide at least one source root or a canonical merge artifact.");
  }
  const graduationCounters = new Map(
    GRADUATION_KEYS.map((key) => [key.id, new Map<string, ValueCounter>()] as const),
  );
  const rawFieldCounters = new Map<string, Map<string, ValueCounter>>();
  const surfaceKindCounts = new Map<string, number>();
  let artifactCount = 0;
  let acceptedSurfaceCount = 0;

  const artifactPaths: string[] = [];
  const seenArtifactPaths = new Set<string>();
  function addArtifactPaths(paths: string[]) {
    for (const path of paths) {
      if (seenArtifactPaths.has(path)) continue;
      seenArtifactPaths.add(path);
      artifactPaths.push(path);
    }
  }

  for (const root of sourceRoots) {
    addArtifactPaths(await findArtifactPaths(root));
  }
  for (const canonicalMergePath of sourceCanonicalMergePaths) {
    addArtifactPaths(await readCanonicalMergeArtifactPaths(canonicalMergePath));
  }

  for (const artifactPath of artifactPaths) {
    let artifact: unknown;
    try {
      artifact = await Bun.file(artifactPath).json();
    } catch {
      continue;
    }
    if (!isRecord(artifact)) continue;
    artifactCount += 1;
    const submitResult = isRecord(artifact["submitResult"]) ? artifact["submitResult"] : {};
    const accepted = Array.isArray(submitResult["accepted"]) ? submitResult["accepted"] : [];
    for (const acceptedItem of accepted) {
      if (!isRecord(acceptedItem) || !isRecord(acceptedItem["surface"])) continue;
      const surface = acceptedItem["surface"];
      const ref = surfaceRef({ artifactPath, artifact, surface });
      acceptedSurfaceCount += 1;
      increment(surfaceKindCounts, ref.surfaceKind);
      for (const key of GRADUATION_KEYS) {
        const counters = graduationCounters.get(key.id);
        if (counters === undefined) continue;
        for (const fieldPath of key.sourceFieldPaths) {
          for (const value of pathValues(surface, fieldPath)) {
            addValue({
              counters,
              value,
              sourceFieldPath: fieldPath,
              surface: ref,
              examplesPerValue,
            });
          }
        }
      }
      walkRawFields({
        root: surface["rawPayload"],
        prefix: "rawPayload",
        surface: ref,
        countersByPath: rawFieldCounters,
        examplesPerValue,
      });
    }
  }

  const graduationKeys = GRADUATION_KEYS.map((key) => {
    const counters = graduationCounters.get(key.id) ?? new Map<string, ValueCounter>();
    const values = [...counters.values()];
    const topValues = counterValues(counters, maxValuesPerKey);
    return {
      id: key.id,
      tier: key.tier,
      targetPayloadPath: key.targetPayloadPath,
      sourceFieldPaths: [...key.sourceFieldPaths],
      mode: key.mode,
      description: key.description,
      instanceCount: values.reduce((sum, value) => sum + value.count, 0),
      distinctValueCount: counters.size,
      repeatedDistinctValueCount: values.filter((value) => value.count >= 2).length,
      placeholderValueCount: values.filter((value) => isPlaceholder(value.value)).length,
      omittedValueCount: Math.max(0, counters.size - topValues.length),
      topValues,
      llmBatch: {
        keyId: key.id,
        targetPayloadPath: key.targetPayloadPath,
        instruction:
          "Cluster these raw values into a capped canonical taxonomy and alias map. Do not invent facts, routes, dates, geography IDs, metric numbers, or source evidence. Values outside the taxonomy should map to unresolved.",
        values: topValues,
      },
    } satisfies GraduationKeyStats;
  });

  const rawFieldInventory = [...rawFieldCounters.entries()]
    .map(([fieldPath, counters]) => {
      const classification = classifyRawField(fieldPath);
      const values = [...counters.values()];
      return {
        fieldPath,
        ...classification,
        instanceCount: values.reduce((sum, value) => sum + value.count, 0),
        distinctValueCount: counters.size,
        repeatedDistinctValueCount: values.filter((value) => value.count >= 2).length,
        topValues: counterValues(counters, 20),
      } satisfies RawFieldStats;
    })
    .sort(
      (left, right) =>
        right.distinctValueCount - left.distinctValueCount ||
        right.instanceCount - left.instanceCount ||
        left.fieldPath.localeCompare(right.fieldPath),
    );

  const dispositionCounts = rawFieldInventory.reduce(
    (counts, field) => {
      counts[field.disposition] += 1;
      return counts;
    },
    {
      llm_vocab_candidate: 0,
      deterministic_catalog_or_parser: 0,
      preserve_source_wording: 0,
      review_only: 0,
    } satisfies Record<RawFieldDisposition, number>,
  );

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    promptVersion: PROMPT_VERSION,
    sourceRoots,
    sourceCanonicalMergePaths,
    safetyPolicy: {
      rawPayloadMutationAllowed: false,
      projectionMode: "additive_canonical_payload",
      unresolvedBehavior: "preserve_raw_and_emit_unresolved",
      llmRuntimeUse: "design_time_only",
    },
    summary: {
      artifactCount,
      acceptedSurfaceCount,
      surfaceKindCounts: mapToRecord(surfaceKindCounts),
      graduationKeyCount: graduationKeys.length,
      coreGraduationKeyCount: graduationKeys.filter((key) => key.tier === "core").length,
      secondaryGraduationKeyCount: graduationKeys.filter((key) => key.tier === "secondary").length,
      rawFieldCount: rawFieldInventory.length,
      llmVocabularyCandidateFieldCount: dispositionCounts.llm_vocab_candidate,
      deterministicFieldCount: dispositionCounts.deterministic_catalog_or_parser,
      preserveRawFieldCount: dispositionCounts.preserve_source_wording,
      reviewOnlyFieldCount: dispositionCounts.review_only,
      totalGraduationInstances: graduationKeys.reduce((sum, key) => sum + key.instanceCount, 0),
      totalGraduationDistinctValues: graduationKeys.reduce(
        (sum, key) => sum + key.distinctValueCount,
        0,
      ),
    },
    graduationKeys,
    rawFieldInventory,
    projectionContract: {
      keep: [
        "rawPayload",
        "rawText",
        "displayLabel",
        "evidenceByField",
        "fieldSupportIds",
        "canonicalSelections",
      ],
      add: [
        "canonicalPayload.<graduated field>",
        "normalization.vocabVersion",
        "normalization.fieldMappings[]",
        "normalization.unresolvedFields[]",
      ],
      neverInferWithLlm: [
        "routeIds",
        "dates",
        "numeric values",
        "geography ids",
        "evidence handles",
        "field support paths",
      ],
    },
  };
}

export async function runTier2RawFieldGraduation(args: RunTier2RawFieldGraduationArgs): Promise<{
  plan: Tier2RawFieldGraduationPlan;
  outputPath: string;
  markdownPath: string;
  llmBatchOutputPath: string;
}> {
  const plan = await buildTier2RawFieldGraduationPlan(args);
  const sourceSignature = [
    ...plan.sourceRoots,
    ...plan.sourceCanonicalMergePaths.map((path) => `canonical:${path}`),
  ].join("|");
  const outputPath =
    args.outputPath ??
    join(
      defaultArtifactRootPath(),
      "docs",
      "tier2-raw-field-graduation",
      `raw-field-graduation-${shortHash(sourceSignature)}.json`,
    );
  const markdownPath = args.markdownPath ?? outputPath.replace(/\.json$/, ".md");
  const llmBatchOutputPath =
    args.llmBatchOutputPath ?? outputPath.replace(/\.json$/, "-llm-batches.json");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, plan);
  await Bun.write(
    markdownPath.endsWith(".md") ? markdownPath : markdownPath.replace(/\.json$/, ".md"),
    renderMarkdown(plan),
  );
  await writeJson(llmBatchOutputPath, buildLlmBatchArtifact({ plan, sourcePlanPath: outputPath }));
  return { plan, outputPath, markdownPath, llmBatchOutputPath };
}

function parseArgs(argv: string[]): CliArgs {
  const options: CliOption<CliArgs>[] = [
    {
      flags: ["--roots", "--input-roots"],
      apply: (output, value) => {
        if (value !== undefined)
          output.roots = value
            .split(",")
            .map((root) => root.trim())
            .filter((root) => root.length > 0);
      },
    },
    {
      flags: ["--canonical-merge"],
      apply: (output, value) => {
        if (value !== undefined) output.canonicalMergePath = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--markdown"],
      apply: (output, value) => {
        if (value !== undefined) output.markdownPath = fromCliPath(value);
      },
    },
    {
      flags: ["--llm-batch-output"],
      apply: (output, value) => {
        if (value !== undefined) output.llmBatchOutputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--generated-at"],
      apply: (output, value) => {
        if (value !== undefined) output.generatedAt = value;
      },
    },
    {
      flags: ["--max-values-per-key"],
      apply: (output, value) => {
        if (value !== undefined) output.maxValuesPerKey = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--examples-per-value"],
      apply: (output, value) => {
        if (value !== undefined) output.examplesPerValue = Number.parseInt(value, 10);
      },
    },
  ];
  return parseCliOptions(argv, {}, options);
}

export async function runTier2RawFieldGraduationFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (
    (args.roots === undefined || args.roots.length === 0) &&
    args.canonicalMergePath === undefined
  ) {
    throw new Error(
      "Provide --roots with one or more output roots, or --canonical-merge with a canonical merge JSON artifact.",
    );
  }
  const result = await runTier2RawFieldGraduation({
    ...(args.roots === undefined ? {} : { roots: args.roots }),
    ...(args.canonicalMergePath === undefined
      ? {}
      : { canonicalMergePath: args.canonicalMergePath }),
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.llmBatchOutputPath === undefined
      ? {}
      : { llmBatchOutputPath: args.llmBatchOutputPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    ...(args.maxValuesPerKey === undefined ? {} : { maxValuesPerKey: args.maxValuesPerKey }),
    ...(args.examplesPerValue === undefined ? {} : { examplesPerValue: args.examplesPerValue }),
  });
  const plan = result.plan;
  console.log(
    `tier2-raw-field-graduation: surfaces=${plan.summary.acceptedSurfaceCount} keys=${plan.summary.graduationKeyCount} rawFields=${plan.summary.rawFieldCount}`,
  );
  return {
    artifactKind: plan.artifactKind,
    schemaVersion: plan.schemaVersion,
    generatedAt: plan.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    llmBatchOutputPath: result.llmBatchOutputPath,
    summary: plan.summary,
  };
}
