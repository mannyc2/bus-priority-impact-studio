import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { join } from "node:path";
import {
  type Plan097ActivationBundle,
  Plan097ActivationBundleSchema,
  Plan097HttpBaselineSchema,
  type Plan097OperationRequest,
  type Plan097OperationResponse,
  Plan097OperationResponseSchema,
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
  httpBaselinePath?: string | undefined;
  publicBaseUrl?: string | undefined;
  serviceTokenId: string;
  serviceTokenSecret: string;
  executionToken?: string | undefined;
  preflightReceiptSha256?: string | undefined;
  preflightPublicKeyPath?: string | undefined;
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
};

type PublishRecoveryDependencies = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  httpCheck?: typeof runPlan097HttpCheck | undefined;
  verifyPreflightReceipt?: typeof verifyReturnedPlan097Preflight | undefined;
};

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
  activation: Plan097ActivationBundle,
): Promise<string | null> {
  if (path === undefined) return null;
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
  return sha256(bytes);
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

function requireExecutionToken(inputs: PublishRecoveryInputs): string {
  if (inputs.executionToken === undefined || inputs.executionToken.length === 0) {
    throw new Error(
      `Plan 097 ${inputs.action} requires the fresh PLAN097_EXECUTION_TOKEN authorization`,
    );
  }
  return inputs.executionToken;
}

async function remoteCall(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
  request: Plan097OperationRequest;
  execute: boolean;
}): Promise<Plan097OperationResponse> {
  const headers = new Headers({
    "Content-Type": "application/json",
    "CF-Access-Client-Id": input.inputs.serviceTokenId,
    "CF-Access-Client-Secret": input.inputs.serviceTokenSecret,
  });
  if (input.execute) {
    headers.set("X-Plan097-Execution-Token", requireExecutionToken(input.inputs));
  }
  const response = await input.dependencies.fetch(input.inputs.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(input.request),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Plan 097 Worker ${input.request.action} failed with HTTP ${response.status}`);
  }
  return decodeStrict(Plan097OperationResponseSchema)(body);
}

async function stageCandidate(input: {
  inputs: PublishRecoveryInputs;
  dependencies: PublishRecoveryDependencies;
  bundle: Plan097ActivationBundle;
  activationBundleSha256: string;
  receipts: string[];
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
    });
    input.receipts.push(staged.receiptKey);
  }
  const finalized = await remoteCall({
    inputs: input.inputs,
    dependencies: input.dependencies,
    request: { ...base, action: "finalize-manifest" },
    execute: true,
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
  const restoreBundleSha256 = await readOptionalRestoreSha256(inputs.restoreBundlePath, bundle);
  const receipts: string[] = [];
  let preflightAttestation: PublishRecoveryResult["preflightAttestation"] = null;
  const base = { operationId: bundle.operationId, activationBundleSha256 } as const;

  switch (inputs.action) {
    case "dry-run": {
      const httpBaseline = await resolveHttpBaseline({ inputs, dependencies });
      const response = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "preflight", httpBaseline },
        execute: false,
      });
      collectResponseReceipts(response, receipts);
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
      });
      break;
    }
    case "prove": {
      if (restoreBundleSha256 === null) {
        throw new Error("Plan 097 prove requires --restore-bundle for the A→B→A proof");
      }
      await stageCandidate({
        inputs,
        dependencies,
        bundle,
        activationBundleSha256,
        receipts,
      });
      const failBeforeStatement = Math.max(0, bundle.batch.statements.length - 1);
      for (const request of [
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
      ]) {
        const response = await remoteCall({ inputs, dependencies, request, execute: false });
        receipts.push(response.receiptKey);
      }
      break;
    }
    case "activate": {
      requireExecutionToken(inputs);
      if (restoreBundleSha256 === null) {
        throw new Error("Plan 097 activation requires --restore-bundle for contingency rollback");
      }
      const productionBaseline = await revalidateProductionBaseline({ inputs, dependencies });
      if (inputs.preflightReceiptSha256 === undefined) {
        throw new Error("Plan 097 activation requires --receipt-sha256 from the signed preflight");
      }
      await stageCandidate({
        inputs,
        dependencies,
        bundle,
        activationBundleSha256,
        receipts,
      });
      const ready = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "dry-run" },
        execute: false,
      });
      collectResponseReceipts(ready, receipts);
      const response = await remoteCall({
        inputs,
        dependencies,
        request: { ...base, action: "activate" },
        execute: true,
      });
      collectResponseReceipts(response, receipts);
      try {
        if (inputs.publicBaseUrl === undefined) {
          throw new Error("Plan 097 activation is missing the production base URL");
        }
        await (dependencies.httpCheck ?? runPlan097HttpCheck)({
          baseUrl: inputs.publicBaseUrl,
          fetch: dependencies.fetch,
          mode: "candidate",
          expectedReleaseId: bundle.candidate.releaseId,
          expectedExactRouteCount: bundle.expectedExactRouteCount,
        });
      } catch (postActivationFailure) {
        const rollback = await remoteCall({
          inputs,
          dependencies,
          request: { ...base, action: "rollback", restoreBundleSha256 },
          execute: true,
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
        return {
          schemaVersion: 1,
          action: inputs.action,
          operationId: bundle.operationId,
          activationBundleSha256,
          restoreBundleSha256,
          outcome: "rolled_back",
          remoteReceipts: receipts,
          preflightAttestation,
        };
      }
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
  };
}

export default defineCommand({
  path: ["publish", "recovery"],
  summary: "Run the closed, receipt-backed Plan 097 recovery operation.",
  input: {
    options: Schema.Struct({
      action: Schema.Literals(["dry-run", "prove", "activate", "resume", "rollback"]),
      endpoint: Schema.String.check(Schema.isPattern(/^https:\/\//u)),
      activationBundle: Schema.String.check(Schema.isMinLength(1)),
      artifactManifest: Schema.String.check(Schema.isMinLength(1)),
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
    // biome-ignore lint/complexity/useLiteralKeys: process.env is index-signature typed.
    const serviceTokenId = process.env["PLAN097_SERVICE_TOKEN_ID"] ?? "";
    // biome-ignore lint/complexity/useLiteralKeys: process.env is index-signature typed.
    const serviceTokenSecret = process.env["PLAN097_SERVICE_TOKEN_SECRET"] ?? "";
    if (serviceTokenId.length === 0 || serviceTokenSecret.length === 0) {
      throw new Error("PLAN097_SERVICE_TOKEN_ID and PLAN097_SERVICE_TOKEN_SECRET are required");
    }
    return runPublishRecovery({
      action: input.options.action,
      endpoint: input.options.endpoint,
      activationBundlePath: fromCliPath(input.options.activationBundle),
      artifactManifestPath: fromCliPath(input.options.artifactManifest),
      artifactRoot:
        input.options.artifactRoot === undefined
          ? fromRepoRoot("data/artifacts")
          : fromCliPath(input.options.artifactRoot),
      restoreBundlePath:
        input.options.restoreBundle === undefined
          ? undefined
          : fromCliPath(input.options.restoreBundle),
      httpBaselinePath:
        input.options.httpBaseline === undefined
          ? undefined
          : fromCliPath(input.options.httpBaseline),
      publicBaseUrl: input.options.baseUrl,
      preflightPublicKeyPath:
        input.options.preflightPublicKey === undefined
          ? undefined
          : fromCliPath(input.options.preflightPublicKey),
      serviceTokenId,
      serviceTokenSecret,
      // biome-ignore lint/complexity/useLiteralKeys: process.env is index-signature typed.
      executionToken: process.env["PLAN097_EXECUTION_TOKEN"],
      preflightReceiptSha256: input.options.receiptSha256,
    });
  },
});
