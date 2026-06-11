import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type EvidenceCorpusAudit as AppliedEvidenceCorpusAudit,
  buildEvidenceCorpusAudit,
} from "@bp/applied-research/evaluation";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath } from "../../lib/paths.ts";

function signalFeaturesArtifactPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "findings", month, "signal-features.json");
}

function sourceCoverageLedgerPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "source-coverage", month, "ledger.json");
}

const AuditStatusSchema = z.enum(["pass", "warn", "fail"]);

const EvidenceCorpusAuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().min(1),
    month: z.string().regex(/^\d{4}-\d{2}$/),
    status: AuditStatusSchema,
    sources: z
      .object({
        sourceCount: z.number().int().nonnegative(),
        primaryEvidenceAllowedCount: z.number().int().nonnegative(),
        automaticPromotionAllowedCount: z.number().int().nonnegative(),
        manualReviewPrimaryCount: z.number().int().nonnegative(),
        contextOnlyCount: z.number().int().nonnegative(),
        blockedCount: z.number().int().nonnegative(),
      })
      .strict(),
    features: z
      .object({
        featureCount: z.number().int().nonnegative(),
        contextTouchedFeatureCount: z.number().int().nonnegative(),
        contextSourceCount: z.number().int().nonnegative(),
      })
      .strict(),
    detectors: z
      .object({
        detectorCount: z.number().int().nonnegative(),
        candidateCount: z.number().int().nonnegative(),
        evidenceCount: z.number().int().nonnegative(),
        coverageCount: z.number().int().nonnegative(),
      })
      .strict(),
    reviewQueue: z
      .object({
        totalCandidateCount: z.number().int().nonnegative(),
        candidateCount: z.number().int().nonnegative(),
        evidenceLinkedCandidateCount: z.number().int().nonnegative(),
        unlinkedCandidateCount: z.number().int().nonnegative(),
        omittedCandidateCount: z.number().int().nonnegative(),
      })
      .strict(),
    gaps: z.array(z.string()),
    outputPath: z.string(),
  })
  .strict();

export type { EvidenceCorpusAudit } from "@bp/applied-research/evaluation";

async function readJsonIfExists(path: string): Promise<unknown | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json();
}

export function evidenceCorpusAuditPath(artifactRoot: string, month: string): string {
  return join(artifactRoot, "audits", `evidence-corpus-${month}.json`);
}

export async function runAuditEvidenceCorpus(args: {
  year: number;
  month: number;
  artifactRoot?: string | undefined;
  output?: string | undefined;
}): Promise<AppliedEvidenceCorpusAudit> {
  const month = isoMonth(args.year, args.month);
  const artifactRoot = args.artifactRoot ?? defaultArtifactRootPath();
  const outputPath = args.output ?? evidenceCorpusAuditPath(artifactRoot, month);
  const context = { isoMonth: month };

  const [sourceLedger, signalFeatures, detectorAudit, reviewQueue] = await Promise.all([
    readJsonIfExists(sourceCoverageLedgerPath(artifactRoot, context.isoMonth)),
    readJsonIfExists(signalFeaturesArtifactPath(artifactRoot, context.isoMonth)),
    readJsonIfExists(
      join(artifactRoot, "findings", context.isoMonth, "detector-coverage-audit.json"),
    ),
    readJsonIfExists(join(artifactRoot, "findings", context.isoMonth, "review-queue.json")),
  ]);

  const audit = EvidenceCorpusAuditSchema.parse(
    buildEvidenceCorpusAudit({
      generatedAt: new Date().toISOString(),
      month: context.isoMonth,
      outputPath,
      sourceLedger,
      signalFeatures,
      detectorAudit,
      reviewQueue,
    }),
  );

  await mkdir(dirname(outputPath), { recursive: true });
  await writeJson(outputPath, audit);
  return audit;
}

export default defineCommand({
  path: ["audit", "evidence-corpus"],
  summary: "Audit detector evidence corpus (source ledger, signal features, findings).",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026).describe("Calendar year"),
      month: arg.positiveInt().default(3).describe("Calendar month, 1-12"),
      artifactRoot: z.string().optional().describe("Override artifact root directory"),
      output: z.string().optional().describe("Override output path for audit JSON"),
    }),
  },
  output: z
    .object({
      status: z.string(),
      month: z.string(),
      outputPath: z.string(),
    })
    .passthrough(),
  async run({ input }) {
    return runAuditEvidenceCorpus({
      year: input.options.year,
      month: input.options.month,
      artifactRoot:
        input.options.artifactRoot === undefined
          ? undefined
          : fromCliPath(input.options.artifactRoot),
      output: input.options.output === undefined ? undefined : fromCliPath(input.options.output),
    });
  },
});
