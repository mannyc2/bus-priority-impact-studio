import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";

const ARTIFACT_KIND = "bp.tier2_vocab_consumer_index.v1";
const SUMMARY_KIND = "bp.tier2_vocab_consumer_index_summary.v1";

type JsonRecord = Record<string, unknown>;

type CompactEvidenceRef = {
  fieldSupportFound: boolean;
  supportIds: string[];
  evidencePointerIds: string[];
};

type CompactFieldRow = {
  surfaceId: string;
  sourceId: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  surfaceKind: string;
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  canonicalLeafId: string;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  modifiers: Record<string, string[]>;
  evidence: CompactEvidenceRef;
  projectionInputCount: number;
};

type CompactUnresolvedRow = {
  surfaceId: string;
  sourceId: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  surfaceKind: string;
  keyId: string;
  sourceFieldPath: string;
  targetPayloadPath: string;
  rawValue: string;
  decision: string;
  reason: string;
  coarseFamily: string | null;
  modifiers: Record<string, string[]> | null;
  evidence: CompactEvidenceRef;
};

type CompactSurfaceRow = {
  surfaceId: string;
  surfaceKind: string;
  sourceId: string | null;
  sourceTitle: string | null;
  sourceGroup: string | null;
  pageNumbers: number[];
  sourceInvestigationId: string | null;
  runId: string | null;
  shardId: string | null;
  windowId: string | null;
  draftIndex: number | null;
  artifactPath: string;
  auditPath: string | null;
  payloadSchemaId: string | null;
  displayLabel: string | null;
  rawText: string | null;
  canonicalPayload: JsonRecord;
  lifecycle: JsonRecord | null;
  intendedUses: string[];
  confidence: JsonRecord | null;
  routeIds: string[];
  coarseFamilies: string[];
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  evidencePointerIds: string[];
};

type CompactSourceRow = {
  sourceId: string;
  sourceTitle: string | null;
  sourceGroup: string | null;
  surfaceCount: number;
  mappedFieldCount: number;
  unresolvedFieldCount: number;
  pageNumbers: number[];
  surfaceKindCounts: Record<string, number>;
};

type VocabSurfaceApplicationArtifact = {
  artifactKind: string;
  schemaVersion: number;
  generatedAt: string;
  sourceProjectionPath: string;
  summary: JsonRecord;
  normalizedAcceptedSurfaces: Array<{
    artifactPath: string;
    auditPath: string | null;
    windowId: string | null;
    runId: string | null;
    shardId: string | null;
    sourceId: string | null;
    pageNumbers: number[];
    draftIndex: number | null;
    surface: JsonRecord;
  }>;
};

export type Tier2VocabConsumerIndexArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceSurfaceApplicationPath: string;
  sourceSurfaceApplicationGeneratedAt: string;
  sourceProjectionPath: string;
  summary: {
    surfaceRowCount: number;
    fieldRowCount: number;
    unresolvedRowCount: number;
    sourceRowCount: number;
    surfacesWithMappedFields: number;
    surfacesWithUnresolvedFields: number;
    surfacesWithRouteIds: number;
    sourceSurfaceApplicationSummary: JsonRecord;
    surfaceKindCounts: Record<string, number>;
    mappedByKey: Record<string, number>;
    unresolvedByKey: Record<string, number>;
    fieldRowsByCoarseFamily: Record<string, number>;
    unresolvedRowsByDecision: Record<string, number>;
  };
  surfaceRows: CompactSurfaceRow[];
  fieldRows: CompactFieldRow[];
  unresolvedRows: CompactUnresolvedRow[];
  sourceRows: CompactSourceRow[];
};

export type BuildTier2VocabConsumerIndexArgs = {
  surfaceApplicationPath: string;
  outputPath?: string;
  markdownPath?: string;
  summaryPath?: string;
  generatedAt?: string;
};

type CliArgs = Partial<BuildTier2VocabConsumerIndexArgs>;

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.length > 0 ? [item] : []))
    : [];
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function finalizeRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function compactEvidence(input: unknown): CompactEvidenceRef {
  const evidence = isRecord(input) ? input : {};
  return {
    fieldSupportFound: evidence["fieldSupportFound"] === true,
    supportIds: uniqueSorted(stringArray(evidence["supportIds"])),
    evidencePointerIds: uniqueSorted(stringArray(evidence["evidencePointerIds"])),
  };
}

function modifierValues(modifiers: unknown, key: string): string[] {
  return isRecord(modifiers) ? stringArray(modifiers[key]) : [];
}

function compactModifiers(modifiers: unknown): Record<string, string[]> {
  return {
    routeIds: modifierValues(modifiers, "routeIds"),
    directions: modifierValues(modifiers, "directions"),
    periods: modifierValues(modifiers, "periods"),
    geographies: modifierValues(modifiers, "geographies"),
    modes: modifierValues(modifiers, "modes"),
  };
}

function projectionInputCount(mapping: JsonRecord): number {
  const projectionEvidence = isRecord(mapping["projectionEvidence"])
    ? mapping["projectionEvidence"]
    : {};
  const inputCount = projectionEvidence["inputCount"];
  return typeof inputCount === "number" && Number.isFinite(inputCount) ? inputCount : 0;
}

function pageNumbersFor(item: { pageNumbers?: unknown; surface: JsonRecord }): number[] {
  const fromSurface = numberArray(item.surface["pageNumbers"]);
  if (fromSurface.length > 0) return fromSurface;
  return numberArray(item.pageNumbers);
}

function evidencePointerIdsFromRows(rows: Array<{ evidence: CompactEvidenceRef }>): string[] {
  return uniqueSorted(rows.flatMap((row) => row.evidence.evidencePointerIds));
}

function sourceKey(sourceId: string | null): string {
  return sourceId ?? "unknown_source";
}

function buildCompactIndex(input: {
  application: VocabSurfaceApplicationArtifact;
  sourceSurfaceApplicationPath: string;
  generatedAt: string;
}): Tier2VocabConsumerIndexArtifact {
  const surfaceRows: CompactSurfaceRow[] = [];
  const fieldRows: CompactFieldRow[] = [];
  const unresolvedRows: CompactUnresolvedRow[] = [];
  const sourceAccumulator = new Map<
    string,
    {
      sourceId: string;
      sourceTitle: string | null;
      sourceGroup: string | null;
      surfaceCount: number;
      mappedFieldCount: number;
      unresolvedFieldCount: number;
      pageNumbers: Set<number>;
      surfaceKindCounts: Record<string, number>;
    }
  >();
  const surfaceKindCounts: Record<string, number> = {};
  const mappedByKey: Record<string, number> = {};
  const unresolvedByKey: Record<string, number> = {};
  const fieldRowsByCoarseFamily: Record<string, number> = {};
  const unresolvedRowsByDecision: Record<string, number> = {};
  let surfacesWithMappedFields = 0;
  let surfacesWithUnresolvedFields = 0;
  let surfacesWithRouteIds = 0;

  for (const item of input.application.normalizedAcceptedSurfaces) {
    const surface = item.surface;
    const normalization = isRecord(surface["normalization"]) ? surface["normalization"] : {};
    const mappings = Array.isArray(normalization["fieldMappings"])
      ? normalization["fieldMappings"].filter(isRecord)
      : [];
    const unresolved = Array.isArray(normalization["unresolvedFields"])
      ? normalization["unresolvedFields"].filter(isRecord)
      : [];
    const surfaceId = stringValue(surface["surfaceId"]) ?? "unknown_surface";
    const surfaceKind = stringValue(surface["surfaceKind"]) ?? "unknown";
    const sourceId = stringValue(surface["sourceId"]) ?? item.sourceId ?? null;
    const sourceGroup = stringValue(surface["sourceGroup"]);
    const pageNumbers = pageNumbersFor({ pageNumbers: item.pageNumbers, surface });
    const mappedRowsForSurface: CompactFieldRow[] = [];
    const unresolvedRowsForSurface: CompactUnresolvedRow[] = [];

    for (const mapping of mappings) {
      const keyId = stringValue(mapping["keyId"]) ?? "unknown";
      const coarseFamily = stringValue(mapping["coarseFamily"]) ?? "other";
      const modifiers = compactModifiers(mapping["modifiers"]);
      const row: CompactFieldRow = {
        surfaceId,
        sourceId,
        sourceGroup,
        pageNumbers,
        surfaceKind,
        keyId,
        sourceFieldPath: stringValue(mapping["sourceFieldPath"]) ?? "",
        targetPayloadPath: stringValue(mapping["targetPayloadPath"]) ?? "",
        rawValue: stringValue(mapping["rawValue"]) ?? "",
        canonicalLeafId: stringValue(mapping["canonicalLeafId"]) ?? "",
        canonicalLeafLabel: stringValue(mapping["canonicalLeafLabel"]),
        coarseFamily,
        modifiers,
        evidence: compactEvidence(mapping["evidence"]),
        projectionInputCount: projectionInputCount(mapping),
      };
      mappedRowsForSurface.push(row);
      fieldRows.push(row);
      increment(mappedByKey, keyId);
      increment(fieldRowsByCoarseFamily, coarseFamily);
    }

    for (const field of unresolved) {
      const keyId = stringValue(field["keyId"]) ?? "unknown";
      const decision = stringValue(field["decision"]) ?? "unknown";
      const row: CompactUnresolvedRow = {
        surfaceId,
        sourceId,
        sourceGroup,
        pageNumbers,
        surfaceKind,
        keyId,
        sourceFieldPath: stringValue(field["sourceFieldPath"]) ?? "",
        targetPayloadPath: stringValue(field["targetPayloadPath"]) ?? "",
        rawValue: stringValue(field["rawValue"]) ?? "",
        decision,
        reason: stringValue(field["reason"]) ?? "",
        coarseFamily: stringValue(field["coarseFamily"]),
        modifiers: isRecord(field["modifiers"]) ? compactModifiers(field["modifiers"]) : null,
        evidence: compactEvidence(field["evidence"]),
      };
      unresolvedRowsForSurface.push(row);
      unresolvedRows.push(row);
      increment(unresolvedByKey, keyId);
      increment(unresolvedRowsByDecision, decision);
    }

    const canonicalPayload = isRecord(surface["canonicalPayload"])
      ? (surface["canonicalPayload"] as JsonRecord)
      : {};
    const routeIds = uniqueSorted([
      ...stringArray(canonicalPayload["routeIds"]),
      ...mappedRowsForSurface.flatMap((row) => row.modifiers["routeIds"] ?? []),
      ...unresolvedRowsForSurface.flatMap((row) => row.modifiers?.["routeIds"] ?? []),
    ]);
    const coarseFamilies = uniqueSorted([
      ...mappedRowsForSurface.map((row) => row.coarseFamily),
      ...unresolvedRowsForSurface.flatMap((row) =>
        row.coarseFamily === null ? [] : [row.coarseFamily],
      ),
    ]);
    const evidencePointerIds = evidencePointerIdsFromRows([
      ...mappedRowsForSurface,
      ...unresolvedRowsForSurface,
    ]);
    if (mappedRowsForSurface.length > 0) surfacesWithMappedFields += 1;
    if (unresolvedRowsForSurface.length > 0) surfacesWithUnresolvedFields += 1;
    if (routeIds.length > 0) surfacesWithRouteIds += 1;
    increment(surfaceKindCounts, surfaceKind);

    surfaceRows.push({
      surfaceId,
      surfaceKind,
      sourceId,
      sourceTitle: stringValue(surface["sourceTitle"]),
      sourceGroup,
      pageNumbers,
      sourceInvestigationId: stringValue(surface["sourceInvestigationId"]),
      runId: item.runId,
      shardId: item.shardId,
      windowId: item.windowId,
      draftIndex: item.draftIndex,
      artifactPath: item.artifactPath,
      auditPath: item.auditPath,
      payloadSchemaId: stringValue(surface["payloadSchemaId"]),
      displayLabel: stringValue(surface["displayLabel"]),
      rawText: stringValue(surface["rawText"]),
      canonicalPayload,
      lifecycle: isRecord(surface["lifecycle"]) ? surface["lifecycle"] : null,
      intendedUses: stringArray(surface["intendedUses"]),
      confidence: isRecord(surface["confidence"]) ? surface["confidence"] : null,
      routeIds,
      coarseFamilies,
      mappedFieldCount: mappedRowsForSurface.length,
      unresolvedFieldCount: unresolvedRowsForSurface.length,
      evidencePointerIds,
    });

    const sourceIdKey = sourceKey(sourceId);
    const source = sourceAccumulator.get(sourceIdKey) ?? {
      sourceId: sourceIdKey,
      sourceTitle: stringValue(surface["sourceTitle"]),
      sourceGroup,
      surfaceCount: 0,
      mappedFieldCount: 0,
      unresolvedFieldCount: 0,
      pageNumbers: new Set<number>(),
      surfaceKindCounts: {},
    };
    source.sourceTitle = source.sourceTitle ?? stringValue(surface["sourceTitle"]);
    source.sourceGroup = source.sourceGroup ?? sourceGroup;
    source.surfaceCount += 1;
    source.mappedFieldCount += mappedRowsForSurface.length;
    source.unresolvedFieldCount += unresolvedRowsForSurface.length;
    for (const page of pageNumbers) source.pageNumbers.add(page);
    increment(source.surfaceKindCounts, surfaceKind);
    sourceAccumulator.set(sourceIdKey, source);
  }

  const sourceRows: CompactSourceRow[] = [...sourceAccumulator.values()]
    .map((source) => ({
      sourceId: source.sourceId,
      sourceTitle: source.sourceTitle,
      sourceGroup: source.sourceGroup,
      surfaceCount: source.surfaceCount,
      mappedFieldCount: source.mappedFieldCount,
      unresolvedFieldCount: source.unresolvedFieldCount,
      pageNumbers: [...source.pageNumbers].sort((left, right) => left - right),
      surfaceKindCounts: finalizeRecord(source.surfaceKindCounts),
    }))
    .sort(
      (left, right) =>
        right.surfaceCount - left.surfaceCount || left.sourceId.localeCompare(right.sourceId),
    );

  return {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    sourceSurfaceApplicationPath: input.sourceSurfaceApplicationPath,
    sourceSurfaceApplicationGeneratedAt: input.application.generatedAt,
    sourceProjectionPath: input.application.sourceProjectionPath,
    summary: {
      surfaceRowCount: surfaceRows.length,
      fieldRowCount: fieldRows.length,
      unresolvedRowCount: unresolvedRows.length,
      sourceRowCount: sourceRows.length,
      surfacesWithMappedFields,
      surfacesWithUnresolvedFields,
      surfacesWithRouteIds,
      sourceSurfaceApplicationSummary: input.application.summary,
      surfaceKindCounts: finalizeRecord(surfaceKindCounts),
      mappedByKey: finalizeRecord(mappedByKey),
      unresolvedByKey: finalizeRecord(unresolvedByKey),
      fieldRowsByCoarseFamily: finalizeRecord(fieldRowsByCoarseFamily),
      unresolvedRowsByDecision: finalizeRecord(unresolvedRowsByDecision),
    },
    surfaceRows: surfaceRows.sort((left, right) => left.surfaceId.localeCompare(right.surfaceId)),
    fieldRows: fieldRows.sort(
      (left, right) =>
        left.keyId.localeCompare(right.keyId) ||
        left.canonicalLeafId.localeCompare(right.canonicalLeafId) ||
        left.surfaceId.localeCompare(right.surfaceId),
    ),
    unresolvedRows: unresolvedRows.sort(
      (left, right) =>
        left.keyId.localeCompare(right.keyId) ||
        left.decision.localeCompare(right.decision) ||
        left.surfaceId.localeCompare(right.surfaceId),
    ),
    sourceRows,
  };
}

function renderMarkdown(artifact: Tier2VocabConsumerIndexArtifact): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Vocab Consumer Index");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Surface rows: ${artifact.summary.surfaceRowCount}`);
  lines.push(`- Field rows: ${artifact.summary.fieldRowCount}`);
  lines.push(`- Unresolved rows: ${artifact.summary.unresolvedRowCount}`);
  lines.push(`- Source rows: ${artifact.summary.sourceRowCount}`);
  lines.push(`- Surfaces with mapped fields: ${artifact.summary.surfacesWithMappedFields}`);
  lines.push(`- Surfaces with unresolved fields: ${artifact.summary.surfacesWithUnresolvedFields}`);
  lines.push(
    `- Surfaces with route ids from canonical payload or vocab modifiers: ${artifact.summary.surfacesWithRouteIds}`,
  );
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
  lines.push("- This is a compact consumer index, not the full evidence audit artifact.");
  lines.push(
    "- It omits raw payload blobs, field support rows, evidence pointer rows, and projection examples.",
  );
  lines.push(
    "- Use `artifactPath`, `surfaceId`, `supportIds`, and `evidencePointerIds` to reopen the rich source artifact.",
  );
  lines.push(
    "- Field rows are meant for detector/materializer queries; surface rows are meant for UI and review lists.",
  );
  return `${lines.join("\n")}\n`;
}

export async function buildTier2VocabConsumerIndex(
  args: BuildTier2VocabConsumerIndexArgs,
): Promise<Tier2VocabConsumerIndexArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceSurfaceApplicationPath = fromCliPath(args.surfaceApplicationPath);
  const application = (await Bun.file(
    sourceSurfaceApplicationPath,
  ).json()) as VocabSurfaceApplicationArtifact;
  if (!Array.isArray(application.normalizedAcceptedSurfaces)) {
    throw new Error(
      `Surface application has no normalizedAcceptedSurfaces array: ${sourceSurfaceApplicationPath}`,
    );
  }
  return buildCompactIndex({ application, sourceSurfaceApplicationPath, generatedAt });
}

export async function runTier2VocabConsumerIndex(args: BuildTier2VocabConsumerIndexArgs): Promise<{
  artifact: Tier2VocabConsumerIndexArtifact;
  outputPath: string;
  markdownPath: string;
  summaryPath: string;
}> {
  const artifact = await buildTier2VocabConsumerIndex(args);
  const outputPath = fromCliPath(
    args.outputPath ??
      join(
        defaultArtifactRootPath(),
        "docs",
        "tier2-vocab-consumer-index",
        "vocab-consumer-index.json",
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
    if (arg === "--surface-application") {
      if (value === undefined) throw new Error("--surface-application requires a value.");
      args.surfaceApplicationPath = value;
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
      throw new Error(`Unknown docs tier2 vocab-consumer-index option: ${arg}`);
    }
  }
  return args;
}

export async function runTier2VocabConsumerIndexFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.surfaceApplicationPath === undefined) {
    throw new Error("Provide --surface-application.");
  }
  const result = await runTier2VocabConsumerIndex({
    surfaceApplicationPath: args.surfaceApplicationPath,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.summaryPath === undefined ? {} : { summaryPath: args.summaryPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `tier2-vocab-consumer-index: surfaces=${result.artifact.summary.surfaceRowCount} fields=${result.artifact.summary.fieldRowCount} unresolved=${result.artifact.summary.unresolvedRowCount}`,
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
