import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  eventEffectContrastArtifactPath,
  mechanismCorroborationArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  buildMechanismCorroborationArtifact,
  type EventEffectContrastArtifact,
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

export { mechanismCorroborationArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "mechanism-corroboration"],
  summary: "Build the applied-research mechanism corroboration artifact.",
  input: {
    options: z.object({
      year: arg.positiveInt().default(2026),
      month: arg.positiveInt().default(3),
      historyStartMonth: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default("2023-04"),
      artifactRoot: z.string().optional(),
      eventEffectContrast: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    rowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    familyCount: z.number().int().nonnegative(),
    corroboratedCount: z.number().int().nonnegative(),
  }),
  async run({ input }) {
    const releaseMonth = isoMonth(input.options.year, input.options.month);
    const artifactRoot =
      input.options.artifactRoot === undefined
        ? defaultArtifactRootPath()
        : fromCliPath(input.options.artifactRoot);
    const eventEffectContrastPath =
      input.options.eventEffectContrast === undefined
        ? eventEffectContrastArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.eventEffectContrast);
    const outputPath =
      input.options.output === undefined
        ? mechanismCorroborationArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildMechanismCorroborationArtifact({
      eventEffectContrast: (await Bun.file(
        eventEffectContrastPath,
      ).json()) as EventEffectContrastArtifact,
      generatedAt: new Date().toISOString(),
      artifactPath: repoDisplayPath(outputPath),
      sourceEventEffectContrastPath: repoDisplayPath(eventEffectContrastPath),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      rowCount: artifact.summary.rowCount,
      routeCount: artifact.summary.routeCount,
      eventCount: artifact.summary.eventCount,
      familyCount: artifact.summary.familyCount,
      corroboratedCount: artifact.summary.corroboratedCount,
    };
  },
});
