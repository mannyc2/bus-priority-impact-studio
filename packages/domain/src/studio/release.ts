import * as z from "zod";
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
import { StudioQualitySchema } from "./shared.js";

export const StudioSearchSegmentCardSchema = z
  .object({
    segment: StudioSegmentSchema,
    route: StudioRouteSchema,
  })
  .strict();

export const StudioSearchNoteSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    where: z.string(),
    preview: z.string(),
    href: z.string(),
  })
  .strict();

export const StudioSearchResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    /** Latest data month behind this response; null when the projection predates C3. */
    dataAsOf: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable()
      .default(null),
    query: z.string(),
    routes: z.array(StudioRouteSchema),
    segments: z.array(StudioSearchSegmentCardSchema),
    notes: z.array(StudioSearchNoteSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioCompareResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    /** Latest data month behind this response; null when the projection predates C3. */
    dataAsOf: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .nullable()
      .default(null),
    routes: z.tuple([StudioRouteSchema, StudioRouteSchema]),
    deltas: z
      .object({
        speedMph: z.number(),
        riderHoursLost: z.number(),
        laneCoverage: z.number(),
      })
      .strict(),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioReleasePayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    quality: StudioQualitySchema,
    routes: z.array(StudioRouteSchema),
    segments: z.array(StudioSegmentSchema),
    routeArtifacts: z.array(StudioRouteArtifactRefSchema),
    methods: z.array(StudioMethodDatasetSchema),
    docsSections: z.array(StudioDocsSectionSchema),
    docsEndpoints: z.array(StudioDocsEndpointSchema),
  })
  .strict();

export type StudioSearchSegmentCard = z.output<typeof StudioSearchSegmentCardSchema>;
export type StudioSearchNote = z.output<typeof StudioSearchNoteSchema>;
export type StudioSearchResponse = z.output<typeof StudioSearchResponseSchema>;
export type StudioCompareResponse = z.output<typeof StudioCompareResponseSchema>;
export type StudioReleasePayload = z.output<typeof StudioReleasePayloadSchema>;
