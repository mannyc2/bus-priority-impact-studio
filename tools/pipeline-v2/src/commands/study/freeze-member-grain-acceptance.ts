import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { writeJson } from "../../lib/json.ts";
import { fromCliPath, repoRoot } from "../../lib/paths.ts";
import { buildPlan042AcceptanceManifest } from "../../lib/plan042-acceptance.ts";

const optionsSchema = Schema.Struct({
  artifactDir: Schema.String,
  replayArtifactDir: Schema.String,
  focusedLog: Schema.String,
  typecheckLog: Schema.String,
  validationLog: Schema.String,
  replayLog: Schema.String,
  focusedCommand: Schema.String,
  typecheckCommand: Schema.String,
  validationCommand: Schema.String,
  replayCommand: Schema.String,
  output: Schema.String,
});

export default defineCommand({
  path: ["study", "freeze-member-grain-acceptance"],
  summary: "Freeze deterministic Plan 042 package evidence and shared checkpoint receipts.",
  input: { options: optionsSchema },
  output: Schema.Struct({
    output: Schema.String,
    packageCount: Schema.Number,
    artifactCount: Schema.Number,
    reviewCutId: Schema.String,
  }),
  async run({ input }) {
    const output = fromCliPath(input.options.output);
    const manifest = await buildPlan042AcceptanceManifest({
      repositoryRoot: repoRoot,
      artifactDir: fromCliPath(input.options.artifactDir),
      replayArtifactDir: fromCliPath(input.options.replayArtifactDir),
      focusedLogPath: fromCliPath(input.options.focusedLog),
      typecheckLogPath: fromCliPath(input.options.typecheckLog),
      validationLogPath: fromCliPath(input.options.validationLog),
      replayLogPath: fromCliPath(input.options.replayLog),
      focusedCommand: input.options.focusedCommand,
      typecheckCommand: input.options.typecheckCommand,
      validationCommand: input.options.validationCommand,
      replayCommand: input.options.replayCommand,
    });
    await writeJson(output, manifest);
    return {
      output,
      packageCount: manifest.package_results.length,
      artifactCount: manifest.artifacts.length,
      reviewCutId: manifest.review_cut_id,
    };
  },
});
