import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { fromCliPath, repoRoot } from "../lib/paths.ts";
import { renderPlan042DownstreamPin } from "../lib/plan042-closure-receipt.ts";

const optionsSchema = Schema.Struct({
  producerReceipt: Schema.String.annotate({
    description: "Absolute Plan 041 producer-handoff receipt path.",
  }),
  consumerReceipt: Schema.String.annotate({
    description: "Committed Plan 042 tracker receipt path.",
  }),
  output: Schema.String.annotate({
    description: "Absolute wiki downstream-pin output path.",
  }),
});

export default defineCommand({
  path: ["render-closure-downstream-pin"],
  summary: "Atomically render the exact Plan 041/042 downstream-pin projection.",
  input: { options: optionsSchema },
  output: Schema.Struct({
    output: Schema.String,
    consumerCommit: Schema.String,
    candidateSetId: Schema.String,
    grainVerdictRowCount: Schema.Number,
    pinnedAt: Schema.String,
  }),
  async run({ input }) {
    const outputPath = fromCliPath(input.options.output);
    const pin = await renderPlan042DownstreamPin({
      repositoryRoot: repoRoot,
      producerReceiptPath: fromCliPath(input.options.producerReceipt),
      consumerReceiptPath: fromCliPath(input.options.consumerReceipt),
      outputPath,
    });
    return {
      output: outputPath,
      consumerCommit: pin.consumer_commit,
      candidateSetId: pin.candidate_set.candidate_set_id,
      grainVerdictRowCount: pin.grain_verdict.row_count,
      pinnedAt: pin.pinned_at,
    };
  },
});
