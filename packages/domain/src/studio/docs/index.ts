import { Schema } from "effect";
import { StudioQualitySchema } from "../shared.js";

export const StudioMethodDatasetSchema = Schema.Struct({
  sourceId: Schema.String.check(Schema.isMinLength(1)),
  name: Schema.String,
  publisher: Schema.String,
  grain: Schema.String,
  cadence: Schema.String,
  description: Schema.String,
  rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  rowLabel: Schema.String,
  period: Schema.String,
  schemaKeys: Schema.Array(Schema.String),
  method: Schema.String,
  sourceRefCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
});

export const StudioMethodsResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  datasets: Schema.Array(StudioMethodDatasetSchema),
  quality: StudioQualitySchema,
});

export const StudioDocsEndpointSchema = Schema.Struct({
  method: Schema.String,
  path: Schema.String,
  body: Schema.String,
});

export const StudioDocsSourceLinkSchema = Schema.Struct({
  label: Schema.String,
  url: Schema.String,
});

export const StudioDocsSourceSchema = Schema.Struct({
  sourceId: Schema.String,
  name: Schema.String,
  publisher: Schema.String,
  role: Schema.String,
  decision: Schema.String,
  detectorEligibility: Schema.String,
  rowCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  rowLabel: Schema.String,
  period: Schema.String,
  monthCount: Schema.NullOr(
    Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThanOrEqualTo(0)),
  ),
  geocodeRate: Schema.NullOr(Schema.Number),
  joinRate: Schema.NullOr(Schema.Number),
  primaryEvidenceAllowed: Schema.Boolean,
  automaticPromotionAllowed: Schema.Boolean,
  readinessStatus: Schema.String,
  readinessReasons: Schema.Array(Schema.String),
  sourceLinks: Schema.Array(StudioDocsSourceLinkSchema),
  use: Schema.String,
});

export const StudioDocsSectionSchema = Schema.Struct({
  title: Schema.String,
  body: Schema.Array(Schema.String),
  code: Schema.optional(Schema.String),
});

export const StudioSpeedPercentileContextSchema = Schema.Struct({
  metric: Schema.String,
  peerUniverse: Schema.String,
  peerUniverseLabel: Schema.String,
  rank: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  routeCount: Schema.Number.check(Schema.isInt()).check(Schema.isGreaterThan(0)),
  direction: Schema.String,
});

export const StudioDocsResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  sections: Schema.Array(StudioDocsSectionSchema),
  endpoints: Schema.Array(StudioDocsEndpointSchema),
  quality: StudioQualitySchema,
});

export type StudioMethodDataset = typeof StudioMethodDatasetSchema.Type;
export type StudioMethodsResponse = typeof StudioMethodsResponseSchema.Type;
export type StudioDocsEndpoint = typeof StudioDocsEndpointSchema.Type;
export type StudioDocsSourceLink = typeof StudioDocsSourceLinkSchema.Type;
export type StudioDocsSource = typeof StudioDocsSourceSchema.Type;
export type StudioDocsSection = typeof StudioDocsSectionSchema.Type;
export type StudioSpeedPercentileContext = typeof StudioSpeedPercentileContextSchema.Type;
export type StudioDocsResponse = typeof StudioDocsResponseSchema.Type;
