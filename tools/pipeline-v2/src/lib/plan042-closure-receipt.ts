import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  type Plan042AcceptanceManifest,
  Plan042AcceptanceManifestSchema,
  Plan042CandidateSetV5Schema,
  type Plan042ClosureReceipt,
  Plan042ClosureReceiptSchema,
  Plan042ExtentBindingArtifactSchema,
  Plan042GrainVerdictArtifactSchema,
  Plan042IdentityVerdictProjectionSchema,
  type Plan042IndependentReviewReceipt,
  Plan042IndependentReviewReceiptSchema,
  Plan042LineageComparabilityArtifactSchema,
  Plan042MemberGrainProjectionSchema,
  Plan042OutcomeRelevanceRegistrySchema,
  Plan042ProducerImportArtifactSchema,
  Plan042ReviewHandoffArtifactSchema,
  Plan042ServicePatternCoverageArtifactSchema,
  Plan042StopSetCoverageArtifactSchema,
} from "@bp/domain/studio/member-grain-outcomes";
import { Schema } from "effect";
import { PLAN042_IMPLEMENTATION_PATHS } from "./plan042-acceptance.ts";
import {
  type Plan041ProducerHandoff,
  Plan041ProducerHandoffSchema,
  sha256Bytes,
  stableJson,
  validatePlan042ReviewHandoff,
} from "./plan042-member-grain.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

const PROTECTED_BASELINE_COMMIT = "b25542b0a735636e7051be8fb70893499671366f" as const;
const PROTECTED_PATHS = [
  "apps/web/src/components/route/TreatmentsHistorySection.tsx",
  "apps/web/src/components/study/StudyCard.tsx",
  "apps/web/src/components/study/StudyEventChart.chart.tsx",
  "apps/web/src/components/study/StudyEventChart.tsx",
  "apps/web/src/components/study/study-display.ts",
  "apps/web/src/routes/routes/$routeId.tsx",
  "apps/web/src/studio/api-client.ts",
  "apps/web/src/studio/pages/interventions.tsx",
  "docs/research/spine-pattern-grouping-decision.md",
  "docs/research/spine-pattern-grouping-findings.md",
  "packages/analytics/src/feature-history/spine-pattern-grouping-prototype.ts",
  "packages/analytics/test/feature-history/spine-pattern-grouping-prototype.test.ts",
  "tools/pipeline-v2/src/lib/study-engine/bootstrap.ts",
  "tools/pipeline-v2/src/lib/study-engine/did.ts",
  "tools/pipeline-v2/src/lib/study-engine/estimator.ts",
  "tools/pipeline-v2/src/lib/study-engine/gates.ts",
  "tools/pipeline-v2/src/lib/study-engine/matching.ts",
  "tools/pipeline-v2/src/lib/study-engine/panel.ts",
] as const;

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const PositiveInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0));
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const Commit = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u));
const ArtifactReceipt = Schema.Struct({
  bytes: PositiveInteger,
  path: NonEmptyString,
  row_count: PositiveInteger,
  sha256: Sha256,
});

export const Plan042DownstreamPinSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  consumer: Schema.Literal("bus-reliability-tracker"),
  release_id: Schema.Literal("v1-rc28"),
  manifest_sha256: Sha256,
  generator_commit: Commit,
  contract_versions: Schema.Struct({
    bus_lane_identity_verdicts: Schema.Literal(1),
    operational_anchor_review_decisions: NonNegativeInteger,
    operational_anchors: NonNegativeInteger,
    operational_occurrence_member_extents: Schema.Literal(1),
    operational_occurrence_member_grain: Schema.Literal(1),
    operational_occurrence_review_decisions: NonNegativeInteger,
    operational_occurrences: Schema.Literal(2),
    relationship_integrity_bundle: NonNegativeInteger,
    route_anchors: NonNegativeInteger,
    route_identity_snapshot: NonNegativeInteger,
  }),
  consumer_commit: Commit,
  pinned_at: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u),
  ),
  public_latest_pointer_updated: Schema.Literal(false),
  occurrence_artifact: ArtifactReceipt,
  member_extent_artifact: ArtifactReceipt,
  member_grain_artifact: ArtifactReceipt,
  identity_verdict_artifact: ArtifactReceipt,
  bridge_v2: Schema.Struct({
    bytes: PositiveInteger,
    candidate_count: PositiveInteger,
    path: NonEmptyString,
    sha256: Sha256,
  }),
  closure_reconciliation: Schema.Struct({
    bytes: PositiveInteger,
    candidate_count: PositiveInteger,
    path: NonEmptyString,
    sha256: Sha256,
  }),
  consumer_import: Plan042ClosureReceiptSchema.fields.import,
  candidate_set: Plan042ClosureReceiptSchema.fields.candidate_set,
  member_grain_import: Plan042ClosureReceiptSchema.fields.member_grain_import,
  extent_binding: Plan042ClosureReceiptSchema.fields.extent_binding,
  grain_verdict: Plan042ClosureReceiptSchema.fields.grain_verdict,
  review_handoff: Plan042ClosureReceiptSchema.fields.review_handoff,
  acceptance_manifest: Plan042ClosureReceiptSchema.fields.acceptance_manifest,
  operator_authorization: Plan042ClosureReceiptSchema.fields.operator_authorization,
  authority: Plan042ClosureReceiptSchema.fields.authority,
  producer_handoff: Schema.Struct({
    path: NonEmptyString,
    sha256: Sha256,
  }),
  consumer_receipt: Schema.Struct({
    repository: Schema.Literal("bus-reliability-tracker"),
    path: NonEmptyString,
    sha256: Sha256,
    receipt_commit: Commit,
  }),
});
export type Plan042DownstreamPin = typeof Plan042DownstreamPinSchema.Type;

function assertSafeRepositoryPath(path: string): void {
  if (
    path.length === 0 ||
    isAbsolute(path) ||
    path.split("/").some((part) => part === ".." || part === "." || part === "")
  ) {
    throw new Error(`Unsafe or non-canonical repository path: ${path}`);
  }
}

async function gitBytes(repositoryRoot: string, commit: string, path: string): Promise<Uint8Array> {
  assertSafeRepositoryPath(path);
  const process = Bun.spawn(["git", "-C", repositoryRoot, "show", `${commit}:${path}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git show ${commit}:${path} failed: ${stderr.trim()}`);
  }
  return new Uint8Array(stdout);
}

async function gitText(repositoryRoot: string, args: readonly string[]): Promise<string> {
  const process = Bun.spawn(["git", "-C", repositoryRoot, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

async function assertAncestor(
  repositoryRoot: string,
  ancestor: string,
  descendant: string,
): Promise<void> {
  const process = Bun.spawn(
    ["git", "-C", repositoryRoot, "merge-base", "--is-ancestor", ancestor, descendant],
    { stdout: "ignore", stderr: "pipe" },
  );
  const [stderr, exitCode] = await Promise.all([
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${ancestor} is not an ancestor of ${descendant}: ${stderr.trim()}`);
  }
}

function decodeJsonBytes<T>(schema: Schema.Constraint, bytes: Uint8Array, label: string): T {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    throw new Error(`${label}: invalid JSON: ${String(cause)}`);
  }
  return decodeSchemaStrict(schema, value) as T;
}

async function readReceiptFile<T>(
  schema: Schema.Constraint,
  path: string,
): Promise<{ readonly artifact: T; readonly bytes: Uint8Array }> {
  const bytes = new Uint8Array(await readFile(path));
  return { artifact: decodeJsonBytes<T>(schema, bytes, path), bytes };
}

function assertBlockEqual(label: string, actual: unknown, expected: unknown): void {
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error(`${label}: receipt block does not match committed artifact`);
  }
}

function histogram(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(result).toSorted(([left], [right]) => left.localeCompare(right)),
  );
}

function digestLines(values: readonly string[]): string {
  return sha256Bytes(`${[...values].toSorted().join("\n")}\n`);
}

async function verifyAddressedArtifact<T>(input: {
  readonly repositoryRoot: string;
  readonly consumerCommit: string;
  readonly receipt: { readonly path: string; readonly bytes: number; readonly sha256: string };
  readonly schema: Schema.Constraint;
}): Promise<T> {
  const bytes = await gitBytes(input.repositoryRoot, input.consumerCommit, input.receipt.path);
  if (bytes.byteLength !== input.receipt.bytes || sha256Bytes(bytes) !== input.receipt.sha256) {
    throw new Error(`${input.receipt.path}: consumer-commit byte/hash mismatch`);
  }
  return decodeJsonBytes<T>(input.schema, bytes, input.receipt.path);
}

function assertVerificationBaseline(receipt: Plan042ClosureReceipt): void {
  const baseline = receipt.verification_baseline.baseline;
  const expectedLogHashes = {
    check_style: "09e7075ece995d92804e7f481fb420594d3cc5e143ca1696994789db604a10c6",
    check_architecture: "4dc4f5ce49bf4d79216f53a4c00b02949e9582805b876e184462a164c3dd39a7",
    test_unit: "0a16ce191a70f143d7715629649f35590aa79aa04a999c4c4a9b95d4a027af1c",
    test_web: "63ff40e037a2a25147f54c77634513f23adf51f4865553d7348521a99b4e111d",
    test_worker: "b4f2a914a8841f2d118d24e6f72de96e6d8a61c9260930e175b32ea76a39425f",
  } as const;
  for (const [phase, expected] of Object.entries(expectedLogHashes) as [
    keyof typeof expectedLogHashes,
    string,
  ][]) {
    if (baseline[phase].log_sha256 !== expected) {
      throw new Error(`${phase}: baseline log pin drifted`);
    }
  }
  if (
    baseline.check_style.exit_code !== 1 ||
    baseline.check_architecture.exit_code !== 0 ||
    baseline.test_unit.exit_code !== 0 ||
    baseline.test_web.exit_code !== 0 ||
    baseline.test_worker.exit_code !== 1
  ) {
    throw new Error("Pinned Plan 042 baseline phase exits drifted");
  }
  const final = receipt.verification_baseline.final;
  if (
    final.check_style.exit_code !== 1 ||
    final.check_style.status !== "matches_baseline" ||
    final.check_architecture.exit_code !== 0 ||
    final.check_architecture.status !== "pass" ||
    final.test_unit.exit_code !== 0 ||
    final.test_unit.status !== "pass" ||
    final.test_web.exit_code !== 0 ||
    final.test_web.status !== "pass" ||
    final.test_worker.exit_code !== 1 ||
    final.test_worker.status !== "matches_listen_eperm_baseline"
  ) {
    throw new Error("Final phase matrix does not prove zero additional failures");
  }
}

export async function verifyPlan042ClosureReceipt(input: {
  readonly repositoryRoot: string;
  readonly receiptPath: string;
  readonly downstreamPinPath?: string;
}): Promise<{
  readonly status: "verified";
  readonly consumerCommit: string;
  readonly candidateSetId: string;
  readonly grainVerdictRowCount: number;
  readonly protectedSurfaceCount: number;
  readonly downstreamPinVerified: boolean;
}> {
  const receiptFile = await readReceiptFile<Plan042ClosureReceipt>(
    Plan042ClosureReceiptSchema,
    input.receiptPath,
  );
  const receipt = receiptFile.artifact;
  const head = await gitText(input.repositoryRoot, ["rev-parse", "HEAD"]);
  const receiptRelativePath = relative(input.repositoryRoot, input.receiptPath);
  assertSafeRepositoryPath(receiptRelativePath);
  const committedReceiptBytes = await gitBytes(input.repositoryRoot, head, receiptRelativePath);
  if (sha256Bytes(committedReceiptBytes) !== sha256Bytes(receiptFile.bytes)) {
    throw new Error("Plan 042 closure receipt is not the exact tracker HEAD receipt");
  }
  await assertAncestor(input.repositoryRoot, receipt.consumer_commit, head);
  if (
    receipt.producer.manifest_sha256 !==
      "b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c" ||
    receipt.producer.handoff_sha256 !==
      "986dfc18adc7867975c338e960eb99fa808cb585a091073887f744427e471aec"
  ) {
    throw new Error("Plan 041 producer identity drifted");
  }
  const [
    producerImport,
    candidateSet,
    memberGrain,
    extentBinding,
    grainVerdict,
    handoff,
    acceptanceManifest,
  ] = await Promise.all([
    verifyAddressedArtifact<typeof Plan042ProducerImportArtifactSchema.Type>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.import,
      schema: Plan042ProducerImportArtifactSchema,
    }),
    verifyAddressedArtifact<typeof Plan042CandidateSetV5Schema.Type>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.candidate_set,
      schema: Plan042CandidateSetV5Schema,
    }),
    verifyAddressedArtifact<typeof Plan042MemberGrainProjectionSchema.Type>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.member_grain_import,
      schema: Plan042MemberGrainProjectionSchema,
    }),
    verifyAddressedArtifact<typeof Plan042ExtentBindingArtifactSchema.Type>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.extent_binding,
      schema: Plan042ExtentBindingArtifactSchema,
    }),
    verifyAddressedArtifact<typeof Plan042GrainVerdictArtifactSchema.Type>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.grain_verdict,
      schema: Plan042GrainVerdictArtifactSchema,
    }),
    verifyAddressedArtifact<typeof Plan042ReviewHandoffArtifactSchema.Type>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.review_handoff,
      schema: Plan042ReviewHandoffArtifactSchema,
    }),
    verifyAddressedArtifact<Plan042AcceptanceManifest>({
      repositoryRoot: input.repositoryRoot,
      consumerCommit: receipt.consumer_commit,
      receipt: receipt.acceptance_manifest,
      schema: Plan042AcceptanceManifestSchema,
    }),
  ]);
  assertBlockEqual("import", receipt.import, {
    path: receipt.import.path,
    bytes: receipt.import.bytes,
    sha256: receipt.import.sha256,
    source_occurrence_count: producerImport.source_occurrence_count,
    eligible_occurrence_count: producerImport.eligible_occurrence_count,
    route_projection_count: producerImport.route_projection_count,
    complete_occurrence_route_count: producerImport.complete_occurrence_route_count,
  });
  assertBlockEqual("candidate_set", receipt.candidate_set, {
    path: receipt.candidate_set.path,
    bytes: receipt.candidate_set.bytes,
    sha256: receipt.candidate_set.sha256,
    candidate_set_id: candidateSet.candidate_set_id,
    candidate_count: candidateSet.summary.candidate_count,
    approval_state: candidateSet.approval_state,
  });
  assertBlockEqual("member_grain_import", receipt.member_grain_import, {
    path: receipt.member_grain_import.path,
    bytes: receipt.member_grain_import.bytes,
    sha256: receipt.member_grain_import.sha256,
    row_count: memberGrain.row_count,
    member_extent_projection_sha256: memberGrain.source.member_extent_projection_sha256,
  });
  assertBlockEqual("extent_binding", receipt.extent_binding, {
    path: receipt.extent_binding.path,
    bytes: receipt.extent_binding.bytes,
    sha256: receipt.extent_binding.sha256,
    row_count: extentBinding.row_count,
    disposition_histogram: extentBinding.disposition_histogram,
  });
  assertBlockEqual("grain_verdict", receipt.grain_verdict, {
    path: receipt.grain_verdict.path,
    bytes: receipt.grain_verdict.bytes,
    sha256: receipt.grain_verdict.sha256,
    row_count: grainVerdict.row_count,
    denominator: grainVerdict.denominator,
    family_by_verdict_histogram: grainVerdict.family_by_verdict_histogram,
  });
  assertBlockEqual("review_handoff", receipt.review_handoff, {
    path: receipt.review_handoff.path,
    bytes: receipt.review_handoff.bytes,
    sha256: receipt.review_handoff.sha256,
    review_cut_id: handoff.review_cut_id,
    row_count: handoff.row_count,
    status: handoff.status,
    approval_applied: handoff.approval_applied,
  });
  assertBlockEqual("acceptance_manifest", receipt.acceptance_manifest, {
    path: receipt.acceptance_manifest.path,
    bytes: receipt.acceptance_manifest.bytes,
    sha256: receipt.acceptance_manifest.sha256,
    review_cut_id: acceptanceManifest.review_cut_id,
    artifact_count: acceptanceManifest.artifacts.length,
    package_count: acceptanceManifest.package_results.length,
  });
  if (
    producerImport.source_occurrence_count !== 131 ||
    producerImport.eligible_occurrence_count !== 130 ||
    producerImport.route_projection_count !== 167 ||
    producerImport.complete_occurrence_route_count !== 168 ||
    candidateSet.candidates.length !== 555 ||
    candidateSet.summary.candidate_count !== 555 ||
    candidateSet.summary.occurrence_route_candidate_count !== 168 ||
    candidateSet.summary.no_member_candidate_count !== 387 ||
    candidateSet.summary.member_row_count !== 308 ||
    memberGrain.rows.length !== 308 ||
    memberGrain.row_count !== 308 ||
    extentBinding.rows.length !== 48 ||
    extentBinding.row_count !== 48 ||
    grainVerdict.rows.length !== 695 ||
    grainVerdict.row_count !== 695 ||
    grainVerdict.denominator.member_row_count !== 308 ||
    grainVerdict.denominator.no_member_candidate_count !== 387 ||
    grainVerdict.denominator.expected_row_count !== 695 ||
    grainVerdict.prior_accepted_ace_row_count !== 8 ||
    handoff.row_count !== 695 ||
    handoff.review_cut_id !== grainVerdict.review_cut_id ||
    acceptanceManifest.review_cut_id !== grainVerdict.review_cut_id ||
    acceptanceManifest.candidate_set_id !== candidateSet.candidate_set_id
  ) {
    throw new Error("Plan 042 exact closure denominator or cross-artifact identity drifted");
  }
  if (
    stableJson(extentBinding.disposition_histogram) !==
      stableJson(histogram(extentBinding.rows.map((row) => row.disposition))) ||
    stableJson(extentBinding.readiness_histogram) !==
      stableJson(histogram(extentBinding.rows.map((row) => row.spine_readiness))) ||
    stableJson(grainVerdict.verdict_histogram) !==
      stableJson(histogram(grainVerdict.rows.map((row) => row.verdict)))
  ) {
    throw new Error("Plan 042 artifact histogram does not match its rows");
  }
  const recomputedFamilyByVerdict: Record<string, Record<string, number>> = {};
  for (const row of grainVerdict.rows) {
    recomputedFamilyByVerdict[row.treatment_family] ??= {};
    const family = recomputedFamilyByVerdict[row.treatment_family];
    if (family === undefined) throw new Error("Unreachable family histogram");
    family[row.verdict] = (family[row.verdict] ?? 0) + 1;
    if (row.authorizes_study) throw new Error(`${row.candidate_id}: authority must remain false`);
  }
  if (
    stableJson(grainVerdict.family_by_verdict_histogram) !== stableJson(recomputedFamilyByVerdict)
  ) {
    throw new Error("Plan 042 family-by-verdict histogram does not match its rows");
  }
  const expectedPackageItemIds = grainVerdict.rows
    .map((row) => row.member_extent_id ?? row.candidate_id)
    .toSorted();
  const actualPackageItemIds = handoff.package_results
    .flatMap((result) => {
      if (
        result.candidate_or_member_count !== result.item_ids.length ||
        result.item_ids_sha256 !== digestLines(result.item_ids)
      ) {
        throw new Error(`${result.package_id}: package count/hash mismatch`);
      }
      return result.item_ids;
    })
    .toSorted();
  if (
    actualPackageItemIds.length !== 695 ||
    new Set(actualPackageItemIds).size !== 695 ||
    stableJson(actualPackageItemIds) !== stableJson(expectedPackageItemIds)
  ) {
    throw new Error("Plan 042 review packages do not exactly partition all 695 rows");
  }
  const riskyItemIds = handoff.package_results
    .filter((result) => result.risk_class === "risky")
    .flatMap((result) => result.item_ids)
    .toSorted();
  const expectedRiskyItemIds = grainVerdict.rows
    .filter((row) =>
      [
        "blocked:member_grain_blocked_upstream",
        "blocked:spine_not_ready",
        "blocked:missing_endpoint_stop_id_equivalence",
        "blocked:missing_pinned_stop_grain_coverage",
        "blocked:missing_pinned_service_pattern_product_coverage",
        "blocked:route_lineage_incomparable",
      ].includes(row.verdict),
    )
    .map((row) => row.member_extent_id ?? row.candidate_id)
    .toSorted();
  const routineItemCount = handoff.package_results
    .filter((result) => result.risk_class === "routine")
    .reduce((sum, result) => sum + result.item_ids.length, 0);
  if (
    riskyItemIds.length !== 122 ||
    routineItemCount !== 573 ||
    stableJson(riskyItemIds) !== stableJson(expectedRiskyItemIds)
  ) {
    throw new Error("Plan 042 risky/routine package partition drifted");
  }
  if (
    acceptanceManifest.package_results.length !== handoff.package_results.length ||
    acceptanceManifest.package_results.some((result, index) => {
      const packageResult = handoff.package_results[index];
      return (
        packageResult === undefined ||
        stableJson({
          package_id: result.package_id,
          candidate_or_member_count: result.candidate_or_member_count,
          item_ids: result.item_ids,
          item_ids_sha256: result.item_ids_sha256,
          risk_class: result.risk_class,
        }) !==
          stableJson({
            package_id: packageResult.package_id,
            candidate_or_member_count: packageResult.candidate_or_member_count,
            item_ids: packageResult.item_ids,
            item_ids_sha256: packageResult.item_ids_sha256,
            risk_class: packageResult.risk_class,
          })
      );
    })
  ) {
    throw new Error("Plan 042 acceptance manifest package partition drifted");
  }
  const acceptanceArtifactIds = acceptanceManifest.artifacts.map(
    (artifact) => artifact.artifact_id,
  );
  const expectedAcceptanceArtifactIds = [
    "candidate-set-v5",
    "extent-segment-bindings",
    "grain-verdict-matrix",
    "identity-verdict-import",
    "lineage-comparability",
    "member-grain-import",
    "outcome-relevance-registry",
    "pending-review-handoff",
    "producer-import",
    "service-pattern-coverage",
    "stop-set-coverage",
  ];
  if (stableJson(acceptanceArtifactIds) !== stableJson(expectedAcceptanceArtifactIds)) {
    throw new Error("Plan 042 acceptance manifest artifact inventory drifted");
  }
  if (
    stableJson(acceptanceManifest.implementation_files.map((file) => file.path)) !==
    stableJson(PLAN042_IMPLEMENTATION_PATHS)
  ) {
    throw new Error("Plan 042 implementation-file inventory drifted");
  }
  for (const file of acceptanceManifest.implementation_files) {
    const fileBytes = await gitBytes(input.repositoryRoot, receipt.consumer_commit, file.path);
    if (fileBytes.byteLength !== file.bytes || sha256Bytes(fileBytes) !== file.sha256) {
      throw new Error(`${file.path}: reviewed implementation bytes changed`);
    }
  }
  const acceptanceArtifactById = new Map(
    acceptanceManifest.artifacts.map((artifact) => [artifact.artifact_id, artifact]),
  );
  const receiptAddressedArtifactPaths = {
    "candidate-set-v5": receipt.candidate_set.path,
    "extent-segment-bindings": receipt.extent_binding.path,
    "grain-verdict-matrix": receipt.grain_verdict.path,
    "member-grain-import": receipt.member_grain_import.path,
    "producer-import": receipt.import.path,
  } as const;
  for (const [artifactId, path] of Object.entries(receiptAddressedArtifactPaths)) {
    if (acceptanceArtifactById.get(artifactId)?.path !== path) {
      throw new Error(`${artifactId}: acceptance and closure receipt paths differ`);
    }
  }
  const decodedAcceptanceArtifacts = new Map<string, unknown>();
  for (const artifact of acceptanceManifest.artifacts) {
    const bytes = await gitBytes(input.repositoryRoot, receipt.consumer_commit, artifact.path);
    if (bytes.byteLength !== artifact.bytes || sha256Bytes(bytes) !== artifact.sha256) {
      throw new Error(`${artifact.path}: acceptance artifact byte/hash mismatch`);
    }
    const schema = {
      "candidate-set-v5": Plan042CandidateSetV5Schema,
      "extent-segment-bindings": Plan042ExtentBindingArtifactSchema,
      "grain-verdict-matrix": Plan042GrainVerdictArtifactSchema,
      "identity-verdict-import": Plan042IdentityVerdictProjectionSchema,
      "lineage-comparability": Plan042LineageComparabilityArtifactSchema,
      "member-grain-import": Plan042MemberGrainProjectionSchema,
      "outcome-relevance-registry": Plan042OutcomeRelevanceRegistrySchema,
      "pending-review-handoff": Plan042ReviewHandoffArtifactSchema,
      "producer-import": Plan042ProducerImportArtifactSchema,
      "service-pattern-coverage": Plan042ServicePatternCoverageArtifactSchema,
      "stop-set-coverage": Plan042StopSetCoverageArtifactSchema,
    }[artifact.artifact_id];
    if (schema === undefined) {
      throw new Error(`${artifact.artifact_id}: no strict acceptance artifact schema`);
    }
    const decoded = decodeJsonBytes<Record<string, unknown>>(schema, bytes, artifact.path);
    const decodedRowCount =
      typeof decoded["row_count"] === "number"
        ? decoded["row_count"]
        : artifact.artifact_id === "candidate-set-v5"
          ? (decoded["summary"] as { readonly candidate_count?: number } | undefined)
              ?.candidate_count
          : null;
    if (artifact.row_count !== (decodedRowCount ?? null)) {
      throw new Error(`${artifact.artifact_id}: manifest row count drifted`);
    }
    decodedAcceptanceArtifacts.set(artifact.artifact_id, decoded);
  }
  const identityImport = decodedAcceptanceArtifacts.get(
    "identity-verdict-import",
  ) as typeof Plan042IdentityVerdictProjectionSchema.Type;
  const stopCoverage = decodedAcceptanceArtifacts.get(
    "stop-set-coverage",
  ) as typeof Plan042StopSetCoverageArtifactSchema.Type;
  const serviceCoverage = decodedAcceptanceArtifacts.get(
    "service-pattern-coverage",
  ) as typeof Plan042ServicePatternCoverageArtifactSchema.Type;
  const lineageCoverage = decodedAcceptanceArtifacts.get(
    "lineage-comparability",
  ) as typeof Plan042LineageComparabilityArtifactSchema.Type;
  const relevanceRegistry = decodedAcceptanceArtifacts.get(
    "outcome-relevance-registry",
  ) as typeof Plan042OutcomeRelevanceRegistrySchema.Type;
  const pendingHandoff = decodedAcceptanceArtifacts.get(
    "pending-review-handoff",
  ) as typeof Plan042ReviewHandoffArtifactSchema.Type;
  if (
    identityImport.row_count !== 321 ||
    identityImport.rows.length !== 321 ||
    identityImport.rows.some(
      (row) => row.verdict === "occurrence_created" || row.authorizes_study,
    ) ||
    stableJson(identityImport.verdict_histogram) !==
      stableJson(histogram(identityImport.rows.map((row) => row.verdict))) ||
    stopCoverage.row_count !== 9 ||
    stopCoverage.rows.length !== 9 ||
    stopCoverage.observed_headway_total_row_count !== 0 ||
    stopCoverage.rows.some(
      (row) =>
        row.observed_headway_row_count !== 0 ||
        row.ewt_artifact_match_count !== 0 ||
        row.typed_stop_id_lineage_present ||
        row.authorizes_study,
    ) ||
    serviceCoverage.row_count !== 5 ||
    serviceCoverage.rows.length !== 5 ||
    serviceCoverage.planned_service_table_present ||
    serviceCoverage.rows.some(
      (row) =>
        row.bus_wait_row_count !== 0 ||
        row.observed_headway_row_count !== 0 ||
        row.planned_service_row_count !== 0 ||
        row.authorizes_study,
    ) ||
    lineageCoverage.row_count !== 22 ||
    lineageCoverage.rows.length !== 22 ||
    lineageCoverage.rows.some((row) => row.authorizes_study) ||
    lineageCoverage.rows.filter((row) => row.route_id === "Q61").length !== 3 ||
    lineageCoverage.rows
      .filter((row) => row.route_id === "Q61")
      .some(
        (row) =>
          row.disposition !== "route_lineage_incomparable:missing_reviewed_endpoint_equivalence",
      ) ||
    relevanceRegistry.entries.length !== 7 ||
    relevanceRegistry.upstream_registry_validation.validation !== "passed" ||
    relevanceRegistry.authority.authorizes_study ||
    relevanceRegistry.authority.authorizes_public_serving ||
    pendingHandoff.status !== "pending_independent_review" ||
    pendingHandoff.review_cut_id !== handoff.review_cut_id ||
    pendingHandoff.package_results.length !== handoff.package_results.length ||
    pendingHandoff.package_results.some((result, index) => {
      const reviewed = handoff.package_results[index];
      return (
        reviewed === undefined ||
        stableJson({
          package_id: result.package_id,
          candidate_or_member_count: result.candidate_or_member_count,
          item_ids: result.item_ids,
          item_ids_sha256: result.item_ids_sha256,
          risk_class: result.risk_class,
        }) !==
          stableJson({
            package_id: reviewed.package_id,
            candidate_or_member_count: reviewed.candidate_or_member_count,
            item_ids: reviewed.item_ids,
            item_ids_sha256: reviewed.item_ids_sha256,
            risk_class: reviewed.risk_class,
          })
      );
    })
  ) {
    throw new Error("Plan 042 secondary evidence artifact semantics drifted");
  }
  const candidateSetIds = [
    extentBinding.candidate_set_id,
    grainVerdict.candidate_set_id,
    handoff.candidate_set_id,
    stopCoverage.candidate_set_id,
    serviceCoverage.candidate_set_id,
    lineageCoverage.candidate_set_id,
  ];
  if (candidateSetIds.some((id) => id !== candidateSet.candidate_set_id)) {
    throw new Error("Plan 042 candidate-set identity differs across evidence artifacts");
  }
  for (const check of Object.values(acceptanceManifest.checks)) {
    const bytes = await gitBytes(input.repositoryRoot, receipt.consumer_commit, check.log.path);
    if (bytes.byteLength !== check.log.bytes || sha256Bytes(bytes) !== check.log.sha256) {
      throw new Error(`${check.check_id}: acceptance log byte/hash mismatch`);
    }
  }
  const acceptanceManifestSha256 = receipt.acceptance_manifest.sha256;
  validatePlan042ReviewHandoff(handoff, acceptanceManifestSha256);
  const validPackageIds = new Set(handoff.package_results.map((result) => result.package_id));
  const reviewReceiptCache = new Map<string, Plan042IndependentReviewReceipt>();
  for (const packageResult of handoff.package_results) {
    for (const review of packageResult.review_receipts) {
      const cacheKey = `${review.artifact_path}\u0000${review.artifact_sha256}`;
      let reviewArtifact = reviewReceiptCache.get(cacheKey);
      if (reviewArtifact === undefined) {
        const bytes = await gitBytes(
          input.repositoryRoot,
          receipt.consumer_commit,
          review.artifact_path,
        );
        if (sha256Bytes(bytes) !== review.artifact_sha256) {
          throw new Error(`${review.artifact_path}: review receipt hash mismatch`);
        }
        reviewArtifact = decodeJsonBytes<Plan042IndependentReviewReceipt>(
          Plan042IndependentReviewReceiptSchema,
          bytes,
          review.artifact_path,
        );
        reviewReceiptCache.set(cacheKey, reviewArtifact);
      }
      if (
        reviewArtifact.reviewer_id !== review.reviewer_id ||
        reviewArtifact.verdict !== review.verdict ||
        reviewArtifact.reviewed_acceptance_manifest.path !== receipt.acceptance_manifest.path ||
        reviewArtifact.reviewed_acceptance_manifest.sha256 !== acceptanceManifestSha256 ||
        reviewArtifact.reviewed_review_cut_id !== handoff.review_cut_id ||
        !reviewArtifact.package_ids.includes(packageResult.package_id) ||
        reviewArtifact.package_ids.some((packageId) => !validPackageIds.has(packageId))
      ) {
        throw new Error(`${review.artifact_path}: review receipt target mismatch`);
      }
    }
  }
  const protectedPaths = receipt.protected_surfaces.entries.map((entry) => entry.path);
  if (
    receipt.protected_surfaces.protected_baseline_commit !== PROTECTED_BASELINE_COMMIT ||
    stableJson(protectedPaths) !== stableJson(PROTECTED_PATHS)
  ) {
    throw new Error("Protected surface inventory must equal the fixed 18-path baseline");
  }
  for (const entry of receipt.protected_surfaces.entries) {
    const [baselineBytes, consumerBytes] = await Promise.all([
      gitBytes(
        input.repositoryRoot,
        receipt.protected_surfaces.protected_baseline_commit,
        entry.path,
      ),
      gitBytes(input.repositoryRoot, receipt.consumer_commit, entry.path),
    ]);
    const baselineSha256 = sha256Bytes(baselineBytes);
    const consumerSha256 = sha256Bytes(consumerBytes);
    if (
      baselineSha256 !== entry.baseline_sha256 ||
      consumerSha256 !== entry.consumer_sha256 ||
      baselineSha256 !== consumerSha256
    ) {
      throw new Error(`${entry.path}: protected surface changed`);
    }
  }
  assertVerificationBaseline(receipt);
  if (input.downstreamPinPath !== undefined) {
    const pinFile = await readReceiptFile<Plan042DownstreamPin>(
      Plan042DownstreamPinSchema,
      input.downstreamPinPath,
    );
    const producerRoot = resolve(dirname(input.downstreamPinPath), "../..");
    const producerReceiptPath = join(producerRoot, receipt.producer.handoff_path);
    const producerFile = await readReceiptFile<Plan041ProducerHandoff>(
      Plan041ProducerHandoffSchema,
      producerReceiptPath,
    );
    if (sha256Bytes(producerFile.bytes) !== receipt.producer.handoff_sha256) {
      throw new Error("Downstream producer receipt hash does not match consumer receipt");
    }
    const expected = projectPlan042DownstreamPin({
      producer: producerFile.artifact,
      consumer: receipt,
      consumerReceiptPath: relative(input.repositoryRoot, input.receiptPath),
      consumerReceiptSha256: sha256Bytes(receiptFile.bytes),
      receiptCommit: head,
      pinnedAt: pinFile.artifact.pinned_at,
    });
    assertBlockEqual("downstream pin", pinFile.artifact, expected);
    if (pinFile.artifact.consumer_receipt.receipt_commit !== head) {
      throw new Error("Downstream pin consumer receipt commit differs from tracker HEAD");
    }
  }
  return {
    status: "verified",
    consumerCommit: receipt.consumer_commit,
    candidateSetId: candidateSet.candidate_set_id,
    grainVerdictRowCount: grainVerdict.row_count,
    protectedSurfaceCount: protectedPaths.length,
    downstreamPinVerified: input.downstreamPinPath !== undefined,
  };
}

export function projectPlan042DownstreamPin(input: {
  readonly producer: Plan041ProducerHandoff;
  readonly consumer: Plan042ClosureReceipt;
  readonly consumerReceiptPath: string;
  readonly consumerReceiptSha256: string;
  readonly receiptCommit: string;
  readonly pinnedAt: string;
}): Plan042DownstreamPin {
  return decodeSchemaStrict(Plan042DownstreamPinSchema, {
    schema_version: 1,
    consumer: input.consumer.consumer,
    release_id: input.producer.release_id,
    manifest_sha256: input.producer.manifest_sha256,
    generator_commit: input.producer.generator_commit,
    contract_versions: input.producer.contract_versions,
    consumer_commit: input.consumer.consumer_commit,
    pinned_at: input.pinnedAt,
    public_latest_pointer_updated: false,
    occurrence_artifact: input.producer.artifacts.occurrence,
    member_extent_artifact: input.producer.artifacts.member_extent,
    member_grain_artifact: input.producer.artifacts.member_grain,
    identity_verdict_artifact: input.producer.artifacts.identity_verdict,
    bridge_v2: input.producer.bridge_v2,
    closure_reconciliation: input.producer.closure_reconciliation,
    consumer_import: input.consumer.import,
    candidate_set: input.consumer.candidate_set,
    member_grain_import: input.consumer.member_grain_import,
    extent_binding: input.consumer.extent_binding,
    grain_verdict: input.consumer.grain_verdict,
    review_handoff: input.consumer.review_handoff,
    acceptance_manifest: input.consumer.acceptance_manifest,
    operator_authorization: input.consumer.operator_authorization,
    authority: input.consumer.authority,
    producer_handoff: {
      path: input.consumer.producer.handoff_path,
      sha256: input.consumer.producer.handoff_sha256,
    },
    consumer_receipt: {
      repository: "bus-reliability-tracker",
      path: input.consumerReceiptPath,
      sha256: input.consumerReceiptSha256,
      receipt_commit: input.receiptCommit,
    },
  });
}

export async function renderPlan042DownstreamPin(input: {
  readonly repositoryRoot: string;
  readonly producerReceiptPath: string;
  readonly consumerReceiptPath: string;
  readonly outputPath: string;
  readonly now?: () => Date;
}): Promise<Plan042DownstreamPin> {
  if (!isAbsolute(input.producerReceiptPath) || !isAbsolute(input.outputPath)) {
    throw new Error("Producer receipt and output paths must be absolute");
  }
  const status = await gitText(input.repositoryRoot, ["status", "--porcelain"]);
  if (status.length > 0) throw new Error("Tracker checkout must be clean before pin rendering");
  const head = await gitText(input.repositoryRoot, ["rev-parse", "HEAD"]);
  const receiptRelativePath = relative(input.repositoryRoot, input.consumerReceiptPath);
  assertSafeRepositoryPath(receiptRelativePath);
  const [consumerFile, committedConsumerBytes, producerFile] = await Promise.all([
    readReceiptFile<Plan042ClosureReceipt>(Plan042ClosureReceiptSchema, input.consumerReceiptPath),
    gitBytes(input.repositoryRoot, head, receiptRelativePath),
    readReceiptFile<Plan041ProducerHandoff>(
      Plan041ProducerHandoffSchema,
      input.producerReceiptPath,
    ),
  ]);
  if (sha256Bytes(committedConsumerBytes) !== sha256Bytes(consumerFile.bytes)) {
    throw new Error("Consumer receipt is not the exact tracker HEAD receipt");
  }
  if (
    sha256Bytes(producerFile.bytes) !== consumerFile.artifact.producer.handoff_sha256 ||
    producerFile.artifact.release_id !== consumerFile.artifact.producer.release_id ||
    producerFile.artifact.manifest_sha256 !== consumerFile.artifact.producer.manifest_sha256
  ) {
    throw new Error("Producer and consumer receipt identities disagree");
  }
  await verifyPlan042ClosureReceipt({
    repositoryRoot: input.repositoryRoot,
    receiptPath: input.consumerReceiptPath,
  });
  const pinnedAt = (input.now ?? (() => new Date()))().toISOString();
  const output = projectPlan042DownstreamPin({
    producer: producerFile.artifact,
    consumer: consumerFile.artifact,
    consumerReceiptPath: receiptRelativePath,
    consumerReceiptSha256: sha256Bytes(consumerFile.bytes),
    receiptCommit: head,
    pinnedAt,
  });
  const directory = dirname(input.outputPath);
  const temporaryPath = join(
    directory,
    `.${basename(input.outputPath)}.tmp-${process.pid}-${Date.now()}`,
  );
  try {
    await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    await rename(temporaryPath, input.outputPath);
  } catch (cause) {
    await rm(temporaryPath, { force: true });
    throw cause;
  }
  return output;
}
