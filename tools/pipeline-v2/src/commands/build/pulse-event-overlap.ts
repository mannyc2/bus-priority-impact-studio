import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import {
  pulseCandidateSetArtifactPath,
  pulseEventOverlapArtifactPath,
  segmentDaypartPanelArtifactPath,
} from "@bp/applied-research/artifacts";
import {
  buildPulseEventOverlapArtifact,
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

export { pulseEventOverlapArtifactPath } from "@bp/applied-research/artifacts";

export default defineCommand({
  path: ["build", "pulse-event-overlap"],
  summary: "Build route-window pulse/event overlaps against the segment-daypart panel.",
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
      segmentDaypartPanel: z.string().optional(),
      output: z.string().optional(),
    }),
  },
  output: z.object({
    releaseMonth: z.string(),
    outputPath: z.string(),
    overlapRowCount: z.number().int().nonnegative(),
    routeCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    completeWindowCount: z.number().int().nonnegative(),
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
    const segmentDaypartPanelPath =
      input.options.segmentDaypartPanel === undefined
        ? segmentDaypartPanelArtifactPath({
            artifactRoot,
            startMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.segmentDaypartPanel);
    const outputPath =
      input.options.output === undefined
        ? pulseEventOverlapArtifactPath({
            artifactRoot,
            historyStartMonth: input.options.historyStartMonth,
            releaseMonth,
          })
        : fromCliPath(input.options.output);
    const artifact = buildPulseEventOverlapArtifact({
      candidateSet: (await Bun.file(candidateSetPath).json()) as PulseCandidateSetArtifact,
      generatedAt: new Date().toISOString(),
      artifactPath: repoDisplayPath(outputPath),
      sourceCandidateSetPath: repoDisplayPath(candidateSetPath),
      segmentDaypartPanelPath: repoDisplayPath(segmentDaypartPanelPath),
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeJson(outputPath, artifact);
    return {
      releaseMonth,
      outputPath: repoDisplayPath(outputPath),
      overlapRowCount: artifact.summary.overlapRowCount,
      routeCount: artifact.summary.routeCount,
      eventCount: artifact.summary.eventCount,
      completeWindowCount: artifact.summary.completeWindowCount,
    };
  },
});
