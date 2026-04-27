import * as z from "zod";
import { SocrataDatasetIdSchema } from "../socrata/client.js";

const SourceIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9_.-]+$/);

const SourcePrioritySchema = z.enum(["core", "secondary", "optional"]);

const BaseManifestSourceSchema = z.object({
  id: SourceIdSchema,
  priority: SourcePrioritySchema,
  purpose: z.string().min(1),
  status: z.string().min(1),
});

const SocrataManifestSourceSchema = BaseManifestSourceSchema.extend({
  type: z.literal("socrata_dataset"),
  domain: z.string().min(1),
  dataset_id: SocrataDatasetIdSchema,
  url: z.string().min(1),
  api_json: z.string().min(1),
  columns_json: z.string().min(1),
  rows_csv: z.string().min(1),
});

const UrlManifestSourceSchema = BaseManifestSourceSchema.extend({
  type: z.enum(["web_page", "gtfs_static_zip", "gtfs_realtime_api", "pdf_or_doc", "standard_doc"]),
  url: z.string().min(1),
});

export const ManifestSourceSchema = z.discriminatedUnion("type", [
  SocrataManifestSourceSchema,
  UrlManifestSourceSchema,
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

export function parseSourceManifest(text: string): SourceManifest {
  return SourceManifestSchema.parse(Bun.YAML.parse(text));
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
