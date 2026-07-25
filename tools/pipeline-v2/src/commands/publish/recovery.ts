import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { join } from "node:path";
import {
  type Plan097ActivationBundle,
  Plan097ActivationBundleSchema,
  Plan097HttpBaselineSchema,
  type Plan097OperationRequest,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
  type Plan097OperationUsage,
  type Plan097PreflightReceipt,
  Plan097PreflightReceiptSchema,
  Plan097RecoveryArtifactManifestSchema,
  Plan097RestoreBundleSchema,
  plan097PreflightSignedPayloadBytes,
} from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { fromCliPath, fromRepoRoot } from "../../lib/paths.ts";
import { comparePlan097HttpBaselines, runPlan097HttpCheck } from "../../lib/plan097-http-check.ts";

type RecoveryAction = "dry-run" | "prove" | "activate" | "resume" | "rollback";

export type PublishRecoveryInputs = {
  action: RecoveryAction;
  endpoint: string;
  activationBundlePath: string;
  artifactManifestPath: string;
  artifactRoot: string;
  restoreBundlePath?: string | undefined;
  restoreBundleSha256?: string | undefined;
  httpBaselinePath?: string | undefined;
  publicBaseUrl?: string | undefined;
  serviceTokenId: string;
  serviceTokenSecret: string;
  bootstrapToken?: string | undefined;
  executionToken?: string | undefined;
  preflightReceiptSha256?: string | undefined;
  preflightPublicKeyPath?: string | undefined;
  expectedCandidateId?: string | undefined;
  expectedOperationId?: string | undefined;
  proofSummaryRef?:
    | {
        kind: "proof-summary";
        key: string;
        sha256: string;
        bytes: number;
      }
    | undefined;
};

export type PublishRecoveryCliOptions = {
  action: RecoveryAction;
  candidate?: string | undefined;
  operation?: string | undefined;
  proofEnv?: "plan097-proof" | undefined;
  endpoint?: string | undefined;
  activationBundle?: string | undefined;
  artifactManifest?: string | undefined;
  artifactRoot?: string | undefined;
  restoreBundle?: string | undefined;
  httpBaseline?: string | undefined;
  baseUrl?: string | undefined;
  preflightPublicKey?: string | undefined;
  receiptSha256?: string | undefined;
};

export type PublishRecoveryResult = {
  schemaVersion: 1;
  action: RecoveryAction;
  operationId: string;
  activationBundleSha256: string;
  restoreBundleSha256: string | null;
  outcome: "pass" | "rolled_back";
  remoteReceipts: string[];
  preflightAttestation: {
    receiptSha256: string;
    keyId: string;
    publicKeySpkiSha256: string;
  } | null;
  httpComparisons: Array<{
    phase:
      | "preflight-baseline"
      | "proof-baseline"
      | "injected-failure"
      | "candidate-active"
      | "baseline-restored"
      | "production-baseline"
      | "production-active";
    baseline: typeof Plan097HttpBaselineSchema.Type;
  }>;
  proofSummary: NonNullable<Plan097OperationResponse["evidence"]>[number] | null;
  completion: NonNullable<Plan097OperationResponse["evidence"]>[number] | null;
};

type PublishRecoveryDependencies = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  httpCheck?: typeof runPlan097HttpCheck | undefined;
  verifyPreflightReceipt?: typeof verifyReturnedPlan097Preflight | undefined;
};

type RemoteResponseTracker = Plan097OperationResponse[];

const defaultDependencies: PublishRecoveryDependencies = {
  fetch: (input, init) => fetch(input, init),
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export async function verifyReturnedPlan097Preflight(
  response: Plan097OperationResponse,
  publicKeyPath: string | undefined,
): Promise<{
  receiptSha256: string;
  keyId: string;
  publicKeySpkiSha256: string;
}> {
  if (response.action !== "preflight" || response.preflightReceiptBase64 === undefined) {
    throw new Error("Plan 097 preflight response did not return the signed receipt bytes");
  }
  if (publicKeyPath === undefined) {
    throw new Error(
      "Plan 097 dry-run requires --preflight-public-key for independent verification",
    );
  }
  const receiptBytes = Buffer.from(response.preflightReceiptBase64, "base64");
  if (
    receiptBytes.byteLength === 0 ||
    receiptBytes.toString("base64") !== response.preflightReceiptBase64
  ) {
    throw new Error("Plan 097 preflight response contains invalid base64 receipt bytes");
  }
  const receiptSha256 = sha256(receiptBytes);
  const evidence = response.evidence?.find((entry) => entry.kind === "preflight");
  if (
    evidence === undefined ||
    evidence.sha256 !== receiptSha256 ||
    evidence.bytes !== receiptBytes.byteLength
  ) {
    throw new Error("Plan 097 preflight response bytes do not match durable R2 evidence");
  }
  const receipt = decodeStrict(Plan097PreflightReceiptSchema)(
    JSON.parse(receiptBytes.toString("utf8")),
  );
  const keyBytes = Buffer.from(await Bun.file(publicKeyPath).arrayBuffer());
  const keyText = keyBytes.toString("utf8");
  const publicKey = keyText.includes("-----BEGIN PUBLIC KEY-----")
    ? createPublicKey(keyText)
    : createPublicKey({ key: keyBytes, format: "der", type: "spki" });
  const publicKeySpki = publicKey.export({ format: "der", type: "spki" });
  const publicKeySpkiSha256 = sha256(publicKeySpki);
  if (publicKeySpkiSha256 !== receipt.signature.publicKeySpkiSha256) {
    throw new Error("Plan 097 preflight signing key fingerprint does not match the trusted key");
  }
  const { signature, ...unsignedReceipt } = receipt;
  const verified = verifySignature(
    null,
    plan097PreflightSignedPayloadBytes(
      unsignedReceipt as Omit<Plan097PreflightReceipt, "signature">,
    ),
    publicKey,
    Buffer.from(signature.signatureBase64, "base64"),
  );
  if (!verified) {
    throw new Error("Plan 097 preflight Ed25519 signature verification failed");
  }
  return {
    receiptSha256,
    keyId: signature.keyId,
    publicKeySpkiSha256,
  };
}

async function readStrictActivationBundle(path: string): Promise<{
  bundle: Plan097ActivationBundle;
  sha256: string;
}> {
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const bundle = decodeStrict(Plan097ActivationBundleSchema)(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  return { bundle, sha256: sha256(bytes) };
}

async function readOptionalRestoreSha256(
  path: string | undefined,
  declaredSha256: string | undefined,
  activation: Plan097ActivationBundle,
): Promise<string | null> {
  if (path === undefined) return declaredSha256 ?? null;
  const bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
  const restore = decodeStrict(Plan097RestoreBundleSchema)(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  if (
    restore.operationId !== activation.operationId ||
    restore.candidate.releaseId !== activation.candidate.releaseId
  ) {
    throw new Error("Plan 097 restore bundle identity does not match the activation bundle");
  }
  const actualSha256 = sha256(bytes);
  if (declaredSha256 !== undefined && declaredSha256 !== actualSha256) {
    throw new Error("Plan 097 restore bundle SHA-256 differs from its configured allowlist");
  }
  return actualSha256;
}

async function readHttpBaseline(path: string | undefined) {
  if (path === undefined) {
    throw new Error("Plan 097 dry-run requires --http-baseline from the release-aware checker");
  }
  return decodeStrict(Plan097HttpBaselineSchema)(await Bun.file(path).json());
}

async function resolveHttpBaseline(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
}) {
  if (input.inputs.httpBaselinePath !== undefined) {
    return readHttpBaseline(input.inputs.httpBaselinePath);
  }
  if (input.inputs.publicBaseUrl === undefined) {
    throw new Error(
      "Plan 097 dry-run requires --base-url or --http-baseline from the release-aware checker",
    );
  }
  return (
    await (input.dependencies.httpCheck ?? runPlan097HttpCheck)({
      baseUrl: input.inputs.publicBaseUrl,
      fetch: input.dependencies.fetch,
      mode: "baseline",
    })
  ).baseline;
}

async function revalidateProductionBaseline(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
}) {
  if (input.inputs.publicBaseUrl === undefined || input.inputs.httpBaselinePath === undefined) {
    throw new Error("Plan 097 activation requires --base-url and the signed --http-baseline");
  }
  const expected = await readHttpBaseline(input.inputs.httpBaselinePath);
  const actual = (
    await (input.dependencies.httpCheck ?? runPlan097HttpCheck)({
      baseUrl: input.inputs.publicBaseUrl,
      fetch: input.dependencies.fetch,
      mode: "baseline",
      expectedReleaseId: expected.activeReleaseId,
    })
  ).baseline;
  comparePlan097HttpBaselines({ expected, actual });
  return expected;
}

function collectResponseReceipts(response: Plan097OperationResponse, receipts: string[]): void {
  receipts.push(response.receiptKey, ...(response.evidence?.map((entry) => entry.key) ?? []));
}

function requireOperationToken(
  inputs: PublishRecoveryInputs,
  kind: "bootstrap" | "execution",
): string {
  const token = kind === "bootstrap" ? inputs.bootstrapToken : inputs.executionToken;
  if (token === undefined || token.length === 0) {
    throw new Error(
      kind === "bootstrap"
        ? "Plan 097 dry-run requires the isolated PLAN097_BOOTSTRAP_TOKEN"
        : `Plan 097 ${inputs.action} requires the fresh PLAN097_EXECUTION_TOKEN authorization`,
    );
  }
  return token;
}

async function remoteCall(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
  request: Plan097OperationRequest;
  execute: boolean;
  tokenKind?: "bootstrap" | "execution" | undefined;
  tracker?: RemoteResponseTracker | undefined;
}): Promise<Plan097OperationResponse> {
  const headers = new Headers({
    "Content-Type": "application/json",
    "CF-Access-Client-Id": input.inputs.serviceTokenId,
    "CF-Access-Client-Secret": input.inputs.serviceTokenSecret,
  });
  if (input.execute) {
    headers.set(
      "X-Plan097-Execution-Token",
      requireOperationToken(input.inputs, input.tokenKind ?? "execution"),
    );
  }
  const response = await input.dependencies.fetch(input.inputs.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(input.request),
  });
  const responseText = await response.text();
  let body: unknown;
  try {
    body = JSON.parse(responseText);
  } catch {
    throw new Error(
      `Plan 097 Worker ${input.request.action} returned non-JSON HTTP ${response.status}`,
    );
  }
  if (!response.ok) {
    const diagnostic =
      typeof body === "object" &&
      body !== null &&
      "diagnosticSha256" in body &&
      typeof body.diagnosticSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(body.diagnosticSha256)
        ? ` (diagnostic ${body.diagnosticSha256})`
        : "";
    const schemaDiagnostic =
      typeof body === "object" &&
      body !== null &&
      "actualSchemaTableSha256" in body &&
      Array.isArray(body.actualSchemaTableSha256)
        ? ` (schema-table-sha256 ${JSON.stringify(body.actualSchemaTableSha256)})`
        : "";
    throw new Error(
      `Plan 097 Worker ${input.request.action} failed with HTTP ${response.status}${diagnostic}${schemaDiagnostic}`,
    );
  }
  const decoded = decodeStrict(Plan097OperationResponseSchema)(body);
  input.tracker?.push(decoded);
  return decoded;
}

function buildOperationReceiptSet(responses: readonly Plan097OperationResponse[]) {
  const keys = responses.map((response) => response.receiptKey).toSorted();
  const sum = (select: (response: Plan097OperationResponse) => number) =>
    responses.reduce((total, response) => total + select(response), 0);
  const usage: Plan097OperationUsage = {
    scope: "aggregate-of-operation-before-receipt-persistence",
    operationCount: responses.length,
    durationMs: sum((response) => response.metrics.durationMs),
    d1: {
      statementCount: sum((response) => response.metrics.d1.statementCount),
      rowsRead: sum((response) => response.metrics.d1.rowsRead),
      rowsWritten: sum((response) => response.metrics.d1.rowsWritten),
      queryDurationMs: sum((response) => response.metrics.d1.queryDurationMs),
    },
    r2: {
      headRequests: sum((response) => response.metrics.r2.headRequests),
      getRequests: sum((response) => response.metrics.r2.getRequests),
      putRequests: sum((response) => response.metrics.r2.putRequests),
      bytesRead: sum((response) => response.metrics.r2.bytesRead),
      bytesWritten: sum((response) => response.metrics.r2.bytesWritten),
    },
  };
  return {
    receiptCount: keys.length,
    sortedKeysSha256: sha256(new TextEncoder().encode(`${keys.join("\n")}\n`)),
    usage,
  };
}

async function seedCandidateBundle(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
  bundle: Plan097ActivationBundle;
  activationBundleSha256: string;
  receipts: string[];
  tracker: RemoteResponseTracker;
}): Promise<void> {
  const [activationBytes, manifestBytes] = await Promise.all([
    Bun.file(input.inputs.activationBundlePath)
      .arrayBuffer()
      .then((body) => new Uint8Array(body)),
    Bun.file(input.inputs.artifactManifestPath)
      .arrayBuffer()
      .then((body) => new Uint8Array(body)),
  ]);
  if (
    sha256(activationBytes) !== input.activationBundleSha256 ||
    manifestBytes.byteLength !== input.bundle.artifactManifest.byteLength ||
    sha256(manifestBytes) !== input.bundle.artifactManifest.sha256
  ) {
    throw new Error("Plan 097 local seed bundle bytes drifted before isolated upload");
  }
  const response = await remoteCall({
    inputs: input.inputs,
    dependencies: input.dependencies,
    request: {
      operationId: input.bundle.operationId,
      activationBundleSha256: input.activationBundleSha256,
      action: "seed-bundle",
      activationBundleBase64: base64(activationBytes),
      artifactManifestBase64: base64(manifestBytes),
    },
    execute: true,
    tokenKind: "bootstrap",
    tracker: input.tracker,
  });
  input.receipts.push(response.receiptKey);
}

async function stageCandidate(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
  bundle: Plan097ActivationBundle;
  activationBundleSha256: string;
  receipts: string[];
  seedProofAliases?: boolean | undefined;
  tracker: RemoteResponseTracker;
}): Promise<void> {
  const base = {
    operationId: input.bundle.operationId,
    activationBundleSha256: input.activationBundleSha256,
  } as const;
  const mirrored = await remoteCall({
    inputs: input.inputs,
    dependencies: input.dependencies,
    request: { ...base, action: "mirror-bundle" },
    execute: true,
    tracker: input.tracker,
  });
  input.receipts.push(mirrored.receiptKey);
  if (input.inputs.preflightReceiptSha256 !== undefined) {
    const reconciled = await remoteCall({
      inputs: input.inputs,
      dependencies: input.dependencies,
      request: {
        ...base,
        action: "reconcile-schema",
        preflightReceiptSha256: input.inputs.preflightReceiptSha256,
      },
      execute: true,
      tracker: input.tracker,
    });
    input.receipts.push(reconciled.receiptKey);
  }
  const manifestBytes = new Uint8Array(
    await Bun.file(input.inputs.artifactManifestPath).arrayBuffer(),
  );
  if (
    manifestBytes.byteLength !== input.bundle.artifactManifest.byteLength ||
    sha256(manifestBytes) !== input.bundle.artifactManifest.sha256
  ) {
    throw new Error("Local Plan 097 artifact manifest does not match the activation bundle");
  }
  const manifest = decodeStrict(Plan097RecoveryArtifactManifestSchema)(
    JSON.parse(new TextDecoder().decode(manifestBytes)),
  );
  for (const entry of manifest.entries) {
    const body = new Uint8Array(
      await Bun.file(join(input.inputs.artifactRoot, entry.logicalKey)).arrayBuffer(),
    );
    if (body.byteLength !== entry.bytes || sha256(body) !== entry.sha256) {
      throw new Error(`Local Plan 097 artifact ${entry.logicalId} drifted after manifest creation`);
    }
    const staged = await remoteCall({
      inputs: input.inputs,
      dependencies: input.dependencies,
      request: {
        ...base,
        action: "stage-body",
        logicalId: entry.logicalId,
        declaredSha256: entry.sha256,
        declaredBytes: entry.bytes,
        mediaType: entry.mediaType,
        bodyBase64: base64(body),
      },
      execute: true,
      tracker: input.tracker,
    });
    input.receipts.push(staged.receiptKey);
    if (input.seedProofAliases) {
      const alias = await remoteCall({
        inputs: input.inputs,
        dependencies: input.dependencies,
        request: {
          ...base,
          action: "seed-proof-alias",
          logicalId: entry.logicalId,
          declaredSha256: entry.sha256,
          declaredBytes: entry.bytes,
          mediaType: entry.mediaType,
          bodyBase64: base64(body),
        },
        execute: true,
        tracker: input.tracker,
      });
      input.receipts.push(alias.receiptKey);
    }
  }
  const finalized = await remoteCall({
    inputs: input.inputs,
    dependencies: input.dependencies,
    request: { ...base, action: "finalize-manifest" },
    execute: true,
    tracker: input.tracker,
  });
  input.receipts.push(finalized.receiptKey);
}

export async function runPublishRecovery(
  inputs: PublishRecoveryInputs,
  dependencies: PublishRecoveryDependencies = defaultDependencies,
): Promise<PublishRecoveryResult> {
  if (new URL(inputs.endpoint).protocol !== "https:") {
    throw new Error("Plan 097 recovery endpoint must use HTTPS");
  }
  const { bundle, sha256: activationBundleSha256 } = await readStrictActivationBundle(
    inputs.activationBundlePath,
  );
  if (
    inputs.expectedCandidateId !== undefined &&
    bundle.candidate.releaseId !== inputs.expectedCandidateId
  ) {
    throw new Error("Plan 097 --candidate does not identify the configured activation bundle");
  }
  if (
    inputs.expectedOperationId !== undefined &&
    bundle.operationId !== inputs.expectedOperationId
  ) {
    throw new Error("Plan 097 --operation does not identify the configured activation bundle");
  }
  let restoreBundleSha256 = await readOptionalRestoreSha256(
    inputs.restoreBundlePath,
    inputs.restoreBundleSha256,
    bundle,
  );
  const receipts: string[] = [];
  const responseTracker: RemoteResponseTracker = [];
  const httpComparisons: PublishRecoveryResult["httpComparisons"] = [];
  let preflightAttestation: PublishRecoveryResult["preflightAttestation"] = null;
  let proofSummary: PublishRecoveryResult["proofSummary"] = null;
  let completion: PublishRecoveryResult["completion"] = null;
  const base = { operationId: bundle.operationId, activationBundleSha256 } as const;
  const recordTerminalCompletion = async (outcome: "active" | "rolled_back") => {
    if (
      inputs.proofSummaryRef === undefined ||
      inputs.preflightReceiptSha256 === undefined ||
      restoreBundleSha256 === null
    ) {
      throw new Error(
        "Plan 097 terminal receipt requires proof, preflight, and restore references",
      );
    }
    const criticalReceiptKeys = [
      ...new Set(
        responseTracker
          .filter(
            (response) =>
              response.action === "activate" ||
              response.action === "rollback" ||
              response.action === "finalize-manifest",
          )
          .map((response) => response.receiptKey),
      ),
    ];
    const request = {
      ...base,
      action: "record-completion" as const,
      outcome,
      preflightReceiptSha256: inputs.preflightReceiptSha256,
      restoreBundleSha256,
      proofSummary: inputs.proofSummaryRef,
      receiptKeys: criticalReceiptKeys,
      receiptSet: buildOperationReceiptSet(responseTracker),
      httpComparisons: httpComparisons as Extract<
        Plan097OperationRequest,
        { action: "record-completion" }
      >["httpComparisons"],
    };
    const response = await remoteCall({
      inputs,
      dependencies,
      request,
      execute: true,
      tracker: responseTracker,
    });
    collectResponseReceipts(response, receipts);
    completion = response.evidence?.find((entry) => entry.kind === "completion") ?? null;
    if (completion === null) {
      throw new Error("Plan 097 terminal operation did not return a completion receipt");
    }
  };

  switch (inputs.action) {
    case "dry-run": {
      const httpBaseline = await resolveHttpBaseline({ inputs, dependencies });
      httpComparisons.push({ phase: "preflight-baseline", baseline: httpBaseline });
      await seedCandidateBundle({
        inputs,
        dependencies,
        bundle,
        activationBundleSha256,
        receipts,
        tracker: responseTracker,
      });
      const response = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "preflight", httpBaseline },
        execute: false,
        tracker: responseTracker,
      });
      collectResponseReceipts(response, receipts);
      const restoreEvidence = response.evidence?.find((entry) => entry.kind === "restore-bundle");
      if (restoreEvidence === undefined) {
        throw new Error("Plan 097 preflight did not return the durable restore bundle reference");
      }
      restoreBundleSha256 = restoreEvidence.sha256;
      preflightAttestation = await (
        dependencies.verifyPreflightReceipt ?? verifyReturnedPlan097Preflight
      )(response, inputs.preflightPublicKeyPath);
      break;
    }
    case "resume": {
      if (inputs.preflightReceiptSha256 === undefined) {
        throw new Error("Plan 097 resume requires --receipt-sha256 from the signed preflight");
      }
      await stageCandidate({
        inputs,
        dependencies,
        bundle,
        activationBundleSha256,
        receipts,
        tracker: responseTracker,
      });
      break;
    }
    case "prove": {
      if (restoreBundleSha256 === null) {
        throw new Error("Plan 097 prove requires --restore-bundle for the A→B→A proof");
      }
      if (inputs.publicBaseUrl === undefined) {
        throw new Error("Plan 097 prove requires the disposable proof --base-url");
      }
      await stageCandidate({
        inputs,
        dependencies,
        bundle,
        activationBundleSha256,
        receipts,
        seedProofAliases: true,
        tracker: responseTracker,
      });
      const initialized = await remoteCall({
        inputs,
        dependencies,
        request: {
          ...base,
          action: "prove",
          bundle: "restore",
          restoreBundleSha256,
        },
        execute: false,
        tracker: responseTracker,
      });
      receipts.push(initialized.receiptKey);
      const proofBaseline = (
        await (dependencies.httpCheck ?? runPlan097HttpCheck)({
          baseUrl: inputs.publicBaseUrl,
          fetch: dependencies.fetch,
          mode: "baseline",
        })
      ).baseline;
      httpComparisons.push({ phase: "proof-baseline", baseline: proofBaseline });
      const failBeforeStatement = Math.max(0, bundle.batch.statements.length - 1);
      const proofRequests = [
        {
          ...base,
          action: "prove" as const,
          bundle: "activation" as const,
          restoreBundleSha256,
          failBeforeStatement,
        },
        {
          ...base,
          action: "prove" as const,
          bundle: "activation" as const,
          restoreBundleSha256,
        },
        {
          ...base,
          action: "prove" as const,
          bundle: "restore" as const,
          restoreBundleSha256,
        },
      ] as const;
      for (const [index, request] of proofRequests.entries()) {
        const response = await remoteCall({
          inputs,
          dependencies,
          request,
          execute: false,
          tracker: responseTracker,
        });
        receipts.push(response.receiptKey);
        if (index === 1) {
          const candidate = (
            await (dependencies.httpCheck ?? runPlan097HttpCheck)({
              baseUrl: inputs.publicBaseUrl,
              fetch: dependencies.fetch,
              mode: "candidate",
              expectedReleaseId: bundle.candidate.releaseId,
              expectedExactRouteCount: bundle.expectedExactRouteCount,
            })
          ).baseline;
          httpComparisons.push({ phase: "candidate-active", baseline: candidate });
          continue;
        }
        const restored = (
          await (dependencies.httpCheck ?? runPlan097HttpCheck)({
            baseUrl: inputs.publicBaseUrl,
            fetch: dependencies.fetch,
            mode: "baseline",
            expectedReleaseId: proofBaseline.activeReleaseId,
          })
        ).baseline;
        comparePlan097HttpBaselines({ expected: proofBaseline, actual: restored });
        httpComparisons.push({
          phase: index === 0 ? "injected-failure" : "baseline-restored",
          baseline: restored,
        });
      }
      const proofReceiptKeys = [
        ...new Set(
          responseTracker
            .filter((response) => response.action === "prove")
            .map((response) => response.receiptKey),
        ),
      ];
      const summaryResponse = await remoteCall({
        inputs,
        dependencies,
        request: {
          ...base,
          action: "record-proof",
          restoreBundleSha256,
          receiptKeys: proofReceiptKeys,
          receiptSet: buildOperationReceiptSet(responseTracker),
          httpComparisons: httpComparisons as Extract<
            Plan097OperationRequest,
            { action: "record-proof" }
          >["httpComparisons"],
        },
        execute: true,
        tracker: responseTracker,
      });
      collectResponseReceipts(summaryResponse, receipts);
      proofSummary =
        summaryResponse.evidence?.find((entry) => entry.kind === "proof-summary") ?? null;
      if (proofSummary === null) {
        throw new Error("Plan 097 proof did not return its durable summary receipt");
      }
      break;
    }
    case "activate": {
      requireOperationToken(inputs, "execution");
      if (restoreBundleSha256 === null) {
        throw new Error("Plan 097 activation requires --restore-bundle for contingency rollback");
      }
      const productionBaseline = await revalidateProductionBaseline({ inputs, dependencies });
      httpComparisons.push({ phase: "production-baseline", baseline: productionBaseline });
      if (inputs.preflightReceiptSha256 === undefined) {
        throw new Error("Plan 097 activation requires --receipt-sha256 from the signed preflight");
      }
      await stageCandidate({
        inputs,
        dependencies,
        bundle,
        activationBundleSha256,
        receipts,
        tracker: responseTracker,
      });
      const ready = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "dry-run" },
        execute: false,
        tracker: responseTracker,
      });
      collectResponseReceipts(ready, receipts);
      const response = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "activate" },
        execute: true,
        tracker: responseTracker,
      });
      collectResponseReceipts(response, receipts);
      try {
        if (inputs.publicBaseUrl === undefined) {
          throw new Error("Plan 097 activation is missing the production base URL");
        }
        const active = await (dependencies.httpCheck ?? runPlan097HttpCheck)({
          baseUrl: inputs.publicBaseUrl,
          fetch: dependencies.fetch,
          mode: "candidate",
          expectedReleaseId: bundle.candidate.releaseId,
          expectedExactRouteCount: bundle.expectedExactRouteCount,
        });
        httpComparisons.push({ phase: "production-active", baseline: active.baseline });
      } catch (postActivationFailure) {
        const rollback = await remoteCall({
          inputs,
          dependencies,
          request: { ...base, action: "rollback", restoreBundleSha256 },
          execute: true,
          tracker: responseTracker,
        });
        collectResponseReceipts(rollback, receipts);
        if (inputs.publicBaseUrl === undefined) throw postActivationFailure;
        const restored = (
          await (dependencies.httpCheck ?? runPlan097HttpCheck)({
            baseUrl: inputs.publicBaseUrl,
            fetch: dependencies.fetch,
            mode: "baseline",
            expectedReleaseId: productionBaseline.activeReleaseId,
          })
        ).baseline;
        comparePlan097HttpBaselines({ expected: productionBaseline, actual: restored });
        httpComparisons.push({ phase: "baseline-restored", baseline: restored });
        await recordTerminalCompletion("rolled_back");
        return {
          schemaVersion: 1,
          action: inputs.action,
          operationId: bundle.operationId,
          activationBundleSha256,
          restoreBundleSha256,
          outcome: "rolled_back",
          remoteReceipts: receipts,
          preflightAttestation,
          httpComparisons,
          proofSummary,
          completion,
        };
      }
      await recordTerminalCompletion("active");
      break;
    }
    case "rollback": {
      if (restoreBundleSha256 === null) {
        throw new Error("Plan 097 rollback requires --restore-bundle");
      }
      const response = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "rollback", restoreBundleSha256 },
        execute: true,
        tracker: responseTracker,
      });
      receipts.push(response.receiptKey);
      break;
    }
  }
  return {
    schemaVersion: 1,
    action: inputs.action,
    operationId: bundle.operationId,
    activationBundleSha256,
    restoreBundleSha256,
    outcome: "pass",
    remoteReceipts: receipts,
    preflightAttestation,
    httpComparisons,
    proofSummary,
    completion,
  };
}

function configuredValue(
  explicit: string | undefined,
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  const value = explicit ?? environment[key];
  return value === undefined || value.length === 0 ? undefined : value;
}

function requireConfigured(value: string | undefined, label: string): string {
  if (value === undefined) throw new Error(`Plan 097 requires ${label}`);
  return value;
}

export function resolvePublishRecoveryCliInputs(
  options: PublishRecoveryCliOptions,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PublishRecoveryInputs {
  if (options.action === "dry-run") {
    if (options.candidate === undefined || !/^pub_[0-9TZ]+$/u.test(options.candidate)) {
      throw new Error("Plan 097 dry-run requires --candidate <candidate-id>");
    }
  } else if (
    options.operation === undefined ||
    !/^plan097:pub_[0-9TZ]+$/u.test(options.operation)
  ) {
    throw new Error(`Plan 097 ${options.action} requires --operation <operation-id>`);
  }
  if (options.action === "prove" && options.proofEnv !== "plan097-proof") {
    throw new Error("Plan 097 prove requires --proof-env plan097-proof");
  }
  if (options.action !== "prove" && options.proofEnv !== undefined) {
    throw new Error("Plan 097 --proof-env is valid only for the prove action");
  }

  const candidateDirValue = configuredValue(undefined, environment, "PLAN097_CANDIDATE_DIR");
  const candidateDir = candidateDirValue === undefined ? undefined : fromCliPath(candidateDirValue);
  const candidateFile = (explicit: string | undefined, key: string, leaf: string): string => {
    const configured = configuredValue(explicit, environment, key);
    if (configured !== undefined) return fromCliPath(configured);
    if (candidateDir !== undefined) return join(candidateDir, leaf);
    throw new Error(`Plan 097 requires --${leaf} or PLAN097_CANDIDATE_DIR`);
  };
  const proof = options.action === "prove";
  const endpoint = requireConfigured(
    configuredValue(
      options.endpoint,
      environment,
      proof ? "PLAN097_PROOF_ENDPOINT" : "PLAN097_RECOVERY_ENDPOINT",
    ),
    proof ? "PLAN097_PROOF_ENDPOINT" : "PLAN097_RECOVERY_ENDPOINT",
  );
  const serviceTokenId = requireConfigured(
    configuredValue(undefined, environment, "PLAN097_SERVICE_TOKEN_ID"),
    "PLAN097_SERVICE_TOKEN_ID",
  );
  const serviceTokenSecret = requireConfigured(
    configuredValue(undefined, environment, "PLAN097_SERVICE_TOKEN_SECRET"),
    "PLAN097_SERVICE_TOKEN_SECRET",
  );
  const artifactRoot = configuredValue(options.artifactRoot, environment, "PLAN097_ARTIFACT_ROOT");
  const restoreBundle = configuredValue(
    options.restoreBundle,
    environment,
    "PLAN097_RESTORE_BUNDLE_PATH",
  );
  const httpBaseline = configuredValue(
    options.httpBaseline,
    environment,
    "PLAN097_HTTP_BASELINE_PATH",
  );
  const preflightPublicKey = configuredValue(
    options.preflightPublicKey,
    environment,
    "PLAN097_PREFLIGHT_PUBLIC_KEY",
  );
  const proofSummaryKey = configuredValue(undefined, environment, "PLAN097_PROOF_SUMMARY_KEY");
  const proofSummarySha256 = configuredValue(
    undefined,
    environment,
    "PLAN097_PROOF_SUMMARY_SHA256",
  );
  const proofSummaryBytesText = configuredValue(
    undefined,
    environment,
    "PLAN097_PROOF_SUMMARY_BYTES",
  );
  const proofSummaryValues = [proofSummaryKey, proofSummarySha256, proofSummaryBytesText];
  if (
    proofSummaryValues.some((value) => value !== undefined) &&
    proofSummaryValues.includes(undefined)
  ) {
    throw new Error(
      "Plan 097 proof summary key, SHA-256, and byte length must be configured together",
    );
  }
  const proofSummaryBytes =
    proofSummaryBytesText === undefined ? undefined : Number(proofSummaryBytesText);
  if (
    proofSummaryBytes !== undefined &&
    (!Number.isSafeInteger(proofSummaryBytes) || proofSummaryBytes <= 0)
  ) {
    throw new Error("PLAN097_PROOF_SUMMARY_BYTES must be a positive safe integer");
  }

  return {
    action: options.action,
    endpoint,
    activationBundlePath: candidateFile(
      options.activationBundle,
      "PLAN097_ACTIVATION_BUNDLE_PATH",
      "plan097-activation-bundle.json",
    ),
    artifactManifestPath: candidateFile(
      options.artifactManifest,
      "PLAN097_ARTIFACT_MANIFEST_PATH",
      "plan097-artifact-manifest.json",
    ),
    artifactRoot:
      artifactRoot === undefined ? fromRepoRoot("data/artifacts") : fromCliPath(artifactRoot),
    restoreBundlePath: restoreBundle === undefined ? undefined : fromCliPath(restoreBundle),
    restoreBundleSha256: configuredValue(undefined, environment, "PLAN097_RESTORE_BUNDLE_SHA256"),
    httpBaselinePath: httpBaseline === undefined ? undefined : fromCliPath(httpBaseline),
    publicBaseUrl: configuredValue(
      options.baseUrl,
      environment,
      proof ? "PLAN097_PROOF_BASE_URL" : "PLAN097_PUBLIC_BASE_URL",
    ),
    preflightPublicKeyPath:
      preflightPublicKey === undefined ? undefined : fromCliPath(preflightPublicKey),
    serviceTokenId,
    serviceTokenSecret,
    bootstrapToken: configuredValue(undefined, environment, "PLAN097_BOOTSTRAP_TOKEN"),
    executionToken: configuredValue(undefined, environment, "PLAN097_EXECUTION_TOKEN"),
    preflightReceiptSha256: configuredValue(
      options.receiptSha256,
      environment,
      "PLAN097_PREFLIGHT_RECEIPT_SHA256",
    ),
    expectedCandidateId: options.candidate,
    expectedOperationId: options.operation,
    proofSummaryRef:
      proofSummaryKey === undefined ||
      proofSummarySha256 === undefined ||
      proofSummaryBytes === undefined
        ? undefined
        : {
            kind: "proof-summary",
            key: proofSummaryKey,
            sha256: proofSummarySha256,
            bytes: proofSummaryBytes,
          },
  };
}

export default defineCommand({
  path: ["publish", "recovery"],
  summary: "Run the closed, receipt-backed Plan 097 recovery operation.",
  input: {
    options: Schema.Struct({
      action: Schema.Literals(["dry-run", "prove", "activate", "resume", "rollback"]),
      candidate: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^pub_[0-9TZ]+$/u))),
      operation: Schema.optionalKey(
        Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
      ),
      proofEnv: Schema.optionalKey(Schema.Literal("plan097-proof")),
      endpoint: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^https:\/\//u))),
      activationBundle: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
      artifactManifest: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
      artifactRoot: Schema.optionalKey(Schema.String),
      restoreBundle: Schema.optionalKey(Schema.String),
      httpBaseline: Schema.optionalKey(Schema.String),
      baseUrl: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^https:\/\//u))),
      preflightPublicKey: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1))),
      receiptSha256: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u))),
    }),
  },
  output: Schema.Unknown,
  run({ input }) {
    return runPublishRecovery(resolvePublishRecoveryCliInputs(input.options));
  },
});
