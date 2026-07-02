import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import { fromCliPath } from "../../../lib/paths.ts";
import { type CliOption, parseCliOptions } from "./_shared.ts";

const ARTIFACT_KIND = "bp.tier2_agentic_canonical_merge.v1";

type SelfHealItem = {
  shardId: string;
  windowIds: string[];
  sourceIds: string[];
  primaryLane: string;
  decision: string;
  reasons: string[];
  manifestPath: string;
  artifactPath: string | null;
  auditPath: string | null;
  lastAttemptStatus: string | null;
  lastHttpStatus: number | null;
  submitState: string | null;
  auditBlockerCount: number;
  validationIssueCount: number;
  rejectedCount: number;
  acceptedCount: number;
  draftCount: number;
  issueCodes: string[];
};

type SelfHealPlan = {
  artifactKind: string;
  sourceRunId: string;
  sourceQueuePath: string;
  sourceOutputRoot: string | null;
  summary: {
    shardCount: number;
    cleanCount: number;
    acceptedSurfaceCount: number;
    retryEligibleCount: number;
    quarantineCount: number;
  };
  items: SelfHealItem[];
};

type MergeCandidate = {
  runId: string;
  runIndex: number;
  selfHealPlanPath: string;
  shardId: string;
  windowId: string;
  sourceIds: string[];
  sourceId: string | null;
  pageNumbers: number[];
  primaryLane: string;
  decision: string;
  clean: boolean;
  reasons: string[];
  manifestPath: string;
  artifactPath: string | null;
  auditPath: string | null;
  lastAttemptStatus: string | null;
  lastHttpStatus: number | null;
  submitState: string | null;
  auditBlockerCount: number;
  validationIssueCount: number;
  rejectedCount: number;
  acceptedCount: number;
  draftCount: number;
  issueCodes: string[];
  acceptedSurfaceKindCounts: Record<string, number>;
};

type CanonicalWindow = {
  windowId: string;
  selected: MergeCandidate;
  supersededCandidates: MergeCandidate[];
};

type UnresolvedWindow = {
  windowId: string;
  candidates: MergeCandidate[];
  reasons: string[];
};

export type Tier2AgenticCanonicalMergeArtifact = {
  artifactKind: typeof ARTIFACT_KIND;
  schemaVersion: 1;
  generatedAt: string;
  sourceSelfHealPlanPaths: string[];
  policy: {
    cleanCandidateRule: string;
    precedenceRule: string;
    unresolvedRule: string;
  };
  sourceRuns: Array<{
    runId: string;
    runIndex: number;
    selfHealPlanPath: string;
    sourceQueuePath: string;
    sourceOutputRoot: string | null;
    shardCount: number;
    cleanCount: number;
    acceptedSurfaceCount: number;
    retryEligibleCount: number;
    quarantineCount: number;
  }>;
  summary: {
    sourceRunCount: number;
    candidateRecordCount: number;
    uniqueWindowCount: number;
    canonicalWindowCount: number;
    unresolvedWindowCount: number;
    supersededCandidateCount: number;
    canonicalAcceptedSurfaceCount: number;
    canonicalDraftCount: number;
    canonicalRunCounts: Record<string, number>;
    canonicalSurfaceKindCounts: Record<string, number>;
    unresolvedLaneCounts: Record<string, number>;
  };
  canonicalArtifacts: Array<{
    windowId: string;
    runId: string;
    shardId: string;
    sourceId: string | null;
    pageNumbers: number[];
    artifactPath: string;
    auditPath: string | null;
    acceptedCount: number;
    draftCount: number;
    acceptedSurfaceKindCounts: Record<string, number>;
  }>;
  canonicalWindows: CanonicalWindow[];
  unresolvedWindows: UnresolvedWindow[];
};

export type BuildTier2AgenticCanonicalMergeArgs = {
  selfHealPlanPaths: readonly string[];
  outputPath?: string;
  markdownPath?: string;
  generatedAt?: string;
};

type CliArgs = {
  selfHealPlanPaths?: string[];
  outputPath?: string;
  markdownPath?: string;
  generatedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "string" && item.length > 0 ? [item] : []))
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (typeof item === "number" && Number.isFinite(item) ? [item] : []))
    : [];
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

async function readArtifactSummary(path: string | null): Promise<{
  sourceId: string | null;
  pageNumbers: number[];
  surfaceKindCounts: Record<string, number>;
}> {
  if (path === null) return { sourceId: null, pageNumbers: [], surfaceKindCounts: {} };
  const file = Bun.file(path);
  if (!(await file.exists())) return { sourceId: null, pageNumbers: [], surfaceKindCounts: {} };
  const raw = await file.json();
  if (!isRecord(raw)) return { sourceId: null, pageNumbers: [], surfaceKindCounts: {} };
  const source = isRecord(raw["source"]) ? raw["source"] : {};
  const submitResult = isRecord(raw["submitResult"]) ? raw["submitResult"] : {};
  const accepted = Array.isArray(submitResult["accepted"]) ? submitResult["accepted"] : [];
  const surfaceKindCounts: Record<string, number> = {};
  for (const item of accepted) {
    if (!isRecord(item) || !isRecord(item["surface"])) continue;
    const surfaceKind = stringValue(item["surface"]["surfaceKind"]) ?? "unknown";
    increment(surfaceKindCounts, surfaceKind);
  }
  return {
    sourceId: stringValue(source["sourceId"]),
    pageNumbers: numberArray(source["pageNumbers"]),
    surfaceKindCounts,
  };
}

function parseSelfHealPlan(raw: unknown, path: string): SelfHealPlan {
  if (!isRecord(raw)) throw new Error(`Self-heal plan is not an object: ${path}`);
  const summary = isRecord(raw["summary"]) ? raw["summary"] : {};
  const items = Array.isArray(raw["items"]) ? raw["items"] : [];
  return {
    artifactKind: stringValue(raw["artifactKind"]) ?? "unknown",
    sourceRunId: stringValue(raw["sourceRunId"]) ?? "unknown",
    sourceQueuePath: stringValue(raw["sourceQueuePath"]) ?? "",
    sourceOutputRoot: stringValue(raw["sourceOutputRoot"]),
    summary: {
      shardCount: numberValue(summary["shardCount"]) ?? 0,
      cleanCount: numberValue(summary["cleanCount"]) ?? 0,
      acceptedSurfaceCount: numberValue(summary["acceptedSurfaceCount"]) ?? 0,
      retryEligibleCount: numberValue(summary["retryEligibleCount"]) ?? 0,
      quarantineCount: numberValue(summary["quarantineCount"]) ?? 0,
    },
    items: items.flatMap((item, index) => {
      if (!isRecord(item)) return [];
      const shardId = stringValue(item["shardId"]) ?? `item-${index}`;
      return [
        {
          shardId,
          windowIds: stringArray(item["windowIds"]),
          sourceIds: stringArray(item["sourceIds"]),
          primaryLane: stringValue(item["primaryLane"]) ?? "unknown",
          decision: stringValue(item["decision"]) ?? "unknown",
          reasons: stringArray(item["reasons"]),
          manifestPath: stringValue(item["manifestPath"]) ?? "",
          artifactPath: stringValue(item["artifactPath"]),
          auditPath: stringValue(item["auditPath"]),
          lastAttemptStatus: stringValue(item["lastAttemptStatus"]),
          lastHttpStatus: numberValue(item["lastHttpStatus"]),
          submitState: stringValue(item["submitState"]),
          auditBlockerCount: numberValue(item["auditBlockerCount"]) ?? 0,
          validationIssueCount: numberValue(item["validationIssueCount"]) ?? 0,
          rejectedCount: numberValue(item["rejectedCount"]) ?? 0,
          acceptedCount: numberValue(item["acceptedCount"]) ?? 0,
          draftCount: numberValue(item["draftCount"]) ?? 0,
          issueCodes: stringArray(item["issueCodes"]),
        } satisfies SelfHealItem,
      ];
    }),
  };
}

function cleanCandidate(item: SelfHealItem): boolean {
  return (
    item.primaryLane === "clean" &&
    item.artifactPath !== null &&
    item.auditBlockerCount === 0 &&
    item.validationIssueCount === 0 &&
    item.rejectedCount === 0
  );
}

async function candidatesFromPlan(input: {
  plan: SelfHealPlan;
  selfHealPlanPath: string;
  runIndex: number;
}): Promise<MergeCandidate[]> {
  const out: MergeCandidate[] = [];
  for (const item of input.plan.items) {
    const artifactSummary = await readArtifactSummary(item.artifactPath);
    for (const windowId of item.windowIds.length === 0
      ? [`${item.shardId}:unknown`]
      : item.windowIds) {
      out.push({
        runId: input.plan.sourceRunId,
        runIndex: input.runIndex,
        selfHealPlanPath: input.selfHealPlanPath,
        shardId: item.shardId,
        windowId,
        sourceIds: item.sourceIds,
        sourceId: artifactSummary.sourceId ?? item.sourceIds[0] ?? null,
        pageNumbers: artifactSummary.pageNumbers,
        primaryLane: item.primaryLane,
        decision: item.decision,
        clean: cleanCandidate(item),
        reasons: item.reasons,
        manifestPath: item.manifestPath,
        artifactPath: item.artifactPath,
        auditPath: item.auditPath,
        lastAttemptStatus: item.lastAttemptStatus,
        lastHttpStatus: item.lastHttpStatus,
        submitState: item.submitState,
        auditBlockerCount: item.auditBlockerCount,
        validationIssueCount: item.validationIssueCount,
        rejectedCount: item.rejectedCount,
        acceptedCount: item.acceptedCount,
        draftCount: item.draftCount,
        issueCodes: item.issueCodes,
        acceptedSurfaceKindCounts: artifactSummary.surfaceKindCounts,
      });
    }
  }
  return out;
}

function selectWinner(candidates: MergeCandidate[]): MergeCandidate | null {
  const clean = candidates.filter((candidate) => candidate.clean);
  if (clean.length === 0) return null;
  return (
    clean.sort(
      (left, right) => right.runIndex - left.runIndex || left.shardId.localeCompare(right.shardId),
    )[0] ?? null
  );
}

function unresolvedReasons(candidates: MergeCandidate[]): string[] {
  const reasons = new Set<string>();
  for (const candidate of candidates) {
    reasons.add(candidate.primaryLane);
    for (const reason of candidate.reasons) reasons.add(reason);
    for (const code of candidate.issueCodes) reasons.add(code);
  }
  return [...reasons].sort();
}

function renderMarkdown(artifact: Tier2AgenticCanonicalMergeArtifact): string {
  const lines: string[] = [];
  lines.push("# Tier 2 Agentic Canonical Merge");
  lines.push("");
  lines.push(`Generated: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Source runs: ${artifact.summary.sourceRunCount}`);
  lines.push(`- Unique windows: ${artifact.summary.uniqueWindowCount}`);
  lines.push(`- Canonical windows: ${artifact.summary.canonicalWindowCount}`);
  lines.push(`- Unresolved windows: ${artifact.summary.unresolvedWindowCount}`);
  lines.push(`- Canonical accepted surfaces: ${artifact.summary.canonicalAcceptedSurfaceCount}`);
  lines.push(`- Superseded candidate records: ${artifact.summary.supersededCandidateCount}`);
  lines.push("");
  lines.push("## Canonical Runs");
  lines.push("");
  lines.push("| Run | Windows |");
  lines.push("|---|---:|");
  for (const [runId, count] of Object.entries(artifact.summary.canonicalRunCounts)) {
    lines.push(`| ${runId} | ${count} |`);
  }
  lines.push("");
  lines.push("## Surface Kinds");
  lines.push("");
  lines.push("| Surface kind | Count |");
  lines.push("|---|---:|");
  for (const [kind, count] of Object.entries(artifact.summary.canonicalSurfaceKindCounts)) {
    lines.push(`| ${kind} | ${count} |`);
  }
  lines.push("");
  if (artifact.unresolvedWindows.length > 0) {
    lines.push("## Unresolved Windows");
    lines.push("");
    lines.push("| Window | Reasons |");
    lines.push("|---|---|");
    for (const window of artifact.unresolvedWindows.slice(0, 40)) {
      lines.push(`| ${window.windowId} | ${window.reasons.join(", ")} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function buildTier2AgenticCanonicalMerge(
  args: BuildTier2AgenticCanonicalMergeArgs,
): Promise<Tier2AgenticCanonicalMergeArtifact> {
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const planPaths = args.selfHealPlanPaths.map((path) => fromCliPath(path));
  const sourceRuns: Tier2AgenticCanonicalMergeArtifact["sourceRuns"] = [];
  const candidates: MergeCandidate[] = [];

  for (const [runIndex, planPath] of planPaths.entries()) {
    const plan = parseSelfHealPlan(await Bun.file(planPath).json(), planPath);
    sourceRuns.push({
      runId: plan.sourceRunId,
      runIndex,
      selfHealPlanPath: planPath,
      sourceQueuePath: plan.sourceQueuePath,
      sourceOutputRoot: plan.sourceOutputRoot,
      shardCount: plan.summary.shardCount,
      cleanCount: plan.summary.cleanCount,
      acceptedSurfaceCount: plan.summary.acceptedSurfaceCount,
      retryEligibleCount: plan.summary.retryEligibleCount,
      quarantineCount: plan.summary.quarantineCount,
    });
    candidates.push(...(await candidatesFromPlan({ plan, selfHealPlanPath: planPath, runIndex })));
  }

  const byWindow = new Map<string, MergeCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byWindow.get(candidate.windowId) ?? [];
    bucket.push(candidate);
    byWindow.set(candidate.windowId, bucket);
  }

  const canonicalWindows: CanonicalWindow[] = [];
  const unresolvedWindows: UnresolvedWindow[] = [];
  for (const [windowId, bucket] of [...byWindow.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const winner = selectWinner(bucket);
    if (winner === null) {
      unresolvedWindows.push({ windowId, candidates: bucket, reasons: unresolvedReasons(bucket) });
      continue;
    }
    canonicalWindows.push({
      windowId,
      selected: winner,
      supersededCandidates: bucket.filter((candidate) => candidate !== winner),
    });
  }

  const canonicalRunCounts: Record<string, number> = {};
  const canonicalSurfaceKindCounts: Record<string, number> = {};
  const unresolvedLaneCounts: Record<string, number> = {};
  for (const window of canonicalWindows) {
    increment(canonicalRunCounts, window.selected.runId);
    for (const [kind, count] of Object.entries(window.selected.acceptedSurfaceKindCounts)) {
      increment(canonicalSurfaceKindCounts, kind, count);
    }
  }
  for (const window of unresolvedWindows) {
    for (const candidate of window.candidates)
      increment(unresolvedLaneCounts, candidate.primaryLane);
  }

  const canonicalArtifacts = canonicalWindows.flatMap((window) => {
    if (window.selected.artifactPath === null) return [];
    return [
      {
        windowId: window.windowId,
        runId: window.selected.runId,
        shardId: window.selected.shardId,
        sourceId: window.selected.sourceId,
        pageNumbers: window.selected.pageNumbers,
        artifactPath: window.selected.artifactPath,
        auditPath: window.selected.auditPath,
        acceptedCount: window.selected.acceptedCount,
        draftCount: window.selected.draftCount,
        acceptedSurfaceKindCounts: window.selected.acceptedSurfaceKindCounts,
      },
    ];
  });

  const artifact: Tier2AgenticCanonicalMergeArtifact = {
    artifactKind: ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceSelfHealPlanPaths: planPaths,
    policy: {
      cleanCandidateRule:
        "A candidate is eligible only when its self-heal lane is clean, artifactPath is present, audit blockers are zero, rejected drafts are zero, and validation issues are zero.",
      precedenceRule:
        "Among eligible candidates for the same windowId, the later input self-heal plan wins. Later failed retries never displace an earlier clean artifact.",
      unresolvedRule:
        "Windows with no eligible clean candidate remain unresolved; dirty partial outputs are not promoted into the canonical set.",
    },
    sourceRuns,
    summary: {
      sourceRunCount: sourceRuns.length,
      candidateRecordCount: candidates.length,
      uniqueWindowCount: byWindow.size,
      canonicalWindowCount: canonicalWindows.length,
      unresolvedWindowCount: unresolvedWindows.length,
      supersededCandidateCount: canonicalWindows.reduce(
        (sum, window) => sum + window.supersededCandidates.length,
        0,
      ),
      canonicalAcceptedSurfaceCount: canonicalWindows.reduce(
        (sum, window) => sum + window.selected.acceptedCount,
        0,
      ),
      canonicalDraftCount: canonicalWindows.reduce(
        (sum, window) => sum + window.selected.draftCount,
        0,
      ),
      canonicalRunCounts,
      canonicalSurfaceKindCounts,
      unresolvedLaneCounts,
    },
    canonicalArtifacts,
    canonicalWindows,
    unresolvedWindows,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, artifact);
  }
  if (args.markdownPath !== undefined) {
    await mkdir(dirname(args.markdownPath), { recursive: true });
    await Bun.write(args.markdownPath, renderMarkdown(artifact));
  }
  return artifact;
}

function parseArgs(argv: string[]): CliArgs {
  const options: CliOption<CliArgs>[] = [
    {
      flags: ["--self-heal-plans"],
      apply: (output, value) => {
        if (value !== undefined)
          output.selfHealPlanPaths = value
            .split(",")
            .map((path) => fromCliPath(path.trim()))
            .filter((path) => path.length > 0);
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
      flags: ["--generated-at"],
      apply: (output, value) => {
        if (value !== undefined) output.generatedAt = value;
      },
    },
  ];
  return parseCliOptions(argv, {}, options);
}

export async function runTier2AgenticCanonicalMergeFromCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.selfHealPlanPaths === undefined || args.selfHealPlanPaths.length === 0) {
    throw new Error("Provide --self-heal-plans with comma-separated self-heal plan JSON paths.");
  }
  const artifact = await buildTier2AgenticCanonicalMerge({
    selfHealPlanPaths: args.selfHealPlanPaths,
    ...(args.outputPath === undefined ? {} : { outputPath: args.outputPath }),
    ...(args.markdownPath === undefined ? {} : { markdownPath: args.markdownPath }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  });
  console.log(
    `tier2-agentic-canonical-merge: canonical=${artifact.summary.canonicalWindowCount} unresolved=${artifact.summary.unresolvedWindowCount} surfaces=${artifact.summary.canonicalAcceptedSurfaceCount}`,
  );
  return {
    artifactKind: artifact.artifactKind,
    schemaVersion: artifact.schemaVersion,
    generatedAt: artifact.generatedAt,
    outputPath: args.outputPath ?? null,
    markdownPath: args.markdownPath ?? null,
    summary: artifact.summary,
  };
}
