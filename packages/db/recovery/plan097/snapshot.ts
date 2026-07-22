import {
  CanonicalPublishedAtSchema,
  ReleaseIdentitySchema,
  ReleaseIdSchema,
} from "@bp/domain/studio/shared";
import { Schema } from "effect";
import { Plan097CompactedBatchSchema } from "./batches.js";

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const NonNegativeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const SqlScalarSchema = Schema.Union([Schema.Null, Schema.String, Schema.Number]);

export const Plan097ServingTableSnapshotSchema = Schema.Struct({
  table: NonEmptyStringSchema,
  columns: Schema.Array(NonEmptyStringSchema).check(Schema.isNonEmpty()),
  primaryKey: Schema.Array(NonEmptyStringSchema),
  deleteStatement: Schema.Struct({
    sql: NonEmptyStringSchema,
    params: Schema.Array(Schema.String),
  }),
  schemaSha256: Sha256Schema,
  rows: Schema.Array(Schema.Array(SqlScalarSchema)),
  rowCount: NonNegativeIntegerSchema,
  rowsSha256: Sha256Schema,
});

export const Plan097ProtectedFingerprintSchema = Schema.Struct({
  scope: Schema.Literals(["whole-table", "appendix-reliability-status"]),
  table: NonEmptyStringSchema,
  predicate: Schema.NullOr(NonEmptyStringSchema),
  rowCount: NonNegativeIntegerSchema,
  rowsSha256: Sha256Schema,
});

const PreviousElectionSchema = Schema.Struct({
  studioReleaseId: Schema.NullOr(ReleaseIdSchema),
  mapReleaseId: Schema.NullOr(ReleaseIdSchema),
  exactRouteReleaseId: Schema.NullOr(ReleaseIdSchema),
});

export const Plan097SelectiveSnapshotSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.selective-snapshot.v1"),
  schemaVersion: Schema.Literal(1),
  capturedAt: CanonicalPublishedAtSchema,
  candidate: ReleaseIdentitySchema,
  previousElection: PreviousElectionSchema,
  tables: Schema.Array(Plan097ServingTableSnapshotSchema),
  protectedFingerprints: Schema.Array(Plan097ProtectedFingerprintSchema),
});

export const Plan097RestoreBundleSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.ops.plan097.restore-bundle.v1"),
  schemaVersion: Schema.Literal(1),
  operationId: Schema.String.check(Schema.isPattern(/^plan097:pub_[0-9TZ]+$/u)),
  candidate: ReleaseIdentitySchema,
  snapshotSha256: Sha256Schema,
  expectedElection: PreviousElectionSchema,
  protectedFingerprints: Schema.Array(Plan097ProtectedFingerprintSchema),
  batch: Plan097CompactedBatchSchema,
});

export type Plan097ServingTableSnapshot = typeof Plan097ServingTableSnapshotSchema.Type;
export type Plan097ProtectedFingerprint = typeof Plan097ProtectedFingerprintSchema.Type;
export type Plan097SelectiveSnapshot = typeof Plan097SelectiveSnapshotSchema.Type;
export type Plan097RestoreBundle = typeof Plan097RestoreBundleSchema.Type;
