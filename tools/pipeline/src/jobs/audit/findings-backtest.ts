import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FindingReviewPacketsArtifactSchema } from "@bp/domain";
import * as z from "zod";
import { writeJson } from "../../lib/json.js";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.js";
import { createMonthContext, parseMonthDbCliArgs } from "../../lib/route-job.js";

type Args = {
  year?: number;
  month?: number;
  dbPath?: string;
  artifactRoot?: string;
  goldSetPath?: string;
};

export type FindingsBacktestResult = {
  isoMonth: string;
  status: "pass" | "fail";
  expectationCount: number;
  matchedExpectationCount: number;
  missingExpectationCount: number;
  artifactPath: string;
};

const GoldExpectationSchema = z
  .object({
    expectationId: z.string().min(1),
    routeId: z.string().min(1).optional(),
    scopeId: z.string().min(1).optional(),
    detectorId: z.string().min(1).optional(),
    reasonCode: z.string().min(1).optional(),
    expectCounterEvidence: z.boolean().default(false),
  })
  .strict();

const GoldSetSchema = z.union([
  z.array(GoldExpectationSchema),
  z
    .object({
      expectations: z.array(GoldExpectationSchema),
    })
    .strict(),
]);

type GoldExpectation = z.output<typeof GoldExpectationSchema>;

const DEFAULT_TINY_GOLD_SET: readonly GoldExpectation[] = [
  {
    expectationId: "at_least_one_persistent_speed_hotspot",
    detectorId: "persistent_speed_hotspot",
    reasonCode: "persistent_low_speed",
    expectCounterEvidence: true,
  },
  {
    expectationId: "at_least_one_source_gap_packet",
    detectorId: "source_gap",
    expectCounterEvidence: false,
  },
];

function parseCliArgs(args: string[]): Args {
  return parseMonthDbCliArgs(args, {} as Args, [
    {
      flags: ["--artifact-root"],
      apply: (output, value) => {
        if (value !== undefined) output.artifactRoot = fromCliPath(value);
      },
    },
    {
      flags: ["--gold-set"],
      apply: (output, value) => {
        if (value !== undefined) output.goldSetPath = fromCliPath(value);
      },
    },
  ]);
}

export function findingsReviewPacketsPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "review-packets.json");
}

export function findingsBacktestArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "backtest.json");
}

async function loadGoldSet(goldSetPath: string | undefined): Promise<readonly GoldExpectation[]> {
  if (goldSetPath === undefined) return DEFAULT_TINY_GOLD_SET;
  const parsed = GoldSetSchema.parse(await Bun.file(goldSetPath).json());
  return Array.isArray(parsed) ? parsed : parsed.expectations;
}

function packetMatchesExpectation(
  packet: z.output<typeof FindingReviewPacketsArtifactSchema>["packets"][number],
  expectation: GoldExpectation,
): boolean {
  if (expectation.routeId !== undefined && packet.candidate.routeId !== expectation.routeId) {
    return false;
  }
  if (expectation.scopeId !== undefined && packet.candidate.scopeId !== expectation.scopeId) {
    return false;
  }
  if (
    expectation.detectorId !== undefined &&
    packet.candidate.detectorId !== expectation.detectorId
  ) {
    return false;
  }
  if (
    expectation.reasonCode !== undefined &&
    packet.candidate.reasonCode !== expectation.reasonCode
  ) {
    return false;
  }
  if (expectation.expectCounterEvidence && !packet.packetCompleteness.hasCounterEvidence) {
    return false;
  }
  return true;
}

export async function auditFindingsBacktest(args: Args = {}): Promise<FindingsBacktestResult> {
  const options = createMonthContext(args);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const reviewPacketsPath = findingsReviewPacketsPath(artifactRoot, options.isoMonth);
  const artifactPath = findingsBacktestArtifactPath(artifactRoot, options.isoMonth);
  const [reviewPackets, goldSet] = await Promise.all([
    Bun.file(reviewPacketsPath)
      .json()
      .then((json) => FindingReviewPacketsArtifactSchema.parse(json)),
    loadGoldSet(args.goldSetPath),
  ]);

  const results = goldSet.map((expectation) => {
    const matches = reviewPackets.packets.filter((packet) =>
      packetMatchesExpectation(packet, expectation),
    );
    return {
      ...expectation,
      status: matches.length > 0 ? "matched" : "missing",
      matchedCandidateIds: matches.map((packet) => packet.candidate.candidateId),
      matchedPacketIds: matches.map((packet) => packet.packetId),
    };
  });
  const missingExpectationCount = results.filter((result) => result.status === "missing").length;
  const matchedExpectationCount = results.length - missingExpectationCount;
  const status = missingExpectationCount === 0 ? "pass" : "fail";

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeJson(artifactPath, {
    artifactKind: "finding_backtest",
    schemaVersion: 1,
    month: options.isoMonth,
    generatedAt: new Date().toISOString(),
    reviewPacketsArtifactPath: reviewPacketsPath,
    goldSetPath: args.goldSetPath ?? null,
    status,
    summary: {
      expectationCount: results.length,
      matchedExpectationCount,
      missingExpectationCount,
    },
    results,
  });

  return {
    isoMonth: options.isoMonth,
    status,
    expectationCount: results.length,
    matchedExpectationCount,
    missingExpectationCount,
    artifactPath,
  };
}

export async function auditFindingsBacktestFromCli(
  args: string[],
): Promise<FindingsBacktestResult> {
  const result = await auditFindingsBacktest(parseCliArgs(args));
  console.log(
    `findings-backtest ${result.isoMonth}: status=${result.status} matched=${result.matchedExpectationCount}/${result.expectationCount} artifact=${result.artifactPath}`,
  );
  return result;
}
