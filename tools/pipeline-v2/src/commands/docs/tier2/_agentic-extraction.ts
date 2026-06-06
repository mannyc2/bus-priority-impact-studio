import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type DocumentResearchEvidenceHandle,
  DocumentResearchEvidenceHandleSchema,
  type DocumentResearchLookupResult,
  DocumentResearchLookupResultSchema,
  type DocumentResearchRouteLookupResult,
  type DocumentResearchSourceContext,
  DocumentResearchSourceContextSchema,
  type DocumentResearchSurfaceDraftV2,
  DocumentResearchSurfaceDraftV2Schema,
  type DocumentResearchSurfaceDraftValidation,
  type SubmitDocumentResearchSurfaceDraftsResult,
  submitDocumentResearchSurfaceDrafts,
  validateDocumentResearchSurfaceDraft,
} from "@bp/domain/documents/research-surfaces";
import { toProjectJsonSchema } from "@bp/domain/json-schema";
import * as z from "zod";
import { writeJson } from "../../../lib/json.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import { normalizeRouteIdText } from "../../../lib/route-ids.ts";
import {
  callDeepSeekToolCallDirect,
  callPioneerToolCallDirect,
  openRouterErrorMessage,
} from "./_llm-clients.ts";
import {
  defaultFetch,
  extractToolCallArguments,
  type FetchLike,
  missingToolCallErrorMessage,
} from "./_shared.ts";

export const TIER2_AGENTIC_EXTRACTION_ARTIFACT_KIND = "bp.tier2_agentic_extraction_harness.v1";
export const AGENTIC_EXTRACTION_TOOL_NAME = "submit_document_research_surface_drafts";
export const AGENTIC_EXTRACTION_PROMPT_VERSION = "tier2-agentic-extraction-v1";
export const DEFAULT_AGENTIC_EXTRACTION_PROVIDER = "pioneer";
export const DEFAULT_AGENTIC_EXTRACTION_MODEL = "claude-opus-4-5";
export const DEFAULT_AGENTIC_EXTRACTION_MAX_TOKENS = 16_000;
export const DEFAULT_AGENTIC_EXTRACTION_TEMPERATURE = 0;
export const DEFAULT_AGENTIC_EXTRACTION_MAX_REPAIR_ROUNDS = 2;

export type AgenticExtractionProvider = "pioneer" | "deepseek";

type RouteCatalogEntry = {
  routeId: string;
  longName: string | null;
  description: string | null;
  inEffect: boolean;
};

const RouteCatalogRowSchema = z
  .object({
    route_id: z.string().optional(),
    route_long_name: z.string().nullable().optional(),
    route_description: z.string().nullable().optional(),
    in_effect: z.union([z.string(), z.boolean()]).optional(),
  })
  .passthrough();

const RouteLookupRequestSchema = z
  .object({
    lookupHandle: z.string().min(1).optional(),
    text: z.string().min(1),
  })
  .strict();
export type RouteLookupRequest = z.output<typeof RouteLookupRequestSchema>;

export const Tier2AgenticExtractionRequestSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    runId: z.string().min(1).optional(),
    generatedAt: z.string().min(1).optional(),
    source: DocumentResearchSourceContextSchema,
    evidenceHandles: z.array(DocumentResearchEvidenceHandleSchema).default([]),
    lookupResults: z.array(DocumentResearchLookupResultSchema).default([]),
    routeLookupRequests: z.array(RouteLookupRequestSchema).default([]),
    routeUniverse: z.array(z.string().min(1)).default([]),
    routeCatalogPath: z.string().min(1).optional(),
    priorContext: z.array(z.unknown()).default([]),
    drafts: z.array(DocumentResearchSurfaceDraftV2Schema).default([]),
  })
  .strict();
export type Tier2AgenticExtractionRequest = z.output<typeof Tier2AgenticExtractionRequestSchema>;

const AgenticExtractionToolResponseSchema = z
  .object({
    drafts: z.array(DocumentResearchSurfaceDraftV2Schema).default([]),
    notes: z.string().min(1).optional(),
  })
  .strict();
type AgenticExtractionToolResponse = z.output<typeof AgenticExtractionToolResponseSchema>;

export type Tier2AgenticExtractionLlmAttempt = {
  readonly attemptIndex: number;
  readonly repairRound: number;
  readonly provider: AgenticExtractionProvider;
  readonly model: string;
  readonly temperature: number;
  readonly promptVersion: typeof AGENTIC_EXTRACTION_PROMPT_VERSION;
  readonly httpStatus: number | null;
  readonly providerErrorMessage: string | null;
  readonly status:
    | "tool_response_parse_failed"
    | "provider_failed"
    | "accepted"
    | "partial_accepted"
    | "rejected";
  readonly errorMessage: string | null;
  readonly toolNotes: string | null;
  readonly rawToolArgs: unknown | null;
  readonly drafts: DocumentResearchSurfaceDraftV2[];
  readonly draftCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly validationIssueCount: number;
  readonly validationResults: DocumentResearchSurfaceDraftValidation[];
};

export type Tier2AgenticExtractionArtifact = {
  readonly artifactKind: typeof TIER2_AGENTIC_EXTRACTION_ARTIFACT_KIND;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly runId: string;
  readonly inputPath: string | null;
  readonly outputPath: string | null;
  readonly promptVersion: typeof AGENTIC_EXTRACTION_PROMPT_VERSION;
  readonly execute: boolean;
  readonly provider: AgenticExtractionProvider | null;
  readonly model: string | null;
  readonly maxTokens: number | null;
  readonly temperature: number | null;
  readonly timeoutMs: number | null;
  readonly maxAttempts: number | null;
  readonly maxRepairRounds: number;
  readonly summary: {
    readonly draftCount: number;
    readonly acceptedCount: number;
    readonly rejectedCount: number;
    readonly routeLookupCount: number;
    readonly validationIssueCount: number;
    readonly llmAttemptCount: number;
  };
  readonly source: DocumentResearchSourceContext;
  readonly evidenceHandles: DocumentResearchEvidenceHandle[];
  readonly lookupResults: DocumentResearchLookupResult[];
  readonly routeLookups: DocumentResearchRouteLookupResult[];
  readonly priorContext: unknown[];
  readonly drafts: DocumentResearchSurfaceDraftV2[];
  readonly validationResults: DocumentResearchSurfaceDraftValidation[];
  readonly submitResult: SubmitDocumentResearchSurfaceDraftsResult;
  readonly llmAttempts: Tier2AgenticExtractionLlmAttempt[];
};

export type Tier2AgenticExtractionAuditIssue = {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

export type Tier2AgenticExtractionAudit = {
  readonly artifactKind: "bp.tier2_agentic_extraction_audit.v1";
  readonly generatedAt: string;
  readonly artifactPath: string | null;
  readonly runId: string;
  readonly summary: Tier2AgenticExtractionArtifact["summary"];
  readonly attemptSummary: Array<{
    readonly status: Tier2AgenticExtractionLlmAttempt["status"];
    readonly temperature: number;
    readonly draftCount: number;
    readonly acceptedCount: number;
    readonly rejectedCount: number;
    readonly validationIssueCount: number;
  }>;
  readonly surfaceKindCounts: Record<string, number>;
  readonly routeFieldPaths: Record<string, number>;
  readonly issues: Tier2AgenticExtractionAuditIssue[];
  readonly blockerCount: number;
};

export type BuildTier2AgenticExtractionRequestFromDiscoveryArgs = {
  readonly discoveryPath: string;
  readonly windowId?: string;
  readonly sourceId?: string;
  readonly generatedAt?: string;
  readonly runId?: string;
  readonly routeCatalogPath?: string;
  readonly priorContext?: readonly unknown[];
};

export type RunTier2AgenticExtractionBatchArgs = {
  readonly discoveryPath: string;
  readonly outputDir: string;
  readonly windowIds?: readonly string[];
  readonly sourceId?: string;
  readonly status?: string;
  readonly limit?: number;
  readonly generatedAt?: string;
  readonly runId?: string;
  readonly routeCatalogPath?: string;
  readonly execute?: boolean;
  readonly provider?: AgenticExtractionProvider;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly maxRepairRounds?: number;
  readonly priorContextByWindowId?: ReadonlyMap<string, readonly unknown[]>;
};

export type Tier2AgenticExtractionBatchArtifact = {
  readonly artifactKind: "bp.tier2_agentic_extraction_batch.v1";
  readonly generatedAt: string;
  readonly runId: string;
  readonly discoveryPath: string;
  readonly outputDir: string;
  readonly execute: boolean;
  readonly windowCount: number;
  readonly summary: {
    readonly draftCount: number;
    readonly acceptedCount: number;
    readonly rejectedCount: number;
    readonly validationIssueCount: number;
    readonly auditBlockerCount: number;
    readonly llmAttemptCount: number;
  };
  readonly windows: Array<{
    readonly windowId: string;
    readonly sourceId: string;
    readonly pageNumbers: number[];
    readonly requestPath: string;
    readonly artifactPath: string;
    readonly auditPath: string;
    readonly summary: Tier2AgenticExtractionArtifact["summary"];
    readonly auditBlockerCount: number;
  }>;
};

export type RunTier2AgenticExtractionHarnessArgs = {
  readonly inputPath: string;
  readonly outputPath?: string;
  readonly generatedAt?: string;
  readonly runId?: string;
  readonly execute?: boolean;
  readonly provider?: AgenticExtractionProvider;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly maxRepairRounds?: number;
  readonly fetcher?: FetchLike;
  readonly pioneerApiKey?: string;
  readonly deepseekApiKey?: string;
};

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function isInEffect(value: string | boolean | undefined): boolean {
  return value === true || value === "true" || value === "1";
}

export async function loadRouteCatalog(path: string): Promise<Map<string, RouteCatalogEntry>> {
  const raw = (await Bun.file(path).json()) as { rows?: unknown[] };
  const catalog = new Map<string, RouteCatalogEntry>();
  for (const row of raw.rows ?? []) {
    const parsed = RouteCatalogRowSchema.safeParse(row);
    if (!parsed.success) continue;
    if (parsed.data.route_id === undefined) continue;
    const routeId = normalizeRouteIdText(parsed.data.route_id);
    if (routeId === null) continue;
    catalog.set(routeId, {
      routeId,
      longName: parsed.data.route_long_name ?? null,
      description: parsed.data.route_description ?? null,
      inEffect: isInEffect(parsed.data.in_effect),
    });
  }
  return catalog;
}

const ROUTE_TOKEN_RE = /\b(SIM|BX|BM|QM|M|B|Q|S|X)\s*0*(\d{1,3})([A-Z]?)\b/giu;
const FAMILY_BRANCH_RE = /\b(SIM|BX|BM|QM|M|B|Q|S|X)\s*0*(\d{1,3})\s+([A-Z])\s*\/\s*([A-Z])\b/iu;

function serviceVariantsIn(text: string): string[] {
  const variants = new Set<string>();
  if (/\b(SBS|SELECT\s+BUS\s+SERVICE)\b/iu.test(text)) variants.add("sbs");
  if (/\bLOCAL\b/iu.test(text)) variants.add("local");
  if (/\b(LIMITED|LTD)\b/iu.test(text)) variants.add("limited");
  if (/\bEXPRESS\b/iu.test(text)) variants.add("express");
  return [...variants].toSorted();
}

function routeTokensIn(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(ROUTE_TOKEN_RE)) {
    const routeId = normalizeRouteIdText(`${match[1]}${match[2]}${match[3] ?? ""}`);
    if (routeId !== null) out.add(routeId);
  }
  const branch = FAMILY_BRANCH_RE.exec(text);
  if (branch !== null) {
    const left = normalizeRouteIdText(`${branch[1]}${branch[2]}${branch[3]}`);
    const right = normalizeRouteIdText(`${branch[1]}${branch[2]}${branch[4]}`);
    if (left !== null) out.add(left);
    if (right !== null) out.add(right);
  }
  return [...out].toSorted();
}

function aliasesFor(input: {
  rawText: string;
  routeId: string;
  catalogEntry?: RouteCatalogEntry | undefined;
}): string[] {
  return [
    input.rawText,
    input.routeId,
    `${input.routeId} SBS`,
    `${input.routeId} Select Bus Service`,
    input.catalogEntry?.longName ?? "",
    input.catalogEntry?.description ?? "",
  ]
    .map((alias) => alias.trim())
    .filter((alias, index, aliases) => alias.length > 0 && aliases.indexOf(alias) === index);
}

export function routeLookup(input: {
  readonly text: string;
  readonly lookupHandle?: string;
  readonly routeCatalog?: ReadonlyMap<string, RouteCatalogEntry>;
  readonly routeUniverse?: readonly string[];
}): DocumentResearchRouteLookupResult {
  const routeUniverse = new Set(input.routeUniverse ?? []);
  for (const routeId of input.routeCatalog?.keys() ?? []) routeUniverse.add(routeId);
  const serviceVariants = serviceVariantsIn(input.text);
  const tokens = routeTokensIn(input.text);
  const candidates = tokens.map((routeId) => {
    const catalogEntry = input.routeCatalog?.get(routeId);
    const inUniverse = routeUniverse.size === 0 || routeUniverse.has(routeId);
    return {
      routeId,
      aliases: aliasesFor({ rawText: input.text, routeId, catalogEntry }),
      mode: "bus" as const,
      currentStatus:
        catalogEntry?.inEffect === false ? ("historical" as const) : ("current" as const),
      routeFamily: routeId.replace(/[A-Z]$/u, ""),
      serviceVariants,
      resolutionTier:
        inUniverse || catalogEntry !== undefined
          ? ("catalog_alias" as const)
          : ("historical_or_proposed_route" as const),
      score: inUniverse || catalogEntry !== undefined ? 0.95 : 0.55,
      requiresReview: !inUniverse && catalogEntry === undefined,
    };
  });
  return {
    lookupKind: "route",
    lookupHandle: input.lookupHandle ?? `route_lookup:${shortHash(input.text)}`,
    rawText: input.text,
    candidates,
    ambiguityNotes:
      candidates.length === 0
        ? ["No bus-route-shaped token was found in the lookup text."]
        : candidates.some((candidate) => candidate.requiresReview)
          ? ["At least one candidate is not in the route universe/catalog."]
          : [],
  };
}

const DiscoveryWindowSchema = z
  .object({
    windowId: z.string().min(1),
    sourceId: z.string().min(1),
    pageNumbers: z.array(z.number().int().positive()).default([]),
    status: z.string().min(1),
    blockIndexArtifactKey: z.string().min(1).nullable().optional(),
    extractionArtifactKey: z.string().min(1).nullable().optional(),
  })
  .passthrough();
type DiscoveryWindow = z.output<typeof DiscoveryWindowSchema>;

const DiscoveryRunSchema = z
  .object({
    windows: z.array(DiscoveryWindowSchema).default([]),
  })
  .passthrough();

const DiscoveryBlockSchema = z
  .object({
    blockId: z.string().min(1),
    pageNumber: z.number().int().positive(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
    blockHash: z.string().min(1),
    text: z.string(),
  })
  .strict();
type DiscoveryBlock = z.output<typeof DiscoveryBlockSchema>;

const DiscoveryBlockIndexSchema = z
  .object({
    sourceId: z.string().min(1),
    pageNumbers: z.array(z.number().int().positive()).min(1),
    markdownHash: z.string().min(1),
    blockIndexHash: z.string().min(1),
    pageArtifactKeys: z.array(z.string().min(1)).default([]),
    blocks: z.array(DiscoveryBlockSchema).default([]),
  })
  .passthrough();
type DiscoveryBlockIndex = z.output<typeof DiscoveryBlockIndexSchema>;

const DiscoverySourceMetadataSchema = z
  .object({
    sourceId: z.string().min(1),
    title: z.string().min(1).optional(),
    sourceGroup: z.string().min(1).optional(),
    sha256: z.string().min(1).optional(),
  })
  .passthrough();
type DiscoverySourceMetadata = z.output<typeof DiscoverySourceMetadataSchema>;

const DiscoveryExtractionSchema = z
  .object({
    source: z
      .object({
        sourceId: z.string().min(1).optional(),
        sourceTitle: z.string().min(1).optional(),
        sourceGroup: z.string().min(1).optional(),
        sourceContentHash: z.string().min(1).optional(),
        pageArtifactKeys: z.array(z.string().min(1)).optional(),
      })
      .passthrough()
      .optional(),
    pageProfile: z.unknown().optional(),
    entities: z.array(z.unknown()).optional(),
    metrics: z.array(z.unknown()).optional(),
    events: z.array(z.unknown()).optional(),
    tables: z.array(z.unknown()).optional(),
    claims: z.array(z.unknown()).optional(),
    contextSignals: z.array(z.unknown()).optional(),
    reviewQuestions: z.array(z.unknown()).optional(),
  })
  .passthrough();
type DiscoveryExtraction = z.output<typeof DiscoveryExtractionSchema>;

function artifactRootForDiscoveryPath(discoveryPath: string): string {
  return dirname(discoveryPath);
}

function artifactPathFromKey(input: { discoveryPath: string; artifactKey: string }): string {
  return join(artifactRootForDiscoveryPath(input.discoveryPath), input.artifactKey);
}

function metadataPathForWindow(input: { discoveryPath: string; sourceId: string }): string {
  return join(
    artifactRootForDiscoveryPath(input.discoveryPath),
    "sources",
    input.sourceId,
    "metadata.json",
  );
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  if (!(await Bun.file(path).exists())) return null;
  return Bun.file(path).json();
}

async function readDiscoveryRun(path: string): Promise<z.output<typeof DiscoveryRunSchema>> {
  return DiscoveryRunSchema.parse(await Bun.file(path).json());
}

function selectedDiscoveryWindow(input: {
  discovery: z.output<typeof DiscoveryRunSchema>;
  windowId?: string;
  sourceId?: string;
}): DiscoveryWindow {
  const windows = input.discovery.windows.filter((window) => {
    if (input.windowId !== undefined) return window.windowId === input.windowId;
    if (input.sourceId !== undefined) {
      return window.sourceId === input.sourceId && window.status === "extracted";
    }
    return window.status === "extracted";
  });
  const window = windows[0];
  if (window === undefined) {
    throw new Error(
      input.windowId === undefined
        ? "No extracted discovery window matched the request."
        : `Discovery window ${input.windowId} was not found.`,
    );
  }
  return window;
}

function evidenceHandlesFromBlocks(input: {
  source: DocumentResearchSourceContext;
  blockIndex: DiscoveryBlockIndex;
}): DocumentResearchEvidenceHandle[] {
  const pageArtifactByPage = new Map(
    input.blockIndex.pageNumbers.map((pageNumber, index) => [
      pageNumber,
      input.blockIndex.pageArtifactKeys[index] ?? input.source.pageArtifactKey,
    ]),
  );
  return input.blockIndex.blocks
    .filter((block) => block.text.trim().length > 0)
    .map((block) =>
      DocumentResearchEvidenceHandleSchema.parse({
        evidenceHandle: `ev-${block.blockId.toLowerCase()}`,
        sourceId: input.source.sourceId,
        pageNumber: block.pageNumber,
        pageArtifactKey: pageArtifactByPage.get(block.pageNumber) ?? input.source.pageArtifactKey,
        sourceContentHash: input.source.sourceContentHash,
        markdownHash: input.source.markdownHash,
        blockIndexHash: input.source.blockIndexHash,
        blockId: block.blockId,
        blockHash: block.blockHash,
        lineStart: block.lineStart,
        lineEnd: block.lineEnd,
        quoteText: block.text,
        text: block.text,
        extractionMethod: "ocr_markdown",
      }),
    );
}

function routeLookupsFromBlocks(blocks: readonly DiscoveryBlock[]): {
  routeLookupRequests: RouteLookupRequest[];
  routeUniverse: string[];
} {
  const routeLookupRequests: RouteLookupRequest[] = [];
  const routeUniverse = new Set<string>();
  for (const block of blocks) {
    const lookup = routeLookup({
      text: block.text,
      lookupHandle: `route-block-${block.blockId.toLowerCase()}`,
    });
    if (lookup.candidates.length === 0) continue;
    routeLookupRequests.push({ lookupHandle: lookup.lookupHandle, text: block.text });
    for (const candidate of lookup.candidates) routeUniverse.add(candidate.routeId);
  }
  return {
    routeLookupRequests,
    routeUniverse: [...routeUniverse].toSorted(),
  };
}

function priorContextFromDiscovery(extraction: DiscoveryExtraction | null): unknown[] {
  if (extraction === null) return [];
  return [
    {
      kind: "prior_discovery_window",
      validationState: "prior_hint_not_truth",
      pageProfile: extraction.pageProfile ?? null,
      entities: extraction.entities ?? [],
      metrics: extraction.metrics ?? [],
      events: extraction.events ?? [],
      tables: extraction.tables ?? [],
      claims: extraction.claims ?? [],
      contextSignals: extraction.contextSignals ?? [],
      reviewQuestions: extraction.reviewQuestions ?? [],
    },
  ];
}

function sourceContextFromDiscovery(input: {
  runId: string;
  window: DiscoveryWindow;
  blockIndex: DiscoveryBlockIndex;
  metadata: DiscoverySourceMetadata | null;
  extraction: DiscoveryExtraction | null;
}): DocumentResearchSourceContext {
  const extractionSource = input.extraction?.source;
  const pageArtifactKey =
    extractionSource?.pageArtifactKeys?.[0] ??
    input.blockIndex.pageArtifactKeys[0] ??
    `unknown:${input.window.windowId}`;
  return DocumentResearchSourceContextSchema.parse({
    sourceId: input.window.sourceId,
    sourceTitle: extractionSource?.sourceTitle ?? input.metadata?.title ?? input.window.sourceId,
    sourceGroup: extractionSource?.sourceGroup ?? input.metadata?.sourceGroup ?? "unknown",
    sourceInvestigationId: input.runId,
    pageNumbers:
      input.window.pageNumbers.length > 0 ? input.window.pageNumbers : input.blockIndex.pageNumbers,
    sourceContentHash:
      extractionSource?.sourceContentHash ??
      input.metadata?.sha256 ??
      `sha256:${shortHash(input.window.sourceId)}`,
    pageArtifactKey,
    markdownHash: input.blockIndex.markdownHash,
    blockIndexHash: input.blockIndex.blockIndexHash,
  });
}

export async function buildTier2AgenticExtractionRequestFromDiscovery(
  args: BuildTier2AgenticExtractionRequestFromDiscoveryArgs,
): Promise<Tier2AgenticExtractionRequest> {
  const discovery = await readDiscoveryRun(args.discoveryPath);
  const window = selectedDiscoveryWindow({
    discovery,
    ...(args.windowId === undefined ? {} : { windowId: args.windowId }),
    ...(args.sourceId === undefined ? {} : { sourceId: args.sourceId }),
  });
  if (window.blockIndexArtifactKey === null || window.blockIndexArtifactKey === undefined) {
    throw new Error(`Discovery window ${window.windowId} does not have a block index artifact.`);
  }
  const runId = args.runId ?? "tier2-agentic-extraction";
  const blockIndex = DiscoveryBlockIndexSchema.parse(
    await Bun.file(
      artifactPathFromKey({
        discoveryPath: args.discoveryPath,
        artifactKey: window.blockIndexArtifactKey,
      }),
    ).json(),
  );
  const metadataRaw = await readJsonIfExists(
    metadataPathForWindow({ discoveryPath: args.discoveryPath, sourceId: window.sourceId }),
  );
  const metadata = metadataRaw === null ? null : DiscoverySourceMetadataSchema.parse(metadataRaw);
  const extractionRaw =
    window.extractionArtifactKey === null || window.extractionArtifactKey === undefined
      ? null
      : await readJsonIfExists(
          artifactPathFromKey({
            discoveryPath: args.discoveryPath,
            artifactKey: window.extractionArtifactKey,
          }),
        );
  const extraction = extractionRaw === null ? null : DiscoveryExtractionSchema.parse(extractionRaw);
  const source = sourceContextFromDiscovery({
    runId,
    window,
    blockIndex,
    metadata,
    extraction,
  });
  const routeContext = routeLookupsFromBlocks(blockIndex.blocks);
  const priorContext = [...priorContextFromDiscovery(extraction), ...(args.priorContext ?? [])];
  return Tier2AgenticExtractionRequestSchema.parse({
    schemaVersion: 1,
    runId,
    generatedAt: args.generatedAt,
    source,
    evidenceHandles: evidenceHandlesFromBlocks({ source, blockIndex }),
    routeLookupRequests: routeContext.routeLookupRequests,
    routeUniverse: routeContext.routeUniverse,
    ...(args.routeCatalogPath === undefined ? {} : { routeCatalogPath: args.routeCatalogPath }),
    priorContext,
    drafts: [],
  });
}

async function readRequest(path: string): Promise<Tier2AgenticExtractionRequest> {
  const raw = await Bun.file(path).json();
  return Tier2AgenticExtractionRequestSchema.parse(raw);
}

async function buildRouteLookups(
  request: Tier2AgenticExtractionRequest,
): Promise<DocumentResearchRouteLookupResult[]> {
  const catalog =
    request.routeCatalogPath === undefined
      ? undefined
      : await loadRouteCatalog(request.routeCatalogPath);
  return request.routeLookupRequests.map((lookupRequest) =>
    routeLookup({
      text: lookupRequest.text,
      ...(lookupRequest.lookupHandle === undefined
        ? {}
        : { lookupHandle: lookupRequest.lookupHandle }),
      ...(catalog === undefined ? {} : { routeCatalog: catalog }),
      routeUniverse: request.routeUniverse,
    }),
  );
}

type DraftEvaluation = {
  validationResults: DocumentResearchSurfaceDraftValidation[];
  submitResult: SubmitDocumentResearchSurfaceDraftsResult;
};

function evaluateDrafts(input: {
  readonly idPrefix: string;
  readonly drafts: readonly DocumentResearchSurfaceDraftV2[];
  readonly source: DocumentResearchSourceContext;
  readonly evidenceHandles: readonly DocumentResearchEvidenceHandle[];
  readonly lookupResults: readonly DocumentResearchLookupResult[];
  readonly routeUniverse: readonly string[];
}): DraftEvaluation {
  const validationResults = input.drafts.map((draft) =>
    validateDocumentResearchSurfaceDraft({
      draft,
      source: input.source,
      evidenceHandles: input.evidenceHandles,
      lookupResults: input.lookupResults,
      routeUniverse: input.routeUniverse,
    }),
  );
  const submitResult = submitDocumentResearchSurfaceDrafts({
    idPrefix: input.idPrefix,
    drafts: input.drafts,
    source: input.source,
    evidenceHandles: input.evidenceHandles,
    lookupResults: input.lookupResults,
    routeUniverse: input.routeUniverse,
  });
  return { validationResults, submitResult };
}

function lookupByKindAndHandle(input: {
  lookupResults: readonly DocumentResearchLookupResult[];
  lookupKind: string;
  lookupHandle: string;
}): DocumentResearchLookupResult | null {
  return (
    input.lookupResults.find(
      (lookup) =>
        lookup.lookupKind === input.lookupKind && lookup.lookupHandle === input.lookupHandle,
    ) ?? null
  );
}

const SOURCE_STATEMENT_SURFACE_KINDS = new Set(["metric_observation", "claim", "causal_claim"]);

const SOURCE_CLAIM_AUTHORITIES = new Set([
  "official_mta",
  "official_nyc_dot",
  "official_joint_mta_dot",
  "third_party",
  "unknown",
]);

const SOURCE_STATEMENT_TRUTH_STATUSES = new Set([
  "official_source_statement",
  "official_agency_metric_claim",
  "document_claim_only",
  "deterministic_project_metric",
]);

const PUBLICATION_WORDING_GATES = new Set([
  "quote_as_source_statement",
  "needs_metric_crosscheck",
  "needs_causal_review",
  "review_only",
]);

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function payloadString(input: {
  readonly draft: DocumentResearchSurfaceDraftV2;
  readonly fieldNames: readonly string[];
}): string | null {
  for (const fieldName of input.fieldNames) {
    const value = stringField(input.draft.rawPayload[fieldName]);
    if (value !== null) return value;
  }
  return null;
}

function authorityText(input: {
  readonly source: DocumentResearchSourceContext;
  readonly draft: DocumentResearchSurfaceDraftV2;
}): string {
  return [
    input.source.sourceId,
    input.source.sourceGroup,
    input.source.sourceTitle,
    payloadString({
      draft: input.draft,
      fieldNames: [
        "sourceClaimAuthority",
        "metricAuthority",
        "authorityRaw",
        "authority",
        "factAuthority",
        "claimAuthority",
        "presentingAgency",
        "publisher",
        "dataSource",
      ],
    }),
  ]
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase();
}

function normalizeSourceClaimAuthority(value: unknown): string | null {
  const text = stringField(value);
  if (text === null) return null;
  const normalized = text.toLowerCase().replace(/[\s/]+/gu, "_");
  if (SOURCE_CLAIM_AUTHORITIES.has(normalized)) return normalized;
  const hasMta = /\b(mta|nyct|new york city transit)\b/iu.test(text);
  const hasDot = /\b(dot|nyc\s+dot|nycdot|department of transportation)\b/iu.test(text);
  if (hasMta && hasDot) return "official_joint_mta_dot";
  if (hasMta) return "official_mta";
  if (hasDot) return "official_nyc_dot";
  if (/\b(survey|consultant|third[-\s]?party|merchant|business)\b/iu.test(text)) {
    return "third_party";
  }
  return null;
}

function inferSourceClaimAuthority(input: {
  readonly source: DocumentResearchSourceContext;
  readonly draft: DocumentResearchSurfaceDraftV2;
}): string {
  const explicit = normalizeSourceClaimAuthority(input.draft.rawPayload["sourceClaimAuthority"]);
  if (explicit !== null && explicit !== "unknown") return explicit;
  const payloadAuthority = payloadString({
    draft: input.draft,
    fieldNames: [
      "metricAuthority",
      "authorityRaw",
      "authority",
      "factAuthority",
      "claimAuthority",
      "presentingAgency",
      "publisher",
    ],
  });
  const normalizedPayloadAuthority = normalizeSourceClaimAuthority(payloadAuthority);
  if (normalizedPayloadAuthority !== null) return normalizedPayloadAuthority;
  const text = authorityText(input);
  const hasMta =
    /(^|[^a-z0-9])(mta|nyct)(?=[^a-z0-9]|$)/iu.test(text) ||
    /\bnew york city transit\b/iu.test(text);
  const hasDot =
    text.includes("nyc_dot") ||
    /(^|[^a-z0-9])(nyc dot|nycdot|dot|department of transportation)(?=[^a-z0-9]|$)/iu.test(text);
  if (hasMta && hasDot) return "official_joint_mta_dot";
  if (hasMta) return "official_mta";
  if (hasDot) return "official_nyc_dot";
  return explicit ?? "unknown";
}

function officialAuthority(authority: string): boolean {
  return (
    authority === "official_mta" ||
    authority === "official_nyc_dot" ||
    authority === "official_joint_mta_dot"
  );
}

function claimLooksCausal(draft: DocumentResearchSurfaceDraftV2): boolean {
  const text = [
    draft.surfaceKind,
    draft.rawText,
    draft.displayLabel,
    payloadString({
      draft,
      fieldNames: ["claimKind", "claimKindRaw", "claimText", "cause", "effect"],
    }),
  ]
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase();
  return /\b(causal|cause|caused|because|due to|driven by|resulted in|made possible by|impact|effect)\b/iu.test(
    text,
  );
}

function inferTruthStatus(input: {
  readonly draft: DocumentResearchSurfaceDraftV2;
  readonly sourceClaimAuthority: string;
}): string {
  const explicit = stringField(input.draft.rawPayload["truthStatus"]);
  if (explicit !== null && SOURCE_STATEMENT_TRUTH_STATUSES.has(explicit)) return explicit;
  if (officialAuthority(input.sourceClaimAuthority)) {
    return input.draft.surfaceKind === "metric_observation"
      ? "official_agency_metric_claim"
      : "official_source_statement";
  }
  return "document_claim_only";
}

function inferPublicationWordingGate(input: {
  readonly draft: DocumentResearchSurfaceDraftV2;
  readonly sourceClaimAuthority: string;
}): string {
  const explicit = stringField(input.draft.rawPayload["publicationWordingGate"]);
  if (explicit !== null && PUBLICATION_WORDING_GATES.has(explicit)) return explicit;
  if (input.draft.surfaceKind === "causal_claim" || claimLooksCausal(input.draft)) {
    return "needs_causal_review";
  }
  if (officialAuthority(input.sourceClaimAuthority)) return "quote_as_source_statement";
  return "review_only";
}

function isSourceStatementSurface(draft: DocumentResearchSurfaceDraftV2): boolean {
  return SOURCE_STATEMENT_SURFACE_KINDS.has(draft.surfaceKind);
}

function deterministicDraftRepairs(input: {
  readonly source: DocumentResearchSourceContext;
  readonly drafts: readonly DocumentResearchSurfaceDraftV2[];
  readonly lookupResults: readonly DocumentResearchLookupResult[];
  readonly evidenceHandles: readonly DocumentResearchEvidenceHandle[];
}): DocumentResearchSurfaceDraftV2[] {
  return input.drafts.map((draft) => {
    let repaired: DocumentResearchSurfaceDraftV2 = draft;
    if (isSourceStatementSurface(repaired)) {
      const sourceClaimAuthority = inferSourceClaimAuthority({
        source: input.source,
        draft: repaired,
      });
      const truthStatus = inferTruthStatus({ draft: repaired, sourceClaimAuthority });
      const publicationWordingGate = inferPublicationWordingGate({
        draft: repaired,
        sourceClaimAuthority,
      });
      repaired = DocumentResearchSurfaceDraftV2Schema.parse({
        ...repaired,
        rawPayload: {
          ...repaired.rawPayload,
          sourceClaimAuthority,
          truthStatus,
          publicationWordingGate,
        },
      });
    }
    for (const selection of repaired.canonicalSelections) {
      if (
        selection.lookupKind !== "route" ||
        selection.rawTextFieldPath !== "rawPayload.routeTextRaw" ||
        draftPathValue(repaired, selection.rawTextFieldPath) !== undefined
      ) {
        continue;
      }
      const lookup = lookupByKindAndHandle({
        lookupResults: input.lookupResults,
        lookupKind: selection.lookupKind,
        lookupHandle: selection.lookupHandle,
      });
      if (
        lookup?.lookupKind !== "route" ||
        !textIsInEvidence({ text: lookup.rawText, evidenceHandles: input.evidenceHandles })
      ) {
        continue;
      }
      repaired = DocumentResearchSurfaceDraftV2Schema.parse({
        ...repaired,
        rawPayload: {
          ...repaired.rawPayload,
          routeTextRaw: lookup.rawText,
        },
        evidenceByField: {
          ...repaired.evidenceByField,
          "rawPayload.routeTextRaw":
            repaired.evidenceByField["rawPayload.routeTextRaw"] ??
            selection.evidenceHandles.map((evidenceHandle) => ({
              evidenceHandle,
              supportRole: "route_scope",
              supportCompleteness: "exact",
            })),
        },
      });
    }
    return repaired;
  });
}

function fallbackToolParameterSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["drafts"],
    properties: {
      drafts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
        },
      },
      notes: { type: "string" },
    },
  };
}

function asJsonObjectSchema(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fallbackToolParameterSchema();
}

function agenticExtractionTool(): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  let parameters: Record<string, unknown>;
  try {
    parameters = asJsonObjectSchema(toProjectJsonSchema(AgenticExtractionToolResponseSchema));
  } catch {
    parameters = fallbackToolParameterSchema();
  }
  return {
    name: AGENTIC_EXTRACTION_TOOL_NAME,
    description:
      "Submit evidence-backed document research surface drafts. Canonical selections must reference provided lookup handles and candidate ids exactly.",
    parameters,
  };
}

function lookupSummary(lookup: DocumentResearchLookupResult): unknown {
  if (lookup.lookupKind === "route") {
    return {
      lookupKind: lookup.lookupKind,
      lookupHandle: lookup.lookupHandle,
      rawText: lookup.rawText,
      allowedSelectedIds: lookup.candidates.map((candidate) => candidate.routeId),
      candidates: lookup.candidates.map((candidate) => ({
        routeId: candidate.routeId,
        aliases: candidate.aliases,
        mode: candidate.mode,
        currentStatus: candidate.currentStatus,
        routeFamily: candidate.routeFamily ?? null,
        serviceVariants: candidate.serviceVariants,
        resolutionTier: candidate.resolutionTier,
        score: candidate.score ?? null,
        requiresReview: candidate.requiresReview,
      })),
      ambiguityNotes: lookup.ambiguityNotes,
    };
  }
  return {
    lookupKind: lookup.lookupKind,
    lookupHandle: lookup.lookupHandle,
    rawText: lookup.rawText ?? null,
    allowedSelectedIds: lookup.candidates.map((candidate) => candidate.id),
    candidates: lookup.candidates,
    ambiguityNotes: lookup.ambiguityNotes,
  };
}

function lookupForSelection(input: {
  lookupResults: readonly DocumentResearchLookupResult[];
  lookupKind: string;
  lookupHandle: string;
}): DocumentResearchLookupResult | null {
  return (
    input.lookupResults.find(
      (lookup) =>
        lookup.lookupKind === input.lookupKind && lookup.lookupHandle === input.lookupHandle,
    ) ?? null
  );
}

function repairFeedbackFor(input: {
  readonly drafts: readonly DocumentResearchSurfaceDraftV2[];
  readonly evaluation: DraftEvaluation;
  readonly lookupResults: readonly DocumentResearchLookupResult[];
}): unknown[] {
  return input.evaluation.submitResult.rejected.map((rejection) => {
    const draft = input.drafts[rejection.draftIndex];
    return {
      draftIndex: rejection.draftIndex,
      displayLabel: draft?.displayLabel ?? null,
      rawText: draft?.rawText ?? null,
      submittedCanonicalSelections:
        draft?.canonicalSelections.map((selection) => {
          const lookup = lookupForSelection({
            lookupResults: input.lookupResults,
            lookupKind: selection.lookupKind,
            lookupHandle: selection.lookupHandle,
          });
          return {
            fieldPath: selection.fieldPath,
            lookupKind: selection.lookupKind,
            lookupHandle: selection.lookupHandle,
            submittedSelectedIds: selection.selectedIds,
            rawTextFieldPath: selection.rawTextFieldPath ?? null,
            allowedLookup: lookup === null ? null : lookupSummary(lookup),
          };
        }) ?? [],
      validationState: rejection.validation.state,
      issues: rejection.validation.issues.map((issue) => ({
        severity: issue.severity,
        code: issue.code,
        path: issue.path,
        message: issue.message,
        recoverability: issue.recoverability,
        suggestedActions: issue.suggestedActions,
      })),
    };
  });
}

function zodErrorFeedback(error: z.ZodError): unknown[] {
  return [
    {
      kind: "tool_response_schema_error",
      issues: error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  ];
}

function normalizeAgenticToolResponseArgs(rawToolArgs: unknown): unknown {
  if (rawToolArgs === null || typeof rawToolArgs !== "object" || Array.isArray(rawToolArgs)) {
    return rawToolArgs;
  }
  const response = { ...(rawToolArgs as Record<string, unknown>) };
  if (typeof response["notes"] === "string" && response["notes"].trim().length === 0) {
    delete response["notes"];
  }
  if (Array.isArray(response["drafts"])) {
    response["drafts"] = response["drafts"].map((draft) => {
      if (draft === null || typeof draft !== "object" || Array.isArray(draft)) return draft;
      const normalizedDraft = { ...(draft as Record<string, unknown>) };
      if (
        typeof normalizedDraft["agentNotes"] === "string" &&
        normalizedDraft["agentNotes"].trim().length === 0
      ) {
        delete normalizedDraft["agentNotes"];
      }
      return normalizedDraft;
    });
  }
  return response;
}

function buildAgenticExtractionMessages(input: {
  readonly request: Tier2AgenticExtractionRequest;
  readonly evidenceHandles: readonly DocumentResearchEvidenceHandle[];
  readonly lookupResults: readonly DocumentResearchLookupResult[];
  readonly routeLookups: readonly DocumentResearchRouteLookupResult[];
  readonly repairRound: number;
  readonly repairFeedback: readonly unknown[];
}): ToolCallMessage[] {
  const system = [
    "You extract document research surfaces for Bus Priority Impact Studio.",
    "Use only the provided source context, evidence handles, lookup results, route universe, and prior draft context.",
    "Submit through the forced tool exactly once.",
    "Every substantive field must be backed by evidenceByField entries using known evidenceHandle values. evidenceByField keys must be exact draft paths such as rawText, displayLabel, or rawPayload.routeTextRaw.",
    "For canonicalSelections, select only ids returned by the matching lookupHandle. Do not normalize route prose yourself.",
    "Route canonicalSelections must use fieldPath routeIds. Put exact source route wording in rawPayload.routeTextRaw and reference it with rawTextFieldPath.",
    "Lookup rawText and routeLookupRequests are resolver context, not source evidence. Do not quote, summarize, or infer document content from lookup text unless a cited evidenceHandle contains the same wording.",
    "For routes, selectedIds must be bare canonical route ids like M15 or BX12. Keep SBS/local/limited/express wording in rawPayload, service variant notes, or agentNotes, never inside selectedIds.",
    "Do not submit missing-data/source-gap support unless the input includes an explicit source_shell/search transcript proving the absence. With only OCR evidence handles, ask review questions but do not claim the source is missing something.",
    "If source wording is ambiguous or the lookup candidates do not support a canonical id, keep the raw text and add agentNotes or a review_question/source_gap_seed instead of inventing an id.",
    "Prefer richer, evidence-backed rawPayload data over terse rows; downstream briefs and findings need route/date/status/treatment/metric/context details when the source supports them.",
    "For metric_observation, claim, and causal_claim rows, include rawPayload.sourceClaimAuthority, rawPayload.truthStatus, and rawPayload.publicationWordingGate. Use official_nyc_dot/official_mta/official_joint_mta_dot when an official agency source states the claim; use official_agency_metric_claim for official source-stated metrics; use quote_as_source_statement unless the row needs causal review.",
  ].join("\n");
  const promptContext = {
    promptVersion: AGENTIC_EXTRACTION_PROMPT_VERSION,
    task: "Return draft document research surfaces for this source window. Include detector evidence, detector context, brief/finding seeds, review questions, and source gaps when supported.",
    repairRound: input.repairRound,
    source: input.request.source,
    routeUniverse: input.request.routeUniverse,
    evidenceHandles: input.evidenceHandles,
    lookupResults: input.lookupResults.map(lookupSummary),
    generatedRouteLookups: input.routeLookups.map(lookupSummary),
    routeLookupRequests: input.request.routeLookupRequests,
    priorContext:
      input.request.priorContext.length === 0
        ? []
        : input.request.priorContext.map((context) => ({
            hintOnly: true,
            verificationPolicy:
              "Use this prior extraction only to decide what to inspect. It is not source evidence and cannot satisfy evidenceByField.",
            context,
          })),
    priorDrafts: input.request.drafts,
    repairFeedback: input.repairFeedback,
    outputShape:
      "Call submit_document_research_surface_drafts with { drafts: DocumentResearchSurfaceDraftV2[], notes?: string }.",
  };
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `Extract and submit the best usable research surfaces from this context.\n\n${JSON.stringify(
        promptContext,
        null,
        2,
      )}`,
    },
  ];
}

async function callAgenticExtractionProvider(input: {
  readonly provider: AgenticExtractionProvider;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly messages: ToolCallMessage[];
  readonly fetcher: FetchLike;
  readonly pioneerApiKey?: string;
  readonly deepseekApiKey?: string;
}) {
  const tool = agenticExtractionTool();
  if (input.provider === "pioneer") {
    const apiKey = input.pioneerApiKey ?? process.env["PIONEER_API_KEY"];
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error(
        "PIONEER_API_KEY is required for agentic extraction with --provider pioneer.",
      );
    }
    return callPioneerToolCallDirect({
      apiKey,
      model: input.model,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      toolName: AGENTIC_EXTRACTION_TOOL_NAME,
      messages: input.messages,
      tools: [tool],
      fetcher: input.fetcher,
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
    });
  }
  const apiKey = input.deepseekApiKey ?? process.env["DEEPSEEK_API_KEY"];
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error(
      "DEEPSEEK_API_KEY is required for agentic extraction with --provider deepseek.",
    );
  }
  return callDeepSeekToolCallDirect({
    apiKey,
    model: input.model,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    toolName: AGENTIC_EXTRACTION_TOOL_NAME,
    messages: input.messages,
    tools: [tool],
    fetcher: input.fetcher,
    ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

function attemptFromEvaluation(input: {
  readonly attemptIndex: number;
  readonly repairRound: number;
  readonly provider: AgenticExtractionProvider;
  readonly model: string;
  readonly temperature: number;
  readonly httpStatus: number | null;
  readonly rawToolArgs: unknown | null;
  readonly toolResponse: AgenticExtractionToolResponse;
  readonly evaluation: DraftEvaluation;
}): Tier2AgenticExtractionLlmAttempt {
  return {
    attemptIndex: input.attemptIndex,
    repairRound: input.repairRound,
    provider: input.provider,
    model: input.model,
    temperature: input.temperature,
    promptVersion: AGENTIC_EXTRACTION_PROMPT_VERSION,
    httpStatus: input.httpStatus,
    providerErrorMessage: null,
    status: input.evaluation.submitResult.state,
    errorMessage: null,
    toolNotes: input.toolResponse.notes ?? null,
    rawToolArgs: input.rawToolArgs,
    drafts: input.toolResponse.drafts,
    draftCount: input.toolResponse.drafts.length,
    acceptedCount: input.evaluation.submitResult.accepted.length,
    rejectedCount: input.evaluation.submitResult.rejected.length,
    validationIssueCount: input.evaluation.validationResults.reduce(
      (sum, validation) => sum + validation.issues.length,
      0,
    ),
    validationResults: input.evaluation.validationResults,
  };
}

async function generateDraftsWithLlm(input: {
  readonly runId: string;
  readonly request: Tier2AgenticExtractionRequest;
  readonly source: DocumentResearchSourceContext;
  readonly evidenceHandles: readonly DocumentResearchEvidenceHandle[];
  readonly lookupResults: readonly DocumentResearchLookupResult[];
  readonly routeLookups: readonly DocumentResearchRouteLookupResult[];
  readonly provider: AgenticExtractionProvider;
  readonly model: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly maxRepairRounds: number;
  readonly fetcher: FetchLike;
  readonly pioneerApiKey?: string;
  readonly deepseekApiKey?: string;
}): Promise<{
  drafts: DocumentResearchSurfaceDraftV2[];
  attempts: Tier2AgenticExtractionLlmAttempt[];
}> {
  const attempts: Tier2AgenticExtractionLlmAttempt[] = [];
  let repairFeedback: unknown[] = [];
  let lastParseableDrafts: DocumentResearchSurfaceDraftV2[] | null = null;

  for (let repairRound = 0; repairRound <= input.maxRepairRounds; repairRound += 1) {
    const messages = buildAgenticExtractionMessages({
      request: input.request,
      evidenceHandles: input.evidenceHandles,
      lookupResults: input.lookupResults,
      routeLookups: input.routeLookups,
      repairRound,
      repairFeedback,
    });
    const result = await callAgenticExtractionProvider({
      provider: input.provider,
      model: input.model,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
      messages,
      fetcher: input.fetcher,
      ...(input.pioneerApiKey === undefined ? {} : { pioneerApiKey: input.pioneerApiKey }),
      ...(input.deepseekApiKey === undefined ? {} : { deepseekApiKey: input.deepseekApiKey }),
    });
    const providerErrorMessage = openRouterErrorMessage(result.body);
    if (!result.response.ok) {
      const errorMessage = providerErrorMessage ?? result.response.statusText;
      attempts.push({
        attemptIndex: attempts.length + 1,
        repairRound,
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        promptVersion: AGENTIC_EXTRACTION_PROMPT_VERSION,
        httpStatus: result.response.status,
        providerErrorMessage,
        status: "provider_failed",
        errorMessage,
        toolNotes: null,
        rawToolArgs: null,
        drafts: [],
        draftCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        validationIssueCount: 0,
        validationResults: [],
      });
      return { drafts: lastParseableDrafts ?? [], attempts };
    }

    const rawToolArgs = extractToolCallArguments(result.body, AGENTIC_EXTRACTION_TOOL_NAME);
    if (rawToolArgs === null) {
      const errorMessage = missingToolCallErrorMessage({
        responseJson: result.body,
        toolName: AGENTIC_EXTRACTION_TOOL_NAME,
        maxTokens: input.maxTokens,
      });
      attempts.push({
        attemptIndex: attempts.length + 1,
        repairRound,
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        promptVersion: AGENTIC_EXTRACTION_PROMPT_VERSION,
        httpStatus: result.response.status,
        providerErrorMessage: null,
        status: "tool_response_parse_failed",
        errorMessage,
        toolNotes: null,
        rawToolArgs,
        drafts: [],
        draftCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        validationIssueCount: 0,
        validationResults: [],
      });
      repairFeedback = [{ kind: "missing_forced_tool_call", message: errorMessage }];
      continue;
    }

    const normalizedToolArgs = normalizeAgenticToolResponseArgs(rawToolArgs);
    const parsedToolResponse = AgenticExtractionToolResponseSchema.safeParse(normalizedToolArgs);
    if (!parsedToolResponse.success) {
      const errorMessage = "Tool response did not match DocumentResearchSurfaceDraftV2[] schema.";
      attempts.push({
        attemptIndex: attempts.length + 1,
        repairRound,
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        promptVersion: AGENTIC_EXTRACTION_PROMPT_VERSION,
        httpStatus: result.response.status,
        providerErrorMessage: null,
        status: "tool_response_parse_failed",
        errorMessage,
        toolNotes: null,
        rawToolArgs,
        drafts: [],
        draftCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        validationIssueCount: 0,
        validationResults: [],
      });
      repairFeedback = zodErrorFeedback(parsedToolResponse.error);
      continue;
    }

    const toolResponse = {
      ...parsedToolResponse.data,
      drafts: deterministicDraftRepairs({
        source: input.source,
        drafts: parsedToolResponse.data.drafts,
        lookupResults: input.lookupResults,
        evidenceHandles: input.evidenceHandles,
      }),
    };
    lastParseableDrafts = toolResponse.drafts;
    const evaluation = evaluateDrafts({
      idPrefix: `${input.runId}:attempt:${repairRound + 1}`,
      drafts: toolResponse.drafts,
      source: input.source,
      evidenceHandles: input.evidenceHandles,
      lookupResults: input.lookupResults,
      routeUniverse: input.request.routeUniverse,
    });
    attempts.push(
      attemptFromEvaluation({
        attemptIndex: attempts.length + 1,
        repairRound,
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        httpStatus: result.response.status,
        rawToolArgs,
        toolResponse,
        evaluation,
      }),
    );
    if (evaluation.submitResult.rejected.length === 0) {
      return { drafts: toolResponse.drafts, attempts };
    }
    repairFeedback = repairFeedbackFor({
      drafts: toolResponse.drafts,
      evaluation,
      lookupResults: input.lookupResults,
    });
  }

  if (lastParseableDrafts === null) {
    return { drafts: [], attempts };
  }
  return { drafts: lastParseableDrafts, attempts };
}

function draftPathValue(root: unknown, path: string): unknown {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  let current: unknown = root;
  for (const part of normalized.split(".")) {
    if (part.length === 0) continue;
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function handleText(handle: DocumentResearchEvidenceHandle): string {
  return [handle.quoteText, handle.text].filter((part) => part !== undefined).join("\n");
}

function textIsInEvidence(input: {
  text: string;
  evidenceHandles: readonly DocumentResearchEvidenceHandle[];
}): boolean {
  const needle = input.text.trim();
  if (needle.length === 0) return false;
  return input.evidenceHandles.some((handle) => handleText(handle).includes(needle));
}

function pushAuditIssue(
  issues: Tier2AgenticExtractionAuditIssue[],
  issueInput: Tier2AgenticExtractionAuditIssue,
) {
  issues.push(issueInput);
}

export function auditTier2AgenticExtractionArtifact(input: {
  readonly artifact: Tier2AgenticExtractionArtifact;
  readonly artifactPath?: string | null;
  readonly generatedAt?: string;
}): Tier2AgenticExtractionAudit {
  const issues: Tier2AgenticExtractionAuditIssue[] = [];
  const surfaceKindCounts: Record<string, number> = {};
  const routeFieldPaths: Record<string, number> = {};
  const evidenceHandlesById = new Map(
    input.artifact.evidenceHandles.map((handle) => [handle.evidenceHandle, handle]),
  );

  if (input.artifact.summary.rejectedCount > 0 || input.artifact.summary.validationIssueCount > 0) {
    pushAuditIssue(issues, {
      severity: "error",
      code: "artifact_has_validation_failures",
      path: "summary",
      message:
        "The final artifact still has rejected drafts or validation issues and should not be scaled.",
    });
  }

  if (input.artifact.execute && input.artifact.llmAttempts.length === 0) {
    pushAuditIssue(issues, {
      severity: "error",
      code: "executed_artifact_has_no_llm_attempts",
      path: "llmAttempts",
      message: "Executed artifacts must preserve at least one LLM attempt for auditability.",
    });
  }

  for (const [attemptIndex, attempt] of input.artifact.llmAttempts.entries()) {
    if (attempt.status === "provider_failed") {
      pushAuditIssue(issues, {
        severity: "error",
        code: "llm_provider_failed",
        path: `llmAttempts.${attemptIndex}`,
        message: attempt.errorMessage ?? "The LLM provider failed for this window.",
      });
    }
  }

  if (
    input.artifact.execute &&
    input.artifact.llmAttempts.length > 0 &&
    input.artifact.llmAttempts.every((attempt) => attempt.status === "tool_response_parse_failed")
  ) {
    pushAuditIssue(issues, {
      severity: "error",
      code: "llm_no_parseable_tool_response",
      path: "llmAttempts",
      message: "The LLM never produced a parseable forced-tool response for this window.",
    });
  }

  for (const lookup of input.artifact.routeLookups) {
    if (
      lookup.candidates.length > 0 &&
      !textIsInEvidence({ text: lookup.rawText, evidenceHandles: input.artifact.evidenceHandles })
    ) {
      pushAuditIssue(issues, {
        severity: "error",
        code: "route_lookup_text_without_evidence",
        path: `routeLookups.${lookup.lookupHandle}.rawText`,
        message:
          "Route lookup rawText is not contained in any evidence handle. Generate route lookups from source blocks/search transcripts only.",
      });
    }
  }

  for (const [draftIndex, draft] of input.artifact.drafts.entries()) {
    surfaceKindCounts[draft.surfaceKind] = (surfaceKindCounts[draft.surfaceKind] ?? 0) + 1;
    if (isSourceStatementSurface(draft)) {
      const sourceClaimAuthority = stringField(draft.rawPayload["sourceClaimAuthority"]);
      const truthStatus = stringField(draft.rawPayload["truthStatus"]);
      const publicationWordingGate = stringField(draft.rawPayload["publicationWordingGate"]);
      if (
        sourceClaimAuthority === null ||
        !SOURCE_CLAIM_AUTHORITIES.has(sourceClaimAuthority) ||
        truthStatus === null ||
        !SOURCE_STATEMENT_TRUTH_STATUSES.has(truthStatus) ||
        publicationWordingGate === null ||
        !PUBLICATION_WORDING_GATES.has(publicationWordingGate)
      ) {
        pushAuditIssue(issues, {
          severity: "error",
          code: "source_statement_authority_fields_missing",
          path: `drafts.${draftIndex}.rawPayload`,
          message:
            "Metric/claim surfaces must carry canonical sourceClaimAuthority, truthStatus, and publicationWordingGate fields.",
        });
      }
      if (truthStatus === "deterministic_project_metric") {
        pushAuditIssue(issues, {
          severity: "error",
          code: "source_statement_claims_project_metric_truth",
          path: `drafts.${draftIndex}.rawPayload.truthStatus`,
          message:
            "Agentic document extraction may not promote source-stated rows to deterministic Studio metrics.",
        });
      }
    }
    for (const [fieldPath, supports] of Object.entries(draft.evidenceByField)) {
      if (draftPathValue(draft, fieldPath) === undefined) {
        pushAuditIssue(issues, {
          severity: "error",
          code: "evidence_field_path_not_found",
          path: `drafts.${draftIndex}.evidenceByField.${fieldPath}`,
          message: `Evidence path ${fieldPath} does not resolve on draft ${draftIndex}.`,
        });
      }
      for (const [supportIndex, support] of supports.entries()) {
        const handle = evidenceHandlesById.get(support.evidenceHandle);
        if (handle === undefined) {
          pushAuditIssue(issues, {
            severity: "error",
            code: "unknown_evidence_handle",
            path: `drafts.${draftIndex}.evidenceByField.${fieldPath}.${supportIndex}`,
            message: `Evidence handle ${support.evidenceHandle} is not available to the artifact.`,
          });
          continue;
        }
        if (
          (support.supportRole === "missing_data" || support.supportCompleteness === "absent") &&
          handle.extractionMethod !== "source_shell"
        ) {
          pushAuditIssue(issues, {
            severity: "error",
            code: "missing_data_requires_search_transcript",
            path: `drafts.${draftIndex}.evidenceByField.${fieldPath}.${supportIndex}`,
            message:
              "Missing-data support requires a source_shell/search transcript evidence handle.",
          });
        }
      }
    }
    for (const [selectionIndex, selection] of draft.canonicalSelections.entries()) {
      if (selection.lookupKind !== "route") continue;
      routeFieldPaths[selection.fieldPath] = (routeFieldPaths[selection.fieldPath] ?? 0) + 1;
      if (selection.fieldPath !== "routeIds") {
        pushAuditIssue(issues, {
          severity: "error",
          code: "route_selection_field_path_not_canonical",
          path: `drafts.${draftIndex}.canonicalSelections.${selectionIndex}.fieldPath`,
          message: "Canonical route selections must write to routeIds.",
        });
      }
      if (
        selection.rawTextFieldPath !== undefined &&
        draftPathValue(draft, selection.rawTextFieldPath) === undefined
      ) {
        pushAuditIssue(issues, {
          severity: "error",
          code: "raw_route_text_field_path_not_found",
          path: `drafts.${draftIndex}.canonicalSelections.${selectionIndex}.rawTextFieldPath`,
          message: `Route rawTextFieldPath ${selection.rawTextFieldPath} does not resolve on draft ${draftIndex}.`,
        });
      }
    }
  }

  return {
    artifactKind: "bp.tier2_agentic_extraction_audit.v1",
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    artifactPath: input.artifactPath ?? input.artifact.outputPath,
    runId: input.artifact.runId,
    summary: input.artifact.summary,
    attemptSummary: input.artifact.llmAttempts.map((attempt) => ({
      status: attempt.status,
      temperature:
        attempt.temperature ?? input.artifact.temperature ?? DEFAULT_AGENTIC_EXTRACTION_TEMPERATURE,
      draftCount: attempt.draftCount,
      acceptedCount: attempt.acceptedCount,
      rejectedCount: attempt.rejectedCount,
      validationIssueCount: attempt.validationIssueCount,
    })),
    surfaceKindCounts,
    routeFieldPaths,
    issues,
    blockerCount: issues.filter((issue) => issue.severity === "error").length,
  };
}

export async function auditTier2AgenticExtractionArtifactFile(input: {
  readonly inputPath: string;
  readonly outputPath?: string;
  readonly generatedAt?: string;
}): Promise<Tier2AgenticExtractionAudit> {
  const artifact = (await Bun.file(input.inputPath).json()) as Tier2AgenticExtractionArtifact;
  const audit = auditTier2AgenticExtractionArtifact({
    artifact,
    artifactPath: input.inputPath,
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  });
  if (input.outputPath !== undefined) {
    await mkdir(dirname(input.outputPath), { recursive: true });
    await writeJson(input.outputPath, audit);
  }
  return audit;
}

export async function runTier2AgenticExtractionHarness(
  args: RunTier2AgenticExtractionHarnessArgs,
): Promise<Tier2AgenticExtractionArtifact> {
  const request = await readRequest(args.inputPath);
  const runId = args.runId ?? request.runId ?? "tier2-agentic-extraction";
  const execute = args.execute === true;
  const provider = args.provider ?? DEFAULT_AGENTIC_EXTRACTION_PROVIDER;
  const model = args.model ?? DEFAULT_AGENTIC_EXTRACTION_MODEL;
  const maxTokens = args.maxTokens ?? DEFAULT_AGENTIC_EXTRACTION_MAX_TOKENS;
  const temperature = args.temperature ?? DEFAULT_AGENTIC_EXTRACTION_TEMPERATURE;
  const maxRepairRounds = args.maxRepairRounds ?? DEFAULT_AGENTIC_EXTRACTION_MAX_REPAIR_ROUNDS;
  const source = DocumentResearchSourceContextSchema.parse(request.source);
  const evidenceHandles: DocumentResearchEvidenceHandle[] = request.evidenceHandles.map((handle) =>
    DocumentResearchEvidenceHandleSchema.parse(handle),
  );
  const generatedLookups = await buildRouteLookups(request);
  const lookupResults: DocumentResearchLookupResult[] = [
    ...request.lookupResults,
    ...generatedLookups,
  ];
  const llmResult = execute
    ? await generateDraftsWithLlm({
        runId,
        request,
        source,
        evidenceHandles,
        lookupResults,
        routeLookups: generatedLookups,
        provider,
        model,
        maxTokens,
        temperature,
        ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
        ...(args.maxAttempts === undefined ? {} : { maxAttempts: args.maxAttempts }),
        maxRepairRounds,
        fetcher: args.fetcher ?? defaultFetch,
        ...(args.pioneerApiKey === undefined ? {} : { pioneerApiKey: args.pioneerApiKey }),
        ...(args.deepseekApiKey === undefined ? {} : { deepseekApiKey: args.deepseekApiKey }),
      })
    : null;
  const rawDrafts: DocumentResearchSurfaceDraftV2[] =
    llmResult?.drafts ??
    request.drafts.map((draft) => DocumentResearchSurfaceDraftV2Schema.parse(draft));
  const drafts = deterministicDraftRepairs({
    source,
    drafts: rawDrafts,
    lookupResults,
    evidenceHandles,
  });
  const evaluation = evaluateDrafts({
    idPrefix: runId,
    drafts,
    source,
    evidenceHandles,
    lookupResults,
    routeUniverse: request.routeUniverse,
  });
  const { validationResults, submitResult } = evaluation;
  const artifact: Tier2AgenticExtractionArtifact = {
    artifactKind: TIER2_AGENTIC_EXTRACTION_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt: args.generatedAt ?? request.generatedAt ?? new Date().toISOString(),
    runId,
    inputPath: args.inputPath,
    outputPath: args.outputPath ?? null,
    promptVersion: AGENTIC_EXTRACTION_PROMPT_VERSION,
    execute,
    provider: execute ? provider : null,
    model: execute ? model : null,
    maxTokens: execute ? maxTokens : null,
    temperature: execute ? temperature : null,
    timeoutMs: execute ? (args.timeoutMs ?? null) : null,
    maxAttempts: execute ? (args.maxAttempts ?? null) : null,
    maxRepairRounds,
    summary: {
      draftCount: drafts.length,
      acceptedCount: submitResult.accepted.length,
      rejectedCount: submitResult.rejected.length,
      routeLookupCount: generatedLookups.length,
      validationIssueCount: validationResults.reduce(
        (sum, validation) => sum + validation.issues.length,
        0,
      ),
      llmAttemptCount: llmResult?.attempts.length ?? 0,
    },
    source,
    evidenceHandles,
    lookupResults,
    routeLookups: generatedLookups,
    priorContext: request.priorContext,
    drafts,
    validationResults,
    submitResult,
    llmAttempts: llmResult?.attempts ?? [],
  };
  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  return artifact;
}

function safePathPart(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 180);
}

function pageSpan(pageNumbers: readonly number[]): string {
  if (pageNumbers.length === 0) return "unknown-pages";
  const sorted = [...pageNumbers].toSorted((a, b) => a - b);
  return sorted.length === 1
    ? `p${String(sorted[0]).padStart(4, "0")}`
    : `p${String(sorted[0]).padStart(4, "0")}-${String(sorted.at(-1)).padStart(4, "0")}`;
}

function selectDiscoveryWindowsForBatch(input: {
  discovery: z.output<typeof DiscoveryRunSchema>;
  windowIds?: readonly string[];
  sourceId?: string;
  status: string;
  limit: number;
}): DiscoveryWindow[] {
  const requestedWindowIds = new Set(input.windowIds ?? []);
  const windows = input.discovery.windows
    .filter((window) => {
      if (requestedWindowIds.size > 0) return requestedWindowIds.has(window.windowId);
      if (input.sourceId !== undefined && window.sourceId !== input.sourceId) return false;
      return window.status === input.status;
    })
    .filter(
      (window) =>
        window.blockIndexArtifactKey !== null && window.blockIndexArtifactKey !== undefined,
    )
    .toSorted((left, right) => left.windowId.localeCompare(right.windowId));
  return windows.slice(0, input.limit);
}

export async function runTier2AgenticExtractionBatch(
  args: RunTier2AgenticExtractionBatchArgs,
): Promise<Tier2AgenticExtractionBatchArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const runId = args.runId ?? "tier2-agentic-extraction-batch";
  const execute = args.execute === true;
  const discovery = await readDiscoveryRun(args.discoveryPath);
  const windows = selectDiscoveryWindowsForBatch({
    discovery,
    ...(args.windowIds === undefined ? {} : { windowIds: args.windowIds }),
    ...(args.sourceId === undefined ? {} : { sourceId: args.sourceId }),
    status: args.status ?? "extracted",
    limit: args.limit ?? args.windowIds?.length ?? 1,
  });
  if (windows.length === 0) {
    throw new Error("No discovery windows matched the agentic extraction batch selection.");
  }
  await mkdir(args.outputDir, { recursive: true });

  const batchWindows: Tier2AgenticExtractionBatchArtifact["windows"] = [];
  const summary = {
    draftCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    validationIssueCount: 0,
    auditBlockerCount: 0,
    llmAttemptCount: 0,
  };

  for (const [index, window] of windows.entries()) {
    const windowRunId = `${runId}:${window.windowId}`;
    const windowDir = join(
      args.outputDir,
      `${String(index + 1).padStart(4, "0")}_${safePathPart(window.sourceId)}_${pageSpan(window.pageNumbers)}`,
    );
    await mkdir(windowDir, { recursive: true });
    const requestPath = join(windowDir, "request.json");
    const artifactPath = join(windowDir, "artifact.json");
    const auditPath = join(windowDir, "audit.json");
    const priorContext = args.priorContextByWindowId?.get(window.windowId);
    const request = await buildTier2AgenticExtractionRequestFromDiscovery({
      discoveryPath: args.discoveryPath,
      windowId: window.windowId,
      generatedAt,
      runId: windowRunId,
      ...(args.routeCatalogPath === undefined ? {} : { routeCatalogPath: args.routeCatalogPath }),
      ...(priorContext === undefined ? {} : { priorContext }),
    });
    await writeJson(requestPath, request);
    const artifact = await runTier2AgenticExtractionHarness({
      inputPath: requestPath,
      outputPath: artifactPath,
      generatedAt,
      runId: windowRunId,
      execute,
      ...(args.provider === undefined ? {} : { provider: args.provider }),
      ...(args.model === undefined ? {} : { model: args.model }),
      ...(args.maxTokens === undefined ? {} : { maxTokens: args.maxTokens }),
      ...(args.temperature === undefined ? {} : { temperature: args.temperature }),
      ...(args.timeoutMs === undefined ? {} : { timeoutMs: args.timeoutMs }),
      ...(args.maxAttempts === undefined ? {} : { maxAttempts: args.maxAttempts }),
      ...(args.maxRepairRounds === undefined ? {} : { maxRepairRounds: args.maxRepairRounds }),
    });
    const audit = auditTier2AgenticExtractionArtifact({
      artifact,
      artifactPath,
      generatedAt,
    });
    await writeJson(auditPath, audit);

    summary.draftCount += artifact.summary.draftCount;
    summary.acceptedCount += artifact.summary.acceptedCount;
    summary.rejectedCount += artifact.summary.rejectedCount;
    summary.validationIssueCount += artifact.summary.validationIssueCount;
    summary.auditBlockerCount += audit.blockerCount;
    summary.llmAttemptCount += artifact.summary.llmAttemptCount;
    batchWindows.push({
      windowId: window.windowId,
      sourceId: window.sourceId,
      pageNumbers: window.pageNumbers,
      requestPath,
      artifactPath,
      auditPath,
      summary: artifact.summary,
      auditBlockerCount: audit.blockerCount,
    });
  }

  const batchArtifact: Tier2AgenticExtractionBatchArtifact = {
    artifactKind: "bp.tier2_agentic_extraction_batch.v1",
    generatedAt,
    runId,
    discoveryPath: args.discoveryPath,
    outputDir: args.outputDir,
    execute,
    windowCount: batchWindows.length,
    summary,
    windows: batchWindows,
  };
  await writeJson(join(args.outputDir, "manifest.json"), batchArtifact);
  return batchArtifact;
}
