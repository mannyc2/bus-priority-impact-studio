import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { writeJson } from "../../lib/json.ts";
import { fromCliPath, repoRoot } from "../../lib/paths.ts";
import { finalizePlan042ReviewHandoff } from "../../lib/plan042-review-finalizer.ts";

const optionsSchema = Schema.Struct({
  pendingHandoff: Schema.String,
  acceptanceManifest: Schema.String,
  reviewReceiptDir: Schema.String,
  output: Schema.String,
});

export default defineCommand({
  path: ["study", "finalize-member-grain-review"],
  summary: "Finalize Plan 042 only after strict independent-review receipt verification.",
  input: { options: optionsSchema },
  output: Schema.Struct({
    output: Schema.String,
    status: Schema.Literal("reviewed_authority_false"),
    packageCount: Schema.Number,
    reviewCutId: Schema.String,
  }),
  async run({ input }) {
    const output = fromCliPath(input.options.output);
    const handoff = await finalizePlan042ReviewHandoff({
      repositoryRoot: repoRoot,
      pendingHandoffPath: fromCliPath(input.options.pendingHandoff),
      acceptanceManifestPath: fromCliPath(input.options.acceptanceManifest),
      reviewReceiptDir: fromCliPath(input.options.reviewReceiptDir),
    });
    await writeJson(output, handoff);
    return {
      output,
      status: handoff.status,
      packageCount: handoff.package_results.length,
      reviewCutId: handoff.review_cut_id,
    };
  },
});
