import { Effect, Schema } from "effect";
import { MapRouteFactMetadataSchema } from "../maps/index.js";
import { IsoMonthSchema } from "../primitives/index.js";
import {
  StudioDocsEndpointSchema,
  StudioDocsSectionSchema,
  StudioMethodDatasetSchema,
} from "./docs/index.js";
import {
  StudioRouteArtifactRefSchema,
  StudioRouteSchema,
  StudioSegmentSchema,
} from "./routes/index.js";
import { ReleaseIdentitySchema, StudioQualitySchema } from "./shared.js";

export const StudioSearchSegmentCardSchema = Schema.Struct({
  segment: StudioSegmentSchema,
  route: StudioRouteSchema,
});

export const StudioSearchNoteSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  where: Schema.String,
  preview: Schema.String,
  href: Schema.String,
});

export const StudioSearchResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  /** Latest data month behind this response; null when the projection predates C3. */
  dataAsOf: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  query: Schema.String,
  routes: Schema.Array(StudioRouteSchema),
  segments: Schema.Array(StudioSearchSegmentCardSchema),
  notes: Schema.Array(StudioSearchNoteSchema),
  quality: StudioQualitySchema,
});

export const StudioCompareResponseSchema = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  generatedAt: Schema.String,
  /** Latest data month behind this response; null when the projection predates C3. */
  dataAsOf: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/))).pipe(
    Schema.withDecodingDefaultType(Effect.succeed(null)),
  ),
  routes: Schema.Tuple([StudioRouteSchema, StudioRouteSchema]),
  deltas: Schema.Struct({
    speedMph: Schema.Number,
    riderHoursLost: Schema.NullOr(Schema.Number),
    laneCoverage: Schema.Number,
  }),
  quality: StudioQualitySchema,
});

export const StudioReleasePayloadSchema = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  generatedAt: Schema.String,
  baselineMonth: IsoMonthSchema,
  quality: StudioQualitySchema,
  routes: Schema.Array(StudioRouteSchema),
  mapRouteFactsMetadata: ReleaseIdentitySchema,
  routeFactMetadata: Schema.Array(MapRouteFactMetadataSchema),
  segments: Schema.Array(StudioSegmentSchema),
  routeArtifacts: Schema.Array(StudioRouteArtifactRefSchema),
  methods: Schema.Array(StudioMethodDatasetSchema),
  docsSections: Schema.Array(StudioDocsSectionSchema),
  docsEndpoints: Schema.Array(StudioDocsEndpointSchema),
});

export type StudioSearchSegmentCard = typeof StudioSearchSegmentCardSchema.Type;
export type StudioSearchNote = typeof StudioSearchNoteSchema.Type;
export type StudioSearchResponse = typeof StudioSearchResponseSchema.Type;
export type StudioCompareResponse = typeof StudioCompareResponseSchema.Type;
export type StudioReleasePayload = typeof StudioReleasePayloadSchema.Type;
