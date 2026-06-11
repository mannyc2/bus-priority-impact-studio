import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { loadReviewPacketLocalDbRows } from "@bp/applied-research/local-db";
import {
  buildReviewPacketArtifacts,
  type ReviewPacketBuildArtifacts,
} from "@bp/applied-research/review-packets";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { readJsonIfExists, writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

type ExistingPacketRef = {
  packetId?: unknown;
  candidate?: {
    candidateId?: unknown;
  };
};

type ExistingReviewPacketsArtifact = {
  packets?: ExistingPacketRef[];
};

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function existingPacketIdsByCandidateId(
  artifact: ExistingReviewPacketsArtifact | null,
): Map<string, string> {
  const output = new Map<string, string>();
  for (const packet of artifact?.packets ?? []) {
    const candidateId = text(packet.candidate?.candidateId);
    const packetId = text(packet.packetId);
    if (candidateId !== null && packetId !== null) output.set(candidateId, packetId);
  }
  return output;
}

export default defineCommand({
  path: ["findings", "review-packets"],
  summary:
    "Build registry-backed review packets and packet coverage for every local finding candidate.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      detectorSpecsOutput: z.string().optional(),
      reviewPacketsOutput: z.string().optional(),
      promotionQueueOutput: z.string().optional(),
      reviewQueueOutput: z.string().optional(),
      coverageOutput: z.string().optional(),
      queueLimit: arg.positiveInt().default(200),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    detectorSpecsOutputPath: z.string(),
    reviewPacketsOutputPath: z.string(),
    promotionQueueOutputPath: z.string(),
    reviewQueueOutputPath: z.string(),
    coverageOutputPath: z.string(),
    candidateCount: z.number().int().nonnegative(),
    packetCount: z.number().int().nonnegative(),
    reviewQueueCandidateCount: z.number().int().nonnegative(),
    detectorWithCandidateCount: z.number().int().nonnegative(),
    detectorWithPacketCount: z.number().int().nonnegative(),
    missingPacketCandidateCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const findingsRoot = join(artifactRoot, "findings", releaseMonth);
    const detectorSpecsOutputPath =
      input.options.detectorSpecsOutput === undefined
        ? join(artifactRoot, "findings", "detector-specs.json")
        : fromCliPath(input.options.detectorSpecsOutput);
    const reviewPacketsOutputPath =
      input.options.reviewPacketsOutput === undefined
        ? join(findingsRoot, "review-packets.json")
        : fromCliPath(input.options.reviewPacketsOutput);
    const promotionQueueOutputPath =
      input.options.promotionQueueOutput === undefined
        ? join(findingsRoot, "promotion-queue.json")
        : fromCliPath(input.options.promotionQueueOutput);
    const reviewQueueOutputPath =
      input.options.reviewQueueOutput === undefined
        ? join(findingsRoot, "review-queue.json")
        : fromCliPath(input.options.reviewQueueOutput);
    const coverageOutputPath =
      input.options.coverageOutput === undefined
        ? join(findingsRoot, "review-packet-coverage.json")
        : fromCliPath(input.options.coverageOutput);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);
    const existingReviewPackets =
      await readJsonIfExists<ExistingReviewPacketsArtifact>(reviewPacketsOutputPath);
    const sqlite = new BunDatabase(dbPath, { readonly: true });
    let artifacts: ReviewPacketBuildArtifacts;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const generatedAt = new Date().toISOString();
      const rows = loadReviewPacketLocalDbRows({ sqlite, month: releaseMonth });
      artifacts = buildReviewPacketArtifacts({
        month: releaseMonth,
        generatedAt,
        detectorSpecsArtifactPath: repoDisplayPath(detectorSpecsOutputPath),
        reviewPacketsArtifactPath: repoDisplayPath(reviewPacketsOutputPath),
        promotionQueueArtifactPath: repoDisplayPath(promotionQueueOutputPath),
        coverageArtifactPath: repoDisplayPath(coverageOutputPath),
        reviewQueueArtifactPath: repoDisplayPath(reviewQueueOutputPath),
        queueLimit: input.options.queueLimit,
        candidates: rows.candidates,
        evidenceLinks: rows.evidenceLinks,
        coverageRows: rows.coverageRows,
        existingPacketIdsByCandidateId: existingPacketIdsByCandidateId(existingReviewPackets),
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(detectorSpecsOutputPath), { recursive: true });
    await mkdir(dirname(reviewPacketsOutputPath), { recursive: true });
    await mkdir(dirname(promotionQueueOutputPath), { recursive: true });
    await mkdir(dirname(reviewQueueOutputPath), { recursive: true });
    await mkdir(dirname(coverageOutputPath), { recursive: true });
    await writeJson(detectorSpecsOutputPath, artifacts.detectorSpecs);
    await writeJson(reviewPacketsOutputPath, artifacts.reviewPackets);
    await writeJson(promotionQueueOutputPath, artifacts.promotionQueue);
    await writeJson(reviewQueueOutputPath, artifacts.reviewQueue);
    await writeJson(coverageOutputPath, artifacts.coverage);

    return {
      releaseMonth,
      detectorSpecsOutputPath: repoDisplayPath(detectorSpecsOutputPath),
      reviewPacketsOutputPath: repoDisplayPath(reviewPacketsOutputPath),
      promotionQueueOutputPath: repoDisplayPath(promotionQueueOutputPath),
      reviewQueueOutputPath: repoDisplayPath(reviewQueueOutputPath),
      coverageOutputPath: repoDisplayPath(coverageOutputPath),
      candidateCount: artifacts.coverage.summary.candidateCount,
      packetCount: artifacts.reviewPackets.packetCount,
      reviewQueueCandidateCount: artifacts.reviewQueue.candidateCount,
      detectorWithCandidateCount: artifacts.coverage.summary.detectorWithCandidateCount,
      detectorWithPacketCount: artifacts.coverage.summary.detectorWithPacketCount,
      missingPacketCandidateCount: artifacts.coverage.summary.missingPacketCandidateCount,
    };
  },
});
