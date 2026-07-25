import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { writeJson } from "../../lib/json.ts";
import { fromCliPath } from "../../lib/paths.ts";
import {
  artifactSummary,
  buildPlan042Outputs,
  loadPlan042BuildInputs,
  type Plan042BuildOutputs,
  plan042ArtifactFileName,
} from "../../lib/plan042-member-grain.ts";

const optionsSchema = Schema.Struct({
  producerRoot: Schema.String.annotate({
    description: "Exact clean Plan 041 producer checkout at final checkpoint dc1b1008.",
  }),
  priorReviewCut: Schema.String.annotate({
    description: "Exact committed Plan 096 review-cut artifact.",
  }),
  priorReconciliation: Schema.String.annotate({
    description: "Exact committed Plan 096 complete reconciliation.",
  }),
  reviewInputs: Schema.String.annotate({
    description: "Exact committed Plan 096 outcome/spine/scope input receipt.",
  }),
  spineArtifactRoot: Schema.String.annotate({
    description: "Root containing the exact Plan 096 review-input-addressed spine bytes.",
  }),
  plan096Database: Schema.String.annotate({
    description: "Exact isolated Plan 096 May database (07d9d297...).",
  }),
  outputDir: Schema.String.annotate({
    description: "Directory for deterministic Plan 042 artifacts.",
  }),
});

export default defineCommand({
  path: ["study", "certify-member-grain-outcomes"],
  summary:
    "Build the authority-false Plan 042 candidate, extent-binding, relevance, and grain-verdict closure.",
  input: { options: optionsSchema },
  output: Schema.Struct({
    outputDir: Schema.String,
    candidateSetId: Schema.String,
    candidateCount: Schema.Number,
    memberGrainCount: Schema.Number,
    extentBindingCount: Schema.Number,
    grainVerdictCount: Schema.Number,
    reviewCutId: Schema.String,
    files: Schema.Array(Schema.String),
  }),
  async run({ input }) {
    const outputDir = fromCliPath(input.options.outputDir);
    const inputs = await loadPlan042BuildInputs({
      producerRoot: fromCliPath(input.options.producerRoot),
      priorReviewCutPath: fromCliPath(input.options.priorReviewCut),
      priorReconciliationPath: fromCliPath(input.options.priorReconciliation),
      reviewInputsPath: fromCliPath(input.options.reviewInputs),
      spineArtifactRoot: fromCliPath(input.options.spineArtifactRoot),
      plan096DatabasePath: fromCliPath(input.options.plan096Database),
    });
    const outputs = buildPlan042Outputs(inputs);
    await mkdir(outputDir, { recursive: true });
    for (const [kind, artifact] of Object.entries(outputs) as [
      keyof Plan042BuildOutputs,
      Plan042BuildOutputs[keyof Plan042BuildOutputs],
    ][]) {
      await writeJson(join(outputDir, plan042ArtifactFileName(kind)), artifact);
    }
    return { outputDir, ...artifactSummary(outputs) };
  },
});
