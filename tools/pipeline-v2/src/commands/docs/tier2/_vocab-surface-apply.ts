import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";

const ARTIFACT_KIND = "bp.tier2_vocab_surface_application.v1";
const SUMMARY_KIND = "bp.tier2_vocab_surface_application_summary.v1";

type JsonRecord = Record<string, unknown>;

type CanonicalArtifactRef = {
  windowId: string | null;
  runId: string | null;
  shardId: string | null;
  sourceId: string | null;
  pageNumbers: number[];
  artifactPath: string;
  auditPath: string | null;
};

type GraduationKey = {
  id: string;
  tier: "core" | "secondary";
  targetPayloadPath: string;
  sourceFieldPaths: string[];
};

type GraduationPlanArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  graduationKeys: GraduationKey[];
};

type ProjectionDecision = "mapped" | "preserve_raw" | "unresolved";

type ProjectionRow = {
  keyId: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: ProjectionDecision;
  originalDecision: ProjectionDecision;
  canonicalLeafId: string | null;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  modifiers: Record<string, string[]>;
  evidenceProvenance: {
    inputCount: number;
    sourceFieldCounts: Record<string, number>;
    surfaceKindCounts: Record<string, number>;
    examples: unknown[];
  };
};

type ProjectionArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  sourceManifestPath: string;
  rowCount: number;
  rows: ProjectionRow[];
};

type FieldEvidence = {
  fieldSupportFound: boolean;
  supportIds: string[];
  evidencePointerIds: string[];
  verifierStates: string[];
  supportCompleteness: string[];
};

type FieldMapping = {
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: "mapped";
  originalDecision: ProjectionDecision;
  canonicalLeafId: string;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  modifiers: Record<string, string[]>;
  evidence: FieldEvidence;
  projectionEvidence: ProjectionRow["evidenceProvenance"];
};

type UnresolvedField = {
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: "preserve_raw" | "unresolved" | "missing_projection";
  originalDecision: ProjectionDecision | null;
  reason: string;
  coarseFamily: string | null;
  modifiers: Record<string, string[]> | null;
  evidence: FieldEvidence;
};

type TargetWrite = {
  targetPayloadPath: string;
  value: string | string[];
  writeState: "written" | "merged" | "already_present" | "conflict_existing_value";
  existingValue?: unknown;
};

type NormalizedAcceptedSurface = {
  artifactPath: string;
  auditPath: string | null;
  windowId: string | null;
  runId: string | null;
  shardId: string | null;
  sourceId: string | null;
  pageNumbers: number[];
  draftIndex: number | null;
  surface: JsonRecord;
  fieldSupport: unknown[];
  evidencePointers: unknown[];
  acceptedCanonicalFields: unknown[];
  warnings: string[];
};

type SurfaceApplicationSummary = {
  canonicalArtifactCount: number;
  acceptedSurfaceCount: number;
  surfacesWithGraduatedFields: number;
  surfacesWithMappedFields: number;
  surfacesWithUnresolvedFields: number;
  graduationKeyCount: number;
  projectionRowCount: number;
  fieldInstanceCount: number;
  mappedFieldCount: number;
  preserveRawFieldCount: number;
  unresolvedFieldCount: number;
  missingProjectionFieldCount: number;
  targetWriteCount: number;
  targetMergeCount: number;
  targetConflictCount: number;
  fieldSupportFoundCount: number;
  fieldSupportMissingCount: number;
  surfaceKindCounts: Record<string, number>;
  mappedByKey: Record<string, number>;
  unresolvedByKey: Record<string, number>;
  targetWritesByPath: Record<string, number>;
};

export type Tier2VocabSurfaceApplicationArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceCanonicalMergePath: string;
  sourceGraduationPlanPath: string;
  sourceProjectionPath: string;
  sourceProjectionManifestPath: string;
  safetyPolicy: {
    rawPayloadMutationAllowed: false;
    canonicalPayloadMode: "additive_from_vocab_projection";
    unresolvedBehavior: "preserve_raw_and_emit_unresolved";
    llmRuntimeUse: "none";
  };
  summary: SurfaceApplicationSummary;
  normalizedAcceptedSurfaces: NormalizedAcceptedSurface[];
};

export type BuildTier2VocabSurfaceApplicationArgs = {
  canonicalMergePath: string;
  graduationPlanPath: string;
  projectionPath: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
};

type CliArgs = Partial<BuildTier2VocabSurfaceApplicationArgs>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "number" && Number.isFinite(item) ? [item] : []))
    : [];
}

function deepClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function normalizePrimitive(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    return null;
  }
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized.length === 0 ? null : normalized;
}

function primitiveValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => primitiveValues(item));
  const normalized = normalizePrimitive(value);
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

function getPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const part of path.split(".")) {
    if (!isRecord(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function setPath(root: JsonRecord, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = root;
  for (const part of parts.slice(0, -1)) {
    if (!isRecord(cursor[part])) cursor[part] = {};
    cursor = cursor[part] as JsonRecord;
  }
  cursor[parts[parts.length - 1] ?? ""] = value;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function projectionIndexKey(keyId: string, rawValue: string): string {
  return `${keyId}\u0000${rawValue}`;
}

function readCanonicalArtifactRefs(raw: unknown, path: string): CanonicalArtifactRef[] {
  if (!isRecord(raw)) throw new Error(`Canonical merge artifact is not an object: ${path}`);
  const canonicalArtifacts = Array.isArray(raw["canonicalArtifacts"])
    ? raw["canonicalArtifacts"]
    : [];
  const refs: CanonicalArtifactRef[] = [];
  const seen = new Set<string>();
  for (const item of canonicalArtifacts) {
    if (!isRecord(item)) continue;
    const artifactPath = stringValue(item["artifactPath"]);
    if (artifactPath === null || seen.has(artifactPath)) continue;
    seen.add(artifactPath);
    refs.push({
      windowId: stringValue(item["windowId"]),
      runId: stringValue(item["runId"]),
      shardId: stringValue(item["shardId"]),
      sourceId: stringValue(item["sourceId"]),
      pageNumbers: numberArray(item["pageNumbers"]),
      artifactPath: fromCliPath(artifactPath),
      auditPath: stringValue(item["auditPath"]),
    });
  }
  if (refs.length === 0) {
    throw new Error(
      `Canonical merge artifact has no canonicalArtifacts[].artifactPath entries: ${path}`,
    );
  }
  return refs;
}

function buildProjectionIndex(projection: ProjectionArtifact): Map<string, ProjectionRow> {
  const index = new Map<string, ProjectionRow>();
  for (const row of projection.rows) {
    const key = projectionIndexKey(row.keyId, row.rawValue);
    if (index.has(key)) {
      throw new Error(`Duplicate vocab projection row for ${row.keyId}: ${row.rawValue}`);
    }
    index.set(key, row);
  }
  return index;
}

function supportForField(acceptedItem: JsonRecord, fieldPath: string): FieldEvidence {
  const fieldSupport = Array.isArray(acceptedItem["fieldSupport"])
    ? acceptedItem["fieldSupport"]
    : [];
  const rows = fieldSupport.filter(
    (item): item is JsonRecord => isRecord(item) && item["fieldPath"] === fieldPath,
  );
  const evidencePointerIds = rows.flatMap((row) =>
    Array.isArray(row["evidencePointers"])
      ? row["evidencePointers"].flatMap((item) => (typeof item === "string" ? [item] : []))
      : [],
  );
  return {
    fieldSupportFound: rows.length > 0,
    supportIds: uniqueSorted(rows.flatMap((row) => stringValue(row["supportId"]) ?? [])),
    evidencePointerIds: uniqueSorted(evidencePointerIds),
    verifierStates: uniqueSorted(rows.flatMap((row) => stringValue(row["verifierState"]) ?? [])),
    supportCompleteness: uniqueSorted(
      rows.flatMap((row) => stringValue(row["supportCompleteness"]) ?? []),
    ),
  };
}

function shouldWriteArray(targetPayloadPath: string, values: string[], existing: unknown): boolean {
  const leaf = targetPayloadPath.split(".").at(-1) ?? "";
  return Array.isArray(existing) || values.length > 1 || /s$|tags|ids|families|kinds/i.test(leaf);
}

function mergeExistingArray(existing: unknown, additions: string[]): string[] {
  const existingValues = Array.isArray(existing)
    ? existing.flatMap((item) => (typeof item === "string" ? [item] : []))
    : typeof existing === "string"
      ? [existing]
      : [];
  return uniqueSorted([...existingValues, ...additions]);
}

function applyTargetWrites(input: {
  canonicalPayload: JsonRecord;
  targetValues: Map<string, string[]>;
}): { targetWrites: TargetWrite[]; warnings: string[] } {
  const targetWrites: TargetWrite[] = [];
  const warnings: string[] = [];
  for (const [targetPayloadPath, rawValues] of [...input.targetValues.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const values = uniqueSorted(rawValues);
    const canonicalPath = targetPayloadPath.replace(/^canonicalPayload\./, "");
    const existing = getPath(input.canonicalPayload, canonicalPath);
    const writeArray = shouldWriteArray(targetPayloadPath, values, existing);
    if (existing === undefined) {
      const value = writeArray ? values : (values[0] ?? null);
      setPath(input.canonicalPayload, canonicalPath, value);
      targetWrites.push({
        targetPayloadPath,
        value: value as string | string[],
        writeState: "written",
      });
      continue;
    }
    if (Array.isArray(existing)) {
      const merged = mergeExistingArray(existing, values);
      const before = JSON.stringify(existing);
      const after = JSON.stringify(merged);
      if (before === after) {
        targetWrites.push({
          targetPayloadPath,
          value: merged,
          writeState: "already_present",
          existingValue: existing,
        });
      } else {
        setPath(input.canonicalPayload, canonicalPath, merged);
        targetWrites.push({
          targetPayloadPath,
          value: merged,
          writeState: "merged",
          existingValue: existing,
        });
      }
      continue;
    }
    if (typeof existing === "string" && values.length === 1 && existing === values[0]) {
      targetWrites.push({
        targetPayloadPath,
        value: existing,
        writeState: "already_present",
        existingValue: existing,
      });
      continue;
    }
    warnings.push(`Existing canonical value at ${targetPayloadPath} was not overwritten.`);
    targetWrites.push({
      targetPayloadPath,
      value: writeArray ? values : (values[0] ?? ""),
      writeState: "conflict_existing_value",
      existingValue: existing,
    });
  }
  return { targetWrites, warnings };
}

function normalizeAcceptedSurface(input: {
  acceptedItem: JsonRecord;
  artifactRef: CanonicalArtifactRef;
  graduationKeys: GraduationKey[];
  projectionIndex: Map<string, ProjectionRow>;
  vocabVersion: JsonRecord;
}): {
  item: NormalizedAcceptedSurface | null;
  summary: Omit<
    SurfaceApplicationSummary,
    "canonicalArtifactCount" | "acceptedSurfaceCount" | "graduationKeyCount" | "projectionRowCount"
  >;
} {
  if (!isRecord(input.acceptedItem["surface"])) {
    return {
      item: null,
      summary: emptyPartialSummary(),
    };
  }

  const sourceSurface = input.acceptedItem["surface"];
  const outputSurface = deepClone(sourceSurface);
  const canonicalPayload = isRecord(outputSurface["canonicalPayload"])
    ? (deepClone(outputSurface["canonicalPayload"]) as JsonRecord)
    : {};
  const fieldMappings: FieldMapping[] = [];
  const unresolvedFields: UnresolvedField[] = [];
  const targetValues = new Map<string, string[]>();
  const summary = emptyPartialSummary();
  const surfaceKind = stringValue(sourceSurface["surfaceKind"]) ?? "unknown";
  increment(summary.surfaceKindCounts, surfaceKind);

  for (const key of input.graduationKeys) {
    for (const sourceFieldPath of key.sourceFieldPaths) {
      for (const rawValue of pathValues(sourceSurface, sourceFieldPath)) {
        summary.fieldInstanceCount += 1;
        const evidence = supportForField(input.acceptedItem, sourceFieldPath);
        if (evidence.fieldSupportFound) summary.fieldSupportFoundCount += 1;
        else summary.fieldSupportMissingCount += 1;

        const projectionRow = input.projectionIndex.get(projectionIndexKey(key.id, rawValue));
        if (
          projectionRow !== undefined &&
          projectionRow.decision === "mapped" &&
          projectionRow.canonicalLeafId !== null
        ) {
          const values = targetValues.get(key.targetPayloadPath) ?? [];
          values.push(projectionRow.canonicalLeafId);
          targetValues.set(key.targetPayloadPath, values);
          fieldMappings.push({
            keyId: key.id,
            sourceFieldPath,
            targetPayloadPath: key.targetPayloadPath,
            rawValue,
            decision: "mapped",
            originalDecision: projectionRow.originalDecision,
            canonicalLeafId: projectionRow.canonicalLeafId,
            canonicalLeafLabel: projectionRow.canonicalLeafLabel,
            coarseFamily: projectionRow.coarseFamily,
            modifiers: projectionRow.modifiers,
            evidence,
            projectionEvidence: projectionRow.evidenceProvenance,
          });
          summary.mappedFieldCount += 1;
          increment(summary.mappedByKey, key.id);
          continue;
        }

        const decision: UnresolvedField["decision"] =
          projectionRow === undefined
            ? "missing_projection"
            : projectionRow.decision === "preserve_raw"
              ? "preserve_raw"
              : "unresolved";
        unresolvedFields.push({
          keyId: key.id,
          sourceFieldPath,
          targetPayloadPath: key.targetPayloadPath,
          rawValue,
          decision,
          originalDecision: projectionRow?.originalDecision ?? null,
          reason:
            projectionRow === undefined
              ? "No alias-level projection row matched this keyId/rawValue."
              : projectionRow.decision === "preserve_raw"
                ? "Projection preserves this raw value rather than collapsing it to a canonical leaf."
                : projectionRow.decision === "mapped"
                  ? "Projection mapped this raw value but did not provide a canonical leaf id."
                  : "Projection marks this raw value unresolved.",
          coarseFamily: projectionRow?.coarseFamily ?? null,
          modifiers: projectionRow?.modifiers ?? null,
          evidence,
        });
        if (decision === "preserve_raw") summary.preserveRawFieldCount += 1;
        else if (decision === "unresolved") summary.unresolvedFieldCount += 1;
        else summary.missingProjectionFieldCount += 1;
        increment(summary.unresolvedByKey, key.id);
      }
    }
  }

  const { targetWrites, warnings } = applyTargetWrites({ canonicalPayload, targetValues });
  for (const write of targetWrites) {
    if (write.writeState === "written") summary.targetWriteCount += 1;
    else if (write.writeState === "merged") summary.targetMergeCount += 1;
    else if (write.writeState === "conflict_existing_value") summary.targetConflictCount += 1;
    if (write.writeState !== "conflict_existing_value") {
      increment(summary.targetWritesByPath, write.targetPayloadPath);
    }
  }

  outputSurface["canonicalPayload"] = canonicalPayload;
  outputSurface["normalization"] = {
    ...(isRecord(outputSurface["normalization"]) ? outputSurface["normalization"] : {}),
    vocabVersion: input.vocabVersion,
    fieldMappings,
    unresolvedFields,
    targetWrites,
  };

  const allWarnings = [
    ...warnings,
    ...(Array.isArray(input.acceptedItem["warnings"]) ? input.acceptedItem["warnings"] : []),
  ];

  return {
    item: {
      artifactPath: input.artifactRef.artifactPath,
      auditPath: input.artifactRef.auditPath,
      windowId: input.artifactRef.windowId,
      runId: input.artifactRef.runId,
      shardId: input.artifactRef.shardId,
      sourceId: input.artifactRef.sourceId,
      pageNumbers: input.artifactRef.pageNumbers,
      draftIndex:
        typeof input.acceptedItem["draftIndex"] === "number"
          ? input.acceptedItem["draftIndex"]
          : null,
      surface: outputSurface,
      fieldSupport: Array.isArray(input.acceptedItem["fieldSupport"])
        ? input.acceptedItem["fieldSupport"]
        : [],
      evidencePointers: Array.isArray(input.acceptedItem["evidencePointers"])
        ? input.acceptedItem["evidencePointers"]
        : [],
      acceptedCanonicalFields: Array.isArray(input.acceptedItem["acceptedCanonicalFields"])
        ? input.acceptedItem["acceptedCanonicalFields"]
        : [],
      warnings: allWarnings,
    },
    summary,
  };
}

function emptyPartialSummary(): Omit<
  SurfaceApplicationSummary,
  "canonicalArtifactCount" | "acceptedSurfaceCount" | "graduationKeyCount" | "projectionRowCount"
> {
  return {
    surfacesWithGraduatedFields: 0,
    surfacesWithMappedFields: 0,
    surfacesWithUnresolvedFields: 0,
    fieldInstanceCount: 0,
    mappedFieldCount: 0,
    preserveRawFieldCount: 0,
    unresolvedFieldCount: 0,
    missingProjectionFieldCount: 0,
    targetWriteCount: 0,
    targetMergeCount: 0,
    targetConflictCount: 0,
    fieldSupportFoundCount: 0,
    fieldSupportMissingCount: 0,
    surfaceKindCounts: {},
    mappedByKey: {},
    unresolvedByKey: {},
    targetWritesByPath: {},
  };
}

function mergeSummary(
  target: ReturnType<typeof emptyPartialSummary>,
  source: ReturnType<typeof emptyPartialSummary>,
) {
  target.surfacesWithGraduatedFields += source.surfacesWithGraduatedFields;
  target.surfacesWithMappedFields += source.surfacesWithMappedFields;
  target.surfacesWithUnresolvedFields += source.surfacesWithUnresolvedFields;
  target.fieldInstanceCount += source.fieldInstanceCount;
  target.mappedFieldCount += source.mappedFieldCount;
  target.preserveRawFieldCount += source.preserveRawFieldCount;
  target.unresolvedFieldCount += source.unresolvedFieldCount;
  target.missingProjectionFieldCount += source.missingProjectionFieldCount;
  target.targetWriteCount += source.targetWriteCount;
  target.targetMergeCount += source.targetMergeCount;
  target.targetConflictCount += source.targetConflictCount;
  target.fieldSupportFoundCount += source.fieldSupportFoundCount;
  target.fieldSupportMissingCount += source.fieldSupportMissingCount;
  for (const [key, count] of Object.entries(source.surfaceKindCounts))
    increment(target.surfaceKindCounts, key, count);
  for (const [key, count] of Object.entries(source.mappedByKey))
    increment(target.mappedByKey, key, count);
  for (const [key, count] of Object.entries(source.unresolvedByKey))
    increment(target.unresolvedByKey, key, count);
  for (const [key, count] of Object.entries(source.targetWritesByPath))
    increment(target.targetWritesByPath, key, count);
}

function finalizeRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function renderMarkdown(artifact: Tier2VocabSurfaceApplicationArtifact): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Vocab Surface Application");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Canonical artifacts: ${artifact.summary.canonicalArtifactCount}`);
  lines.push(`- Accepted surfaces: ${artifact.summary.acceptedSurfaceCount}`);
  lines.push(`- Surfaces with graduated fields: ${artifact.summary.surfacesWithGraduatedFields}`);
  lines.push(`- Surfaces with mapped fields: ${artifact.summary.surfacesWithMappedFields}`);
  lines.push(`- Surfaces with unresolved fields: ${artifact.summary.surfacesWithUnresolvedFields}`);
  lines.push(`- Field instances: ${artifact.summary.fieldInstanceCount}`);
  lines.push(`- Mapped fields: ${artifact.summary.mappedFieldCount}`);
  lines.push(`- Preserve raw fields: ${artifact.summary.preserveRawFieldCount}`);
  lines.push(`- Unresolved fields: ${artifact.summary.unresolvedFieldCount}`);
  lines.push(`- Missing projection fields: ${artifact.summary.missingProjectionFieldCount}`);
  lines.push(`- Target writes: ${artifact.summary.targetWriteCount}`);
  lines.push(`- Target merges: ${artifact.summary.targetMergeCount}`);
  lines.push(`- Target conflicts: ${artifact.summary.targetConflictCount}`);
  lines.push(`- Field support found: ${artifact.summary.fieldSupportFoundCount}`);
  lines.push(`- Field support missing: ${artifact.summary.fieldSupportMissingCount}`);
  lines.push("");
  lines.push("## Mapped By Key");
  lines.push("");
  lines.push("| Key | Count |");
  lines.push("|---|---:|");
  for (const [key, count] of Object.entries(artifact.summary.mappedByKey)) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push("");
  lines.push("## Unresolved By Key");
  lines.push("");
  lines.push("| Key | Count |");
  lines.push("|---|---:|");
  for (const [key, count] of Object.entries(artifact.summary.unresolvedByKey)) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- `rawPayload` is preserved on every surface.");
  lines.push("- `canonicalPayload` is populated only from deterministic vocab projection rows.");
  lines.push(
    "- `normalization.fieldMappings[]` records the exact source field, raw value, canonical leaf, coarse family, modifiers, and evidence support.",
  );
  lines.push(
    "- `normalization.unresolvedFields[]` keeps preserve-raw, unresolved, and missing-projection values for review.",
  );
  return `${lines.join("\n")}\n`;
}

export async function buildTier2VocabSurfaceApplication(
  args: BuildTier2VocabSurfaceApplicationArgs,
): Promise<Tier2VocabSurfaceApplicationArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceCanonicalMergePath = fromCliPath(args.canonicalMergePath);
  const sourceGraduationPlanPath = fromCliPath(args.graduationPlanPath);
  const sourceProjectionPath = fromCliPath(args.projectionPath);
  const canonicalMerge = await Bun.file(sourceCanonicalMergePath).json();
  const graduationPlan = (await Bun.file(
    sourceGraduationPlanPath,
  ).json()) as GraduationPlanArtifact;
  const projection = (await Bun.file(sourceProjectionPath).json()) as ProjectionArtifact;
  if (!Array.isArray(graduationPlan.graduationKeys)) {
    throw new Error(`Graduation plan has no graduationKeys array: ${sourceGraduationPlanPath}`);
  }
  if (!Array.isArray(projection.rows)) {
    throw new Error(`Projection artifact has no rows array: ${sourceProjectionPath}`);
  }

  const artifactRefs = readCanonicalArtifactRefs(canonicalMerge, sourceCanonicalMergePath);
  const projectionIndex = buildProjectionIndex(projection);
  const normalizedAcceptedSurfaces: NormalizedAcceptedSurface[] = [];
  const partialSummary = emptyPartialSummary();
  const vocabVersion = {
    projectionArtifactKind: projection.artifactKind,
    projectionSchemaVersion: projection.schemaVersion,
    projectionGeneratedAt: projection.generatedAt,
    projectionPath: sourceProjectionPath,
    sourceManifestPath: projection.sourceManifestPath,
  };

  for (const artifactRef of artifactRefs) {
    let rawArtifact: unknown;
    try {
      rawArtifact = await Bun.file(artifactRef.artifactPath).json();
    } catch {
      continue;
    }
    if (!isRecord(rawArtifact)) continue;
    const submitResult = isRecord(rawArtifact["submitResult"]) ? rawArtifact["submitResult"] : {};
    const accepted = Array.isArray(submitResult["accepted"]) ? submitResult["accepted"] : [];
    for (const acceptedItem of accepted) {
      if (!isRecord(acceptedItem)) continue;
      const normalized = normalizeAcceptedSurface({
        acceptedItem,
        artifactRef,
        graduationKeys: graduationPlan.graduationKeys,
        projectionIndex,
        vocabVersion,
      });
      if (normalized.item === null) continue;
      if (normalized.summary.fieldInstanceCount > 0) {
        normalized.summary.surfacesWithGraduatedFields = 1;
      }
      if (normalized.summary.mappedFieldCount > 0) {
        normalized.summary.surfacesWithMappedFields = 1;
      }
      if (
        normalized.summary.preserveRawFieldCount +
          normalized.summary.unresolvedFieldCount +
          normalized.summary.missingProjectionFieldCount >
        0
      ) {
        normalized.summary.surfacesWithUnresolvedFields = 1;
      }
      mergeSummary(partialSummary, normalized.summary);
      normalizedAcceptedSurfaces.push(normalized.item);
    }
  }

  const summary: SurfaceApplicationSummary = {
    canonicalArtifactCount: artifactRefs.length,
    acceptedSurfaceCount: normalizedAcceptedSurfaces.length,
    graduationKeyCount: graduationPlan.graduationKeys.length,
    projectionRowCount: projection.rows.length,
    ...partialSummary,
    surfaceKindCounts: finalizeRecord(partialSummary.surfaceKindCounts),
    mappedByKey: finalizeRecord(partialSummary.mappedByKey),
    unresolvedByKey: finalizeRecord(partialSummary.unresolvedByKey),
    targetWritesByPath: finalizeRecord(partialSummary.targetWritesByPath),
  };

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceCanonicalMergePath,
    sourceGraduationPlanPath,
    sourceProjectionPath,
    sourceProjectionManifestPath: projection.sourceManifestPath,
    safetyPolicy: {
      rawPayloadMutationAllowed: false,
      canonicalPayloadMode: "additive_from_vocab_projection",
      unresolvedBehavior: "preserve_raw_and_emit_unresolved",
      llmRuntimeUse: "none",
    },
    summary,
    normalizedAcceptedSurfaces,
  };
}

export async function runTier2VocabSurfaceApplication(
  args: BuildTier2VocabSurfaceApplicationArgs,
): Promise<{
  artifact: Tier2VocabSurfaceApplicationArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2VocabSurfaceApplication(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(
        defaultArtifactRootPath(),
        "docs",
        "tier2-vocab-surface-application",
        "vocab-surface-application.json",
      ),
  );
  const markdownPath =
    args.markdownPath === undefined
      ? outputPath.replace(/\.json$/, ".md")
      : fromCliPath(args.markdownPath);
  const summaryPath =
    args.summaryPath === undefined
      ? outputPath.replace(/\.json$/, "-summary.json")
      : fromCliPath(args.summaryPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, artifact);
  await Bun.write(markdownPath, renderMarkdown(artifact));
  await writeJson(summaryPath, {
    artifactKind: SUMMARY_KIND,
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    sourceArtifactPath: outputPath,
    summary: artifact.summary,
  });
  return { artifact, outputPath, markdownPath, summaryPath };
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--canonical-merge") {
      if (value === undefined) throw new Error("--canonical-merge requires a value.");
      args.canonicalMergePath = value;
      index += 1;
    } else if (arg === "--graduation-plan") {
      if (value === undefined) throw new Error("--graduation-plan requires a value.");
      args.graduationPlanPath = value;
      index += 1;
    } else if (arg === "--projection") {
      if (value === undefined) throw new Error("--projection requires a value.");
      args.projectionPath = value;
      index += 1;
    } else if (arg === "--output") {
      if (value === undefined) throw new Error("--output requires a value.");
      args.outputPath = value;
      index += 1;
    } else if (arg === "--markdown") {
      if (value === undefined) throw new Error("--markdown requires a value.");
      args.markdownPath = value;
      index += 1;
    } else if (arg === "--summary") {
      if (value === undefined) throw new Error("--summary requires a value.");
      args.summaryPath = value;
      index += 1;
    } else if (arg === "--generated-at") {
      if (value === undefined) throw new Error("--generated-at requires a value.");
      args.generatedAt = value;
      index += 1;
    } else {
      throw new Error(`Unknown docs tier2 vocab-surface-apply option: ${arg}`);
    }
  }
  return args;
}

export async function runTier2VocabSurfaceApplicationFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.canonicalMergePath === undefined) throw new Error("Provide --canonical-merge.");
  if (args.graduationPlanPath === undefined) throw new Error("Provide --graduation-plan.");
  if (args.projectionPath === undefined) throw new Error("Provide --projection.");
  const result = await runTier2VocabSurfaceApplication({
    canonicalMergePath: args.canonicalMergePath,
    graduationPlanPath: args.graduationPlanPath,
    projectionPath: args.projectionPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `tier2-vocab-surface-apply: surfaces=${result.artifact.summary.acceptedSurfaceCount} mapped=${result.artifact.summary.mappedFieldCount} unresolved=${result.artifact.summary.preserveRawFieldCount + result.artifact.summary.unresolvedFieldCount + result.artifact.summary.missingProjectionFieldCount}`,
  );
  return {
    artifactKind: result.artifact.artifactKind,
    schemaVersion: result.artifact.schemaVersion,
    generatedAt: result.artifact.generatedAt,
    outputPath: result.outputPath,
    markdownPath: result.markdownPath,
    summaryPath: result.summaryPath,
    summary: result.artifact.summary,
  };
}
