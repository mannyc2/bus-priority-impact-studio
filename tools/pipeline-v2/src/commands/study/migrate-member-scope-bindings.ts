import {
  StudyEventCandidateSetArtifactV4Schema,
  StudyPhysicalScopeBindingsArtifactSchema,
} from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { migrateStudyPhysicalScopeBindingsArtifactV2 } from "../../lib/study-engine/scope.ts";

export default defineCommand({
  path: ["study", "migrate-member-scope-bindings"],
  summary:
    "Rebind unchanged same-month v1 scope geometry to one exact candidate × occurrence × route × member universe.",
  input: {
    options: Schema.Struct({
      prior: Schema.String.annotate({
        description: "Existing immutable v1 physical-scope binding artifact.",
      }),
      candidateSet: Schema.String.annotate({
        description: "Awaiting-review-cut member-grain v4 candidate artifact.",
      }),
      output: Schema.String.annotate({
        description: "New v2 member-grain scope-binding artifact path.",
      }),
    }),
  },
  output: Schema.Struct({
    outputPath: Schema.String,
    candidateSetId: Schema.String,
    analysisMonth: Schema.String,
    bindingCount: Schema.Number,
  }),
  async run({ input }) {
    const [legacy, candidateSet] = await Promise.all([
      readJsonArtifact(
        fromCliPath(input.options.prior),
        StudyPhysicalScopeBindingsArtifactSchema,
        "strict",
      ),
      readJsonArtifact(
        fromCliPath(input.options.candidateSet),
        StudyEventCandidateSetArtifactV4Schema,
        "strict",
      ),
    ]);
    const artifact = migrateStudyPhysicalScopeBindingsArtifactV2({ legacy, candidateSet });
    const outputPath = fromCliPath(input.options.output);
    await writeJson(outputPath, artifact);
    return {
      outputPath,
      candidateSetId: artifact.candidateSetId,
      analysisMonth: artifact.analysisMonth,
      bindingCount: artifact.bindings.length,
    };
  },
});
