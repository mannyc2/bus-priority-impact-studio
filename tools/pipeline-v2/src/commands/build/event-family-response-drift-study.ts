import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  eventFamilyEffectPanelArtifactPath,
  eventFamilyResponseDriftStudyArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  buildEventFamilyResponseDriftStudyArtifact,
  type EventFamilyEffectPanelArtifact,
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

export { eventFamilyResponseDriftStudyArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "event-family-response-drift-study"],
  summary: "Build the applied-research event-family response drift study artifact.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      artifactRoot: z.string().optional(),
      eventFamilyEffectPanel: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    familyCount: z.number().int().nonnegative(),
    comparableFamilyCount: z.number().int().nonnegative(),
    stableFamilyCount: z.number().int().nonnegative(),
    attenuatedFamilyCount: z.number().int().nonnegative(),
    amplifiedFamilyCount: z.number().int().nonnegative(),
    reversedFamilyCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const eventFamilyEffectPanelPath =
      input.options.eventFamilyEffectPanel === undefined
        ? eventFamilyEffectPanelArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.eventFamilyEffectPanel);
    const outputPath =
      input.options.output === undefined
        ? eventFamilyResponseDriftStudyArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildEventFamilyResponseDriftStudyArtifact({
      eventFamilyEffectPanel: (await Bun.file(
        eventFamilyEffectPanelPath,
      ).json()) as EventFamilyEffectPanelArtifact,
      generatedAt: new Date().toISOString(),
      artifactPath: repoDisplayPath(outputPath),
      sourceEventFamilyEffectPanelPath: repoDisplayPath(eventFamilyEffectPanelPath),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      familyCount: artifact.summary.familyCount,
      comparableFamilyCount: artifact.summary.comparableFamilyCount,
      stableFamilyCount: artifact.summary.stableFamilyCount,
      attenuatedFamilyCount: artifact.summary.attenuatedFamilyCount,
      amplifiedFamilyCount: artifact.summary.amplifiedFamilyCount,
      reversedFamilyCount: artifact.summary.reversedFamilyCount,
    };
  },
});
