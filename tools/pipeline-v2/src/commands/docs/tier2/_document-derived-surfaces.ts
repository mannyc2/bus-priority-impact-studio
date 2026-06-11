import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type DocumentDerivedEntityMode,
  type DocumentDerivedEventStatus,
  type DocumentDerivedMetricAuthority,
  type DocumentDerivedPriority,
  type DocumentDerivedSurfaceKind,
  type DocumentDerivedSurfaceRow,
  DocumentDerivedSurfaceRowSchema,
  type DocumentDerivedSurfacesManifest,
  DocumentDerivedSurfacesManifestSchema,
} from "@bp/domain/documents/derived-surfaces";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { type CliOption, latestDocsRunId, parseCliOptions, runArtifactRoot } from "./_shared.ts";

const ARTIFACT_KIND = "bp.document_derived_surfaces.v1";
const EXTRACTION_VERSION = "document-discovery-canonical-v1";
const NORMALIZATION_VERSION = "document-derived-surfaces-v1";

type CandidateType =
  | "entity"
  | "metric"
  | "event"
  | "table"
  | "claim"
  | "context_signal"
  | "review_question";

type EvidenceRef = {
  blockId: string;
  pageNumber: number;
  lineStart: number;
  lineEnd: number;
  blockHash?: string;
  roleRaw?: string;
  snippet?: string;
};

type NormalizedCandidateRow = {
  rowId: string;
  inputLabel?: string;
  extractionId?: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  candidateType: CandidateType;
  candidateId: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  clusterKey?: string;
  evidenceRefs: EvidenceRef[];
  rawCandidate: unknown;
};

type NormalizedCandidatesArtifact = {
  version: number;
  generatedAt: string;
  rowCount: number;
  rows: NormalizedCandidateRow[];
};

export type RunTier2DocumentDerivedSurfacesArgs = {
  normalizedCandidatesPath: string;
  outputDir?: string;
  workbenchPath?: string;
  generatedAt?: string;
};

type CliArgs = {
  normalizedCandidatesPath?: string;
  artifactRoot?: string;
  runId?: string;
  outputDir?: string;
  workbenchPath?: string;
  generatedAt?: string;
};

type SurfaceBuckets = Record<DocumentDerivedSurfaceKind, DocumentDerivedSurfaceRow[]>;

function shortHash(value: string, length = 16): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function compact(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.length > 0 ? [item] : []))
    : [];
}

function includesAny(text: string, values: readonly string[]): boolean {
  const normalized = compact(text);
  return values.some((value) => normalized.includes(value));
}

function surfaceKindForCandidate(candidateType: CandidateType): DocumentDerivedSurfaceKind {
  switch (candidateType) {
    case "entity":
      return "entity";
    case "metric":
      return "metric_claim";
    case "event":
      return "event";
    case "table":
      return "table";
    case "claim":
      return "claim";
    case "context_signal":
      return "context_signal";
    case "review_question":
      return "review_question";
  }
}

function surfaceFileName(kind: DocumentDerivedSurfaceKind): string {
  switch (kind) {
    case "entity":
      return "entities.jsonl";
    case "metric_claim":
      return "metric-claims.jsonl";
    case "event":
      return "events.jsonl";
    case "table":
      return "tables.jsonl";
    case "claim":
      return "claims.jsonl";
    case "context_signal":
      return "context-signals.jsonl";
    case "review_question":
      return "review-questions.jsonl";
    case "relation":
      return "relations.jsonl";
  }
}

function stableSurfaceId(
  row: NormalizedCandidateRow,
  surfaceKind: DocumentDerivedSurfaceKind,
): string {
  return `docsurf_${shortHash(
    JSON.stringify({
      sourceId: row.sourceId,
      rowId: row.rowId,
      candidateType: row.candidateType,
      candidateId: row.candidateId,
      surfaceKind,
      canonicalFamily: row.canonicalFamily,
      evidenceRefs: row.evidenceRefs.map((ref) => [
        ref.pageNumber,
        ref.blockId,
        ref.lineStart,
        ref.lineEnd,
      ]),
    }),
  )}`;
}

function classifyEntityMode(
  row: NormalizedCandidateRow,
  raw: Record<string, unknown>,
): DocumentDerivedEntityMode {
  const text = `${row.displayLabel} ${row.rawFamily} ${row.canonicalFamily} ${optionalString(raw["rawKind"]) ?? ""}`;
  if (includesAny(text, ["amtrak"])) return "amtrak_service";
  if (includesAny(text, ["nj transit", "njt"])) return "nj_transit_line";
  if (includesAny(text, ["lirr", "long island rail road"])) return "lirr_line";
  if (includesAny(text, ["path"])) return "path_line";
  if (includesAny(text, ["subway", "train line", "metro"])) return "subway_line";
  if (includesAny(text, ["station"])) return "rail_station";
  if (includesAny(text, ["bus stop", "stop"])) return "bus_stop";
  if (
    includesAny(text, ["bus route", "route"]) ||
    /(^|\s)(m|b|q|s|bx|sim)\d+[a-z]?\b/i.test(row.displayLabel)
  ) {
    return "bus_route";
  }
  if (includesAny(text, ["intersection"])) return "intersection";
  if (includesAny(text, ["corridor"])) return "corridor";
  if (includesAny(text, ["street", "avenue", "road", "boulevard"])) return "street";
  if (includesAny(text, ["borough"])) return "borough";
  if (includesAny(text, ["community board"])) return "community_board";
  if (includesAny(text, ["neighborhood"])) return "neighborhood";
  if (includesAny(text, ["agency", "mta", "nyct", "dot"])) return "agency";
  if (includesAny(text, ["program", "initiative"])) return "program";
  if (includesAny(text, ["bus lane", "busway", "camera enforcement", "tsp"])) return "treatment";
  if (includesAny(text, ["date", "month", "year", "period"])) return "date_or_period";
  if (includesAny(text, ["metric", "speed", "ridership", "headway"])) return "metric_subject";
  return "unknown";
}

function classifyMetricAuthority(raw: Record<string, unknown>): DocumentDerivedMetricAuthority {
  const text = `${optionalString(raw["authorityRaw"]) ?? ""} ${optionalString(raw["labelRaw"]) ?? ""}`;
  if (includesAny(text, ["customer journey", "abst", "additional bus stop time"])) {
    return "official_customer_metric";
  }
  if (includesAny(text, ["comptroller", "audit", "independent"])) return "independent_audit";
  if (includesAny(text, ["mta", "nyct", "dot", "agency", "official"])) {
    return "official_agency_metric";
  }
  if (includesAny(text, ["consultant", "advocacy"])) return "consultant_or_advocacy";
  return "document_claim_only";
}

function metricTruthStatus(authority: DocumentDerivedMetricAuthority) {
  if (authority === "deterministic_project_metric") return "deterministic_project_metric" as const;
  if (
    authority === "official_agency_metric" ||
    authority === "official_customer_metric" ||
    authority === "independent_audit"
  ) {
    return "official_source_claim" as const;
  }
  return "document_claim_only" as const;
}

function classifyEventStatus(raw: Record<string, unknown>): DocumentDerivedEventStatus {
  const text = `${optionalString(raw["statusRaw"]) ?? ""} ${optionalString(raw["nameRaw"]) ?? ""} ${optionalString(raw["familyRaw"]) ?? ""}`;
  if (includesAny(text, ["implemented", "launched", "complete", "in service", "in effect"])) {
    return "implemented";
  }
  if (includesAny(text, ["approved"])) return "approved";
  if (includesAny(text, ["planned", "upcoming", "scheduled"])) return "planned";
  if (includesAny(text, ["proposed", "proposal", "recommended"])) return "proposed";
  if (includesAny(text, ["historical", "past"])) return "historical_context";
  return "unclear";
}

function classifyDatePrecision(dateText: string | undefined) {
  if (dateText === undefined) return "unknown" as const;
  const text = compact(dateText);
  if (text.includes(" to ") || text.includes(" through ") || /\d{4}\s*[-/]\s*\d{4}/.test(text)) {
    return "range" as const;
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return "day" as const;
  if (
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/.test(
      text,
    )
  ) {
    return "day" as const;
  }
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b/.test(text)) {
    return "month" as const;
  }
  if (/\b\d{4}\b/.test(text)) return "year" as const;
  return "unknown" as const;
}

function classifyPriority(raw: Record<string, unknown>): DocumentDerivedPriority {
  const text = `${optionalString(raw["priorityRaw"]) ?? ""} ${optionalString(raw["questionKindRaw"]) ?? ""}`;
  if (includesAny(text, ["high", "critical", "urgent"])) return "high";
  if (includesAny(text, ["medium"])) return "medium";
  if (includesAny(text, ["low"])) return "low";
  return "unknown";
}

function causalClaimFlag(text: string): boolean {
  return includesAny(text, [
    "caused",
    "causal",
    "led to",
    "resulted in",
    "effect of",
    "impact of",
    "because of",
    "attributable",
  ]);
}

function baseRow(
  row: NormalizedCandidateRow,
  surfaceKind: DocumentDerivedSurfaceKind,
  inputSnapshotHash: string,
) {
  return {
    schemaVersion: 1 as const,
    surfaceId: stableSurfaceId(row, surfaceKind),
    surfaceKind,
    sourceId: row.sourceId,
    sourceTitle: row.sourceTitle,
    sourceGroup: row.sourceGroup,
    pageNumbers: row.pageNumbers.length > 0 ? row.pageNumbers : [1],
    evidenceRefs: row.evidenceRefs.map((ref) => ({
      sourceId: row.sourceId,
      pageNumber: ref.pageNumber,
      blockId: ref.blockId,
      lineStart: ref.lineStart,
      lineEnd: ref.lineEnd,
      ...(ref.blockHash === undefined ? {} : { blockHash: ref.blockHash }),
      ...(ref.roleRaw === undefined ? {} : { roleRaw: ref.roleRaw }),
      ...(ref.snippet === undefined ? {} : { snippet: ref.snippet }),
    })),
    displayLabel: row.displayLabel,
    canonicalFamily: row.canonicalFamily,
    rawFamily: row.rawFamily,
    ...(row.clusterKey === undefined ? {} : { clusterKey: row.clusterKey }),
    lifecycleState: "candidate" as const,
    validationState: "unvalidated" as const,
    promotionState: "research_only" as const,
    reviewState: "unreviewed" as const,
    truthStatus: "document_claim_only" as const,
    sourceCandidate: {
      rowId: row.rowId,
      candidateType: row.candidateType,
      candidateId: row.candidateId,
      ...(row.extractionId === undefined ? {} : { extractionId: row.extractionId }),
      ...(row.inputLabel === undefined ? {} : { inputLabel: row.inputLabel }),
    },
    inputSnapshotHash,
    extractionVersion: EXTRACTION_VERSION,
    normalizationVersion: NORMALIZATION_VERSION,
    rawCandidate: asRecord(row.rawCandidate),
    attributes: {},
  };
}

function toSurfaceRow(
  row: NormalizedCandidateRow,
  inputSnapshotHash: string,
): DocumentDerivedSurfaceRow {
  const surfaceKind = surfaceKindForCandidate(row.candidateType);
  const raw = asRecord(row.rawCandidate);
  const base = baseRow(row, surfaceKind, inputSnapshotHash);
  switch (surfaceKind) {
    case "entity": {
      const normalizedRef = asRecord(raw["normalizedRefHint"]);
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        rawText: optionalString(raw["rawText"]) ?? row.displayLabel,
        ...(optionalString(raw["rawKind"]) === undefined
          ? {}
          : { rawKind: optionalString(raw["rawKind"]) }),
        entityMode: classifyEntityMode(row, raw),
        ...(optionalString(raw["roleRaw"]) === undefined
          ? {}
          : { roleRaw: optionalString(raw["roleRaw"]) }),
        ...(optionalString(normalizedRef["refTypeRaw"]) === undefined ||
        optionalString(normalizedRef["refIdRaw"]) === undefined
          ? {}
          : {
              normalizedRef: {
                refType: optionalString(normalizedRef["refTypeRaw"]),
                refId: optionalString(normalizedRef["refIdRaw"]),
                confidence: optionalString(normalizedRef["confidence"]) ?? "unknown",
              },
            }),
      });
    }
    case "metric_claim": {
      const metricAuthority = classifyMetricAuthority(raw);
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        truthStatus: metricTruthStatus(metricAuthority),
        metricLabel: optionalString(raw["labelRaw"]) ?? row.displayLabel,
        metricAuthority,
        ...(optionalString(raw["valueRaw"]) === undefined
          ? {}
          : { valueText: optionalString(raw["valueRaw"]) }),
        ...(optionalNumber(raw["valueNumeric"]) === undefined
          ? {}
          : { valueNumeric: optionalNumber(raw["valueNumeric"]) }),
        ...(optionalString(raw["unitRaw"]) === undefined
          ? {}
          : { unit: optionalString(raw["unitRaw"]) }),
        ...(optionalString(raw["valueKind"]) === undefined
          ? {}
          : { valueKind: optionalString(raw["valueKind"]) }),
        ...(optionalString(raw["directionRaw"]) === undefined
          ? {}
          : { directionText: optionalString(raw["directionRaw"]) }),
        ...(optionalString(raw["subjectRaw"]) === undefined
          ? {}
          : { subjectText: optionalString(raw["subjectRaw"]) }),
        ...(optionalString(raw["geographyRaw"]) === undefined
          ? {}
          : { geographyText: optionalString(raw["geographyRaw"]) }),
        ...(optionalString(raw["periodRaw"]) === undefined
          ? {}
          : { periodText: optionalString(raw["periodRaw"]) }),
        ...(optionalString(raw["comparisonRaw"]) === undefined
          ? {}
          : { comparisonText: optionalString(raw["comparisonRaw"]) }),
        needsDeterministicMetric: true,
      });
    }
    case "event": {
      const dateText = optionalString(raw["dateRaw"]);
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        ...(optionalString(raw["nameRaw"]) === undefined
          ? {}
          : { eventName: optionalString(raw["nameRaw"]) }),
        eventFamily: optionalString(raw["familyRaw"]) ?? row.canonicalFamily,
        ...(optionalString(raw["subtypeRaw"]) === undefined
          ? {}
          : { eventSubtype: optionalString(raw["subtypeRaw"]) }),
        eventStatus: classifyEventStatus(raw),
        ...(dateText === undefined ? {} : { dateText }),
        datePrecision: classifyDatePrecision(dateText),
        ...(optionalString(raw["locationRaw"]) === undefined
          ? {}
          : { locationText: optionalString(raw["locationRaw"]) }),
        ...(optionalString(raw["treatmentRaw"]) === undefined
          ? {}
          : { treatmentText: optionalString(raw["treatmentRaw"]) }),
        affectedEntitiesRaw: stringArray(raw["affectedEntitiesRaw"]),
        linkedEntityCandidateIds: stringArray(raw["entityCandidateIds"]),
      });
    }
    case "table":
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        ...(optionalString(raw["titleRaw"]) === undefined
          ? {}
          : { tableTitle: optionalString(raw["titleRaw"]) }),
        tableKind: optionalString(raw["tableKindRaw"]) ?? row.canonicalFamily,
        headers: stringArray(raw["headerTextsRaw"]),
        ...(optionalNumber(raw["rowCount"]) === undefined
          ? {}
          : { rowCount: optionalNumber(raw["rowCount"]) }),
        ...(optionalNumber(raw["columnCount"]) === undefined
          ? {}
          : { columnCount: optionalNumber(raw["columnCount"]) }),
        ...(optionalString(raw["semanticNotes"]) === undefined
          ? {}
          : { semanticNotes: optionalString(raw["semanticNotes"]) }),
        importantEntityCandidateIds: stringArray(raw["importantEntityCandidateIds"]),
        importantMetricCandidateIds: stringArray(raw["importantMetricCandidateIds"]),
      });
    case "claim": {
      const claimText = optionalString(raw["claimText"]) ?? row.displayLabel;
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        claimText,
        claimKind: optionalString(raw["claimKindRaw"]) ?? row.canonicalFamily,
        ...(optionalString(raw["authorityRaw"]) === undefined
          ? {}
          : { authorityText: optionalString(raw["authorityRaw"]) }),
        causalClaimFlag: causalClaimFlag(claimText),
        linkedEntityCandidateIds: stringArray(raw["entityCandidateIds"]),
        linkedMetricCandidateIds: stringArray(raw["metricCandidateIds"]),
        linkedEventCandidateIds: stringArray(raw["eventCandidateIds"]),
        researchUseTagsRaw: stringArray(raw["researchUseTagsRaw"]),
      });
    }
    case "context_signal":
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        signalText: optionalString(raw["signalText"]) ?? row.displayLabel,
        contextKind: optionalString(raw["contextKindRaw"]) ?? row.canonicalFamily,
        ...(optionalString(raw["geographyRaw"]) === undefined
          ? {}
          : { geographyText: optionalString(raw["geographyRaw"]) }),
        ...(optionalString(raw["periodRaw"]) === undefined
          ? {}
          : { periodText: optionalString(raw["periodRaw"]) }),
      });
    case "review_question":
      return DocumentDerivedSurfaceRowSchema.parse({
        ...base,
        surfaceKind,
        question: optionalString(raw["question"]) ?? row.displayLabel,
        questionKind: optionalString(raw["questionKindRaw"]) ?? row.canonicalFamily,
        priority: classifyPriority(raw),
      });
    case "relation":
      throw new Error("Relation surfaces are built by later linking passes, not candidate rows.");
  }
}

function emptyBuckets(): SurfaceBuckets {
  return {
    entity: [],
    metric_claim: [],
    event: [],
    table: [],
    claim: [],
    context_signal: [],
    review_question: [],
    relation: [],
  };
}

async function writeJsonLines(
  path: string,
  rows: readonly DocumentDerivedSurfaceRow[],
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const writer = Bun.file(path).writer({ highWaterMark: 1024 * 1024 });
  for (const row of rows) {
    writer.write(`${JSON.stringify(row)}\n`);
  }
  await writer.end();
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export async function runTier2DocumentDerivedSurfaces(
  args: RunTier2DocumentDerivedSurfacesArgs,
): Promise<{
  manifestPath: string;
  manifest: DocumentDerivedSurfacesManifest;
}> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const normalizedText = await Bun.file(args.normalizedCandidatesPath).text();
  const normalized = JSON.parse(normalizedText) as NormalizedCandidatesArtifact;
  const inputSnapshotHash = shortHash(normalizedText, 24);
  const outputDir =
    args.outputDir ?? join(dirname(args.normalizedCandidatesPath), "document-derived-surfaces-v1");
  const buckets = emptyBuckets();
  const candidateTypeCounts: Record<string, number> = {};
  const lifecycleCounts: Record<string, number> = {};

  for (const row of normalized.rows) {
    increment(candidateTypeCounts, row.candidateType);
    const surface = toSurfaceRow(row, inputSnapshotHash);
    buckets[surface.surfaceKind].push(surface);
    increment(lifecycleCounts, surface.lifecycleState);
  }

  const surfaceFiles = [];
  for (const kind of Object.keys(buckets) as DocumentDerivedSurfaceKind[]) {
    const path = join(outputDir, surfaceFileName(kind));
    await writeJsonLines(path, buckets[kind]);
    surfaceFiles.push({
      surfaceKind: kind,
      path,
      rowCount: buckets[kind].length,
      schemaId: `bp.document_derived_surface.${kind}.v1`,
    });
  }

  const manifest = DocumentDerivedSurfacesManifestSchema.parse({
    schemaVersion: 1,
    artifactKind: ARTIFACT_KIND,
    generatedAt,
    sourceNormalizedCandidatesPath: args.normalizedCandidatesPath,
    ...(args.workbenchPath === undefined ? {} : { sourceWorkbenchPath: args.workbenchPath }),
    outputDir,
    summary: {
      inputRows: normalized.rows.length,
      sourceCount: new Set(normalized.rows.map((row) => row.sourceId)).size,
      evidenceRefCount: normalized.rows.reduce((sum, row) => sum + row.evidenceRefs.length, 0),
      surfaceCounts: Object.fromEntries(
        Object.entries(buckets).map(([kind, rows]) => [kind, rows.length]),
      ),
      candidateTypeCounts,
      lifecycleCounts,
    },
    surfaceFiles,
    notes: [
      "These surfaces are a normalized research substrate, not public facts.",
      "Metric rows remain document-claimed until cross-checked against deterministic analytics or reviewer dispositions.",
      "Subway, PATH, LIRR, NJ Transit, and Amtrak entities are retained but typed separately from bus routes.",
      "The source OCR Markdown/PDF artifacts remain the regeneration and audit substrate.",
    ],
    nextActions: [
      "Add deterministic relation-building to link claims, metrics, events, entities, and tables.",
      "Add reviewer disposition tables before promoting rows to serving projections.",
      "Join eligible event rows to route/segment/month panels for applied-research candidate generation.",
      "Use metric-claim rows as source-stated context only until deterministic detector metrics corroborate them.",
    ],
  });
  const manifestPath = join(outputDir, "manifest.json");
  await writeJson(manifestPath, manifest);
  return { manifestPath, manifest };
}

function parseArgs(argv: string[]): CliArgs {
  const options: CliOption<CliArgs>[] = [
    {
      flags: ["--normalized-candidates"],
      apply: (output, value) => {
        if (value !== undefined) output.normalizedCandidatesPath = fromCliPath(value);
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
      flags: ["--output-dir"],
      apply: (output, value) => {
        if (value !== undefined) output.outputDir = fromCliPath(value);
      },
    },
    {
      flags: ["--workbench"],
      apply: (output, value) => {
        if (value !== undefined) output.workbenchPath = fromCliPath(value);
      },
    },
    {
      flags: ["--generated-at"],
      apply: (output, value) => {
        if (value !== undefined) output.generatedAt = value;
      },
    },
  ];
  return parseCliOptions(argv, {}, options);
}

async function resolveNormalizedCandidatesPath(args: CliArgs): Promise<string> {
  if (args.normalizedCandidatesPath !== undefined) return args.normalizedCandidatesPath;
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or --normalized-candidates.");
  }
  return join(
    runArtifactRoot(artifactRoot, runId),
    "document-discovery-normalized-candidates-canonical-v1.json",
  );
}

export async function runTier2DocumentDerivedSurfacesFromCli(argv: string[]) {
  const args = parseArgs(argv);
  const normalizedCandidatesPath = await resolveNormalizedCandidatesPath(args);
  const result = await runTier2DocumentDerivedSurfaces({
    normalizedCandidatesPath,
    ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
    ...(args.workbenchPath === undefined ? {} : { workbenchPath: args.workbenchPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `tier2-document-derived-surfaces: input=${result.manifest.summary.inputRows} surfaces=${Object.values(result.manifest.summary.surfaceCounts).reduce((sum, count) => sum + count, 0)} manifest=${result.manifestPath}`,
  );
  return result.manifest;
}
