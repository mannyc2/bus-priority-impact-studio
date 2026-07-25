import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { fromCliPath, repoRoot } from "../lib/paths.ts";
import { verifyPlan042ClosureReceipt } from "../lib/plan042-closure-receipt.ts";

const optionsSchema = Schema.Struct({
  receipt: Schema.String.annotate({
    description: "Fixed Plan 042 closure receipt path.",
  }),
  downstreamPin: Schema.optionalKey(
    Schema.String.annotate({
      description: "Optional absolute completed wiki downstream-pin path.",
    }),
  ),
});

export default defineCommand({
  path: ["verify-closure-receipt"],
  summary: "Strictly verify the committed Plan 042 consumer receipt and optional wiki pin.",
  input: { options: optionsSchema },
  output: Schema.Struct({
    status: Schema.Literal("verified"),
    consumerCommit: Schema.String,
    candidateSetId: Schema.String,
    grainVerdictRowCount: Schema.Number,
    protectedSurfaceCount: Schema.Number,
    downstreamPinVerified: Schema.Boolean,
  }),
  run({ input }) {
    return verifyPlan042ClosureReceipt({
      repositoryRoot: repoRoot,
      receiptPath: fromCliPath(input.options.receipt),
      ...(input.options.downstreamPin === undefined
        ? {}
        : { downstreamPinPath: fromCliPath(input.options.downstreamPin) }),
    });
  },
});
