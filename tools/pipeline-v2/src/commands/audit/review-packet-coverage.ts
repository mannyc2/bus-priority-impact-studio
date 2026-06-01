import { isAbsolute, join, relative } from "node:path";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type ReviewPacketCoverageArtifact = {
  summary?: {
    candidateCount?: unknown;
    packetCount?: unknown;
    missingPacketCandidateCount?: unknown;
    packetCompleteDetectorCount?: unknown;
    packetPartialDetectorCount?: unknown;
    packetMissingDetectorCount?: unknown;
    noCandidateDetectorCount?: unknown;
  };
  detectors?: Array<{
    detectorId?: unknown;
    candidateCount?: unknown;
    packetCount?: unknown;
    missingPacketCount?: unknown;
    packetsWithoutPrimaryEvidence?: unknown;
    packetsWithoutCounterEvidence?: unknown;
    packetsWithoutCoverage?: unknown;
    status?: unknown;
  }>;
};

export type ReviewPacketCoverageGate = {
  releaseMonth: string;
  status: "pass" | "warn" | "fail";
  artifactPath: string;
  failOnPartial: boolean;
  summary: {
    candidateCount: number;
    packetCount: number;
    missingPacketCandidateCount: number;
    completeDetectorCount: number;
    partialDetectorCount: number;
    missingDetectorCount: number;
    noCandidateDetectorCount: number;
  };
  gaps: Array<{
    severity: "warn" | "fail";
    detectorId: string;
    status: string;
    candidateCount: number;
    packetCount: number;
    missingPacketCount: number;
    packetsWithoutPrimaryEvidence: number;
    packetsWithoutCounterEvidence: number;
    packetsWithoutCoverage: number;
  }>;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function evaluateReviewPacketCoverageGate(input: {
  releaseMonth: string;
  artifactPath: string;
  failOnPartial: boolean;
  artifact: ReviewPacketCoverageArtifact | null;
}): ReviewPacketCoverageGate {
  if (input.artifact === null) {
    return {
      releaseMonth: input.releaseMonth,
      status: "fail",
      artifactPath: input.artifactPath,
      failOnPartial: input.failOnPartial,
      summary: {
        candidateCount: 0,
        packetCount: 0,
        missingPacketCandidateCount: 0,
        completeDetectorCount: 0,
        partialDetectorCount: 0,
        missingDetectorCount: 0,
        noCandidateDetectorCount: 0,
      },
      gaps: [
        {
          severity: "fail",
          detectorId: "artifact",
          status: "missing",
          candidateCount: 0,
          packetCount: 0,
          missingPacketCount: 0,
          packetsWithoutPrimaryEvidence: 0,
          packetsWithoutCounterEvidence: 0,
          packetsWithoutCoverage: 0,
        },
      ],
    };
  }

  const gaps = (input.artifact.detectors ?? [])
    .map((detector) => {
      const status = text(detector.status) ?? "unknown";
      const candidateCount = numberValue(detector.candidateCount);
      const packetCount = numberValue(detector.packetCount);
      const missingPacketCount = numberValue(detector.missingPacketCount);
      const packetsWithoutPrimaryEvidence = numberValue(detector.packetsWithoutPrimaryEvidence);
      const packetsWithoutCounterEvidence = numberValue(detector.packetsWithoutCounterEvidence);
      const packetsWithoutCoverage = numberValue(detector.packetsWithoutCoverage);
      const severity =
        status === "missing" ||
        missingPacketCount > 0 ||
        packetsWithoutPrimaryEvidence > 0 ||
        packetsWithoutCoverage > 0 ||
        (input.failOnPartial && status === "partial")
          ? "fail"
          : status === "partial" || packetsWithoutCounterEvidence > 0
            ? "warn"
            : null;
      if (severity === null) return null;
      return {
        severity,
        detectorId: text(detector.detectorId) ?? "unknown",
        status,
        candidateCount,
        packetCount,
        missingPacketCount,
        packetsWithoutPrimaryEvidence,
        packetsWithoutCounterEvidence,
        packetsWithoutCoverage,
      };
    })
    .filter((gap): gap is ReviewPacketCoverageGate["gaps"][number] => gap !== null);
  const hasFail = gaps.some((gap) => gap.severity === "fail");
  const status = hasFail ? "fail" : gaps.length > 0 ? "warn" : "pass";
  const summary = input.artifact.summary ?? {};
  return {
    releaseMonth: input.releaseMonth,
    status,
    artifactPath: input.artifactPath,
    failOnPartial: input.failOnPartial,
    summary: {
      candidateCount: numberValue(summary.candidateCount),
      packetCount: numberValue(summary.packetCount),
      missingPacketCandidateCount: numberValue(summary.missingPacketCandidateCount),
      completeDetectorCount: numberValue(summary.packetCompleteDetectorCount),
      partialDetectorCount: numberValue(summary.packetPartialDetectorCount),
      missingDetectorCount: numberValue(summary.packetMissingDetectorCount),
      noCandidateDetectorCount: numberValue(summary.noCandidateDetectorCount),
    },
    gaps,
  };
}

export default defineCommand({
  path: ["audit", "review-packet-coverage"],
  summary: "Gate release readiness on finding review-packet coverage.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      input: z.string().optional(),
      failOnPartial: z.coerce.boolean().default(false),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    status: z.enum(["pass", "warn", "fail"]),
    artifactPath: z.string(),
    failOnPartial: z.boolean(),
    summary: z.object({
      candidateCount: z.number().int().nonnegative(),
      packetCount: z.number().int().nonnegative(),
      missingPacketCandidateCount: z.number().int().nonnegative(),
      completeDetectorCount: z.number().int().nonnegative(),
      partialDetectorCount: z.number().int().nonnegative(),
      missingDetectorCount: z.number().int().nonnegative(),
      noCandidateDetectorCount: z.number().int().nonnegative(),
    }),
    gaps: z.array(
      z.object({
        severity: z.enum(["warn", "fail"]),
        detectorId: z.string(),
        status: z.string(),
        candidateCount: z.number().int().nonnegative(),
        packetCount: z.number().int().nonnegative(),
        missingPacketCount: z.number().int().nonnegative(),
        packetsWithoutPrimaryEvidence: z.number().int().nonnegative(),
        packetsWithoutCounterEvidence: z.number().int().nonnegative(),
        packetsWithoutCoverage: z.number().int().nonnegative(),
      }),
    ),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const artifactPath =
      input.options.input === undefined
        ? join(artifactRoot, "findings", releaseMonth, "review-packet-coverage.json")
        : fromCliPath(input.options.input);
    return evaluateReviewPacketCoverageGate({
      releaseMonth,
      artifactPath: repoDisplayPath(artifactPath),
      failOnPartial: input.options.failOnPartial,
      artifact: await readJsonIfExists<ReviewPacketCoverageArtifact>(artifactPath),
    });
  },
});
