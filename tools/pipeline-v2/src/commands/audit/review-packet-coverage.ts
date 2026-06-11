import { isAbsolute, join, relative } from "node:path";
import {
  evaluateReviewPacketCoverageGate,
  type ReviewPacketCoverageGateArtifact,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

export type {
  ReviewPacketCoverageGate,
  ReviewPacketCoverageGateArtifact,
} from "@bp/applied-research/evaluation";
export { evaluateReviewPacketCoverageGate };

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
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
      artifact: await readJsonIfExists<ReviewPacketCoverageGateArtifact>(artifactPath),
    });
  },
});
