import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  pulseCandidateSetArtifactPath,
  treatmentEventPanelArtifactPath,
} from "@bp/applied-research/artifacts";
import { buildPulseCandidateSetArtifact } from "@bp/applied-research/causal";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export { pulseCandidateSetArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "pulse-candidate-set"],
  summary: "Build the applied-research pulse candidate set from the treatment event panel.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      artifactRoot: z.string().optional(),
      treatmentEventPanel: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    candidateCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    candidateCausalCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const treatmentEventPanelPath =
      input.options.treatmentEventPanel === undefined
        ? treatmentEventPanelArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.treatmentEventPanel);
    const outputPath =
      input.options.output === undefined
        ? pulseCandidateSetArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildPulseCandidateSetArtifact({
      treatmentEventPanel: await Bun.file(treatmentEventPanelPath).json(),
      generatedAt: new Date().toISOString(),
      releaseMonth,
      historyStartMonth: input.options.historyStartMonth,
      artifactPath: repoDisplayPath(outputPath),
      sourcePanelPath: repoDisplayPath(treatmentEventPanelPath),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      candidateCount: artifact.summary.candidateCount,
      routeCount: artifact.summary.routeCount,
      eventCount: artifact.summary.eventCount,
      candidateCausalCount: artifact.summary.candidateCausalCount,
    };
  },
});
