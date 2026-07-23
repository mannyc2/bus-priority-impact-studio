import { ReleaseIdSchema } from "@bp/domain/studio/shared";
import { Schema } from "effect";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const OperationIdSchema = Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const BaseFields = {
  operationId: OperationIdSchema,
  activationBundleSha256: Sha256Schema,
};

export const Plan097HttpEndpointEvidenceSchema = Schema.Struct({
  path: Schema.String.check(Schema.isPattern(/^\//u)),
  status: NonNegativeIntegerSchema.check(Schema.isLessThanOrEqualTo(599)),
  schemaId: Schema.String.check(Schema.isMinLength(1)),
  safeBodySha256: Sha256Schema,
  requestId: Schema.NullOr(Schema.String),
  cfRay: Schema.NullOr(Schema.String),
  cacheControl: Schema.NullOr(Schema.String),
  etag: Schema.NullOr(Schema.String),
});

export const Plan097HttpBaselineSchema = Schema.Struct({
  checkedAt: Schema.String.check(
    Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
  ),
  activeReleaseId: ReleaseIdSchema,
  endpoints: Schema.Array(Plan097HttpEndpointEvidenceSchema).check(Schema.isNonEmpty()),
}).check(
  Schema.makeFilter((baseline) => {
    const paths = baseline.endpoints.map((endpoint) => endpoint.path);
    if (new Set(paths).size !== paths.length) {
      return [{ path: ["endpoints"], issue: "HTTP baseline endpoint paths must be unique" }];
    }
    if (baseline.endpoints.some((endpoint) => endpoint.status !== 200)) {
      return [{ path: ["endpoints"], issue: "Every preflight HTTP endpoint must pass" }];
    }
    return [];
  }),
);

export const Plan097OperationRequestSchema = Schema.Union([
  Schema.Struct({ ...BaseFields, action: Schema.Literal("dry-run") }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("preflight"),
    httpBaseline: Plan097HttpBaselineSchema,
  }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("mirror-bundle") }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("stage-body"),
    logicalId: Schema.String.check(Schema.isMinLength(1)),
    declaredSha256: Sha256Schema,
    declaredBytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
    mediaType: Schema.String.check(Schema.isMinLength(1)),
    bodyBase64: Schema.String.check(Schema.isMinLength(1)),
  }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("finalize-manifest") }),
  Schema.Struct({ ...BaseFields, action: Schema.Literal("activate") }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("prove"),
    bundle: Schema.Literals(["activation", "restore"]),
    restoreBundleSha256: Schema.optionalKey(Sha256Schema),
    failBeforeStatement: Schema.optionalKey(
      Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
    ),
  }),
  Schema.Struct({
    ...BaseFields,
    action: Schema.Literal("rollback"),
    restoreBundleSha256: Sha256Schema,
  }),
]);

export const Plan097OperationResponseSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.worker-response.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: OperationIdSchema,
  action: Schema.Literals([
    "dry-run",
    "preflight",
    "mirror-bundle",
    "stage-body",
    "finalize-manifest",
    "activate",
    "prove",
    "rollback",
  ]),
  outcome: Schema.Literals(["pass", "failed_as_expected"]),
  releaseId: ReleaseIdSchema,
  activationBundleSha256: Sha256Schema,
  receiptKey: Schema.String.check(
    Schema.isPattern(/^operations\/plan097\/receipts\/pub_[0-9TZ]+\/[a-z-]+\.[a-f0-9]{64}\.json$/u),
  ),
  statementCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  objectCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  evidence: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        kind: Schema.Literals(["selective-snapshot", "restore-bundle", "preflight"]),
        key: Schema.String.check(Schema.isPattern(/^operations\/plan097\/[A-Za-z0-9+._/-]+$/u)),
        sha256: Sha256Schema,
        bytes: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
      }),
    ),
  ),
});

export type Plan097OperationRequest = typeof Plan097OperationRequestSchema.Type;
export type Plan097OperationResponse = typeof Plan097OperationResponseSchema.Type;
export type Plan097HttpBaseline = typeof Plan097HttpBaselineSchema.Type;
