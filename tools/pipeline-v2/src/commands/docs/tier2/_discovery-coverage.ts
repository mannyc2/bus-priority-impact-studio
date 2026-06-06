import { mkdir, readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  type DocumentDiscoveryExtraction,
  DocumentDiscoveryExtractionSchema,
} from "@bp/domain/documents/discovery";
import { Glob } from "bun";
import { writeJson } from "../../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { DISCOVERY_EXTRACTION_PROMPT_VERSION } from "./_discovery-extraction.ts";
import {
  artifactKey,
  type CliOption,
  latestDocsRunId,
  ocrPlanPath,
  parseCliOptions,
  parseSourceIds,
  readRequiredJsonArtifact,
  runArtifactRoot,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditPage,
  type Tier2OcrPlan,
} from "./_shared.ts";

type DiscoveryCoverageStatus =
  | "discovered"
  | "missing"
  | "failed"
  | "needs_rerun_old_schema"
  | "skipped_no_ocr"
  | "blocked_no_plan_source";

type DiscoveryRootHit = {
  discoveryRoot: string;
  artifactKey: string;
  promptVersion: string | null;
  validationIssueCount: number | null;
};

export type Tier2DiscoveryCoverageWindow = {
  windowId: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  sourceIndex: number | null;
  pageNumbers: number[];
  pageArtifactKeys: string[];
  status: DiscoveryCoverageStatus;
  runnable: boolean;
  reasons: string[];
  discoveryHits: DiscoveryRootHit[];
};

export type Tier2DiscoveryCoverageArtifact = {
  version: 1;
  generatedAt: string;
  runId: string;
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  discoveryRoots: string[];
  pageWindowSize: number;
  outputPath: string;
  missingWindowManifestPath: string;
  summary: {
    sourceCount: number;
    planSourceCount: number;
    windowCount: number;
    discoveredWindowCount: number;
    missingWindowCount: number;
    failedWindowCount: number;
    needsRerunOldSchemaWindowCount: number;
    skippedNoOcrWindowCount: number;
    blockedNoPlanSourceWindowCount: number;
    runnableMissingWindowCount: number;
  };
  windows: Tier2DiscoveryCoverageWindow[];
};

export type Tier2DiscoveryMissingWindowManifest = {
  version: 1;
  generatedAt: string;
  runId: string;
  sourceCoverageArtifactPath: string;
  pageWindowSize: number;
  windowCount: number;
  windows: Array<{
    windowId: string;
    sourceId: string;
    sourceTitle: string;
    sourceGroup: string;
    pageNumbers: number[];
    pageArtifactKeys: string[];
    reason: string;
  }>;
};

type DiscoveryCoverageCliArgs = {
  ocrPlanPath?: string;
  pageMarkdownAuditPath?: string;
  artifactRoot?: string;
  runId?: string;
  discoveryRoots?: string[];
  sourceIds?: string[];
  pageWindowSize?: number;
  outputPath?: string;
  missingWindowManifestPath?: string;
};

type DiscoveryRootIndex = {
  discovered: Map<string, DiscoveryRootHit[]>;
  failed: Map<string, DiscoveryRootHit[]>;
  oldSchema: Map<string, DiscoveryRootHit[]>;
};

function windowKey(input: { sourceId: string; pageNumbers: number[] }): string {
  return `${input.sourceId}:${input.pageNumbers.join("-")}`;
}

function chunkPages<T>(pages: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < pages.length; index += size) {
    chunks.push(pages.slice(index, index + size));
  }
  return chunks;
}

function pushHit(map: Map<string, DiscoveryRootHit[]>, key: string, hit: DiscoveryRootHit): void {
  const hits = map.get(key) ?? [];
  hits.push(hit);
  map.set(key, hits);
}

async function pathKind(path: string): Promise<"directory" | "file" | "missing"> {
  const result = await stat(path).catch(() => null);
  if (result === null) return "missing";
  if (result.isDirectory()) return "directory";
  if (result.isFile()) return "file";
  return "missing";
}

function hitFromExtraction(input: {
  root: string;
  rootPath: string;
  extractionPath: string;
  extraction: DocumentDiscoveryExtraction;
}): { key: string; hit: DiscoveryRootHit; currentSchema: boolean } {
  const key = windowKey({
    sourceId: input.extraction.source.sourceId,
    pageNumbers: input.extraction.source.pageNumbers,
  });
  return {
    key,
    currentSchema:
      input.extraction.extractionAudit.promptVersion === DISCOVERY_EXTRACTION_PROMPT_VERSION,
    hit: {
      discoveryRoot: input.root,
      artifactKey: artifactKey(input.extractionPath, dirname(input.rootPath)),
      promptVersion: input.extraction.extractionAudit.promptVersion,
      validationIssueCount: input.extraction.validationIssues.length,
    },
  };
}

async function indexDiscoveryDirectory(rootPath: string, index: DiscoveryRootIndex): Promise<void> {
  const root = basename(rootPath);
  const glob = new Glob("**/{document-discovery,error}.json");
  for await (const relativePath of glob.scan(rootPath)) {
    const path = join(rootPath, relativePath);
    const json = await Bun.file(path)
      .json()
      .catch(() => null);
    if (json === null) continue;
    if (relativePath.endsWith("document-discovery.json")) {
      const parsed = DocumentDiscoveryExtractionSchema.safeParse(json);
      if (!parsed.success) continue;
      const result = hitFromExtraction({
        root,
        rootPath,
        extractionPath: path,
        extraction: parsed.data,
      });
      pushHit(result.currentSchema ? index.discovered : index.oldSchema, result.key, result.hit);
      continue;
    }
    const record = json as { sourceId?: unknown; pageNumbers?: unknown };
    if (typeof record.sourceId !== "string" || !Array.isArray(record.pageNumbers)) continue;
    const pageNumbers = record.pageNumbers.filter(
      (page): page is number => typeof page === "number" && Number.isInteger(page),
    );
    if (pageNumbers.length === 0) continue;
    pushHit(index.failed, windowKey({ sourceId: record.sourceId, pageNumbers }), {
      discoveryRoot: root,
      artifactKey: artifactKey(path, dirname(rootPath)),
      promptVersion: null,
      validationIssueCount: null,
    });
  }
}

async function indexDiscoveryArtifact(rootPath: string, index: DiscoveryRootIndex): Promise<void> {
  const root = basename(rootPath);
  const json = await Bun.file(rootPath)
    .json()
    .catch(() => null);
  const record = json !== null && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const extractions = Array.isArray(record["extractions"]) ? record["extractions"] : [];
  for (const extractionJson of extractions) {
    const parsed = DocumentDiscoveryExtractionSchema.safeParse(extractionJson);
    if (!parsed.success) continue;
    const result = hitFromExtraction({
      root,
      rootPath,
      extractionPath: rootPath,
      extraction: parsed.data,
    });
    pushHit(result.currentSchema ? index.discovered : index.oldSchema, result.key, result.hit);
  }
  const windows = Array.isArray(record["windows"]) ? record["windows"] : [];
  for (const windowJson of windows) {
    const window = windowJson as { sourceId?: unknown; pageNumbers?: unknown; status?: unknown };
    if (window.status !== "failed") continue;
    if (typeof window.sourceId !== "string" || !Array.isArray(window.pageNumbers)) continue;
    const pageNumbers = window.pageNumbers.filter(
      (page): page is number => typeof page === "number" && Number.isInteger(page),
    );
    if (pageNumbers.length === 0) continue;
    pushHit(index.failed, windowKey({ sourceId: window.sourceId, pageNumbers }), {
      discoveryRoot: root,
      artifactKey: artifactKey(rootPath, dirname(rootPath)),
      promptVersion: null,
      validationIssueCount: null,
    });
  }
}

async function indexDiscoveryRoots(discoveryRoots: string[]): Promise<DiscoveryRootIndex> {
  const index: DiscoveryRootIndex = {
    discovered: new Map(),
    failed: new Map(),
    oldSchema: new Map(),
  };
  for (const root of discoveryRoots) {
    const kind = await pathKind(root);
    if (kind === "directory") {
      await indexDiscoveryDirectory(root, index);
      continue;
    }
    if (kind === "file") {
      await indexDiscoveryArtifact(root, index);
    }
  }
  return index;
}

async function defaultDiscoveryRoots(runRoot: string): Promise<string[]> {
  const entries = await readdir(runRoot, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("document-discovery-"))
    .map((entry) => join(runRoot, entry.name))
    .sort();
}

function statusForWindow(input: {
  key: string;
  pages: Tier2OcrPageMarkdownAuditPage[];
  hasPlanSource: boolean;
  rootIndex: DiscoveryRootIndex;
}): Pick<Tier2DiscoveryCoverageWindow, "status" | "reasons" | "discoveryHits" | "runnable"> {
  const discovered = input.rootIndex.discovered.get(input.key) ?? [];
  const oldSchema = input.rootIndex.oldSchema.get(input.key) ?? [];
  const failed = input.rootIndex.failed.get(input.key) ?? [];
  const complete = input.pages.every(
    (page) => page.status === "ocr_complete" && page.markdownArtifactKey !== null,
  );
  if (discovered.length > 0) {
    return {
      status: "discovered",
      reasons: ["current discovery extraction exists"],
      discoveryHits: discovered,
      runnable: false,
    };
  }
  if (oldSchema.length > 0) {
    return {
      status: "needs_rerun_old_schema",
      reasons: ["only older prompt/schema discovery extraction exists"],
      discoveryHits: oldSchema,
      runnable: input.hasPlanSource && complete,
    };
  }
  if (failed.length > 0) {
    return {
      status: "failed",
      reasons: ["previous discovery attempt failed"],
      discoveryHits: failed,
      runnable: input.hasPlanSource && complete,
    };
  }
  if (!complete) {
    return {
      status: "skipped_no_ocr",
      reasons: ["one or more pages are missing OCR Markdown"],
      discoveryHits: [],
      runnable: false,
    };
  }
  if (!input.hasPlanSource) {
    return {
      status: "blocked_no_plan_source",
      reasons: ["OCR audit source is not present in the OCR plan used by discovery-extract"],
      discoveryHits: [],
      runnable: false,
    };
  }
  return {
    status: "missing",
    reasons: ["OCR Markdown exists but no discovery extraction was found"],
    discoveryHits: [],
    runnable: true,
  };
}

export async function buildTier2DiscoveryCoverage(args: {
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  discoveryRoots?: string[];
  sourceIds?: string[];
  pageWindowSize?: number;
  outputPath: string;
  missingWindowManifestPath: string;
  generatedAt?: string;
}): Promise<Tier2DiscoveryCoverageArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const pageWindowSize = args.pageWindowSize ?? 1;
  const plan = await readRequiredJsonArtifact<Tier2OcrPlan>(args.ocrPlanPath);
  const audit = await readRequiredJsonArtifact<Tier2OcrPageMarkdownAudit>(
    args.pageMarkdownAuditPath,
  );
  const sourceFilter = args.sourceIds === undefined ? null : new Set(args.sourceIds);
  const planSourceIndex = new Map(plan.sources.map((source, index) => [source.sourceId, index]));
  const discoveryRoots =
    args.discoveryRoots ?? (await defaultDiscoveryRoots(dirname(args.ocrPlanPath)));
  const rootIndex = await indexDiscoveryRoots(discoveryRoots);
  const windows: Tier2DiscoveryCoverageWindow[] = [];

  for (const source of audit.sources) {
    if (sourceFilter !== null && !sourceFilter.has(source.sourceId)) continue;
    const sourceIndex = planSourceIndex.get(source.sourceId) ?? null;
    const pages = source.pages.toSorted((left, right) => left.pageNumber - right.pageNumber);
    for (const pageWindow of chunkPages(pages, pageWindowSize)) {
      const pageNumbers = pageWindow.map((page) => page.pageNumber);
      const key = windowKey({ sourceId: source.sourceId, pageNumbers });
      const status = statusForWindow({
        key,
        pages: pageWindow,
        hasPlanSource: sourceIndex !== null,
        rootIndex,
      });
      windows.push({
        windowId: key,
        sourceId: source.sourceId,
        sourceTitle: source.title,
        sourceGroup: source.sourceGroup,
        sourceIndex,
        pageNumbers,
        pageArtifactKeys: pageWindow
          .map((page) => page.markdownArtifactKey)
          .filter((key): key is string => key !== null),
        ...status,
      });
    }
  }

  const runnableMissing = windows.filter(
    (window) =>
      window.runnable &&
      (window.status === "missing" ||
        window.status === "failed" ||
        window.status === "needs_rerun_old_schema"),
  );
  const artifact: Tier2DiscoveryCoverageArtifact = {
    version: 1,
    generatedAt,
    runId: audit.runId,
    ocrPlanPath: args.ocrPlanPath,
    pageMarkdownAuditPath: args.pageMarkdownAuditPath,
    discoveryRoots,
    pageWindowSize,
    outputPath: args.outputPath,
    missingWindowManifestPath: args.missingWindowManifestPath,
    summary: {
      sourceCount: new Set(windows.map((window) => window.sourceId)).size,
      planSourceCount: plan.sources.length,
      windowCount: windows.length,
      discoveredWindowCount: windows.filter((window) => window.status === "discovered").length,
      missingWindowCount: windows.filter((window) => window.status === "missing").length,
      failedWindowCount: windows.filter((window) => window.status === "failed").length,
      needsRerunOldSchemaWindowCount: windows.filter(
        (window) => window.status === "needs_rerun_old_schema",
      ).length,
      skippedNoOcrWindowCount: windows.filter((window) => window.status === "skipped_no_ocr")
        .length,
      blockedNoPlanSourceWindowCount: windows.filter(
        (window) => window.status === "blocked_no_plan_source",
      ).length,
      runnableMissingWindowCount: runnableMissing.length,
    },
    windows,
  };
  const manifest: Tier2DiscoveryMissingWindowManifest = {
    version: 1,
    generatedAt,
    runId: audit.runId,
    sourceCoverageArtifactPath: args.outputPath,
    pageWindowSize,
    windowCount: runnableMissing.length,
    windows: runnableMissing.map((window) => ({
      windowId: window.windowId,
      sourceId: window.sourceId,
      sourceTitle: window.sourceTitle,
      sourceGroup: window.sourceGroup,
      pageNumbers: window.pageNumbers,
      pageArtifactKeys: window.pageArtifactKeys,
      reason: window.reasons.join("; "),
    })),
  };
  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeJson(args.outputPath, artifact);
  await mkdir(dirname(args.missingWindowManifestPath), { recursive: true });
  await writeJson(args.missingWindowManifestPath, manifest);
  return artifact;
}

function parsePositiveInteger(value: string | undefined, flag: string): number {
  if (value === undefined) throw new Error(`${flag} requires a value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function parseDiscoveryCoverageCliArgs(args: string[]): DiscoveryCoverageCliArgs {
  return parseCliOptions<DiscoveryCoverageCliArgs>(args, {}, [
    {
      flags: ["--ocr-plan"],
      apply: (output, value) => {
        if (value !== undefined) output.ocrPlanPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-audit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownAuditPath = fromCliPath(value);
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
      flags: ["--discovery-root"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.discoveryRoots = [...(output.discoveryRoots ?? []), fromCliPath(value)];
        }
      },
    },
    {
      flags: ["--discovery-roots"],
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
      flags: ["--source-id"],
      apply: (output, value) => {
        if (value !== undefined) output.sourceIds = [value];
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
      flags: ["--page-window-size"],
      apply: (output, value) => {
        output.pageWindowSize = parsePositiveInteger(value, "--page-window-size");
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.outputPath = fromCliPath(value);
      },
    },
    {
      flags: ["--missing-window-manifest", "--manifest"],
      apply: (output, value) => {
        if (value !== undefined) output.missingWindowManifestPath = fromCliPath(value);
      },
    },
  ] satisfies CliOption<DiscoveryCoverageCliArgs>[]);
}

async function resolveDiscoveryCoverageCliPaths(args: DiscoveryCoverageCliArgs): Promise<{
  ocrPlanPath: string;
  pageMarkdownAuditPath: string;
  outputPath: string;
  missingWindowManifestPath: string;
}> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId =
    args.runId ?? (args.ocrPlanPath === undefined ? await latestDocsRunId(artifactRoot) : null);
  const baseDir =
    args.ocrPlanPath !== undefined
      ? dirname(args.ocrPlanPath)
      : runId === null
        ? null
        : runArtifactRoot(artifactRoot, runId);
  if (baseDir === null) {
    throw new Error("No docs run found. Provide --run-id or --ocr-plan.");
  }
  return {
    ocrPlanPath: args.ocrPlanPath ?? ocrPlanPath(artifactRoot, runId!),
    pageMarkdownAuditPath:
      args.pageMarkdownAuditPath ?? join(baseDir, "ocr-page-markdown-audit.json"),
    outputPath: args.outputPath ?? join(baseDir, "document-discovery-coverage-refactored-v1.json"),
    missingWindowManifestPath:
      args.missingWindowManifestPath ??
      join(baseDir, "document-discovery-missing-windows-refactored-v1.json"),
  };
}

export async function buildTier2DiscoveryCoverageFromCli(args: string[]) {
  const parsed = parseDiscoveryCoverageCliArgs(args);
  const paths = await resolveDiscoveryCoverageCliPaths(parsed);
  const artifact = await buildTier2DiscoveryCoverage({
    ...paths,
    ...(parsed.discoveryRoots === undefined ? {} : { discoveryRoots: parsed.discoveryRoots }),
    ...(parsed.sourceIds === undefined ? {} : { sourceIds: parsed.sourceIds }),
    ...(parsed.pageWindowSize === undefined ? {} : { pageWindowSize: parsed.pageWindowSize }),
  });
  return {
    version: artifact.version,
    generatedAt: artifact.generatedAt,
    outputPath: artifact.outputPath,
    missingWindowManifestPath: artifact.missingWindowManifestPath,
    summary: artifact.summary,
  };
}
