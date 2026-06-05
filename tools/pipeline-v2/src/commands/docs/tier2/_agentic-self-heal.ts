import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { writeJson } from "../../../lib/json.ts";
import type { AgenticExtractionProvider } from "./_agentic-extraction.ts";

export const TIER2_AGENTIC_SELF_HEAL_PLAN_ARTIFACT_KIND =
  "bp.tier2_agentic_self_heal_plan.v1";

export type Tier2AgenticSelfHealLane =
  | "clean"
  | "pending_or_in_progress"
  | "worker_retry"
  | "provider_transient_retry"
  | "tool_response_retry"
  | "validator_feedback_retry"
  | "source_tool_enrichment"
  | "quarantine";

export type Tier2AgenticSelfHealDecision =
  | "no_action"
  | "wait_for_running_worker"
  | "retry"
  | "retry_with_validator_feedback"
  | "rerun_with_source_tools"
  | "quarantine";

export type Tier2AgenticSelfHealPlanItem = {
  readonly shardId: string;
  readonly windowIds: string[];
  readonly sourceIds: string[];
  readonly outputDir: string;
  readonly primaryLane: Tier2AgenticSelfHealLane;
  readonly decision: Tier2AgenticSelfHealDecision;
  readonly reasons: string[];
  readonly manifestPath: string;
  readonly artifactPath: string | null;
  readonly auditPath: string | null;
  readonly workerErrorPath: string | null;
  readonly claimPath: string | null;
  readonly lastAttemptStatus: string | null;
  readonly lastHttpStatus: number | null;
  readonly submitState: string | null;
  readonly auditBlockerCount: number;
  readonly validationIssueCount: number;
  readonly rejectedCount: number;
  readonly acceptedCount: number;
  readonly draftCount: number;
  readonly issueCodes: string[];
};

export type Tier2AgenticSelfHealPlan = {
  readonly artifactKind: typeof TIER2_AGENTIC_SELF_HEAL_PLAN_ARTIFACT_KIND;
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly sourceQueuePath: string;
  readonly sourceRunId: string;
  readonly sourceOutputRoot: string | null;
  readonly nextRun: {
    readonly runId: string;
    readonly outputRoot: string | null;
    readonly workerCountPlanned: number;
    readonly recommendedWorkerCount: number;
    readonly provider: AgenticExtractionProvider | string | null;
    readonly model: string | null;
    readonly maxTokens: number | null;
    readonly temperature: number | null;
    readonly timeoutMs: number | null;
    readonly maxAttempts: number | null;
    readonly maxRepairRounds: number | null;
  };
  readonly summary: {
    readonly shardCount: number;
    readonly completedShardCount: number;
    readonly pendingOrInProgressCount: number;
    readonly cleanCount: number;
    readonly retryEligibleCount: number;
    readonly sourceToolEnrichmentCount: number;
    readonly quarantineCount: number;
    readonly workerErrorCount: number;
    readonly providerFailureCount: number;
    readonly toolResponseFailureCount: number;
    readonly validatorFailureCount: number;
    readonly auditBlockerCount: number;
    readonly acceptedSurfaceCount: number;
    readonly rejectedDraftCount: number;
    readonly validationIssueCount: number;
    readonly laneCounts: Record<Tier2AgenticSelfHealLane, number>;
    readonly issueCodeCounts: Record<string, number>;
    readonly httpStatusCounts: Record<string, number>;
  };
  readonly policy: {
    readonly providerTransientRetry: string;
    readonly toolResponseRetry: string;
    readonly validatorFeedbackRetry: string;
    readonly sourceToolEnrichment: string;
    readonly quarantine: string;
  };
  readonly retryWindowIdsByLane: Record<Tier2AgenticSelfHealLane, string[]>;
  readonly items: Tier2AgenticSelfHealPlanItem[];
};

export type BuildTier2AgenticSelfHealPlanArgs = {
  readonly queuePath: string;
  readonly outputPath?: string;
  readonly generatedAt?: string;
  readonly nextRunId?: string;
  readonly nextOutputRoot?: string;
  readonly workerCountPlanned?: number;
  readonly provider?: AgenticExtractionProvider;
  readonly model?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  readonly maxRepairRounds?: number;
};

type QueueShard = {
  readonly shardId: string;
  readonly outputDir: string;
  readonly windowIds: string[];
  readonly sourceIds: string[];
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown): string[] {
  return arrayValue(value).flatMap((item) =>
    typeof item === "string" && item.length > 0 ? [item] : [],
  );
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function readJsonIfExists(path: string): Promise<unknown | null> {
  if (!(await fileExists(path))) return null;
  return Bun.file(path).json();
}

function parseShard(value: unknown, index: number): QueueShard {
  const object = objectValue(value);
  if (object === null) {
    throw new Error(`Queue shard ${index} is not an object.`);
  }
  const shardId = stringValue(object["shardId"]) ?? `shard-${String(index + 1).padStart(4, "0")}`;
  const outputDir = stringValue(object["outputDir"]);
  if (outputDir === null) {
    throw new Error(`Queue shard ${shardId} is missing outputDir.`);
  }
  return {
    shardId,
    outputDir,
    windowIds: stringArray(object["windowIds"]),
    sourceIds: stringArray(object["sourceIds"]),
  };
}

function primaryLaneFor(input: {
  readonly manifestExists: boolean;
  readonly workerErrorExists: boolean;
  readonly providerFailed: boolean;
  readonly toolResponseFailed: boolean;
  readonly sourceToolRequired: boolean;
  readonly validatorFailed: boolean;
  readonly clean: boolean;
  readonly auditBlockerCount: number;
}): Tier2AgenticSelfHealLane {
  if (!input.manifestExists) {
    return input.workerErrorExists ? "worker_retry" : "pending_or_in_progress";
  }
  if (input.workerErrorExists) return "worker_retry";
  if (input.providerFailed) return "provider_transient_retry";
  if (input.toolResponseFailed) return "tool_response_retry";
  if (input.sourceToolRequired) return "source_tool_enrichment";
  if (input.validatorFailed) return "validator_feedback_retry";
  if (input.clean) return "clean";
  return input.auditBlockerCount > 0 ? "quarantine" : "clean";
}

function decisionFor(lane: Tier2AgenticSelfHealLane): Tier2AgenticSelfHealDecision {
  if (lane === "clean") return "no_action";
  if (lane === "pending_or_in_progress") return "wait_for_running_worker";
  if (lane === "validator_feedback_retry") return "retry_with_validator_feedback";
  if (lane === "source_tool_enrichment") return "rerun_with_source_tools";
  if (lane === "quarantine") return "quarantine";
  return "retry";
}

function addLaneCount(
  counts: Record<Tier2AgenticSelfHealLane, number>,
  lane: Tier2AgenticSelfHealLane,
): void {
  counts[lane] += 1;
}

function retryEligible(lane: Tier2AgenticSelfHealLane): boolean {
  return (
    lane === "worker_retry" ||
    lane === "provider_transient_retry" ||
    lane === "tool_response_retry" ||
    lane === "validator_feedback_retry"
  );
}

function recommendedWorkerCount(input: {
  readonly planned: number;
  readonly completed: number;
  readonly providerFailures: number;
}): number {
  if (input.completed === 0) return input.planned;
  const providerFailureRate = input.providerFailures / input.completed;
  if (providerFailureRate >= 0.4) return Math.max(4, Math.floor(input.planned / 2));
  if (providerFailureRate >= 0.2) return Math.max(8, Math.floor(input.planned * 0.75));
  return input.planned;
}

export async function buildTier2AgenticSelfHealPlan(
  args: BuildTier2AgenticSelfHealPlanArgs,
): Promise<Tier2AgenticSelfHealPlan> {
  const queue = objectValue(await Bun.file(args.queuePath).json());
  if (queue === null) throw new Error("Agentic self-heal queue input must be an object.");
  const shards = arrayValue(queue["shards"]).map(parseShard);
  if (shards.length === 0) throw new Error("Agentic self-heal queue input has no shards.");

  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const sourceRunId = stringValue(queue["runId"]) ?? "unknown-agentic-run";
  const sourceOutputRoot = stringValue(queue["outputRoot"]);
  const issueCodeCounts: Record<string, number> = {};
  const httpStatusCounts: Record<string, number> = {};
  const laneCounts: Record<Tier2AgenticSelfHealLane, number> = {
    clean: 0,
    pending_or_in_progress: 0,
    worker_retry: 0,
    provider_transient_retry: 0,
    tool_response_retry: 0,
    validator_feedback_retry: 0,
    source_tool_enrichment: 0,
    quarantine: 0,
  };
  const retryWindowIdsByLane: Record<Tier2AgenticSelfHealLane, string[]> = {
    clean: [],
    pending_or_in_progress: [],
    worker_retry: [],
    provider_transient_retry: [],
    tool_response_retry: [],
    validator_feedback_retry: [],
    source_tool_enrichment: [],
    quarantine: [],
  };
  const items: Tier2AgenticSelfHealPlanItem[] = [];

  let completedShardCount = 0;
  let workerErrorCount = 0;
  let providerFailureCount = 0;
  let toolResponseFailureCount = 0;
  let validatorFailureCount = 0;
  let auditBlockerCount = 0;
  let acceptedSurfaceCount = 0;
  let rejectedDraftCount = 0;
  let validationIssueCount = 0;

  for (const shard of shards) {
    const manifestPath = join(shard.outputDir, "manifest.json");
    const claimPath = join(shard.outputDir, ".claim", "claim.json");
    const workerErrorPath = join(shard.outputDir, "worker-error.json");
    const manifest = objectValue(await readJsonIfExists(manifestPath));
    const workerErrorExists = await fileExists(workerErrorPath);
    const claimExists = await fileExists(claimPath);
    if (workerErrorExists) workerErrorCount += 1;

    let artifactPath: string | null = null;
    let auditPath: string | null = null;
    let artifact: Record<string, unknown> | null = null;
    let audit: Record<string, unknown> | null = null;
    if (manifest !== null) {
      completedShardCount += 1;
      const window = objectValue(arrayValue(manifest["windows"])[0]);
      artifactPath = window === null ? null : stringValue(window["artifactPath"]);
      auditPath = window === null ? null : stringValue(window["auditPath"]);
      artifact = artifactPath === null ? null : objectValue(await readJsonIfExists(artifactPath));
      audit = auditPath === null ? null : objectValue(await readJsonIfExists(auditPath));
    }

    const attempts = artifact === null ? [] : arrayValue(artifact["llmAttempts"]);
    const lastAttempt = objectValue(attempts.at(-1));
    const lastAttemptStatus = lastAttempt === null ? null : stringValue(lastAttempt["status"]);
    const lastHttpStatus = lastAttempt === null ? null : numberValue(lastAttempt["httpStatus"]);
    if (lastHttpStatus !== null) increment(httpStatusCounts, String(lastHttpStatus));

    const submitResult = artifact === null ? null : objectValue(artifact["submitResult"]);
    const submitState = submitResult === null ? null : stringValue(submitResult["state"]);
    const summary = artifact === null ? null : objectValue(artifact["summary"]);
    const draftCount = summary === null ? 0 : (numberValue(summary["draftCount"]) ?? 0);
    const acceptedCount = summary === null ? 0 : (numberValue(summary["acceptedCount"]) ?? 0);
    const rejectedCount = summary === null ? 0 : (numberValue(summary["rejectedCount"]) ?? 0);
    const artifactValidationIssues =
      summary === null ? 0 : (numberValue(summary["validationIssueCount"]) ?? 0);
    acceptedSurfaceCount += acceptedCount;
    rejectedDraftCount += rejectedCount;
    validationIssueCount += artifactValidationIssues;

    const auditIssues = audit === null ? [] : arrayValue(audit["issues"]);
    const issueCodes = auditIssues.flatMap((issue) => {
      const code = stringValue(objectValue(issue)?.["code"]);
      return code === null ? [] : [code];
    });
    for (const code of issueCodes) increment(issueCodeCounts, code);

    const auditBlockers =
      audit === null ? 0 : (numberValue(audit["blockerCount"]) ?? 0);
    auditBlockerCount += auditBlockers;

    const providerFailed =
      lastAttemptStatus === "provider_failed" || issueCodes.includes("llm_provider_failed");
    const toolResponseFailed =
      lastAttemptStatus === "tool_response_parse_failed" ||
      issueCodes.includes("llm_no_parseable_tool_response");
    const sourceToolRequired = issueCodes.includes("missing_data_requires_search_transcript");
    const validatorFailed =
      rejectedCount > 0 ||
      artifactValidationIssues > 0 ||
      issueCodes.includes("artifact_has_validation_failures") ||
      issueCodes.includes("route_selection_field_path_not_canonical") ||
      issueCodes.includes("evidence_field_path_not_found");
    if (providerFailed) providerFailureCount += 1;
    if (toolResponseFailed) toolResponseFailureCount += 1;
    if (validatorFailed) validatorFailureCount += 1;

    const manifestExists = manifest !== null;
    const clean =
      manifestExists &&
      !workerErrorExists &&
      auditBlockers === 0 &&
      rejectedCount === 0 &&
      artifactValidationIssues === 0 &&
      lastAttemptStatus !== "provider_failed" &&
      lastAttemptStatus !== "tool_response_parse_failed";
    const primaryLane = primaryLaneFor({
      manifestExists,
      workerErrorExists,
      providerFailed,
      toolResponseFailed,
      sourceToolRequired,
      validatorFailed,
      clean,
      auditBlockerCount: auditBlockers,
    });
    addLaneCount(laneCounts, primaryLane);
    retryWindowIdsByLane[primaryLane].push(...shard.windowIds);

    const reasons = [
      ...(manifestExists ? [] : ["manifest_missing"]),
      ...(claimExists && !manifestExists ? ["claimed_without_manifest"] : []),
      ...(workerErrorExists ? ["worker_error"] : []),
      ...(providerFailed ? ["provider_failed"] : []),
      ...(toolResponseFailed ? ["tool_response_parse_failed"] : []),
      ...(sourceToolRequired ? ["source_shell_required"] : []),
      ...(validatorFailed ? ["validator_failed"] : []),
      ...(auditBlockers > 0 ? ["audit_blocked"] : []),
    ];

    items.push({
      shardId: shard.shardId,
      windowIds: shard.windowIds,
      sourceIds: shard.sourceIds,
      outputDir: shard.outputDir,
      primaryLane,
      decision: decisionFor(primaryLane),
      reasons,
      manifestPath,
      artifactPath,
      auditPath,
      workerErrorPath: workerErrorExists ? workerErrorPath : null,
      claimPath: claimExists ? claimPath : null,
      lastAttemptStatus,
      lastHttpStatus,
      submitState,
      auditBlockerCount: auditBlockers,
      validationIssueCount: artifactValidationIssues,
      rejectedCount,
      acceptedCount,
      draftCount,
      issueCodes,
    });
  }

  const plannedWorkerCount =
    args.workerCountPlanned ?? numberValue(queue["workerCountPlanned"]) ?? 8;
  const plan: Tier2AgenticSelfHealPlan = {
    artifactKind: TIER2_AGENTIC_SELF_HEAL_PLAN_ARTIFACT_KIND,
    schemaVersion: 1,
    generatedAt,
    sourceQueuePath: args.queuePath,
    sourceRunId,
    sourceOutputRoot,
    nextRun: {
      runId: args.nextRunId ?? `${sourceRunId}:self-heal`,
      outputRoot: args.nextOutputRoot ?? null,
      workerCountPlanned: plannedWorkerCount,
      recommendedWorkerCount: recommendedWorkerCount({
        planned: plannedWorkerCount,
        completed: completedShardCount,
        providerFailures: providerFailureCount,
      }),
      provider: args.provider ?? stringValue(queue["provider"]),
      model: args.model ?? stringValue(queue["model"]),
      maxTokens: args.maxTokens ?? numberValue(queue["maxTokens"]),
      temperature: args.temperature ?? numberValue(queue["temperature"]),
      timeoutMs: args.timeoutMs ?? numberValue(queue["timeoutMs"]),
      maxAttempts: args.maxAttempts ?? numberValue(queue["maxAttempts"]),
      maxRepairRounds: args.maxRepairRounds ?? numberValue(queue["maxRepairRounds"]),
    },
    summary: {
      shardCount: shards.length,
      completedShardCount,
      pendingOrInProgressCount: laneCounts.pending_or_in_progress,
      cleanCount: laneCounts.clean,
      retryEligibleCount: items.filter((item) => retryEligible(item.primaryLane)).length,
      sourceToolEnrichmentCount: laneCounts.source_tool_enrichment,
      quarantineCount: laneCounts.quarantine,
      workerErrorCount,
      providerFailureCount,
      toolResponseFailureCount,
      validatorFailureCount,
      auditBlockerCount,
      acceptedSurfaceCount,
      rejectedDraftCount,
      validationIssueCount,
      laneCounts,
      issueCodeCounts,
      httpStatusCounts,
    },
    policy: {
      providerTransientRetry:
        "Retry only failed windows with bounded attempts, provider request ids preserved, and concurrency reduced when the completed-window provider-failure rate is high.",
      toolResponseRetry:
        "Retry the window with stricter forced-tool feedback; do not accept raw prose or inferred fields without a parseable tool call.",
      validatorFeedbackRetry:
        "Retry with prior validation/audit feedback as context, then accept only rows that pass deterministic field, evidence, and canonical-selection validation.",
      sourceToolEnrichment:
        "Rerun with source-shell/PDF search evidence tools before allowing missing-data or absence claims.",
      quarantine:
        "Do not automatically rerun hard or unexplained blocker classes; preserve source/artifact/audit paths for human or schema review.",
    },
    retryWindowIdsByLane,
    items,
  };

  if (args.outputPath !== undefined) {
    await mkdir(dirname(args.outputPath), { recursive: true });
    await writeJson(args.outputPath, plan);
  }
  return plan;
}
