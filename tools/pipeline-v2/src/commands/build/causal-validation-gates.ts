import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  causalValidationGatesArtifactPath,
  eventFamilyEffectPanelArtifactPath,
  eventFamilyResponseDriftStudyArtifactPath,
  treatmentEventPanelArtifactPath,
} from "@bp/applied-research/artifacts";
import { buildCausalValidationGatesArtifact } from "@bp/applied-research/causal";
import { arg, defineCommand, z } from "@liche/core";
import { isoMonth } from "../../lib/dates.ts";
import { writeJson } from "../../lib/json.ts";
import { defaultArtifactRootPath, fromCliPath, repoRoot } from "../../lib/paths.ts";

function repoDisplayPath(path: string): string {
  if (!isAbsolute(path)) return path;
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith("..") ? path : relativePath;
}

export { causalValidationGatesArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "causal-validation-gates"],
  summary: "Build compact causal validation gate statuses from the treatment event panel.",
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
      eventFamilyEffectPanel: z.string().optional(),
      eventFamilyResponseDriftStudy: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    panelRowCount: z.number().int().nonnegative(),
    supportedRowCount: z.number().int().nonnegative(),
    candidateCausalEligibleRowCount: z.number().int().nonnegative(),
    gateStatuses: z.record(z.string(), z.string()),
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
    const eventFamilyEffectPanelPath =
      input.options.eventFamilyEffectPanel === undefined
        ? eventFamilyEffectPanelArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.eventFamilyEffectPanel);
    const eventFamilyResponseDriftStudyPath =
      input.options.eventFamilyResponseDriftStudy === undefined
        ? eventFamilyResponseDriftStudyArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.eventFamilyResponseDriftStudy);
    const eventFamilyEffectPanelFile = Bun.file(eventFamilyEffectPanelPath);
    const eventFamilyResponseDriftStudyFile = Bun.file(eventFamilyResponseDriftStudyPath);
    const hasEventFamilyEffectPanel = await eventFamilyEffectPanelFile.exists();
    const hasEventFamilyResponseDriftStudy = await eventFamilyResponseDriftStudyFile.exists();
    const outputPath =
      input.options.output === undefined
        ? causalValidationGatesArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildCausalValidationGatesArtifact({
      treatmentEventPanel: await Bun.file(treatmentEventPanelPath).json(),
      eventFamilyEffectPanel: hasEventFamilyEffectPanel
        ? await eventFamilyEffectPanelFile.json()
        : null,
      eventFamilyResponseDriftStudy: hasEventFamilyResponseDriftStudy
        ? await eventFamilyResponseDriftStudyFile.json()
        : null,
      generatedAt: new Date().toISOString(),
      releaseMonth,
      historyStartMonth: input.options.historyStartMonth,
      artifactPath: repoDisplayPath(outputPath),
      sourcePanelPath: repoDisplayPath(treatmentEventPanelPath),
      sourceEventFamilyEffectPanelPath: hasEventFamilyEffectPanel
        ? repoDisplayPath(eventFamilyEffectPanelPath)
        : null,
      sourceEventFamilyResponseDriftStudyPath: hasEventFamilyResponseDriftStudy
        ? repoDisplayPath(eventFamilyResponseDriftStudyPath)
        : null,
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      panelRowCount: artifact.summary.panelRowCount,
      supportedRowCount: artifact.summary.supportedRowCount,
      candidateCausalEligibleRowCount: artifact.summary.candidateCausalEligibleRowCount,
      gateStatuses: Object.fromEntries(artifact.gates.map((gate) => [gate.gateId, gate.status])),
    };
  },
});
