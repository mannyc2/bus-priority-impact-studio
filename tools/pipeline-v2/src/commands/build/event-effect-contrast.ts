import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  eventEffectContrastArtifactPath,
  pulseCandidateSetArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  buildEventEffectContrastArtifact,
  type PulseCandidateSetArtifact,
} from "@bp/applied-research/causal";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export { eventEffectContrastArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "event-effect-contrast"],
  summary: "Build the applied-research event effect contrast artifact.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      artifactRoot: z.string().optional(),
      candidateSet: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    contrastCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    candidateCausalContrastCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const candidateSetPath =
      input.options.candidateSet === undefined
        ? pulseCandidateSetArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.candidateSet);
    const outputPath =
      input.options.output === undefined
        ? eventEffectContrastArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildEventEffectContrastArtifact({
      candidateSet: (await Bun.file(candidateSetPath).json()) as PulseCandidateSetArtifact,
      generatedAt: new Date().toISOString(),
      artifactPath: repoDisplayPath(outputPath),
      sourceCandidateSetPath: repoDisplayPath(candidateSetPath),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      contrastCount: artifact.summary.contrastCount,
      routeCount: artifact.summary.routeCount,
      eventCount: artifact.summary.eventCount,
      candidateCausalContrastCount: artifact.summary.candidateCausalContrastCount,
    };
  },
});
