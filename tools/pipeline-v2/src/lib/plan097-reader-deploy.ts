import { createHash } from "node:crypto";
import { Plan097HttpBaselineSchema } from "@bp/db/recovery/plan097";
import { decodeStrict } from "@bp/domain/decode";
import { ReleaseIdSchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { type Plan097HttpCheckResult, runPlan097HttpCheck } from "./plan097-http-check.ts";

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const RepoShaSchema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u));
const UtcInstantSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);

export const Plan097ReaderDeployReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.reader-deploy.v1"),
  schemaVersion: Schema.Literal(1),
  repoSha: RepoShaSchema,
  workflowRunId: Schema.String.check(Schema.isPattern(/^[1-9][0-9]*$/u)),
  checkedAt: UtcInstantSchema,
  expectedPreviousReleaseId: ReleaseIdSchema,
  baseline: Plan097HttpBaselineSchema,
  exactRouteCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  representativeGeometry: Schema.NullOr(
    Schema.Struct({
      path: Schema.String.check(Schema.isPattern(/^\//u)),
      sha256: Sha256Schema,
      featureCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    }),
  ),
  recoveryNamespace: Schema.Struct({
    path: Schema.Literal("/__operations/plan097"),
    status: Schema.Literal(404),
    safeBodySha256: Sha256Schema,
    requestId: Schema.NullOr(Schema.String),
    cfRay: Schema.NullOr(Schema.String),
    cacheControl: Schema.NullOr(Schema.String),
  }),
}).check(
  Schema.makeFilter((receipt) =>
    receipt.baseline.activeReleaseId === receipt.expectedPreviousReleaseId
      ? []
      : [
          {
            path: ["baseline", "activeReleaseId"],
            issue: "The reader predeploy elected a release other than the pinned previous release",
          },
        ],
  ),
);

export type Plan097ReaderDeployReceipt = typeof Plan097ReaderDeployReceiptSchema.Type;

export async function runPlan097ReaderDeployCheck(
  input: {
    baseUrl: string;
    expectedReleaseId: string;
    repoSha: string;
    workflowRunId: string;
    checkedAt?: string | undefined;
    nonce?: string | undefined;
  },
  dependencies: {
    fetch?: Fetch | undefined;
    httpCheck?: typeof runPlan097HttpCheck | undefined;
  } = {},
): Promise<Plan097ReaderDeployReceipt> {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const fetchDependency = dependencies.fetch ?? fetch;
  const result: Plan097HttpCheckResult = await (dependencies.httpCheck ?? runPlan097HttpCheck)({
    baseUrl: input.baseUrl,
    fetch: fetchDependency,
    mode: "baseline",
    expectedReleaseId: input.expectedReleaseId,
    checkedAt,
    nonce: input.nonce,
  });
  const operationPath = "/__operations/plan097";
  const operationResponse = await fetchDependency(new URL(operationPath, input.baseUrl), {
    headers: {
      accept: "text/plain",
      "user-agent": "bp-plan097-reader-deploy-check/1",
    },
  });
  const operationBody = await operationResponse.text();
  if (operationResponse.status !== 404) {
    throw new Error(
      `Plan 097 operation namespace is reachable with HTTP ${operationResponse.status}`,
    );
  }

  return decodeStrict(Plan097ReaderDeployReceiptSchema)({
    artifactKind: "bp.ops.plan097.reader-deploy.v1",
    schemaVersion: 1,
    repoSha: input.repoSha,
    workflowRunId: input.workflowRunId,
    checkedAt,
    expectedPreviousReleaseId: input.expectedReleaseId,
    baseline: result.baseline,
    exactRouteCount: result.exactRouteCount,
    representativeGeometry: result.representativeGeometry,
    recoveryNamespace: {
      path: operationPath,
      status: 404,
      safeBodySha256: createHash("sha256").update(operationBody).digest("hex"),
      requestId: operationResponse.headers.get("x-request-id"),
      cfRay: operationResponse.headers.get("cf-ray"),
      cacheControl: operationResponse.headers.get("cache-control"),
    },
  });
}
