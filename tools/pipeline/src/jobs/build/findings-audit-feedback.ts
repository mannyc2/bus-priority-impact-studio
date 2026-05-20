import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type FindingDetectorAuditAction,
  type FindingDetectorAuditResult,
  FindingDetectorAuditResultsArtifactSchema,
  type FindingDetectorAuditSummaryArtifact,
  FindingDetectorAuditSummaryArtifactSchema,
} from "@bp/domain";
import { type CliOption, monthOption, parseCliOptions, yearOption } from "../../lib/cli-args.js";
import { writeJson } from "../../lib/json.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext } from "../../lib/route-job.js";

type FindingsAuditFeedbackArgs = {
  year?: number;
  month?: number;
  input?: string;
  output?: string;
  artifactRoot?: string;
};

export type FindingsAuditFeedbackResult = {
  isoMonth: string;
  reviewedCandidateCount: number;
  outputPath: string;
};

const ACTIONS: readonly FindingDetectorAuditAction[] = [
  "keep",
  "downgrade",
  "suppress",
  "split",
  "enrich",
];

const CONFIDENCES = ["insufficient", "low", "medium", "high"] as const;

function parseCliArgs(args: string[]): FindingsAuditFeedbackArgs {
  const options: CliOption<FindingsAuditFeedbackArgs>[] = [
    yearOption(),
    monthOption(),
    {
      flags: ["--input"],
      apply: (output, value) => {
        if (value !== undefined) output.input = fromCliPath(value);
      },
    },
    {
      flags: ["--output"],
      apply: (output, value) => {
        if (value !== undefined) output.output = fromCliPath(value);
      },
    },
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
  ];

  return parseCliOptions(args, {} as FindingsAuditFeedbackArgs, options);
}

export function findingsAuditFeedbackArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "detector-audit-feedback.json");
}

function emptyActionCounts(): Record<FindingDetectorAuditAction, number> {
  return Object.fromEntries(ACTIONS.map((action) => [action, 0])) as Record<
    FindingDetectorAuditAction,
    number
  >;
}

function emptyConfidenceCounts(): Record<string, number> {
  return Object.fromEntries(CONFIDENCES.map((confidence) => [confidence, 0]));
}

function increment<T extends string>(counts: Record<T, number>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function normalizeTheme(value: string): string {
  return value
    .toLowerCase()
    .replace(/[`"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function actionRecommendation(input: {
  detectorId: string;
  actionCounts: Record<FindingDetectorAuditAction, number>;
  results: readonly FindingDetectorAuditResult[];
}): string {
  const { detectorId, actionCounts, results } = input;
  const issueSnippets = results
    .flatMap((result) => [
      ...result.missingEvidence,
      ...result.derivedMetricIssues,
      result.detectorImprovement ?? "",
    ])
    .map(normalizeTheme)
    .filter((value) => value.length > 0)
    .slice(0, 3);

  if (actionCounts.suppress > 0 || actionCounts.downgrade > 0) {
    return `${detectorId} needs tighter emit criteria or clearer required inputs before candidates are promoted from audit. Focus: ${issueSnippets.join("; ") || "review downgraded/suppressed examples"}.`;
  }

  if (actionCounts.split > 0) {
    return `${detectorId} should split mixed claims so each emitted candidate has one primary metric family and one review question. Focus: ${issueSnippets.join("; ") || "review split-scope examples"}.`;
  }

  if (actionCounts.enrich > 0) {
    return `${detectorId} is directionally useful but should enrich packets with raw evidence fields and source rows. Focus: ${issueSnippets.join("; ") || "review enrich examples"}.`;
  }

  return `${detectorId} review feedback was mostly keep; preserve current emit criteria while keeping evidence packets auditable.`;
}

export function buildFindingsAuditFeedbackSummary(input: {
  inputArtifactPath: string;
  generatedAt: string;
  results: readonly FindingDetectorAuditResult[];
  month: string;
}): FindingDetectorAuditSummaryArtifact {
  const actionCounts = emptyActionCounts();
  const detectorActionCounts: Record<string, Record<FindingDetectorAuditAction, number>> = {};
  const confidenceCounts = emptyConfidenceCounts();
  const themes = new Map<
    string,
    { count: number; detectorIds: Set<string>; exampleCandidateIds: Set<string> }
  >();
  const resultsByDetector = new Map<string, FindingDetectorAuditResult[]>();

  for (const result of input.results) {
    increment(actionCounts, result.action);
    confidenceCounts[result.confidence] = (confidenceCounts[result.confidence] ?? 0) + 1;

    const detectorCounts = detectorActionCounts[result.detectorId] ?? emptyActionCounts();
    detectorActionCounts[result.detectorId] = detectorCounts;
    increment(detectorCounts, result.action);

    const detectorResults = resultsByDetector.get(result.detectorId) ?? [];
    detectorResults.push(result);
    resultsByDetector.set(result.detectorId, detectorResults);

    for (const rawTheme of [
      ...result.missingEvidence,
      ...result.derivedMetricIssues,
      result.detectorImprovement ?? "",
    ]) {
      const theme = normalizeTheme(rawTheme);
      if (theme.length === 0) continue;
      const row = themes.get(theme) ?? {
        count: 0,
        detectorIds: new Set<string>(),
        exampleCandidateIds: new Set<string>(),
      };
      row.count += 1;
      row.detectorIds.add(result.detectorId);
      row.exampleCandidateIds.add(result.candidateId);
      themes.set(theme, row);
    }
  }

  const improvementThemes = [...themes.entries()]
    .map(([theme, row]) => ({
      theme,
      count: row.count,
      detectorIds: [...row.detectorIds].sort(),
      exampleCandidateIds: [...row.exampleCandidateIds].slice(0, 5),
    }))
    .sort((left, right) => right.count - left.count || left.theme.localeCompare(right.theme));

  const topDetectorRecommendations = [...resultsByDetector.entries()]
    .map(([detectorId, results]) => ({
      detectorId,
      actionCounts: detectorActionCounts[detectorId] ?? emptyActionCounts(),
      recommendation: actionRecommendation({
        detectorId,
        actionCounts: detectorActionCounts[detectorId] ?? emptyActionCounts(),
        results,
      }),
    }))
    .sort((left, right) => left.detectorId.localeCompare(right.detectorId));

  return FindingDetectorAuditSummaryArtifactSchema.parse({
    artifactKind: "finding_detector_audit_summary",
    schemaVersion: 1,
    month: input.month,
    generatedAt: input.generatedAt,
    inputArtifactPath: input.inputArtifactPath,
    reviewedCandidateCount: input.results.length,
    actionCounts,
    detectorActionCounts,
    confidenceCounts,
    improvementThemes,
    derivedMetricIssueCount: input.results.reduce(
      (sum, result) => sum + result.derivedMetricIssues.length,
      0,
    ),
    topDetectorRecommendations,
  });
}

export async function buildFindingsAuditFeedback(
  args: FindingsAuditFeedbackArgs = {},
): Promise<FindingsAuditFeedbackResult> {
  const context = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const inputPath =
    args.input ?? join(artifactRoot, "findings", context.isoMonth, "detector-audit-results.json");
  const outputPath =
    args.output ?? findingsAuditFeedbackArtifactPath(artifactRoot, context.isoMonth);
  const input = FindingDetectorAuditResultsArtifactSchema.parse(await Bun.file(inputPath).json());

  if (input.month !== context.isoMonth) {
    throw new Error(
      `Audit result month ${input.month} does not match requested ${context.isoMonth}.`,
    );
  }

  const summary = buildFindingsAuditFeedbackSummary({
    inputArtifactPath: inputPath,
    generatedAt: new Date().toISOString(),
    results: input.results,
    month: context.isoMonth,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, summary);

  return {
    isoMonth: context.isoMonth,
    reviewedCandidateCount: summary.reviewedCandidateCount,
    outputPath,
  };
}

export async function buildFindingsAuditFeedbackFromCli(
  args: string[],
): Promise<FindingsAuditFeedbackResult> {
  return buildFindingsAuditFeedback(parseCliArgs(args));
}
