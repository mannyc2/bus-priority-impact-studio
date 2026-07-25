import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  type Plan042ClosureReceipt,
  Plan042ClosureReceiptSchema,
  Plan042IndependentReviewReceiptSchema,
  Plan042ReviewHandoffArtifactSchema,
} from "@bp/domain/studio/member-grain-outcomes";
import {
  buildPlan042AcceptanceManifest,
  PLAN042_IMPLEMENTATION_PATHS,
} from "../../src/lib/plan042-acceptance.ts";
import {
  projectPlan042DownstreamPin,
  renderPlan042DownstreamPin,
  verifyPlan042ClosureReceipt,
} from "../../src/lib/plan042-closure-receipt.ts";
import {
  PLAN042_PRODUCER_HANDOFF_SHA256,
  type Plan041ProducerHandoff,
  Plan041ProducerHandoffSchema,
  sha256Bytes,
} from "../../src/lib/plan042-member-grain.ts";
import { finalizePlan042ReviewHandoff } from "../../src/lib/plan042-review-finalizer.ts";
import { decodeSchemaStrict } from "../../src/lib/schema-decode.ts";

const BASELINE_COMMIT = "b25542b0a735636e7051be8fb70893499671366f";
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

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const sourceArtifactDir = join(repositoryRoot, "docs/research/reviews/closure-plan-042/artifacts");
const producerFixturePath = resolve(import.meta.dir, "../fixtures/plan042-producer-handoff.json");

type Fixture = {
  readonly root: string;
  readonly repository: string;
  readonly receiptPath: string;
  readonly consumerCommit: string;
  readonly receiptCommit: string;
  readonly receipt: Plan042ClosureReceipt;
  readonly producer: Plan041ProducerHandoff;
  readonly producerReceiptPath: string;
};

async function command(cwd: string, args: readonly string[]): Promise<string> {
  const process = Bun.spawn([...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`${args.join(" ")} failed: ${stderr}`);
  }
  return stdout.trim();
}

async function bytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path));
}

async function json<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fileReceipt(path: string, repository: string) {
  const value = await bytes(join(repository, path));
  return { path, bytes: value.byteLength, sha256: sha256Bytes(value) };
}

async function gitFileBytes(repository: string, commit: string, path: string): Promise<Uint8Array> {
  const process = Bun.spawn(["git", "show", `${commit}:${path}`], {
    cwd: repository,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(`git show failed: ${stderr}`);
  return new Uint8Array(stdout);
}

function verificationBaseline() {
  const phase = (exitCode: number, logSha256: string, status: string) => ({
    exit_code: exitCode,
    log_sha256: logSha256,
    byte_count: 1,
    line_count: 1,
    status,
  });
  return {
    protected_commit: BASELINE_COMMIT,
    baseline: {
      check_style: {
        ...phase(
          1,
          "09e7075ece995d92804e7f481fb420594d3cc5e143ca1696994789db604a10c6",
          "pinned_baseline",
        ),
        error_count: 6,
        warning_count: 39,
        info_count: 514,
        file_count: 1107,
      },
      check_architecture: {
        ...phase(0, "4dc4f5ce49bf4d79216f53a4c00b02949e9582805b876e184462a164c3dd39a7", "pass"),
        pass_count: 42,
        fail_count: 0,
      },
      test_unit: {
        ...phase(0, "0a16ce191a70f143d7715629649f35590aa79aa04a999c4c4a9b95d4a027af1c", "pass"),
        pass_count: 1056,
        fail_count: 0,
      },
      test_web: {
        ...phase(0, "63ff40e037a2a25147f54c77634513f23adf51f4865553d7348521a99b4e111d", "pass"),
        pass_count: 342,
        fail_count: 0,
      },
      test_worker: {
        ...phase(
          1,
          "b4f2a914a8841f2d118d24e6f72de96e6d8a61c9260930e175b32ea76a39425f",
          "pinned_baseline",
        ),
        failure_signature: "listen EPERM 127.0.0.1",
      },
    },
    final: {
      check_style: phase(1, "1".repeat(64), "matches_baseline"),
      check_architecture: phase(0, "2".repeat(64), "pass"),
      test_unit: phase(0, "3".repeat(64), "pass"),
      test_web: phase(0, "4".repeat(64), "pass"),
      test_worker: phase(1, "5".repeat(64), "matches_listen_eperm_baseline"),
    },
    zero_additional_failures: true,
  };
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "plan042-receipt-test-"));
  const producerReceiptPath = join(root, "plan-041-producer-handoff.json");
  await writeFile(
    producerReceiptPath,
    `${JSON.stringify(await json<unknown>(producerFixturePath))}\n`,
  );
  expect(sha256Bytes(await bytes(producerReceiptPath))).toBe(PLAN042_PRODUCER_HANDOFF_SHA256);
  const repository = join(root, "tracker");
  await command(root, ["git", "clone", "--shared", repositoryRoot, repository]);
  await command(repository, ["git", "checkout", "--detach", BASELINE_COMMIT]);
  await command(repository, ["git", "config", "user.email", "plan042@example.invalid"]);
  await command(repository, ["git", "config", "user.name", "Plan 042 Test"]);
  for (const path of PLAN042_IMPLEMENTATION_PATHS) {
    await mkdir(dirname(join(repository, path)), { recursive: true });
    await copyFile(join(repositoryRoot, path), join(repository, path));
  }
  const artifactDir = join(repository, "docs/research/reviews/closure-plan-042/artifacts");
  await mkdir(artifactDir, { recursive: true });
  for (const name of await readdir(sourceArtifactDir)) {
    if (name.endsWith(".json")) {
      await copyFile(join(sourceArtifactDir, name), join(artifactDir, name));
    }
  }
  await copyFile(
    join(sourceArtifactDir, "pending-review-handoff.json"),
    join(artifactDir, "review-handoff.json"),
  );
  const replayArtifactDir = join(root, "replay-artifacts");
  await mkdir(replayArtifactDir, { recursive: true });
  for (const name of await readdir(sourceArtifactDir)) {
    if (name.endsWith(".json")) {
      await copyFile(join(sourceArtifactDir, name), join(replayArtifactDir, name));
    }
  }
  await copyFile(
    join(sourceArtifactDir, "pending-review-handoff.json"),
    join(replayArtifactDir, "review-handoff.json"),
  );
  const verificationDir = join(repository, "docs/research/reviews/closure-plan-042/verification");
  await mkdir(verificationDir, { recursive: true });
  for (const name of ["focused", "typecheck", "validation", "replay"]) {
    await writeFile(join(verificationDir, `${name}.log`), `${name}: pass\n`);
  }
  const acceptance = await buildPlan042AcceptanceManifest({
    repositoryRoot: repository,
    artifactDir,
    replayArtifactDir,
    focusedLogPath: join(verificationDir, "focused.log"),
    typecheckLogPath: join(verificationDir, "typecheck.log"),
    validationLogPath: join(verificationDir, "validation.log"),
    replayLogPath: join(verificationDir, "replay.log"),
    focusedCommand: "bun test exact-plan042-focused-files --timeout 30000",
    typecheckCommand: "bun run check:types",
    validationCommand: "bun run pipeline -- study certify-member-grain-outcomes --exact-pins",
    replayCommand: "bun run pipeline -- study certify-member-grain-outcomes --exact-pins --replay",
  });
  const acceptancePath = "docs/research/reviews/closure-plan-042/acceptance-manifest.json";
  await writeJson(join(repository, acceptancePath), acceptance);
  const acceptanceSha256 = sha256Bytes(await bytes(join(repository, acceptancePath)));
  const pendingHandoff = decodeSchemaStrict(
    Plan042ReviewHandoffArtifactSchema,
    await json(`${artifactDir}/review-handoff.json`),
  );
  const routinePackageIds = pendingHandoff.package_results
    .filter((result) => result.risk_class === "routine")
    .map((result) => result.package_id)
    .toSorted();
  const riskyPackageIds = pendingHandoff.package_results
    .filter((result) => result.risk_class === "risky")
    .map((result) => result.package_id)
    .toSorted();
  const reviewDir = join(repository, "docs/research/reviews/closure-plan-042/independent-reviews");
  const reviewAPath = "docs/research/reviews/closure-plan-042/independent-reviews/reviewer-a.json";
  const reviewBPath = "docs/research/reviews/closure-plan-042/independent-reviews/reviewer-b.json";
  const review = (reviewerId: string, packageIds: readonly string[]) =>
    decodeSchemaStrict(Plan042IndependentReviewReceiptSchema, {
      artifact_kind: "bp.plan042.independent-review-receipt.v1",
      schema_version: 1,
      reviewer_id: reviewerId,
      reviewed_acceptance_manifest: {
        path: acceptancePath,
        sha256: acceptanceSha256,
      },
      reviewed_review_cut_id: pendingHandoff.review_cut_id,
      package_ids: packageIds,
      verdict: "approve",
      findings: [],
      authority: { authorizes_study: false, authorizes_publication: false },
    });
  await mkdir(reviewDir, { recursive: true });
  await writeJson(
    join(repository, reviewAPath),
    review("independent-reviewer-a", [...routinePackageIds, ...riskyPackageIds].toSorted()),
  );
  await writeJson(join(repository, reviewBPath), review("independent-reviewer-b", riskyPackageIds));
  const reviewASha256 = sha256Bytes(await bytes(join(repository, reviewAPath)));
  const reviewBSha256 = sha256Bytes(await bytes(join(repository, reviewBPath)));
  expect(reviewASha256).toMatch(/^[a-f0-9]{64}$/);
  expect(reviewBSha256).toMatch(/^[a-f0-9]{64}$/);
  const reviewedHandoff = await finalizePlan042ReviewHandoff({
    repositoryRoot: repository,
    pendingHandoffPath: join(artifactDir, "pending-review-handoff.json"),
    acceptanceManifestPath: join(repository, acceptancePath),
    reviewReceiptDir: reviewDir,
  });
  await writeJson(`${artifactDir}/review-handoff.json`, reviewedHandoff);
  await command(repository, [
    "git",
    "add",
    "docs/research/reviews/closure-plan-042",
    ...PLAN042_IMPLEMENTATION_PATHS,
  ]);
  await command(repository, ["git", "commit", "-m", "Add Plan 042 consumer artifacts"]);
  const consumerCommit = await command(repository, ["git", "rev-parse", "HEAD"]);

  const artifact = async (name: string) =>
    fileReceipt(`docs/research/reviews/closure-plan-042/artifacts/${name}`, repository);
  const producerImport = await json<Record<string, number>>(`${artifactDir}/producer-import.json`);
  const candidateSet = await json<{
    candidate_set_id: string;
    summary: { candidate_count: number };
    approval_state: string;
  }>(`${artifactDir}/candidate-set-v5.json`);
  const memberGrain = await json<{
    row_count: number;
    source: { member_extent_projection_sha256: string };
  }>(`${artifactDir}/member-grain-import.json`);
  const extentBinding = await json<{
    row_count: number;
    disposition_histogram: Record<string, number>;
  }>(`${artifactDir}/extent-segment-bindings.json`);
  const grainVerdict = await json<{
    row_count: number;
    denominator: Record<string, number>;
    family_by_verdict_histogram: Record<string, Record<string, number>>;
  }>(`${artifactDir}/grain-verdict-matrix.json`);
  const handoffReceipt = await artifact("review-handoff.json");
  const acceptanceReceipt = await fileReceipt(acceptancePath, repository);
  const protectedEntries = await Promise.all(
    PROTECTED_PATHS.map(async (path) => {
      const baseline = await gitFileBytes(repository, BASELINE_COMMIT, path);
      const consumer = await gitFileBytes(repository, consumerCommit, path);
      return {
        path,
        baseline_sha256: sha256Bytes(baseline),
        consumer_sha256: sha256Bytes(consumer),
      };
    }),
  );
  const receipt = decodeSchemaStrict(Plan042ClosureReceiptSchema, {
    schema_version: 1,
    contract_id: "bp.plan042.closure-receipt.v1",
    consumer: "bus-reliability-tracker",
    producer: {
      release_id: "v1-rc28",
      manifest_sha256: "b47a105dc78501210f2d32e6f597f878203b8cfc35654cebc4de445d575a453c",
      handoff_path: "data/quality/study-frontier-closure/plan-041-producer-handoff.json",
      handoff_sha256: "986dfc18adc7867975c338e960eb99fa808cb585a091073887f744427e471aec",
    },
    consumer_commit: consumerCommit,
    import: {
      ...(await artifact("producer-import.json")),
      source_occurrence_count: producerImport["source_occurrence_count"],
      eligible_occurrence_count: producerImport["eligible_occurrence_count"],
      route_projection_count: producerImport["route_projection_count"],
      complete_occurrence_route_count: producerImport["complete_occurrence_route_count"],
    },
    candidate_set: {
      ...(await artifact("candidate-set-v5.json")),
      candidate_set_id: candidateSet.candidate_set_id,
      candidate_count: candidateSet.summary.candidate_count,
      approval_state: candidateSet.approval_state,
    },
    member_grain_import: {
      ...(await artifact("member-grain-import.json")),
      row_count: memberGrain.row_count,
      member_extent_projection_sha256: memberGrain.source.member_extent_projection_sha256,
    },
    extent_binding: {
      ...(await artifact("extent-segment-bindings.json")),
      row_count: extentBinding.row_count,
      disposition_histogram: extentBinding.disposition_histogram,
    },
    grain_verdict: {
      ...(await artifact("grain-verdict-matrix.json")),
      row_count: grainVerdict.row_count,
      denominator: grainVerdict.denominator,
      family_by_verdict_histogram: grainVerdict.family_by_verdict_histogram,
    },
    review_handoff: {
      ...handoffReceipt,
      review_cut_id: reviewedHandoff.review_cut_id,
      row_count: reviewedHandoff.row_count,
      status: reviewedHandoff.status,
      approval_applied: false,
    },
    acceptance_manifest: {
      ...acceptanceReceipt,
      review_cut_id: acceptance.review_cut_id,
      artifact_count: acceptance.artifacts.length,
      package_count: acceptance.package_results.length,
    },
    operator_authorization: {
      authorization_id: "mta-wiki-owner-2026-07-22-all-closure-plans",
      scope: "internal_analyst_stop_set_admission",
      recorded_decision:
        "versioned_analyst_grain_allowed_only_with_candidate_coverage_and_reviewed_stop_id_lineage",
      source_plan: "plans/106-member-grain-outcome-certification.md",
    },
    verification_baseline: verificationBaseline(),
    authority: {
      authorizes_study: false,
      authorizes_publication: false,
      authorizes_d1_r2_mutation: false,
      authorizes_deploy: false,
    },
    protected_surfaces: {
      protected_baseline_commit: BASELINE_COMMIT,
      entries: protectedEntries,
    },
  });
  const receiptPath = "docs/research/reviews/closure-plan-042/downstream-pin-receipt.json";
  await writeJson(join(repository, receiptPath), receipt);
  await command(repository, ["git", "add", receiptPath]);
  await command(repository, ["git", "commit", "-m", "Add Plan 042 closure receipt"]);
  const receiptCommit = await command(repository, ["git", "rev-parse", "HEAD"]);
  const producer = decodeSchemaStrict(
    Plan041ProducerHandoffSchema,
    await json(producerReceiptPath),
  );
  return {
    root,
    repository,
    receiptPath: join(repository, receiptPath),
    consumerCommit,
    receiptCommit,
    receipt,
    producer,
    producerReceiptPath,
  };
}

async function cloneFixture(fixture: Fixture, name: string): Promise<string> {
  const target = join(fixture.root, name);
  await command(fixture.root, ["git", "clone", "--shared", fixture.repository, target]);
  await command(target, ["git", "config", "user.email", "plan042@example.invalid"]);
  await command(target, ["git", "config", "user.name", "Plan 042 Test"]);
  return target;
}

let fixture: Fixture;

beforeAll(async () => {
  fixture = await createFixture();
}, 30_000);

afterAll(async () => {
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
});

describe("Plan 042 closure receipt and downstream projection", () => {
  test("strictly verifies the committed authority-false receipt", async () => {
    await expect(
      verifyPlan042ClosureReceipt({
        repositoryRoot: fixture.repository,
        receiptPath: fixture.receiptPath,
      }),
    ).resolves.toMatchObject({
      status: "verified",
      consumerCommit: fixture.consumerCommit,
      grainVerdictRowCount: 695,
      protectedSurfaceCount: 18,
    });
  });

  test("rejects unknown fields, placeholder commits, and any authority elevation", () => {
    expect(() =>
      decodeSchemaStrict(Plan042ClosureReceiptSchema, {
        ...fixture.receipt,
        unknown: true,
      }),
    ).toThrow();
    expect(() =>
      decodeSchemaStrict(Plan042ClosureReceiptSchema, {
        ...fixture.receipt,
        consumer_commit: "b25542b0",
      }),
    ).toThrow();
    expect(() =>
      decodeSchemaStrict(Plan042ClosureReceiptSchema, {
        ...fixture.receipt,
        authority: { ...fixture.receipt.authority, authorizes_study: true },
      }),
    ).toThrow();
  });

  test("rejects a consumer-commit addressed artifact hash mismatch", async () => {
    const repository = await cloneFixture(fixture, "artifact-mismatch");
    const receiptPath = join(
      repository,
      "docs/research/reviews/closure-plan-042/downstream-pin-receipt.json",
    );
    const receipt = await json<Plan042ClosureReceipt>(receiptPath);
    await writeJson(receiptPath, {
      ...receipt,
      import: { ...receipt.import, sha256: "0".repeat(64) },
    });
    await command(repository, ["git", "add", receiptPath]);
    await command(repository, ["git", "commit", "-m", "Tamper artifact pin"]);
    await expect(
      verifyPlan042ClosureReceipt({ repositoryRoot: repository, receiptPath }),
    ).rejects.toThrow("consumer-commit byte/hash mismatch");
  });

  test("rejects a protected-surface mutation even with matching declared bytes", async () => {
    const repository = await cloneFixture(fixture, "protected-mutation");
    await command(repository, ["git", "checkout", "--detach", fixture.consumerCommit]);
    const protectedPath = PROTECTED_PATHS[0];
    const absoluteProtectedPath = join(repository, protectedPath);
    await writeFile(
      absoluteProtectedPath,
      `${await readFile(absoluteProtectedPath, "utf8")}\n// mutation\n`,
    );
    await command(repository, ["git", "add", protectedPath]);
    await command(repository, ["git", "commit", "-m", "Mutate protected surface"]);
    const consumerCommit = await command(repository, ["git", "rev-parse", "HEAD"]);
    const receiptPath = join(
      repository,
      "docs/research/reviews/closure-plan-042/downstream-pin-receipt.json",
    );
    const receipt = structuredClone(fixture.receipt);
    const mutatedBytes = await gitFileBytes(repository, consumerCommit, protectedPath);
    const entries = receipt.protected_surfaces.entries.map((entry) =>
      entry.path === protectedPath
        ? { ...entry, consumer_sha256: sha256Bytes(mutatedBytes) }
        : entry,
    );
    await writeJson(receiptPath, {
      ...receipt,
      consumer_commit: consumerCommit,
      protected_surfaces: { ...receipt.protected_surfaces, entries },
    });
    await command(repository, ["git", "add", receiptPath]);
    await command(repository, ["git", "commit", "-m", "Address mutated consumer"]);
    await expect(
      verifyPlan042ClosureReceipt({ repositoryRoot: repository, receiptPath }),
    ).rejects.toThrow("protected surface changed");
  });

  test("rejects implementation bytes changed after independent review", async () => {
    const repository = await cloneFixture(fixture, "implementation-mutation");
    await command(repository, ["git", "checkout", "--detach", fixture.consumerCommit]);
    const implementationPath = "tools/pipeline-v2/src/cli/registry.ts";
    const absoluteImplementationPath = join(repository, implementationPath);
    await writeFile(
      absoluteImplementationPath,
      `${await readFile(absoluteImplementationPath, "utf8")}\n// post-review mutation\n`,
    );
    await command(repository, ["git", "add", implementationPath]);
    await command(repository, ["git", "commit", "-m", "Mutate reviewed implementation"]);
    const consumerCommit = await command(repository, ["git", "rev-parse", "HEAD"]);
    const receiptPath = join(
      repository,
      "docs/research/reviews/closure-plan-042/downstream-pin-receipt.json",
    );
    await writeJson(receiptPath, {
      ...fixture.receipt,
      consumer_commit: consumerCommit,
    });
    await command(repository, ["git", "add", receiptPath]);
    await command(repository, ["git", "commit", "-m", "Address mutated implementation"]);
    await expect(
      verifyPlan042ClosureReceipt({ repositoryRoot: repository, receiptPath }),
    ).rejects.toThrow("reviewed implementation bytes changed");
  });

  test("projects deterministically and rejects a receipt-commit/downstream mismatch", async () => {
    const receiptBytes = await bytes(fixture.receiptPath);
    const pinnedAt = "2026-07-25T00:00:00.000Z";
    const input = {
      producer: fixture.producer,
      consumer: fixture.receipt,
      consumerReceiptPath: "docs/research/reviews/closure-plan-042/downstream-pin-receipt.json",
      consumerReceiptSha256: sha256Bytes(receiptBytes),
      receiptCommit: fixture.receiptCommit,
      pinnedAt,
    };
    const first = projectPlan042DownstreamPin(input);
    expect(projectPlan042DownstreamPin(input)).toEqual(first);
    expect(first.authority).toEqual({
      authorizes_study: false,
      authorizes_publication: false,
      authorizes_d1_r2_mutation: false,
      authorizes_deploy: false,
    });
    const wikiRoot = join(fixture.root, "wiki");
    const downstreamPath = join(wikiRoot, "data/quality/downstream-pin.json");
    const wikiProducerPath = join(
      wikiRoot,
      "data/quality/study-frontier-closure/plan-041-producer-handoff.json",
    );
    await mkdir(dirname(wikiProducerPath), { recursive: true });
    await copyFile(fixture.producerReceiptPath, wikiProducerPath);
    await writeJson(downstreamPath, {
      ...first,
      consumer_receipt: {
        ...first.consumer_receipt,
        receipt_commit: fixture.consumerCommit,
      },
    });
    await expect(
      verifyPlan042ClosureReceipt({
        repositoryRoot: fixture.repository,
        receiptPath: fixture.receiptPath,
        downstreamPinPath: downstreamPath,
      }),
    ).rejects.toThrow("downstream pin");
  });

  test("renderer refuses a dirty tracker before any atomic output write", async () => {
    const repository = await cloneFixture(fixture, "dirty-render");
    await writeFile(join(repository, "dirty.txt"), "dirty\n");
    const output = join(fixture.root, "dirty-output.json");
    await expect(
      renderPlan042DownstreamPin({
        repositoryRoot: repository,
        producerReceiptPath: fixture.producerReceiptPath,
        consumerReceiptPath: join(
          repository,
          "docs/research/reviews/closure-plan-042/downstream-pin-receipt.json",
        ),
        outputPath: output,
        now: () => new Date("2026-07-25T00:00:00.000Z"),
      }),
    ).rejects.toThrow("clean");
  });

  test("finalizer rejects an under-reviewed risky package", async () => {
    const repository = await cloneFixture(fixture, "under-reviewed-finalizer");
    const reviewDir = join(
      repository,
      "docs/research/reviews/closure-plan-042/independent-reviews",
    );
    await rm(join(reviewDir, "reviewer-b.json"));
    await expect(
      finalizePlan042ReviewHandoff({
        repositoryRoot: repository,
        pendingHandoffPath: join(
          repository,
          "docs/research/reviews/closure-plan-042/artifacts/pending-review-handoff.json",
        ),
        acceptanceManifestPath: join(
          repository,
          "docs/research/reviews/closure-plan-042/acceptance-manifest.json",
        ),
        reviewReceiptDir: reviewDir,
      }),
    ).rejects.toThrow("insufficient independent review receipts");
  });

  test("finalizer rejects an independent-review target hash mismatch", async () => {
    const repository = await cloneFixture(fixture, "review-target-mismatch");
    const reviewDir = join(
      repository,
      "docs/research/reviews/closure-plan-042/independent-reviews",
    );
    const reviewPath = join(reviewDir, "reviewer-b.json");
    const review = await json<Record<string, unknown>>(reviewPath);
    await writeJson(reviewPath, {
      ...review,
      reviewed_acceptance_manifest: {
        ...(review["reviewed_acceptance_manifest"] as Record<string, unknown>),
        sha256: "0".repeat(64),
      },
    });
    await expect(
      finalizePlan042ReviewHandoff({
        repositoryRoot: repository,
        pendingHandoffPath: join(
          repository,
          "docs/research/reviews/closure-plan-042/artifacts/pending-review-handoff.json",
        ),
        acceptanceManifestPath: join(
          repository,
          "docs/research/reviews/closure-plan-042/acceptance-manifest.json",
        ),
        reviewReceiptDir: reviewDir,
      }),
    ).rejects.toThrow("independent review target drifted");
  });

  test("acceptance freeze never clobbers differing frozen pending bytes", async () => {
    const repository = await cloneFixture(fixture, "pending-freeze-clobber");
    const artifactDir = join(repository, "docs/research/reviews/closure-plan-042/artifacts");
    const pendingPath = join(artifactDir, "pending-review-handoff.json");
    const originalPendingBytes = await bytes(pendingPath);
    const pending = await json<{
      package_results: readonly Record<string, unknown>[];
    }>(pendingPath);
    await writeJson(join(artifactDir, "review-handoff.json"), {
      ...pending,
      package_results: pending.package_results.map((result, index) =>
        index === 0 ? { ...result, package_id: "different-pending-package" } : result,
      ),
    });
    const verificationDir = join(repository, "docs/research/reviews/closure-plan-042/verification");
    await expect(
      buildPlan042AcceptanceManifest({
        repositoryRoot: repository,
        artifactDir,
        replayArtifactDir: sourceArtifactDir,
        focusedLogPath: join(verificationDir, "focused.log"),
        typecheckLogPath: join(verificationDir, "typecheck.log"),
        validationLogPath: join(verificationDir, "validation.log"),
        replayLogPath: join(verificationDir, "replay.log"),
        focusedCommand: "focused",
        typecheckCommand: "typecheck",
        validationCommand: "validation",
        replayCommand: "replay",
      }),
    ).rejects.toThrow("Frozen pending review handoff differs");
    expect(await bytes(pendingPath)).toEqual(originalPendingBytes);
  });
});
