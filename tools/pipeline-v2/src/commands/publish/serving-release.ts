import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { fromCliPath } from "../../lib/paths.ts";
import {
  canonicalReceiptText,
  prepareServingPublication,
  sha256,
} from "../../lib/serving-publication.ts";

export default defineCommand({
  path: ["publish", "serving-release"],
  summary: "Prepare an immutable release receipt for protected publication.",
  input: {
    options: Schema.Struct({
      action: Schema.Literals(["dry-run", "prepare"]).pipe(
        Schema.withDecodingDefaultTypeKey(Effect.succeed("dry-run" as const)),
      ),
      candidateRoot: Schema.String.check(Schema.isMinLength(1)),
      releaseTag: Schema.String.check(Schema.isMinLength(1)),
      archiveAsset: Schema.String.check(Schema.isMinLength(1)),
      archiveSha256: Schema.String.check(Schema.isMinLength(1)),
      expectedRelease: Schema.String.check(Schema.isMinLength(1)),
      expectedCandidate: Schema.String.check(Schema.isMinLength(1)),
      expectedGeneration: arg
        .number()
        .check(Schema.isInt())
        .check(Schema.isGreaterThanOrEqualTo(0)),
      repoSha: Schema.String.check(Schema.isMinLength(1)),
      workerdParity: arg.boolean().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false))),
      output: Schema.optionalKey(Schema.String),
    }),
  },
  output: Schema.Struct({
    schemaVersion: Schema.Literal(1),
    action: Schema.Literals(["dry-run", "prepare"]),
    operationId: Schema.String,
    candidateId: Schema.String,
    receiptSha256: Schema.String,
    outputPath: Schema.String,
    remoteMutationCount: Schema.Literal(0),
  }),
  async run({ input }) {
    const candidateRoot = fromCliPath(input.options.candidateRoot);
    const receipt = await prepareServingPublication({
      candidateRoot,
      releaseTag: input.options.releaseTag,
      archiveAsset: input.options.archiveAsset,
      archiveSha256: input.options.archiveSha256,
      expectedReleaseId: input.options.expectedRelease,
      expectedCandidateId: input.options.expectedCandidate,
      expectedGeneration: input.options.expectedGeneration,
      repoSha: input.options.repoSha,
      workerdParity: input.options.workerdParity,
    });
    const text = canonicalReceiptText(receipt);
    const outputPath =
      input.options.output === undefined
        ? join(candidateRoot, "publication-preparation.json")
        : fromCliPath(input.options.output);
    if (input.options.action === "prepare") await writeFile(outputPath, text);
    console.error(
      `serving-release ${input.options.action}: ${receipt.operationId} ` +
        `(candidate=${receipt.candidate.candidateId}, remote mutations=0)`,
    );
    return {
      schemaVersion: 1 as const,
      action: input.options.action,
      operationId: receipt.operationId,
      candidateId: receipt.candidate.candidateId,
      receiptSha256: sha256(text),
      outputPath:
        input.options.action === "prepare" ? relative(process.cwd(), outputPath) : "not-written",
      remoteMutationCount: 0 as const,
    };
  },
});
