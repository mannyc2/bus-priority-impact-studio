import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { defineCommand, z } from "@liche/core";
import { fromCliPath, repoRoot } from "../../../lib/paths.ts";

const DEFAULT_RUN_DIR = "data/artifacts/docs/tier2-full-corpus-2026-05-24-pass2";
const DEFAULT_SURFACES_DIR = "document-derived-surfaces-v1";
const DEFAULT_PROOF_FILE = "document-operational-date-proof-harness-live-full-revalidated-v3.json";
const DEFAULT_VIEWER_DIR = "tier2-review-viewer";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4177;

type KnownJsonFields = {
  assertions?: unknown;
  candidateId?: unknown;
  candidates?: unknown;
  canonicalFamily?: unknown;
  claimType?: unknown;
  code?: unknown;
  confidence?: unknown;
  containsCharts?: unknown;
  containsMaps?: unknown;
  containsTables?: unknown;
  contextChars?: unknown;
  contextPageNumbers?: unknown;
  contextStatus?: unknown;
  contextTruncated?: unknown;
  date?: unknown;
  datesMentioned?: unknown;
  dateText?: unknown;
  deterministicReasons?: unknown;
  displayLabel?: unknown;
  evidenceSpans?: unknown;
  expectedClaim?: unknown;
  inputEventCount?: unknown;
  implementationMonth?: unknown;
  interventionFamily?: unknown;
  interventionId?: unknown;
  issues?: unknown;
  kind?: unknown;
  normalizedPrecision?: unknown;
  ocrRoot?: unknown;
  operationalDate?: unknown;
  pageCount?: unknown;
  pageNumber?: unknown;
  pageNumbers?: unknown;
  proofHarness?: unknown;
  proofStatus?: unknown;
  quote?: unknown;
  rawFamily?: unknown;
  requests?: unknown;
  result?: unknown;
  routeIds?: unknown;
  routeResolutionTier?: unknown;
  routeScope?: unknown;
  routesMentioned?: unknown;
  severity?: unknown;
  sourceId?: unknown;
  sourceTitle?: unknown;
  statusRaw?: unknown;
  structuredExtraction?: unknown;
  summary?: unknown;
  surfaceId?: unknown;
  supports?: unknown;
  surfacesDir?: unknown;
  title?: unknown;
  treatmentText?: unknown;
  unvalidatedQuestions?: unknown;
  validProvenCount?: unknown;
  validatedResults?: unknown;
  validationState?: unknown;
  windowCount?: unknown;
};

type JsonRecord = KnownJsonFields & Record<string, unknown>;

type ViewerArtifacts = {
  runDir: string;
  ocrRoot: string;
  structuredExtraction: string;
  surfacesDir: string;
  events: string;
  claims: string;
  assertions: string;
  proofHarness: string;
};

type CandidateRow = {
  candidateId: string;
  interventionId: string | null;
  label: string | null;
  sourceId: string;
  sourceTitle: string | null;
  family: string;
  treatmentText: string | null;
  operationalDate: string | null;
  implementationMonth: string | null;
  precision: string | null;
  routeIds: string[];
  routeResolutionTier: string | null;
  deterministicReasons: string[];
  proofStatus: string | null;
  validationState: string;
  outcome: string;
  issueCodes: string[];
  warningCodes: string[];
  proofDate: string | null;
  proofClaimType: string | null;
  proofRouteKind: string | null;
  proofRouteIds: string[];
  proofConfidence: string | null;
  evidenceQuotes: Array<{
    pageNumber: number | null;
    supports: string[];
    quote: string;
  }>;
  unvalidatedQuestions: string[];
  context: {
    status: string | null;
    pages: number;
    chars: number;
    truncated: boolean;
  };
};

type PageSample = {
  sourceId: string;
  title: string | null;
  pageNumber: number;
  routesMentioned: string[];
  datesMentioned: string[];
  body: string;
  path: string;
};

type ViewerData = {
  generatedAt: string;
  runDir: string;
  artifacts: ViewerArtifacts;
  summaries: JsonRecord;
  stages: Array<{
    id: string;
    title: string;
    count: string;
    description: string;
    artifact: string;
  }>;
  issueGroups: Array<{
    code: string;
    severity: string;
    count: number;
    description: string;
    sampleCandidateIds: string[];
  }>;
  candidates: CandidateRow[];
  desiredRows: CandidateRow[];
  pageSamples: PageSample[];
  eventSamples: JsonRecord[];
  claimSamples: JsonRecord[];
  targetShape: Array<{ field: string; why: string }>;
};

const optionsSchema = z.object({
  runDir: z.string().optional(),
  outputDir: z.string().optional(),
  proofHarness: z.string().optional(),
  host: z.string().optional(),
  port: z.coerce.number().int().positive().optional(),
  serve: z.boolean().optional(),
});

function toCliPath(path: string): string {
  const rel = relative(repoRoot, path);
  return rel.startsWith("..") ? path : rel;
}

async function readJson(path: string): Promise<JsonRecord> {
  const file = Bun.file(path);
  if (!(await file.exists())) throw new Error(`Artifact not found: ${path}`);
  return (await file.json()) as JsonRecord;
}

async function readTextIfExists(path: string): Promise<string | null> {
  const file = Bun.file(path);
  return (await file.exists()) ? await file.text() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseJsonlLine(line: string): JsonRecord | null {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return null;
  }
}

async function countJsonl(path: string): Promise<number> {
  const text = await readTextIfExists(path);
  if (text === null || text.trim().length === 0) return 0;
  return text.split("\n").filter((line) => line.trim().length > 0).length;
}

async function sampleJsonl(path: string, limit: number): Promise<JsonRecord[]> {
  const text = await readTextIfExists(path);
  if (text === null) return [];
  const out: JsonRecord[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed = parseJsonlLine(line);
    if (parsed !== null) {
      out.push({
        surfaceId: parsed.surfaceId,
        sourceId: parsed.sourceId,
        sourceTitle: parsed.sourceTitle,
        pageNumbers: parsed.pageNumbers,
        displayLabel: parsed.displayLabel,
        canonicalFamily: parsed.canonicalFamily,
        rawFamily: parsed.rawFamily,
        dateText: parsed.dateText ?? parsed.operationalDate ?? parsed.date,
        statusRaw: parsed.statusRaw,
        routeIds: parsed.routeIds,
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

function markdownBody(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
}

function parseFrontmatter(markdown: string): JsonRecord {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (match?.[1] === undefined) return {};
  const out: JsonRecord = {};
  for (const line of match[1].split("\n")) {
    const item = line.match(/^([^:]+):\s*(.*)$/);
    if (item?.[1] === undefined || item[2] === undefined) continue;
    const key = item[1].trim();
    const raw = item[2].trim();
    if (raw === "null") {
      out[key] = null;
      continue;
    }
    if (raw === "true" || raw === "false") {
      out[key] = raw === "true";
      continue;
    }
    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith('"') && raw.endsWith('"'))) {
      try {
        out[key] = JSON.parse(raw);
        continue;
      } catch {
        // Fall through to raw value.
      }
    }
    out[key] = raw.replace(/^"|"$/g, "");
  }
  return out;
}

async function findSourceDir(ocrRoot: string, sourceId: string): Promise<string | null> {
  const sourcesRoot = join(ocrRoot, "sources");
  let entries: string[];
  try {
    entries = (await readdir(sourcesRoot)) as string[];
  } catch {
    return null;
  }
  const match = entries.find((entry) => entry === sourceId || entry.endsWith(`_${sourceId}`));
  return match === undefined ? null : join(sourcesRoot, match);
}

async function readPageSample(input: {
  ocrRoot: string;
  sourceId: string;
  pageNumber: number;
}): Promise<PageSample | null> {
  const sourceDir = await findSourceDir(input.ocrRoot, input.sourceId);
  if (sourceDir === null) return null;
  const pagePath = join(sourceDir, "pages", String(input.pageNumber).padStart(4, "0"), "page.md");
  const markdown = await readTextIfExists(pagePath);
  if (markdown === null) return null;
  const frontmatter = parseFrontmatter(markdown);
  return {
    sourceId: input.sourceId,
    title: asString(frontmatter.title),
    pageNumber: input.pageNumber,
    routesMentioned: asStringArray(frontmatter.routesMentioned),
    datesMentioned: asStringArray(frontmatter.datesMentioned),
    body: markdownBody(markdown).slice(0, 2200),
    path: toCliPath(pagePath),
  };
}

async function scanOcrSummary(ocrRoot: string): Promise<JsonRecord> {
  const sourcesRoot = join(ocrRoot, "sources");
  let sourceDirs: string[] = [];
  try {
    sourceDirs = await readdir(sourcesRoot);
  } catch {
    return { sourceCount: 0, pageCount: 0 };
  }

  let pageCount = 0;
  let maps = 0;
  let tables = 0;
  let charts = 0;
  for (const sourceDir of sourceDirs) {
    const pagesRoot = join(sourcesRoot, sourceDir, "pages");
    let pages: string[] = [];
    try {
      pages = await readdir(pagesRoot);
    } catch {
      continue;
    }
    for (const page of pages) {
      const markdown = await readTextIfExists(join(pagesRoot, page, "page.md"));
      if (markdown === null) continue;
      pageCount += 1;
      const frontmatter = parseFrontmatter(markdown);
      if (frontmatter.containsMaps === true) maps += 1;
      if (frontmatter.containsTables === true) tables += 1;
      if (frontmatter.containsCharts === true) charts += 1;
    }
  }
  return { sourceCount: sourceDirs.length, pageCount, maps, tables, charts };
}

function outcomeFor(result: JsonRecord): string {
  const validationState = asString(result.validationState) ?? "unknown";
  const proofStatus = asString(result.proofStatus);
  if (validationState === "valid" && proofStatus === "proven") return "valid_proven";
  if (validationState === "valid" && proofStatus === "ambiguous") return "valid_ambiguous";
  if (validationState === "valid" && proofStatus === "contradicted") return "valid_contradicted";
  if (validationState === "valid" && proofStatus === "not_found") return "valid_not_found";
  if (validationState === "schema_error") return "schema_error";
  if (proofStatus === "proven") return "rejected_proven";
  return "invalid_other";
}

function issueDescription(code: string): string {
  const descriptions: Record<string, string> = {
    evidence_quote_not_found:
      "The model returned a quote that did not appear exactly in the supplied OCR markdown.",
    treatment_family_not_supported:
      "The quote proves some bus fact, but not the candidate treatment family.",
    status_quote_lacks_realized_language:
      "The quote does not state a launch, implementation, activation, installation, completion, or service start.",
    candidate_camera_enforcement_family_mismatch:
      "The candidate text says ACE/ABLE/camera/enforcement, but upstream family metadata is not camera_enforcement.",
    route_scope_not_grounded_in_quote:
      "The returned route ids/text are not grounded in the route-scope evidence quote.",
    missing_route_scope_support: "No exact resolved evidence span supports route scope.",
    non_route_linked_scope:
      "The model proved only corridor/system scope, not a route-linked anchor.",
    proven_date_mismatch: "The proof date does not match the deterministic candidate month/date.",
    missing_date_support: "No exact resolved evidence span supports the date.",
    missing_treatment_type_support: "No exact resolved evidence span supports treatment type.",
    missing_operational_status_support:
      "No exact resolved evidence span supports operational status.",
    candidate_non_anchor_label:
      "The candidate label describes an ancillary/support/observation event rather than a causal treatment anchor.",
    candidate_signal_priority_family_mismatch:
      "The candidate label says signal timing/priority, but upstream family metadata is not transit_signal_priority.",
    candidate_stop_change_family_mismatch:
      "The candidate label says stop addition/removal/replacement, but upstream family metadata is not a stop-change family.",
  };
  return descriptions[code] ?? "Validator issue emitted for this proof result.";
}

function buildCandidateRows(proof: JsonRecord): CandidateRow[] {
  const candidates = asArray(proof.candidates).map(asRecord);
  const requestsById = new Map(
    asArray(proof.requests).map((request) => [
      asString(asRecord(request).candidateId),
      asRecord(request),
    ]),
  );
  const candidateById = new Map(
    candidates.map((candidate) => [asString(candidate.candidateId), candidate]),
  );
  return asArray(proof.validatedResults).map((rawResult) => {
    const validated = asRecord(rawResult);
    const candidate = candidateById.get(asString(validated.candidateId)) ?? {};
    const expected = asRecord(candidate.expectedClaim);
    const result = asRecord(validated.result);
    const routeScope = asRecord(result.routeScope);
    const issues = asArray(validated.issues).map(asRecord);
    const evidenceQuotes = asArray(result.evidenceSpans).map((span) => {
      const record = asRecord(span);
      return {
        pageNumber: typeof record.pageNumber === "number" ? record.pageNumber : null,
        supports: asStringArray(record.supports),
        quote: asString(record.quote) ?? "",
      };
    });
    const request = requestsById.get(asString(validated.candidateId)) ?? {};
    return {
      candidateId:
        asString(candidate.candidateId) ?? asString(validated.candidateId) ?? "<unknown>",
      interventionId: asString(candidate.interventionId),
      label: asString(candidate.displayLabel),
      sourceId: asString(candidate.sourceId) ?? "",
      sourceTitle: asString(candidate.sourceTitle),
      family: asString(expected.interventionFamily) ?? "<unknown>",
      treatmentText: asString(expected.treatmentText),
      operationalDate: asString(expected.operationalDate),
      implementationMonth: asString(expected.implementationMonth),
      precision: asString(expected.normalizedPrecision),
      routeIds: asStringArray(expected.routeIds),
      routeResolutionTier: asString(expected.routeResolutionTier),
      deterministicReasons: asStringArray(candidate.deterministicReasons),
      proofStatus: asString(validated.proofStatus),
      validationState: asString(validated.validationState) ?? "unknown",
      outcome: outcomeFor(validated),
      issueCodes: issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => asString(issue.code))
        .filter((code): code is string => code !== null),
      warningCodes: issues
        .filter((issue) => issue.severity === "warning")
        .map((issue) => asString(issue.code))
        .filter((code): code is string => code !== null),
      proofDate: asString(result.dateText),
      proofClaimType: asString(result.claimType),
      proofRouteKind: asString(routeScope.kind),
      proofRouteIds: asStringArray(routeScope.routeIds),
      proofConfidence: asString(result.confidence),
      evidenceQuotes,
      unvalidatedQuestions: asStringArray(result.unvalidatedQuestions),
      context: {
        status: asString(request.contextStatus),
        pages: asArray(request.contextPageNumbers).length,
        chars: asNumber(request.contextChars),
        truncated: request.contextTruncated === true,
      },
    };
  });
}

function buildIssueGroups(candidates: CandidateRow[]): ViewerData["issueGroups"] {
  const groups = new Map<
    string,
    { severity: string; count: number; sampleCandidateIds: string[] }
  >();
  for (const row of candidates) {
    for (const code of row.issueCodes) {
      const existing = groups.get(code) ?? { severity: "error", count: 0, sampleCandidateIds: [] };
      existing.count += 1;
      if (existing.sampleCandidateIds.length < 6) existing.sampleCandidateIds.push(row.candidateId);
      groups.set(code, existing);
    }
    for (const code of row.warningCodes) {
      const key = `warning:${code}`;
      const existing = groups.get(key) ?? { severity: "warning", count: 0, sampleCandidateIds: [] };
      existing.count += 1;
      if (existing.sampleCandidateIds.length < 6) existing.sampleCandidateIds.push(row.candidateId);
      groups.set(key, existing);
    }
  }
  return [...groups.entries()]
    .map(([rawCode, group]) => {
      const code = rawCode.startsWith("warning:") ? rawCode.slice("warning:".length) : rawCode;
      return {
        code,
        severity: group.severity,
        count: group.count,
        description: issueDescription(code),
        sampleCandidateIds: group.sampleCandidateIds,
      };
    })
    .toSorted((left, right) => right.count - left.count);
}

async function buildPageSamples(input: {
  ocrRoot: string;
  rows: CandidateRow[];
}): Promise<PageSample[]> {
  const selected = new Map<string, { sourceId: string; pageNumber: number }>();
  for (const row of input.rows) {
    for (const quote of row.evidenceQuotes) {
      if (quote.pageNumber === null) continue;
      const key = `${row.sourceId}:${quote.pageNumber}`;
      if (!selected.has(key))
        selected.set(key, { sourceId: row.sourceId, pageNumber: quote.pageNumber });
      break;
    }
    if (selected.size >= 30) break;
  }
  const out: PageSample[] = [];
  for (const page of selected.values()) {
    const sample = await readPageSample({ ocrRoot: input.ocrRoot, ...page });
    if (sample !== null) out.push(sample);
  }
  return out;
}

function buildStages(input: {
  ocrSummary: JsonRecord;
  structuredSummary: JsonRecord;
  eventCount: number;
  claimCount: number;
  assertionsSummary: JsonRecord;
  proofSummary: JsonRecord;
  artifacts: ViewerArtifacts;
}): ViewerData["stages"] {
  return [
    {
      id: "ocr_pages",
      title: "1. Per-page OCR markdown",
      count: `${input.ocrSummary.pageCount ?? 0} pages`,
      description:
        "Rendered page images were transcribed into markdown with frontmatter such as routes, dates, maps, charts, and visual hints. This is the closest layer to the PDFs.",
      artifact: input.artifacts.ocrRoot,
    },
    {
      id: "structured_extraction",
      title: "2. LLM structured extraction",
      count: `${input.structuredSummary.windowCount ?? "?"} page windows`,
      description:
        "An LLM tried to turn page/window markdown into structured candidates. This layer is broad and noisy by design.",
      artifact: input.artifacts.structuredExtraction,
    },
    {
      id: "derived_surfaces",
      title: "3. Derived document surfaces",
      count: `${input.eventCount} events / ${input.claimCount} claims`,
      description:
        "Normalized JSONL surfaces split extraction into events, claims, tables, entities, relations, metrics, and review questions.",
      artifact: input.artifacts.surfacesDir,
    },
    {
      id: "operational_dates",
      title: "4. Operational-date assertions",
      count: `${input.assertionsSummary.inputEventCount ?? "?"} event rows`,
      description:
        "Deterministic rules classified source-stated dates, planned dates, non-operational milestones, route links, and causal-anchor eligibility.",
      artifact: input.artifacts.assertions,
    },
    {
      id: "proof_harness",
      title: "5. LLM proof + deterministic validation",
      count: `${input.proofSummary.validProvenCount ?? "?"} valid proven`,
      description:
        "A proof model received one source document's OCR markdown and had to return exact evidence spans. The validator accepted only exact source-grounded anchors.",
      artifact: input.artifacts.proofHarness,
    },
  ];
}

function targetShape(): ViewerData["targetShape"] {
  return [
    {
      field: "interventionId",
      why: "A stable dedup key so repeated source mentions collapse to one treatment.",
    },
    {
      field: "interventionFamily",
      why: "The causal treatment type: SBS, bus lane, busway, camera enforcement, TSP, queue jump, stop change, etc.",
    },
    { field: "routeIds", why: "Direct route scope, not just a corridor or neighborhood." },
    {
      field: "operationalDate / implementationMonth / precision",
      why: "A realized launch/activation/implementation date precise enough for event-study alignment.",
    },
    {
      field: "proof quote + page",
      why: "A copied exact span from the source context, with page provenance.",
    },
    {
      field: "claimType",
      why: "Must be realized operational launch/start, not planned, meeting, study, observation, or result period.",
    },
    {
      field: "validationState",
      why: "Whether the row is usable as an anchor, ambiguous review material, contradicted, or rejected.",
    },
  ];
}

async function buildViewerData(input: {
  runDir: string;
  proofHarnessPath: string;
}): Promise<ViewerData> {
  const surfacesDir = join(input.runDir, DEFAULT_SURFACES_DIR);
  const ocrRoot = join(input.runDir, "ocr-page-markdown-pioneer-gemini35-lowhanging-v1");
  const structuredExtractionPath = join(
    input.runDir,
    "structured-extraction-deepseek-flash-budget5-v2.json",
  );
  const assertionsPath = join(surfacesDir, "document-operational-date-assertions-v1.json");
  const eventsPath = join(surfacesDir, "events.jsonl");
  const claimsPath = join(surfacesDir, "claims.jsonl");

  const [
    structuredExtraction,
    assertions,
    proof,
    ocrSummary,
    eventCount,
    claimCount,
    eventSamples,
    claimSamples,
  ] = await Promise.all([
    readJson(structuredExtractionPath),
    readJson(assertionsPath),
    readJson(input.proofHarnessPath),
    scanOcrSummary(ocrRoot),
    countJsonl(eventsPath),
    countJsonl(claimsPath),
    sampleJsonl(eventsPath, 80),
    sampleJsonl(claimsPath, 80),
  ]);

  const candidates = buildCandidateRows(proof);
  const desiredRows = candidates.filter((row) => row.outcome === "valid_proven");
  const issueGroups = buildIssueGroups(candidates);
  const pageSamples = await buildPageSamples({
    ocrRoot,
    rows: [
      ...desiredRows.slice(0, 12),
      ...candidates.filter((row) => row.outcome === "rejected_proven").slice(0, 18),
    ],
  });
  const artifacts = {
    runDir: toCliPath(input.runDir),
    ocrRoot: toCliPath(ocrRoot),
    structuredExtraction: toCliPath(structuredExtractionPath),
    surfacesDir: toCliPath(surfacesDir),
    events: toCliPath(eventsPath),
    claims: toCliPath(claimsPath),
    assertions: toCliPath(assertionsPath),
    proofHarness: toCliPath(input.proofHarnessPath),
  };

  const assertionsSummary = asRecord(assertions.summary);
  const proofSummary = asRecord(proof.summary);
  const structuredSummary = asRecord(structuredExtraction.summary);
  return {
    generatedAt: new Date().toISOString(),
    runDir: toCliPath(input.runDir),
    artifacts,
    summaries: {
      ocr: ocrSummary,
      structuredExtraction: structuredSummary,
      assertions: assertionsSummary,
      proof: proofSummary,
      accepted: {
        validProvenRows: desiredRows.length,
        distinctInterventions: new Set(desiredRows.map((row) => row.interventionId).filter(Boolean))
          .size,
        rejectedProven: candidates.filter((row) => row.outcome === "rejected_proven").length,
      },
    },
    stages: buildStages({
      ocrSummary,
      structuredSummary,
      eventCount,
      claimCount,
      assertionsSummary,
      proofSummary,
      artifacts,
    }),
    issueGroups,
    candidates,
    desiredRows,
    pageSamples,
    eventSamples,
    claimSamples,
    targetShape: targetShape(),
  };
}

function viewerHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tier 2 Data Review Viewer</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --line: #d8dde6;
      --text: #17202a;
      --muted: #5f6b7a;
      --accent: #176b87;
      --accent-2: #47663b;
      --bad: #a63a3a;
      --warn: #8a5a00;
      --good: #28724f;
      --code: #eef2f5;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      line-height: 1.45;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 3;
      background: rgba(246, 247, 249, 0.96);
      border-bottom: 1px solid var(--line);
      padding: 14px 20px;
      backdrop-filter: blur(10px);
    }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 16px; }
    h3 { margin: 0 0 8px; font-size: 14px; }
    p { margin: 0 0 10px; color: var(--muted); }
    main { padding: 18px 20px 40px; }
    .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .tab {
      border: 1px solid var(--line);
      background: var(--panel);
      padding: 7px 10px;
      border-radius: 6px;
      cursor: pointer;
      color: var(--text);
      font: inherit;
    }
    .tab.active { border-color: var(--accent); color: var(--accent); font-weight: 650; }
    .grid { display: grid; gap: 12px; }
    .grid.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid.cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .metric { font-size: 24px; font-weight: 720; margin-bottom: 2px; }
    .metric.good { color: var(--good); }
    .metric.bad { color: var(--bad); }
    .metric.warn { color: var(--warn); }
    .label { color: var(--muted); font-size: 12px; }
    .section { display: none; }
    .section.active { display: block; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 12px; }
    input, select {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 6px;
      padding: 7px 9px;
      min-height: 34px;
      font: inherit;
    }
    input[type="search"] { min-width: 280px; }
    table { width: 100%; border-collapse: collapse; background: var(--panel); }
    th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
    th { position: sticky; top: 83px; background: #f9fafb; z-index: 2; font-size: 12px; color: var(--muted); }
    tbody tr { cursor: pointer; }
    tbody tr:hover { background: #f3f7f8; }
    .pill {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 2px 7px;
      margin: 0 4px 4px 0;
      font-size: 12px;
      white-space: nowrap;
      background: #fff;
    }
    .pill.good { border-color: #b7dac7; color: var(--good); background: #f0faf4; }
    .pill.bad { border-color: #e7b8b8; color: var(--bad); background: #fff4f4; }
    .pill.warn { border-color: #e4c985; color: var(--warn); background: #fff9e9; }
    .split { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(360px, 0.7fr); gap: 12px; }
    .detail { position: sticky; top: 86px; max-height: calc(100vh - 104px); overflow: auto; }
    pre {
      background: var(--code);
      padding: 10px;
      border-radius: 6px;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 12px;
      margin: 8px 0;
    }
    code { background: var(--code); padding: 1px 4px; border-radius: 4px; }
    .muted { color: var(--muted); }
    .small { font-size: 12px; }
    .flow { display: grid; gap: 10px; grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .stage { min-height: 150px; }
    .stage .count { color: var(--accent); font-weight: 720; font-size: 18px; }
    .issue-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .hidden { display: none !important; }
    @media (max-width: 1100px) {
      .grid.cols-4, .grid.cols-3, .flow, .split, .issue-list { grid-template-columns: 1fr; }
      th { top: 120px; }
      .detail { position: static; max-height: none; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Tier 2 Document Data Review</h1>
    <div class="muted small" id="subtitle">Loading viewer data…</div>
    <nav class="tabs">
      <button class="tab active" data-tab="overview">Overview</button>
      <button class="tab" data-tab="extraction">1. Extraction Data</button>
      <button class="tab" data-tab="issues">2. Issues</button>
      <button class="tab" data-tab="desired">3. Desired Shape</button>
      <button class="tab" data-tab="explorer">Candidate Explorer</button>
    </nav>
  </header>
  <main>
    <section id="overview" class="section active"></section>
    <section id="extraction" class="section"></section>
    <section id="issues" class="section"></section>
    <section id="desired" class="section"></section>
    <section id="explorer" class="section"></section>
  </main>
  <script>
    const state = { data: null, activeTab: "overview", selectedId: null };
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const fmt = (value) => Number(value ?? 0).toLocaleString();
    const pillClass = (kind) => kind.includes("valid_proven") ? "good" : kind.includes("rejected") || kind.includes("schema") || kind.includes("invalid") ? "bad" : kind.includes("ambiguous") ? "warn" : "";
    const outcomeLabel = (value) => ({
      valid_proven: "valid proven",
      valid_ambiguous: "valid ambiguous",
      valid_contradicted: "valid contradicted",
      valid_not_found: "valid not found",
      rejected_proven: "rejected proven",
      invalid_other: "invalid other",
      schema_error: "schema error"
    }[value] || value);

    function pills(values, cls = "") {
      return (values || []).map((value) => '<span class="pill ' + cls + '">' + esc(value) + '</span>').join("");
    }

    function render() {
      const data = state.data;
      $("#subtitle").textContent = "Generated " + data.generatedAt + " from " + data.runDir;
      renderOverview(data);
      renderExtraction(data);
      renderIssues(data);
      renderDesired(data);
      renderExplorer(data);
    }

    function renderOverview(data) {
      const s = data.summaries;
      $("#overview").innerHTML =
        '<div class="grid cols-4">' +
          metric("OCR pages", s.ocr.pageCount, "Per-page markdown made from rendered PDF pages") +
          metric("Event surfaces", s.assertions.inputEventCount, "Rows classified by deterministic operational-date rules") +
          metric("LLM said proven", s.proof.countsByProofStatus.proven, "Proof model output before validator judgment", "warn") +
          metric("Validator accepted", s.accepted.validProvenRows, "Usable proof-backed rows", "good") +
        '</div>' +
        '<div class="panel" style="margin-top:12px"><h2>What This Data Is</h2>' +
        '<p>Tier 2 starts as DOT/MTA PDFs. Pages were rendered, transcribed to markdown by an LLM, normalized into event/claim surfaces, filtered by deterministic rules into operational-date candidates, then checked by a second proof pass.</p>' +
        '<p>The confusing part is that the middle layers are intentionally broad. They contain real launches, planned work, meetings, design details, results periods, photos, outreach events, and misclassified rows. The desired output is much narrower: route-linked, realized treatment anchors with exact source evidence.</p></div>' +
        '<div class="flow" style="margin-top:12px">' + data.stages.map(stageCard).join("") + '</div>';
    }

    function metric(title, value, detail, cls = "") {
      return '<div class="panel"><div class="metric ' + cls + '">' + fmt(value) + '</div><div><strong>' + esc(title) + '</strong></div><div class="label">' + esc(detail) + '</div></div>';
    }

    function stageCard(stage) {
      return '<div class="panel stage"><h3>' + esc(stage.title) + '</h3><div class="count">' + esc(stage.count) + '</div><p>' + esc(stage.description) + '</p><div class="small muted"><code>' + esc(stage.artifact) + '</code></div></div>';
    }

    function renderExtraction(data) {
      $("#extraction").innerHTML =
        '<div class="grid cols-4">' +
          metric("OCR sources", data.summaries.ocr.sourceCount, "Source documents with page markdown") +
          metric("Structured windows", data.summaries.structuredExtraction.windowCount, "LLM page/window extraction attempts") +
          metric("Failed windows", data.summaries.structuredExtraction.failedWindowCount, "Windows that did not produce valid structured output", "bad") +
          metric("Derived events", data.summaries.assertions.inputEventCount, "Rows that fed operational-date classification") +
        '</div>' +
        '<div class="panel" style="margin-top:12px"><h2>Layer Mismatch To Review</h2><p>The per-page/window extraction artifact is not the same thing as the downstream event surface. The structured artifact reports many failed windows, while the derived surface still has event rows from normalized or reused extraction outputs. This viewer keeps those layers separate so a row is not trusted just because it exists downstream.</p></div>' +
        '<div class="panel" style="margin-top:12px"><h2>Per-page OCR Samples</h2><p>These are the page markdown snippets the proof harness later used as source context. They are not raw PDFs; they are OCR markdown from rendered page images.</p>' +
        data.pageSamples.slice(0, 12).map(pageSample).join("") + '</div>' +
        '<div class="grid cols-2" style="margin-top:12px">' +
          sampleTable("Event Surface Samples", data.eventSamples) +
          sampleTable("Claim Surface Samples", data.claimSamples) +
        '</div>';
    }

    function pageSample(sample) {
      return '<details><summary><strong>' + esc(sample.sourceId) + '</strong> page ' + esc(sample.pageNumber) + ' ' + pills(sample.routesMentioned) + pills(sample.datesMentioned, "warn") + '</summary>' +
        '<div class="small muted"><code>' + esc(sample.path) + '</code></div><pre>' + esc(sample.body) + '</pre></details>';
    }

    function sampleTable(title, rows) {
      return '<div class="panel"><h2>' + esc(title) + '</h2><table><thead><tr><th>Label</th><th>Family</th><th>Source</th></tr></thead><tbody>' +
        rows.slice(0, 30).map((row) => '<tr><td>' + esc(row.displayLabel) + '</td><td>' + esc(row.canonicalFamily || row.rawFamily) + '</td><td><code>' + esc(row.sourceId) + '</code></td></tr>').join("") +
        '</tbody></table></div>';
    }

    function renderIssues(data) {
      const rejected = data.candidates.filter((row) => row.outcome === "rejected_proven").length;
      $("#issues").innerHTML =
        '<div class="grid cols-4">' +
          metric("Rejected proven", rejected, "Rows where the LLM said proven but validator blocked it", "bad") +
          metric("Issue groups", data.issueGroups.length, "Distinct validator issue codes") +
          metric("Camera/family mismatches", issueCount(data, "candidate_camera_enforcement_family_mismatch"), "ACE/ABLE/camera rows not shaped as camera_enforcement", "bad") +
          metric("Family unsupported", issueCount(data, "treatment_family_not_supported"), "Proof quote did not support candidate treatment family", "bad") +
        '</div>' +
        '<div class="panel" style="margin-top:12px"><h2>Why 210 LLM-proven Did Not Become 210 Valid</h2><p>The proof model often found a nearby fact in the document, but not the exact candidate: wrong treatment family, route not grounded, result-period instead of launch date, planned/future language, non-anchor labels, or non-exact spans.</p></div>' +
        '<div class="issue-list" style="margin-top:12px">' + data.issueGroups.map(issueCard).join("") + '</div>';
    }

    function issueCount(data, code) {
      const group = data.issueGroups.find((item) => item.code === code && item.severity === "error");
      return group ? group.count : 0;
    }

    function issueCard(group) {
      return '<div class="panel"><h3><span class="pill ' + (group.severity === "error" ? "bad" : "warn") + '">' + esc(group.severity) + '</span> ' + esc(group.code) + '</h3>' +
        '<div class="metric ' + (group.severity === "error" ? "bad" : "warn") + '">' + fmt(group.count) + '</div><p>' + esc(group.description) + '</p>' +
        '<div class="small muted">Samples: ' + group.sampleCandidateIds.map((id) => '<code>' + esc(id) + '</code>').join(" ") + '</div></div>';
    }

    function renderDesired(data) {
      $("#desired").innerHTML =
        '<div class="grid cols-3">' +
          metric("Valid proven rows", data.summaries.accepted.validProvenRows, "Rows with exact proof and acceptable candidate shape", "good") +
          metric("Distinct interventions", data.summaries.accepted.distinctInterventions, "Dedup target count before DB wiring", "good") +
          metric("Rejected proven", data.summaries.accepted.rejectedProven, "Rows to repair, relabel, or drop", "bad") +
        '</div>' +
        '<div class="panel" style="margin-top:12px"><h2>Desired Anchor Shape</h2><table><thead><tr><th>Field</th><th>Why it matters</th></tr></thead><tbody>' +
        data.targetShape.map((row) => '<tr><td><code>' + esc(row.field) + '</code></td><td>' + esc(row.why) + '</td></tr>').join("") +
        '</tbody></table></div>' +
        '<div class="panel" style="margin-top:12px"><h2>Accepted Proof-backed Rows</h2>' + candidateTable(data.desiredRows.slice(0, 120), false) + '</div>';
    }

    function renderExplorer(data) {
      const outcomes = [...new Set(data.candidates.map((row) => row.outcome))].sort();
      const families = [...new Set(data.candidates.map((row) => row.family))].sort();
      const issueCodes = [...new Set(data.candidates.flatMap((row) => row.issueCodes.concat(row.warningCodes)))].sort();
      $("#explorer").innerHTML =
        '<div class="toolbar">' +
          '<input id="search" type="search" placeholder="Search labels, source ids, routes, issue codes" />' +
          select("outcomeFilter", "Outcome", outcomes) +
          select("familyFilter", "Family", families) +
          select("issueFilter", "Issue", issueCodes) +
        '</div>' +
        '<div class="split"><div class="panel"><div id="candidateCount" class="small muted"></div><div id="candidateTable"></div></div><div class="panel detail" id="detail"><p>Select a candidate row.</p></div></div>';
      ["search", "outcomeFilter", "familyFilter", "issueFilter"].forEach((id) => $("#" + id).addEventListener("input", updateExplorer));
      updateExplorer();
    }

    function select(id, label, values) {
      return '<select id="' + id + '"><option value="">' + esc(label) + ': all</option>' + values.map((value) => '<option value="' + esc(value) + '">' + esc(value) + '</option>').join("") + '</select>';
    }

    function filteredCandidates() {
      const q = ($("#search")?.value || "").toLowerCase();
      const outcome = $("#outcomeFilter")?.value || "";
      const family = $("#familyFilter")?.value || "";
      const issue = $("#issueFilter")?.value || "";
      return state.data.candidates.filter((row) => {
        const haystack = [row.candidateId, row.label, row.sourceId, row.family, row.operationalDate, row.proofDate, row.routeIds.join(" "), row.issueCodes.join(" "), row.warningCodes.join(" ")].join(" ").toLowerCase();
        return (!q || haystack.includes(q)) &&
          (!outcome || row.outcome === outcome) &&
          (!family || row.family === family) &&
          (!issue || row.issueCodes.includes(issue) || row.warningCodes.includes(issue));
      });
    }

    function updateExplorer() {
      const rows = filteredCandidates();
      $("#candidateCount").textContent = fmt(rows.length) + " rows shown";
      $("#candidateTable").innerHTML = candidateTable(rows.slice(0, 500), true);
      $$("#candidateTable tbody tr").forEach((tr) => tr.addEventListener("click", () => showDetail(tr.dataset.id)));
      if (!state.selectedId && rows[0]) showDetail(rows[0].candidateId);
    }

    function candidateTable(rows, clickable) {
      return '<table><thead><tr><th>Outcome</th><th>Label</th><th>Family</th><th>Date</th><th>Routes</th><th>Issues</th></tr></thead><tbody>' +
        rows.map((row) => '<tr data-id="' + esc(row.candidateId) + '">' +
          '<td><span class="pill ' + pillClass(row.outcome) + '">' + esc(outcomeLabel(row.outcome)) + '</span></td>' +
          '<td><strong>' + esc(row.label) + '</strong><div class="small muted"><code>' + esc(row.sourceId) + '</code></div></td>' +
          '<td>' + esc(row.family) + '</td>' +
          '<td>' + esc(row.operationalDate || row.proofDate) + '</td>' +
          '<td>' + pills(row.routeIds) + '</td>' +
          '<td>' + pills(row.issueCodes, "bad") + pills(row.warningCodes, "warn") + '</td>' +
        '</tr>').join("") + '</tbody></table>';
    }

    function showDetail(id) {
      const row = state.data.candidates.find((item) => item.candidateId === id);
      if (!row) return;
      state.selectedId = id;
      $("#detail").innerHTML =
        '<h2>' + esc(row.label) + '</h2>' +
        '<div>' + '<span class="pill ' + pillClass(row.outcome) + '">' + esc(outcomeLabel(row.outcome)) + '</span>' + pills([row.family]) + pills(row.routeIds) + '</div>' +
        '<h3>Candidate</h3><table><tbody>' +
          kv("candidateId", row.candidateId) + kv("interventionId", row.interventionId) + kv("sourceId", row.sourceId) + kv("expected date", row.operationalDate) + kv("month", row.implementationMonth) + kv("route tier", row.routeResolutionTier) + kv("treatment", row.treatmentText) +
        '</tbody></table>' +
        '<h3>Proof Result</h3><table><tbody>' +
          kv("proofStatus", row.proofStatus) + kv("validationState", row.validationState) + kv("claimType", row.proofClaimType) + kv("proof date", row.proofDate) + kv("route scope", row.proofRouteKind) + kv("proof routes", row.proofRouteIds.join(", ")) + kv("confidence", row.proofConfidence) +
        '</tbody></table>' +
        '<h3>Issues</h3><div>' + pills(row.issueCodes, "bad") + pills(row.warningCodes, "warn") + '</div>' +
        '<h3>Evidence Quotes</h3>' + (row.evidenceQuotes.length ? row.evidenceQuotes.map((quote) => '<div class="panel" style="padding:10px;margin:8px 0"><div class="small muted">page ' + esc(quote.pageNumber) + ' supports ' + esc(quote.supports.join(", ")) + '</div><pre>' + esc(quote.quote) + '</pre></div>').join("") : '<p>No evidence quote.</p>') +
        '<h3>Unvalidated Questions</h3>' + (row.unvalidatedQuestions.length ? '<ul>' + row.unvalidatedQuestions.map((q) => '<li>' + esc(q) + '</li>').join("") + '</ul>' : '<p>None.</p>') +
        '<h3>Context Given To Proof Model</h3><p>' + esc(row.context.pages) + ' pages, ' + fmt(row.context.chars) + ' chars, truncated=' + esc(row.context.truncated) + '</p>';
    }

    function kv(key, value) {
      return '<tr><th>' + esc(key) + '</th><td>' + esc(value ?? "") + '</td></tr>';
    }

    $$(".tab").forEach((tab) => tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      $$(".tab").forEach((item) => item.classList.toggle("active", item === tab));
      $$(".section").forEach((section) => section.classList.toggle("active", section.id === state.activeTab));
    }));

    fetch("./viewer-data.json")
      .then((res) => res.json())
      .then((data) => { state.data = data; render(); })
      .catch((err) => { document.body.innerHTML = '<main><div class="panel"><h1>Failed to load viewer data</h1><pre>' + esc(err.stack || err.message || err) + '</pre></div></main>'; });
  </script>
</body>
</html>`;
}

async function writeViewer(input: {
  runDir: string;
  outputDir: string;
  proofHarnessPath: string;
}): Promise<{
  outputDir: string;
  indexPath: string;
  dataPath: string;
  data: ViewerData;
}> {
  await mkdir(input.outputDir, { recursive: true });
  const data = await buildViewerData({
    runDir: input.runDir,
    proofHarnessPath: input.proofHarnessPath,
  });
  const indexPath = join(input.outputDir, "index.html");
  const dataPath = join(input.outputDir, "viewer-data.json");
  await Bun.write(indexPath, viewerHtml());
  await Bun.write(dataPath, JSON.stringify(data, null, 2));
  return { outputDir: input.outputDir, indexPath, dataPath, data };
}

function contentType(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".md" || ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function serveViewer(input: { outputDir: string; host: string; port: number }) {
  const root = resolve(input.outputDir);
  return Bun.serve({
    hostname: input.host,
    port: input.port,
    fetch(request) {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const path = resolve(root, relativePath);
      if (!path.startsWith(root) || !existsSync(path)) {
        return new Response("Not found", { status: 404 });
      }
      return new Response(Bun.file(path), {
        headers: { "content-type": contentType(path) },
      });
    },
  });
}

export default defineCommand({
  path: ["docs", "tier2", "review-viewer"],
  summary: "Build and optionally serve a browser viewer for Tier 2 extraction/proof artifacts.",
  input: { options: optionsSchema },
  output: z.unknown(),
  async run({ input }) {
    const runDir = fromCliPath(input.options.runDir ?? DEFAULT_RUN_DIR);
    const proofHarnessPath = fromCliPath(
      input.options.proofHarness ?? join(DEFAULT_RUN_DIR, DEFAULT_SURFACES_DIR, DEFAULT_PROOF_FILE),
    );
    const outputDir = fromCliPath(
      input.options.outputDir ?? join(input.options.runDir ?? DEFAULT_RUN_DIR, DEFAULT_VIEWER_DIR),
    );
    const built = await writeViewer({ runDir, outputDir, proofHarnessPath });
    const host = input.options.host ?? DEFAULT_HOST;
    const port = input.options.port ?? DEFAULT_PORT;
    const url = `http://${host}:${port}/`;

    if (input.options.serve === true) {
      serveViewer({ outputDir, host, port });
      console.log(
        JSON.stringify(
          { url, outputDir: built.outputDir, indexPath: built.indexPath, dataPath: built.dataPath },
          null,
          2,
        ),
      );
      await new Promise<never>(() => undefined);
    }

    return {
      outputDir: built.outputDir,
      indexPath: built.indexPath,
      dataPath: built.dataPath,
      url,
      summary: built.data.summaries,
    };
  },
});
