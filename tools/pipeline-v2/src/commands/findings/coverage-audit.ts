import { Database as BunDatabase } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import {
  buildDetectorCoverageAuditArtifact,
  type FindingDetectorCoverageAuditArtifact,
} from "@bp/applied-research/evaluation";
import { loadDetectorCoverageAuditLocalDbRows } from "@bp/applied-research/local-db";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { dbOptions, defaultLocalPipelineDbPath } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export default defineCommand({
  path: ["findings", "coverage-audit"],
  summary:
    "Build a detector coverage audit artifact from local finding candidates/evidence/coverage.",
  input: {
    options: dbOptions.extend({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      artifactRoot: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    detectorCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    evidenceCount: z.number().int().nonnegative(),
    coverageCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const outputPath =
      input.options.output === undefined
        ? join(artifactRoot, "findings", releaseMonth, "detector-coverage-audit.json")
        : fromCliPath(input.options.output);
    const dbPath =
      input.options.db === undefined ? defaultLocalPipelineDbPath() : fromCliPath(input.options.db);

    const sqlite = new BunDatabase(dbPath, { readonly: true });
    let artifact: FindingDetectorCoverageAuditArtifact;
    try {
      sqlite.exec("PRAGMA busy_timeout = 30000");
      const rows = loadDetectorCoverageAuditLocalDbRows({ sqlite, month: releaseMonth });
      artifact = buildDetectorCoverageAuditArtifact({
        month: releaseMonth,
        generatedAt: new Date().toISOString(),
        ...rows,
      });
    } finally {
      sqlite.close();
    }

    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      detectorCount: artifact.detectorCount,
      candidateCount: artifact.detectors.reduce(
        (sum, detector) => sum + detector.candidateCount,
        0,
      ),
      evidenceCount: artifact.detectors.reduce((sum, detector) => sum + detector.evidenceCount, 0),
      coverageCount: artifact.detectors.reduce((sum, detector) => sum + detector.coverageCount, 0),
    };
  },
});
