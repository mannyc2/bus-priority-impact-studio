import * as z from "../../schema-compat.js";
import { StudioQualitySchema } from "../shared.js";

export const StudioMethodDatasetSchema = z
  .object({
    sourceId: z.string().min(1),
    name: z.string(),
    publisher: z.string(),
    grain: z.string(),
    cadence: z.string(),
    description: z.string(),
    rowCount: z.number().int().nonnegative(),
    rowLabel: z.string(),
    period: z.string(),
    schemaKeys: z.array(z.string()),
    method: z.string(),
    sourceRefCount: z.number().int().nonnegative(),
  })
  .strict();

export const StudioMethodsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    datasets: z.array(StudioMethodDatasetSchema),
    quality: StudioQualitySchema,
  })
  .strict();

export const StudioDocsEndpointSchema = z
  .object({
    method: z.string(),
    path: z.string(),
    body: z.string(),
  })
  .strip();

export const StudioDocsSourceLinkSchema = z
  .object({
    label: z.string(),
    url: z.string(),
  })
  .strict();

export const StudioDocsSourceSchema = z
  .object({
    sourceId: z.string(),
    name: z.string(),
    publisher: z.string(),
    role: z.string(),
    decision: z.string(),
    detectorEligibility: z.string(),
    rowCount: z.number().int().nonnegative(),
    rowLabel: z.string(),
    period: z.string(),
    monthCount: z.number().int().nonnegative().nullable(),
    geocodeRate: z.number().nullable(),
    joinRate: z.number().nullable(),
    primaryEvidenceAllowed: z.boolean(),
    automaticPromotionAllowed: z.boolean(),
    readinessStatus: z.string(),
    readinessReasons: z.array(z.string()),
    sourceLinks: z.array(StudioDocsSourceLinkSchema),
    use: z.string(),
  })
  .strict();

export const StudioDocsSectionSchema = z
  .object({
    title: z.string(),
    body: z.array(z.string()),
    code: z.string().optional(),
  })
  .strict();

export const StudioSpeedPercentileContextSchema = z
  .object({
    metric: z.string(),
    peerUniverse: z.string(),
    peerUniverseLabel: z.string(),
    rank: z.number().int().positive(),
    routeCount: z.number().int().positive(),
    direction: z.string(),
  })
  .strict();

export const StudioDocsResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string(),
    sections: z.array(StudioDocsSectionSchema),
    endpoints: z.array(StudioDocsEndpointSchema),
    quality: StudioQualitySchema,
  })
  .strip();

export type StudioMethodDataset = z.output<typeof StudioMethodDatasetSchema>;
export type StudioMethodsResponse = z.output<typeof StudioMethodsResponseSchema>;
export type StudioDocsEndpoint = z.output<typeof StudioDocsEndpointSchema>;
export type StudioDocsSourceLink = z.output<typeof StudioDocsSourceLinkSchema>;
export type StudioDocsSource = z.output<typeof StudioDocsSourceSchema>;
export type StudioDocsSection = z.output<typeof StudioDocsSectionSchema>;
export type StudioSpeedPercentileContext = z.output<typeof StudioSpeedPercentileContextSchema>;
export type StudioDocsResponse = z.output<typeof StudioDocsResponseSchema>;
