import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  eventEffectContrastArtifactPath,
  eventFamilyEffectPanelArtifactPath,
  mechanismCorroborationArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  buildEventFamilyEffectPanelArtifact,
  type EventEffectContrastArtifact,
  type MechanismCorroborationArtifact,
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

export { eventFamilyEffectPanelArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "event-family-effect-panel"],
  summary: "Build the applied-research event-family effect panel.",
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
      mechanismCorroboration: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    familyCount: z.number().int().nonnegative(),
    regimeCount: z.number().int().nonnegative(),
    comparableFamilyCount: z.number().int().nonnegative(),
    contrastCount: z.number().int().nonnegative(),
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
    const mechanismCorroborationPath =
      input.options.mechanismCorroboration === undefined
        ? mechanismCorroborationArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.mechanismCorroboration);
    const outputPath =
      input.options.output === undefined
        ? eventFamilyEffectPanelArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildEventFamilyEffectPanelArtifact({
      eventEffectContrast: (await Bun.file(eventEffectContrastPath).json()) as EventEffectContrastArtifact,
      mechanismCorroboration:
        (await Bun.file(mechanismCorroborationPath).json()) as MechanismCorroborationArtifact,
      generatedAt: new Date().toISOString(),
      artifactPath: repoDisplayPath(outputPath),
      sourceEventEffectContrastPath: repoDisplayPath(eventEffectContrastPath),
      sourceMechanismCorroborationPath: repoDisplayPath(mechanismCorroborationPath),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      panelRowCount: artifact.summary.panelRowCount,
      familyCount: artifact.summary.familyCount,
      regimeCount: artifact.summary.regimeCount,
      comparableFamilyCount: artifact.summary.comparableFamilyCount,
      contrastCount: artifact.summary.contrastCount,
    };
  },
});
