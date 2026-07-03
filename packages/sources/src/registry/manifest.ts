import * as z from "zod";
import { SocrataDatasetIdSchema } from "../core/index.js";

const SourceIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9_.-]+$/);

const SourcePrioritySchema = z.enum(["core", "secondary", "optional"]);
const ManifestStatusSchema = z.string().min(1);

const BaseManifestSourceSchema = z.object({
  id: SourceIdSchema,
  priority: SourcePrioritySchema,
  purpose: z.string().min(1),
  status: ManifestStatusSchema,
  notes: z.string().min(1).optional(),
});

const SocrataDefaultAccessSchema = z
  .object({
    kind: z.enum(["query", "export"]),
    format: z.enum(["json", "csv", "geojson"]).optional(),
  })
  .strict();

const SocrataBackfillSchema = z
  .object({
    kind: z.literal("soda3_export"),
    format: z.enum(["csv", "json", "geojson"]),
    supportsByteRange: z.boolean(),
    recommendedChunkBytes: z.number().int().positive().optional(),
    defaultQuery: z.string().min(1).optional(),
    orderingSpecifier: z.enum(["total", "discard"]).optional(),
  })
  .strict();

const SocrataManifestSourceSchema = BaseManifestSourceSchema.extend({
  type: z.literal("socrata_dataset"),
  domain: z.string().min(1),
  dataset_id: SocrataDatasetIdSchema,
  url: z.string().min(1),
  api: z.literal("soda3"),
  default_access: SocrataDefaultAccessSchema,
  backfill: SocrataBackfillSchema.optional(),
}).strict();

const UrlManifestSourceSchema = BaseManifestSourceSchema.extend({
  type: z.enum(["web_page", "gtfs_static_zip", "gtfs_realtime_api", "pdf_or_doc", "standard_doc"]),
  url: z.string().min(1),
}).strict();

const FileDownloadManifestSourceSchema = BaseManifestSourceSchema.extend({
  type: z.literal("file_download"),
  url: z.string().min(1),
}).passthrough();

export const ManifestSourceSchema = z.discriminatedUnion("type", [
  SocrataManifestSourceSchema,
  UrlManifestSourceSchema,
  FileDownloadManifestSourceSchema,
]);

export const SourceManifestSchema = z
  .object({
    verified_at: z.string().min(1),
    sources: z.array(ManifestSourceSchema).min(1),
  })
  .strict();

export type SourceManifest = z.output<typeof SourceManifestSchema>;
export type ManifestSource = z.output<typeof ManifestSourceSchema>;
export type SocrataManifestSource = z.output<typeof SocrataManifestSourceSchema>;

export function parseSourceManifestObject(input: unknown): SourceManifest {
  return SourceManifestSchema.parse(input);
}

export function isSocrataManifestSource(source: ManifestSource): source is SocrataManifestSource {
  return source.type === "socrata_dataset";
}

export function listSocrataSources(manifest: SourceManifest): SocrataManifestSource[] {
  return manifest.sources.filter(isSocrataManifestSource);
}

export function getSocrataSource(manifest: SourceManifest, id: string): SocrataManifestSource {
  const source = listSocrataSources(manifest).find((candidate) => candidate.id === id);
  if (source === undefined) {
    throw new Error(`Missing Socrata source in manifest: ${id}`);
  }

  return source;
}
