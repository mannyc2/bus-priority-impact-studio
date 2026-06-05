import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import type { ToolCallMessage } from "../../../lib/llm.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../../lib/paths.ts";
import { callPioneerToolCallDirect, openRouterErrorMessage } from "./_llm-clients.ts";
import {
  type CliOption,
  defaultFetch,
  extractToolCallArguments,
  type FetchLike,
  latestDocsRunId,
  markdownBody,
  missingToolCallErrorMessage,
  ocrPlanPath,
  parseCliOptions,
  readRequiredJsonArtifact,
  runArtifactRoot,
  type Tier2OcrPageMarkdownAudit,
  type Tier2OcrPageMarkdownAuditPage,
  trueOption,
} from "./_shared.ts";

const RESEARCH_AUDIT_TOOL_NAME = "submit_tier2_research_audit";
const RESEARCH_AUDIT_PROMPT_VERSION = "tier2-research-audit-opus-v1";
const DEFAULT_MODEL = "claude-opus-4-5";
const DEFAULT_MAX_TOKENS = 20_000;
const DEFAULT_FIXTURE_COUNT = 32;
const DEFAULT_MAX_MARKDOWN_CHARS_PER_FIXTURE = 8_000;
const DEFAULT_MAX_CANDIDATE_SAMPLE_PER_FIXTURE = 12;
const DEFAULT_MAX_RAW_CANDIDATE_CHARS = 900;

const RESEARCH_AUDIT_FOCUSES = ["all", "schema", "gold", "adversarial", "causal"] as const;
type ResearchAuditFocus = (typeof RESEARCH_AUDIT_FOCUSES)[number];

const EXECUTABLE_RESEARCH_AUDIT_FOCUSES = ["schema", "gold", "adversarial", "causal"] as const;

const EXTRACTION_REVIEW_GUARDRAILS = [
  "Do not treat recall-heavy discovery candidates as truth or public/published rows.",
  "Keep raw status/date/family/subtype signals visible; downstream code must not discard them.",
  "Separate bus routes from subway, rail, PATH, LIRR, NJ Transit, Amtrak, and station entities.",
  "Keep proposed, planned, process, study, meeting, design, and report-date text out of implemented launch facts.",
  "Treat document metrics as source-stated claims until deterministic analytics or reviewer disposition promotes them.",
  "Flag causal/effect language as candidate evidence only; never promote it as causal proof.",
  "Require resolved OCR markdown plus page/block/line evidence refs for every useful fixture.",
] as const;

type CandidateType =
  | "entity"
  | "metric"
  | "event"
  | "table"
  | "claim"
  | "context_signal"
  | "review_question";

type NormalizedCandidateRow = {
  rowId: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  candidateType: CandidateType;
  candidateId: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  evidenceRefs: Array<{
    blockId: string;
    pageNumber: number;
    lineStart: number;
    lineEnd: number;
    blockHash?: string;
    roleRaw?: string;
  }>;
  rawCandidate: unknown;
};

type NormalizedCandidatesArtifact = {
  version: number;
  generatedAt: string;
  rowCount: number;
  summary: {
    byCandidateType: Record<string, number>;
    byCanonicalFamily: Record<
      string,
      Array<{ canonicalFamily: string; count: number; sourceCount: number }>
    >;
  };
  rows: NormalizedCandidateRow[];
};

type FixtureWindow = {
  fixtureId: string;
  windowKey: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  pageArtifactKeys: string[];
  selectionReasons: string[];
  markdownChars: number;
  markdownTruncated: boolean;
  markdown: string;
  usability: FixtureUsability;
  candidateSample: Array<{
    rowId: string;
    candidateType: CandidateType;
    canonicalFamily: string;
    rawFamily: string;
    displayLabel: string;
    evidenceRefs: NormalizedCandidateRow["evidenceRefs"];
    rawCandidate: unknown;
  }>;
};

type FixtureUsability = {
  usable: boolean;
  issues: string[];
  riskTags: string[];
  resolvedMarkdownPageCount: number;
  expectedPageCount: number;
  sourceGroundedCandidateCount: number;
  candidateCount: number;
};

type CandidateFamilyHighlights = {
  byCandidateType: Record<string, number>;
  topCanonicalFamiliesByCandidateType: Record<
    string,
    Array<{ canonicalFamily: string; count: number; sourceCount: number }>
  >;
};

export type Tier2ResearchAuditFixturePack = {
  version: 1;
  generatedAt: string;
  promptVersion: string;
  sourceArtifacts: {
    normalizedCandidatesPath: string;
    pageMarkdownAuditPath: string;
    markdownRunRoot: string;
  };
  summary: {
    fixtureCount: number;
    normalizedCandidateRows: number;
    sourceGroups: Array<{ sourceGroup: string; fixtureCount: number }>;
    selectionReasonCounts: Array<{ reason: string; fixtureCount: number }>;
    candidateFamilyHighlights: CandidateFamilyHighlights;
    usability: {
      usableFixtureCount: number;
      unusableFixtureCount: number;
      issueCounts: Array<{ issue: string; fixtureCount: number }>;
      riskTagCounts: Array<{ riskTag: string; fixtureCount: number }>;
      guardrails: readonly string[];
    };
  };
  fixtures: FixtureWindow[];
};

export type Tier2ResearchAuditArtifact = {
  version: 1;
  generatedAt: string;
  promptVersion: string;
  provider: "pioneer";
  model: string;
  focus: ResearchAuditFocus;
  execute: boolean;
  maxTokens: number;
  fixturePack: Tier2ResearchAuditFixturePack;
  requestArtifactKey: string | null;
  responseArtifactKey: string | null;
  toolCallArtifactKey: string | null;
  errorArtifactKey: string | null;
  rawUsage: unknown | null;
  result: unknown | null;
};

export type RunTier2ResearchAuditArgs = {
  normalizedCandidatesPath: string;
  pageMarkdownAuditPath: string;
  markdownRunRoot: string;
  outputPath?: string;
  generatedAt?: string;
  model?: string;
  maxTokens?: number;
  fixtureCount?: number;
  maxMarkdownCharsPerFixture?: number;
  maxCandidateSamplePerFixture?: number;
  maxRawCandidateChars?: number;
  focus?: ResearchAuditFocus;
  execute?: boolean;
  fetcher?: FetchLike;
  pioneerApiKey?: string;
};

type ResearchAuditCliArgs = {
  normalizedCandidatesPath?: string;
  pageMarkdownAuditPath?: string;
  markdownRunRoot?: string;
  artifactRoot?: string;
  runId?: string;
  outputPath?: string;
  model?: string;
  maxTokens?: number;
  fixtureCount?: number;
  maxMarkdownCharsPerFixture?: number;
  maxCandidateSamplePerFixture?: number;
  maxRawCandidateChars?: number;
  focus?: ResearchAuditFocus;
  execute?: boolean;
};

type WindowAccumulator = {
  windowKey: string;
  sourceId: string;
  sourceTitle: string;
  sourceGroup: string;
  pageNumbers: number[];
  rows: NormalizedCandidateRow[];
};

type CandidateTarget = {
  reason: string;
  matches: (window: WindowAccumulator) => boolean;
};

const TARGETS: CandidateTarget[] = [
  {
    reason: "performance_comparison_table",
    matches: (window) =>
      hasRow(window, "table", "performance_comparison") ||
      hasRow(window, "table", "service_or_ridership"),
  },
  {
    reason: "claimed_speed_or_travel_time_metric",
    matches: (window) =>
      hasRow(window, "metric", "bus_speed") ||
      hasRow(window, "metric", "travel_time") ||
      hasRow(window, "metric", "reliability_or_dwell"),
  },
  {
    reason: "ridership_or_service_metric",
    matches: (window) =>
      hasRow(window, "metric", "ridership") ||
      hasRow(window, "metric", "service_frequency_or_wait"),
  },
  {
    reason: "proposal_status_risk",
    matches: (window) =>
      hasRow(window, "claim", "proposed_treatment") ||
      hasRow(window, "event", "planned_intervention"),
  },
  {
    reason: "implementation_milestone",
    matches: (window) => hasRow(window, "event", "implementation_milestone"),
  },
  {
    reason: "causal_or_effect_claim",
    matches: (window) => hasRow(window, "claim", "causal_or_effect_claim"),
  },
  {
    reason: "methodology_or_source_note",
    matches: (window) =>
      hasRow(window, "claim", "methodology_or_source_note") ||
      hasRow(window, "metric", "document_or_project_metadata"),
  },
  {
    reason: "bus_route_vs_rail_or_transit_line_confusion",
    matches: (window) =>
      hasRow(window, "entity", "bus_route") &&
      (hasRow(window, "entity", "rail_service") ||
        hasRow(window, "entity", "transit_line") ||
        hasRow(window, "entity", "station")),
  },
  {
    reason: "curb_or_access_context",
    matches: (window) =>
      hasRow(window, "context_signal", "curb_context") ||
      hasRow(window, "claim", "regulatory_restriction") ||
      hasRow(window, "metric", "curb_or_parking"),
  },
  {
    reason: "ace_able_or_enforcement",
    matches: (window) =>
      window.sourceGroup === "ace_able" ||
      hasRow(window, "metric", "enforcement_or_violation") ||
      hasRow(window, "event", "regulatory_or_enforcement"),
  },
  {
    reason: "busway_or_bus_lane_treatment",
    matches: (window) =>
      window.sourceGroup === "busway" ||
      textIncludes(window, ["busway", "bus lane", "red lane", "offset lane"]),
  },
  {
    reason: "route_redesign_or_service_change",
    matches: (window) =>
      window.sourceGroup === "better_buses" ||
      hasRow(window, "event", "service_change") ||
      textIncludes(window, ["route redesign", "service change", "stop consolidation"]),
  },
  {
    reason: "source_gap_or_review_question",
    matches: (window) =>
      hasRow(window, "review_question", "source_gap") ||
      hasRow(window, "review_question", "metadata_gap"),
  },
  {
    reason: "boilerplate_or_suppression_candidate",
    matches: (window) =>
      window.rows.length <= 2 ||
      textIncludes(window, ["agenda", "thank you", "next steps", "contact"]),
  },
];

function sha256Hex(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function compact(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function windowKey(sourceId: string, pageNumbers: number[]): string {
  return `${sourceId}:${pageNumbers.join("-")}`;
}

function hasRow(window: WindowAccumulator, candidateType: CandidateType, family: string): boolean {
  return window.rows.some(
    (row) => row.candidateType === candidateType && row.canonicalFamily === family,
  );
}

function textIncludes(window: WindowAccumulator, needles: string[]): boolean {
  const text = compact(window.rows.map((row) => `${row.displayLabel} ${row.rawFamily}`).join(" "));
  return needles.some((needle) => text.includes(needle));
}

function addCounter(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function counterRows(map: Map<string, number>, valueLabel: string) {
  return [...map.entries()]
    .map(([value, count]) => ({ [valueLabel]: value, fixtureCount: count }))
    .sort(
      (left, right) =>
        right.fixtureCount - left.fixtureCount ||
        String(left[valueLabel]).localeCompare(String(right[valueLabel])),
    );
}

function candidateFamilyHighlights(
  summary: NormalizedCandidatesArtifact["summary"],
): CandidateFamilyHighlights {
  const topCanonicalFamiliesByCandidateType: CandidateFamilyHighlights["topCanonicalFamiliesByCandidateType"] =
    {};
  for (const [candidateType, rows] of Object.entries(summary.byCanonicalFamily)) {
    topCanonicalFamiliesByCandidateType[candidateType] = rows.slice(0, 12);
  }
  return {
    byCandidateType: summary.byCandidateType,
    topCanonicalFamiliesByCandidateType,
  };
}

function compactRawCandidate(value: unknown, maxChars: number): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return value;
  if (serialized.length <= maxChars) return value;
  return {
    truncatedJson: `${serialized.slice(0, maxChars)}...`,
    originalSha256: sha256Hex(serialized),
    originalChars: serialized.length,
  };
}

function windowScore(window: WindowAccumulator): number {
  let score = 0;
  for (const row of window.rows) {
    if (row.candidateType === "table") score += 12;
    if (row.candidateType === "metric") score += 8;
    if (row.candidateType === "event") score += 8;
    if (row.candidateType === "claim") score += 5;
    if (row.candidateType === "context_signal") score += 3;
    if (row.candidateType === "review_question") score += 2;
    if (row.candidateType === "entity") score += 1;
    if (row.canonicalFamily.startsWith("other")) score += 1;
    if (row.canonicalFamily === "causal_or_effect_claim") score += 12;
  }
  score += new Set(window.rows.map((row) => row.candidateType)).size * 5;
  score += TARGETS.filter((target) => target.matches(window)).length * 10;
  return score;
}

function candidatePriority(row: NormalizedCandidateRow): number {
  const typePriority: Record<CandidateType, number> = {
    table: 80,
    metric: 70,
    event: 65,
    claim: 60,
    context_signal: 35,
    review_question: 25,
    entity: 10,
  };
  const familyBoost =
    row.canonicalFamily === "causal_or_effect_claim" ||
    row.canonicalFamily === "performance_comparison" ||
    row.canonicalFamily === "implementation_milestone"
      ? 20
      : row.canonicalFamily.startsWith("other")
        ? -10
        : 0;
  return typePriority[row.candidateType] + familyBoost;
}

function pageMap(audit: Tier2OcrPageMarkdownAudit): Map<string, Tier2OcrPageMarkdownAuditPage> {
  const map = new Map<string, Tier2OcrPageMarkdownAuditPage>();
  for (const source of audit.sources) {
    for (const page of source.pages) {
      map.set(`${page.sourceId}:${page.pageNumber}`, page);
    }
  }
  return map;
}

function buildWindows(rows: NormalizedCandidateRow[]): WindowAccumulator[] {
  const windows = new Map<string, WindowAccumulator>();
  for (const row of rows) {
    const key = windowKey(row.sourceId, row.pageNumbers);
    const current = windows.get(key) ?? {
      windowKey: key,
      sourceId: row.sourceId,
      sourceTitle: row.sourceTitle,
      sourceGroup: row.sourceGroup,
      pageNumbers: row.pageNumbers,
      rows: [],
    };
    current.rows.push(row);
    windows.set(key, current);
  }
  return [...windows.values()].sort((left, right) => right.rows.length - left.rows.length);
}

function selectionReasons(window: WindowAccumulator): string[] {
  const reasons = TARGETS.filter((target) => target.matches(window)).map((target) => target.reason);
  return reasons.length > 0 ? reasons : ["diversity_fill"];
}

function selectWindows(rows: NormalizedCandidateRow[], fixtureCount: number): WindowAccumulator[] {
  const windows = buildWindows(rows);
  const selected = new Map<string, WindowAccumulator>();
  const sourceGroupCounts = new Map<string, number>();

  function add(window: WindowAccumulator): void {
    if (selected.has(window.windowKey)) return;
    selected.set(window.windowKey, window);
    addCounter(sourceGroupCounts, window.sourceGroup);
  }

  for (const target of TARGETS) {
    if (selected.size >= fixtureCount) break;
    const candidates = windows
      .filter((window) => !selected.has(window.windowKey) && target.matches(window))
      .sort((left, right) => {
        const leftGroupCount = sourceGroupCounts.get(left.sourceGroup) ?? 0;
        const rightGroupCount = sourceGroupCounts.get(right.sourceGroup) ?? 0;
        return (
          leftGroupCount - rightGroupCount ||
          windowScore(right) - windowScore(left) ||
          left.windowKey.localeCompare(right.windowKey)
        );
      });
    if (candidates[0] !== undefined) add(candidates[0]);
  }

  for (const window of windows
    .filter((current) => !selected.has(current.windowKey))
    .sort(
      (left, right) =>
        windowScore(right) - windowScore(left) || left.windowKey.localeCompare(right.windowKey),
    )) {
    if (selected.size >= fixtureCount) break;
    add(window);
  }

  return [...selected.values()];
}

async function readMarkdownForWindow(input: {
  markdownRunRoot: string;
  pageByKey: Map<string, Tier2OcrPageMarkdownAuditPage>;
  window: WindowAccumulator;
  maxMarkdownChars: number;
}): Promise<{
  markdown: string;
  pageArtifactKeys: string[];
  truncated: boolean;
  resolvedPageCount: number;
  missingPages: number[];
}> {
  const parts: string[] = [];
  const keys: string[] = [];
  const missingPages: number[] = [];
  for (const pageNumber of input.window.pageNumbers) {
    const page = input.pageByKey.get(`${input.window.sourceId}:${pageNumber}`);
    if (page?.markdownArtifactKey === undefined || page.markdownArtifactKey === null) {
      missingPages.push(pageNumber);
      parts.push(`\n\n<!-- page ${pageNumber}: missing markdown artifact -->\n`);
      continue;
    }
    keys.push(page.markdownArtifactKey);
    const path = join(input.markdownRunRoot, page.markdownArtifactKey);
    const file = Bun.file(path);
    if (!(await file.exists())) {
      missingPages.push(pageNumber);
      parts.push(
        `\n\n<!-- page ${pageNumber}: markdown artifact not found at ${page.markdownArtifactKey} -->\n`,
      );
      continue;
    }
    const body = markdownBody(await file.text());
    parts.push(`\n\n<!-- page ${pageNumber} -->\n\n${body}`);
  }
  const markdown = parts.join("\n").trim();
  if (markdown.length <= input.maxMarkdownChars) {
    return {
      markdown,
      pageArtifactKeys: keys,
      truncated: false,
      resolvedPageCount: input.window.pageNumbers.length - missingPages.length,
      missingPages,
    };
  }
  return {
    markdown: `${markdown.slice(0, input.maxMarkdownChars)}\n\n[TRUNCATED_BY_HARNESS sha=${sha256Hex(markdown)}]`,
    pageArtifactKeys: keys,
    truncated: true,
    resolvedPageCount: input.window.pageNumbers.length - missingPages.length,
    missingPages,
  };
}

function evidenceRefIsGrounded(
  ref: NormalizedCandidateRow["evidenceRefs"][number],
  fixturePageNumbers: readonly number[],
): boolean {
  return (
    fixturePageNumbers.includes(ref.pageNumber) &&
    ref.blockId.length > 0 &&
    ref.lineStart > 0 &&
    ref.lineEnd >= ref.lineStart
  );
}

function riskTagsForFixture(input: {
  selectionReasons: readonly string[];
  candidateSample: FixtureWindow["candidateSample"];
}): string[] {
  const tags = new Set<string>();
  for (const reason of input.selectionReasons) {
    if (reason === "bus_route_vs_rail_or_transit_line_confusion")
      tags.add("route_rail_mode_confusion");
    if (reason === "proposal_status_risk") tags.add("proposal_or_planning_status");
    if (reason === "causal_or_effect_claim") tags.add("causal_language");
    if (reason === "boilerplate_or_suppression_candidate") tags.add("suppression_candidate");
  }
  for (const candidate of input.candidateSample) {
    if (candidate.candidateType === "metric") tags.add("document_claimed_metric");
    if (candidate.candidateType === "event") tags.add("event_status_date_candidate");
    if (
      candidate.candidateType === "claim" &&
      candidate.canonicalFamily === "causal_or_effect_claim"
    ) {
      tags.add("causal_language");
    }
    if (
      candidate.candidateType === "entity" &&
      ["rail_service", "transit_line", "station"].includes(candidate.canonicalFamily)
    ) {
      tags.add("non_bus_entity_mode");
    }
  }
  return [...tags].sort();
}

function fixtureUsability(input: {
  pageNumbers: readonly number[];
  resolvedMarkdownPageCount: number;
  missingPages: readonly number[];
  markdown: string;
  selectionReasons: readonly string[];
  candidateSample: FixtureWindow["candidateSample"];
}): FixtureUsability {
  const issues: string[] = [];
  const expectedPageCount = input.pageNumbers.length;
  if (input.resolvedMarkdownPageCount !== expectedPageCount) {
    issues.push("missing_or_unresolved_markdown");
  }
  if (input.markdown.trim().length === 0) {
    issues.push("empty_markdown_context");
  }
  if (input.candidateSample.length === 0) {
    issues.push("empty_candidate_sample");
  }
  let sourceGroundedCandidateCount = 0;
  let hasPageMismatch = false;
  for (const candidate of input.candidateSample) {
    const grounded = candidate.evidenceRefs.some((ref) =>
      evidenceRefIsGrounded(ref, input.pageNumbers),
    );
    if (grounded) sourceGroundedCandidateCount += 1;
    if (candidate.evidenceRefs.some((ref) => !input.pageNumbers.includes(ref.pageNumber))) {
      hasPageMismatch = true;
    }
  }
  if (input.candidateSample.length > 0 && sourceGroundedCandidateCount === 0) {
    issues.push("no_source_grounded_candidates");
  }
  if (hasPageMismatch) {
    issues.push("evidence_ref_page_mismatch");
  }

  const onlySuppression =
    input.selectionReasons.length > 0 &&
    input.selectionReasons.every((reason) =>
      ["boilerplate_or_suppression_candidate", "diversity_fill"].includes(reason),
    );
  const riskTags = riskTagsForFixture({
    selectionReasons: input.selectionReasons,
    candidateSample: input.candidateSample,
  });
  if (onlySuppression) riskTags.push("suppression_only_window");

  return {
    usable: issues.length === 0,
    issues,
    riskTags: [...new Set(riskTags)].sort(),
    resolvedMarkdownPageCount: input.resolvedMarkdownPageCount,
    expectedPageCount,
    sourceGroundedCandidateCount,
    candidateCount: input.candidateSample.length,
  };
}

function usabilitySummary(
  fixtures: readonly FixtureWindow[],
): Tier2ResearchAuditFixturePack["summary"]["usability"] {
  const issueCounts = new Map<string, number>();
  const riskTagCounts = new Map<string, number>();
  let usableFixtureCount = 0;
  for (const fixture of fixtures) {
    if (fixture.usability.usable) usableFixtureCount += 1;
    for (const issue of fixture.usability.issues) addCounter(issueCounts, issue);
    for (const riskTag of fixture.usability.riskTags) addCounter(riskTagCounts, riskTag);
  }
  return {
    usableFixtureCount,
    unusableFixtureCount: fixtures.length - usableFixtureCount,
    issueCounts: counterRows(issueCounts, "issue") as Array<{
      issue: string;
      fixtureCount: number;
    }>,
    riskTagCounts: counterRows(riskTagCounts, "riskTag") as Array<{
      riskTag: string;
      fixtureCount: number;
    }>,
    guardrails: EXTRACTION_REVIEW_GUARDRAILS,
  };
}

export async function buildTier2ResearchAuditFixturePack(
  input: Pick<
    RunTier2ResearchAuditArgs,
    | "normalizedCandidatesPath"
    | "pageMarkdownAuditPath"
    | "markdownRunRoot"
    | "generatedAt"
    | "fixtureCount"
    | "maxMarkdownCharsPerFixture"
    | "maxCandidateSamplePerFixture"
    | "maxRawCandidateChars"
  >,
): Promise<Tier2ResearchAuditFixturePack> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const normalized = (await Bun.file(
    input.normalizedCandidatesPath,
  ).json()) as NormalizedCandidatesArtifact;
  const audit = await readRequiredJsonArtifact<Tier2OcrPageMarkdownAudit>(
    input.pageMarkdownAuditPath,
  );
  const pageByKey = pageMap(audit);
  const selected = selectWindows(normalized.rows, input.fixtureCount ?? DEFAULT_FIXTURE_COUNT);
  const fixtures: FixtureWindow[] = [];
  for (const [index, window] of selected.entries()) {
    const markdown = await readMarkdownForWindow({
      markdownRunRoot: input.markdownRunRoot,
      pageByKey,
      window,
      maxMarkdownChars: input.maxMarkdownCharsPerFixture ?? DEFAULT_MAX_MARKDOWN_CHARS_PER_FIXTURE,
    });
    const selectionReasonList = selectionReasons(window);
    const candidateSample = window.rows
      .toSorted((left, right) => candidatePriority(right) - candidatePriority(left))
      .slice(0, input.maxCandidateSamplePerFixture ?? DEFAULT_MAX_CANDIDATE_SAMPLE_PER_FIXTURE)
      .map((row) => ({
        rowId: row.rowId,
        candidateType: row.candidateType,
        canonicalFamily: row.canonicalFamily,
        rawFamily: row.rawFamily,
        displayLabel: row.displayLabel,
        evidenceRefs: row.evidenceRefs,
        rawCandidate: compactRawCandidate(
          row.rawCandidate,
          input.maxRawCandidateChars ?? DEFAULT_MAX_RAW_CANDIDATE_CHARS,
        ),
      }));
    const usability = fixtureUsability({
      pageNumbers: window.pageNumbers,
      resolvedMarkdownPageCount: markdown.resolvedPageCount,
      missingPages: markdown.missingPages,
      markdown: markdown.markdown,
      selectionReasons: selectionReasonList,
      candidateSample,
    });
    const fixture: FixtureWindow = {
      fixtureId: `fixture_${String(index + 1).padStart(3, "0")}_${shortHash(window.windowKey)}`,
      windowKey: window.windowKey,
      sourceId: window.sourceId,
      sourceTitle: window.sourceTitle,
      sourceGroup: window.sourceGroup,
      pageNumbers: window.pageNumbers,
      pageArtifactKeys: markdown.pageArtifactKeys,
      selectionReasons: selectionReasonList,
      markdownChars: markdown.markdown.length,
      markdownTruncated: markdown.truncated,
      markdown: markdown.markdown,
      usability,
      candidateSample,
    };
    fixtures.push(fixture);
  }

  const sourceGroupCounts = new Map<string, number>();
  const reasonCounts = new Map<string, number>();
  for (const fixture of fixtures) {
    addCounter(sourceGroupCounts, fixture.sourceGroup);
    for (const reason of fixture.selectionReasons) addCounter(reasonCounts, reason);
  }

  return {
    version: 1,
    generatedAt,
    promptVersion: RESEARCH_AUDIT_PROMPT_VERSION,
    sourceArtifacts: {
      normalizedCandidatesPath: input.normalizedCandidatesPath,
      pageMarkdownAuditPath: input.pageMarkdownAuditPath,
      markdownRunRoot: input.markdownRunRoot,
    },
    summary: {
      fixtureCount: fixtures.length,
      normalizedCandidateRows: normalized.rowCount,
      sourceGroups: counterRows(sourceGroupCounts, "sourceGroup") as Array<{
        sourceGroup: string;
        fixtureCount: number;
      }>,
      selectionReasonCounts: counterRows(reasonCounts, "reason") as Array<{
        reason: string;
        fixtureCount: number;
      }>,
      candidateFamilyHighlights: candidateFamilyHighlights(normalized.summary),
      usability: usabilitySummary(fixtures),
    },
    fixtures,
  };
}

function researchAuditTool(focus: ResearchAuditFocus): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  const requiredByFocus: Record<ResearchAuditFocus, string[]> = {
    all: [
      "schemaAudit",
      "goldFixtures",
      "adversarialAudit",
      "causalStudyScout",
      "crossCuttingRecommendations",
    ],
    schema: ["schemaAudit", "crossCuttingRecommendations"],
    gold: ["goldFixtures", "crossCuttingRecommendations"],
    adversarial: ["adversarialAudit", "crossCuttingRecommendations"],
    causal: ["causalStudyScout", "crossCuttingRecommendations"],
  };
  return {
    name: RESEARCH_AUDIT_TOOL_NAME,
    description:
      "Submit a four-part Tier 2 research audit over fixture pages and discovery candidates.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: requiredByFocus[focus],
      properties: {
        schemaAudit: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "schemaChanges", "validatorGates", "openQuestions"],
          properties: {
            summary: { type: "string" },
            schemaChanges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["priority", "target", "change", "rationale"],
                properties: {
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  target: { type: "string" },
                  change: { type: "string" },
                  rationale: { type: "string" },
                },
              },
            },
            validatorGates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["gateId", "severity", "description", "failureExampleFixtureIds"],
                properties: {
                  gateId: { type: "string" },
                  severity: { type: "string", enum: ["blocker", "warning"] },
                  description: { type: "string" },
                  failureExampleFixtureIds: { type: "array", items: { type: "string" } },
                },
              },
            },
            openQuestions: { type: "array", items: { type: "string" } },
          },
        },
        goldFixtures: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "fixtureId",
              "pageRole",
              "expectedUsefulOutputs",
              "expectedSuppressions",
              "notes",
            ],
            properties: {
              fixtureId: { type: "string" },
              pageRole: { type: "string" },
              expectedUsefulOutputs: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind", "label", "evidence", "downstreamUse"],
                  properties: {
                    kind: {
                      type: "string",
                      enum: [
                        "entity",
                        "document_claimed_metric",
                        "table",
                        "intervention_event",
                        "service_change",
                        "context_signal",
                        "review_question",
                        "source_gap",
                      ],
                    },
                    label: { type: "string" },
                    evidence: { type: "string" },
                    downstreamUse: { type: "string" },
                  },
                },
              },
              expectedSuppressions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["reason", "example"],
                  properties: {
                    reason: { type: "string" },
                    example: { type: "string" },
                  },
                },
              },
              notes: { type: "string" },
            },
          },
        },
        adversarialAudit: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "risks"],
          properties: {
            summary: { type: "string" },
            risks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["riskType", "severity", "description", "fixtureIds", "mitigation"],
                properties: {
                  riskType: { type: "string" },
                  severity: { type: "string", enum: ["high", "medium", "low"] },
                  description: { type: "string" },
                  fixtureIds: { type: "array", items: { type: "string" } },
                  mitigation: { type: "string" },
                },
              },
            },
          },
        },
        causalStudyScout: {
          type: "object",
          additionalProperties: false,
          required: ["summary", "candidates", "sourceGaps"],
          properties: {
            summary: { type: "string" },
            candidates: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "candidateId",
                  "fixtureIds",
                  "title",
                  "viabilityScore",
                  "design",
                  "neededData",
                  "mainRisks",
                ],
                properties: {
                  candidateId: { type: "string" },
                  fixtureIds: { type: "array", items: { type: "string" } },
                  title: { type: "string" },
                  viabilityScore: { type: "number", minimum: 0, maximum: 1000 },
                  design: { type: "string" },
                  neededData: { type: "array", items: { type: "string" } },
                  mainRisks: { type: "array", items: { type: "string" } },
                },
              },
            },
            sourceGaps: { type: "array", items: { type: "string" } },
          },
        },
        crossCuttingRecommendations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["priority", "recommendation", "rationale"],
            properties: {
              priority: { type: "string", enum: ["high", "medium", "low"] },
              recommendation: { type: "string" },
              rationale: { type: "string" },
            },
          },
        },
      },
    },
  };
}

const SYSTEM_PROMPT = [
  "You are a senior applied-research reviewer for a NYC bus reliability analytics project.",
  "Your job is not to extract everything. Your job is to use the fixture pages and discovery candidates to improve the final structured extraction harness.",
  "Produce four separate outputs: schema audit, gold fixture labels, adversarial audit, and causal-study scout.",
  "This review must explicitly avoid known prior extraction failures.",
  "Discovery candidates are recall-heavy inputs, not truth, public rows, implemented events, or deterministic metrics.",
  "Preserve raw status/date/family/subtype evidence and distinguish bus-route identity from rail/transit/station mentions.",
  "Keep causal claims gated: documents can contain claimed effects, but the system must not treat them as causal proof.",
  "Separate document-claimed metrics from deterministic project metrics.",
  "Treat proposal/planning/report-date text as different from implementation/launch evidence.",
  "Use only the provided fixture text and candidate summaries. Do not import outside facts.",
  "Prefer block/line evidence references and short evidence descriptions over long quotations.",
  "Keep tool arguments concise: terse bullets, no essays, no long quote copying.",
  "Call the submit_tier2_research_audit tool exactly once.",
].join("\n");

function focusInstructions(focus: ResearchAuditFocus): string[] {
  if (focus === "all") {
    return ["Return all four work products plus cross-cutting recommendations."];
  }
  const labels: Record<Exclude<ResearchAuditFocus, "all">, string> = {
    schema: "schemaAudit",
    gold: "goldFixtures",
    adversarial: "adversarialAudit",
    causal: "causalStudyScout",
  };
  return [
    `This run focus is '${focus}'. Return only '${labels[focus]}' plus crossCuttingRecommendations.`,
    "Do not include the other top-level work products in this shard.",
  ];
}

function buildUserPrompt(pack: Tier2ResearchAuditFixturePack, focus: ResearchAuditFocus): string {
  const fixtures = pack.fixtures.map((fixture) => ({
    fixtureId: fixture.fixtureId,
    sourceId: fixture.sourceId,
    sourceTitle: fixture.sourceTitle,
    sourceGroup: fixture.sourceGroup,
    pageNumbers: fixture.pageNumbers,
    selectionReasons: fixture.selectionReasons,
    candidateSample: fixture.candidateSample,
    markdown: fixture.markdown,
  }));
  return [
    "Review this Tier 2 discovery fixture pack.",
    "",
    ...focusInstructions(focus),
    "",
    "The current discovery layer is intentionally recall-heavy. We need the next structured extraction schema and scorecard to be precise enough for detector review packets, causal-study panels, forecasting context, event-family response drift, public timelines, and source-gap queues.",
    "",
    "Return:",
    "1. Schema audit: final structured-extraction schema changes and validator gates.",
    "2. Gold fixture labels: what each page/window should produce, and what should be suppressed.",
    "3. Adversarial audit: likely failure modes in the current discovery output and how to catch them.",
    "4. Causal-study scout: promising event-study / DiD / ITS / synthetic-control candidates implied by the fixtures, with risks and needed data.",
    "",
    "Output caps for this review shard:",
    "- schemaChanges <= 6; validatorGates <= 6; openQuestions <= 6",
    "- one goldFixtures entry per input fixture; expectedUsefulOutputs <= 5 per fixture; expectedSuppressions <= 4 per fixture",
    "- adversarial risks <= 8",
    "- causal candidates <= 5; sourceGaps <= 8",
    "- crossCuttingRecommendations <= 6",
    "- evidence fields should be compact page/block/line pointers or short descriptions, not long quotes",
    "",
    "Known extraction mistakes to avoid:",
    JSON.stringify(EXTRACTION_REVIEW_GUARDRAILS, null, 2),
    "",
    "Fixture pack summary:",
    JSON.stringify(pack.summary, null, 2),
    "",
    "Fixtures:",
    JSON.stringify(fixtures, null, 2),
  ].join("\n");
}

function assertExecutableResearchAuditIsUsable(input: {
  execute: boolean | undefined;
  focus: ResearchAuditFocus;
  fixturePack: Tier2ResearchAuditFixturePack;
}): void {
  if (!input.execute) return;
  if (input.focus === "all") {
    throw new Error(
      `docs tier2 research-audit --execute requires a focused --focus value: ${EXECUTABLE_RESEARCH_AUDIT_FOCUSES.join(", ")}. Use focus=all only for dry-run fixture planning.`,
    );
  }
  const unusableFixtures = input.fixturePack.fixtures.filter(
    (fixture) => !fixture.usability.usable,
  );
  if (unusableFixtures.length > 0) {
    const details = unusableFixtures
      .slice(0, 8)
      .map((fixture) => `${fixture.fixtureId}:${fixture.usability.issues.join("|")}`)
      .join(", ");
    throw new Error(
      `docs tier2 research-audit --execute selected ${unusableFixtures.length} unusable fixture(s): ${details}`,
    );
  }
}

function usageFromBody(body: unknown): unknown | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const responseBody = body as { usage?: unknown };
  return responseBody.usage ?? null;
}

function artifactSibling(path: string, suffix: string): string {
  return path.endsWith(".json")
    ? path.replace(/\.json$/, `${suffix}.json`)
    : `${path}${suffix}.json`;
}

export async function runTier2ResearchAudit(
  input: RunTier2ResearchAuditArgs,
): Promise<Tier2ResearchAuditArtifact> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const outputPath =
    input.outputPath ??
    join(dirname(input.normalizedCandidatesPath), "tier2-research-audit-opus-v1.json");
  const requestPath = artifactSibling(outputPath, "-request");
  const responsePath = artifactSibling(outputPath, "-response");
  const toolCallPath = artifactSibling(outputPath, "-tool-call");
  const errorPath = artifactSibling(outputPath, "-error");
  await mkdir(dirname(outputPath), { recursive: true });

  const fixturePack = await buildTier2ResearchAuditFixturePack({
    normalizedCandidatesPath: input.normalizedCandidatesPath,
    pageMarkdownAuditPath: input.pageMarkdownAuditPath,
    markdownRunRoot: input.markdownRunRoot,
    generatedAt,
    ...(input.fixtureCount === undefined ? {} : { fixtureCount: input.fixtureCount }),
    ...(input.maxMarkdownCharsPerFixture === undefined
      ? {}
      : { maxMarkdownCharsPerFixture: input.maxMarkdownCharsPerFixture }),
    ...(input.maxCandidateSamplePerFixture === undefined
      ? {}
      : { maxCandidateSamplePerFixture: input.maxCandidateSamplePerFixture }),
    ...(input.maxRawCandidateChars === undefined
      ? {}
      : { maxRawCandidateChars: input.maxRawCandidateChars }),
  });

  const model = input.model ?? DEFAULT_MODEL;
  const maxTokens = input.maxTokens ?? DEFAULT_MAX_TOKENS;
  const focus = input.focus ?? "all";
  assertExecutableResearchAuditIsUsable({
    execute: input.execute,
    focus,
    fixturePack,
  });
  const tool = researchAuditTool(focus);
  const messages: ToolCallMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(fixturePack, focus) },
  ];
  await writeJson(requestPath, {
    version: 1,
    promptVersion: RESEARCH_AUDIT_PROMPT_VERSION,
    provider: "pioneer",
    model,
    focus,
    maxTokens,
    toolName: RESEARCH_AUDIT_TOOL_NAME,
    messages,
    tool,
  });

  if (!input.execute) {
    const artifact: Tier2ResearchAuditArtifact = {
      version: 1,
      generatedAt,
      promptVersion: RESEARCH_AUDIT_PROMPT_VERSION,
      provider: "pioneer",
      model,
      focus,
      execute: false,
      maxTokens,
      fixturePack,
      requestArtifactKey: requestPath,
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      errorArtifactKey: null,
      rawUsage: null,
      result: null,
    };
    await writeJson(outputPath, artifact);
    return artifact;
  }

  const env = process.env as { PIONEER_API_KEY?: string };
  const apiKey = input.pioneerApiKey ?? env.PIONEER_API_KEY;
  if (apiKey === undefined || apiKey.trim().length === 0) {
    throw new Error("PIONEER_API_KEY is required for docs tier2 research-audit --execute.");
  }

  try {
    const providerResult = await callPioneerToolCallDirect({
      apiKey,
      model,
      maxTokens,
      toolName: RESEARCH_AUDIT_TOOL_NAME,
      messages,
      tools: [tool],
      fetcher: input.fetcher ?? defaultFetch,
    });
    await writeJson(responsePath, providerResult.body);
    if (!providerResult.response.ok) {
      throw new Error(
        openRouterErrorMessage(providerResult.body) ??
          `HTTP ${providerResult.response.status} ${providerResult.response.statusText}`,
      );
    }
    const toolArgs = extractToolCallArguments(providerResult.body, RESEARCH_AUDIT_TOOL_NAME);
    if (toolArgs === null) {
      throw new Error(
        missingToolCallErrorMessage({
          responseJson: providerResult.body,
          toolName: RESEARCH_AUDIT_TOOL_NAME,
          maxTokens,
        }),
      );
    }
    await writeJson(toolCallPath, toolArgs);
    const artifact: Tier2ResearchAuditArtifact = {
      version: 1,
      generatedAt,
      promptVersion: RESEARCH_AUDIT_PROMPT_VERSION,
      provider: "pioneer",
      model,
      focus,
      execute: true,
      maxTokens,
      fixturePack,
      requestArtifactKey: requestPath,
      responseArtifactKey: responsePath,
      toolCallArtifactKey: toolCallPath,
      errorArtifactKey: null,
      rawUsage: usageFromBody(providerResult.body),
      result: toolArgs,
    };
    await writeJson(outputPath, artifact);
    return artifact;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJson(errorPath, {
      version: 1,
      generatedAt,
      promptVersion: RESEARCH_AUDIT_PROMPT_VERSION,
      provider: "pioneer",
      model,
      focus,
      error: message,
      requestArtifactKey: requestPath,
      responseArtifactKey: responsePath,
    });
    const artifact: Tier2ResearchAuditArtifact = {
      version: 1,
      generatedAt,
      promptVersion: RESEARCH_AUDIT_PROMPT_VERSION,
      provider: "pioneer",
      model,
      focus,
      execute: true,
      maxTokens,
      fixturePack,
      requestArtifactKey: requestPath,
      responseArtifactKey: null,
      toolCallArtifactKey: null,
      errorArtifactKey: errorPath,
      rawUsage: null,
      result: null,
    };
    await writeJson(outputPath, artifact);
    return artifact;
  }
}

function parseResearchAuditArgs(argv: string[]): ResearchAuditCliArgs {
  const options: CliOption<ResearchAuditCliArgs>[] = [
    {
      flags: ["--normalized-candidates"],
      apply: (output, value) => {
        if (value !== undefined) output.normalizedCandidatesPath = fromCliPath(value);
      },
    },
    {
      flags: ["--page-markdown-audit"],
      apply: (output, value) => {
        if (value !== undefined) output.pageMarkdownAuditPath = fromCliPath(value);
      },
    },
    {
      flags: ["--markdown-run-root"],
      apply: (output, value) => {
        if (value !== undefined) output.markdownRunRoot = fromCliPath(value);
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
      flags: ["--model"],
      apply: (output, value) => {
        if (value !== undefined) output.model = value;
      },
    },
    {
      flags: ["--focus"],
      apply: (output, value) => {
        if (value === undefined) return;
        if (!RESEARCH_AUDIT_FOCUSES.includes(value as ResearchAuditFocus)) {
          throw new Error(
            `Invalid --focus '${value}'. Expected one of: ${RESEARCH_AUDIT_FOCUSES.join(", ")}`,
          );
        }
        output.focus = value as ResearchAuditFocus;
      },
    },
    {
      flags: ["--max-tokens"],
      apply: (output, value) => {
        if (value !== undefined) output.maxTokens = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--fixture-count"],
      apply: (output, value) => {
        if (value !== undefined) output.fixtureCount = Number.parseInt(value, 10);
      },
    },
    {
      flags: ["--max-markdown-chars-per-fixture"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.maxMarkdownCharsPerFixture = Number.parseInt(value, 10);
        }
      },
    },
    {
      flags: ["--max-candidate-sample-per-fixture"],
      apply: (output, value) => {
        if (value !== undefined) {
          output.maxCandidateSamplePerFixture = Number.parseInt(value, 10);
        }
      },
    },
    {
      flags: ["--max-raw-candidate-chars"],
      apply: (output, value) => {
        if (value !== undefined) output.maxRawCandidateChars = Number.parseInt(value, 10);
      },
    },
    trueOption<ResearchAuditCliArgs>(["--execute"], (output) => {
      output.execute = true;
    }),
  ];
  return parseCliOptions(argv, {}, options);
}

async function resolveDefaults(
  args: ResearchAuditCliArgs,
): Promise<
  Required<
    Pick<
      RunTier2ResearchAuditArgs,
      "normalizedCandidatesPath" | "pageMarkdownAuditPath" | "markdownRunRoot"
    >
  >
> {
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const runId = args.runId ?? (await latestDocsRunId(artifactRoot));
  if (runId === null) {
    throw new Error("No docs run found. Provide --run-id or explicit artifact paths.");
  }
  const runRoot = runArtifactRoot(artifactRoot, runId);
  return {
    normalizedCandidatesPath:
      args.normalizedCandidatesPath ??
      join(runRoot, "document-discovery-normalized-candidates-canonical-v1.json"),
    pageMarkdownAuditPath:
      args.pageMarkdownAuditPath ?? join(runRoot, "ocr-page-markdown-audit.json"),
    markdownRunRoot: args.markdownRunRoot ?? dirname(ocrPlanPath(artifactRoot, runId)),
  };
}

export async function runTier2ResearchAuditFromCli(argv: string[]) {
  const args = parseResearchAuditArgs(argv);
  const defaults = await resolveDefaults(args);
  const result = await runTier2ResearchAudit({
    ...defaults,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.model === undefined ? {} : { model: args.model }),
    ...(args.focus === undefined ? {} : { focus: args.focus }),
    ...(args.maxTokens === undefined ? {} : { maxTokens: args.maxTokens }),
    ...(args.fixtureCount === undefined ? {} : { fixtureCount: args.fixtureCount }),
    ...(args.maxMarkdownCharsPerFixture === undefined
      ? {}
      : { maxMarkdownCharsPerFixture: args.maxMarkdownCharsPerFixture }),
    ...(args.maxCandidateSamplePerFixture === undefined
      ? {}
      : { maxCandidateSamplePerFixture: args.maxCandidateSamplePerFixture }),
    ...(args.maxRawCandidateChars === undefined
      ? {}
      : { maxRawCandidateChars: args.maxRawCandidateChars }),
    ...(args.execute === undefined ? {} : { execute: args.execute }),
  });
  console.log(
    `tier2-research-audit: fixtures=${result.fixturePack.summary.fixtureCount} execute=${result.execute} output=${args.outputPath ?? join(dirname(defaults.normalizedCandidatesPath), "tier2-research-audit-opus-v1.json")}`,
  );
  return result;
}
