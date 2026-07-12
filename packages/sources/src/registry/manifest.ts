import { decodeStrict } from "@bp/domain/decode";
import { Schema } from "effect";
import { SocrataDatasetIdSchema } from "../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const SourceIdSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isPattern(/^[a-z0-9_.-]+$/),
);

const SourcePrioritySchema = Schema.Literals(["core", "secondary", "optional"]);
const ManifestStatusSchema = NonEmptyString;

const BaseManifestSourceFields = {
  id: SourceIdSchema,
  priority: SourcePrioritySchema,
  purpose: NonEmptyString,
  status: ManifestStatusSchema,
  notes: Schema.optionalKey(NonEmptyString),
};

const SocrataDefaultAccessSchema = Schema.Struct({
  kind: Schema.Literals(["query", "export"]),
  format: Schema.optionalKey(Schema.Literals(["json", "csv", "geojson"])),
});

const SocrataBackfillSchema = Schema.Struct({
  kind: Schema.Literal("soda3_export"),
  format: Schema.Literals(["csv", "json", "geojson"]),
  supportsByteRange: Schema.Boolean,
  recommendedChunkBytes: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  ),
  defaultQuery: Schema.optionalKey(NonEmptyString),
  orderingSpecifier: Schema.optionalKey(Schema.Literals(["total", "discard"])),
});

const SocrataManifestSourceSchema = Schema.Struct({
  ...BaseManifestSourceFields,
  type: Schema.Literal("socrata_dataset"),
  domain: NonEmptyString,
  dataset_id: SocrataDatasetIdSchema,
  url: NonEmptyString,
  api: Schema.Literal("soda3"),
  default_access: SocrataDefaultAccessSchema,
  backfill: Schema.optionalKey(SocrataBackfillSchema),
});

const UrlManifestSourceSchema = Schema.Struct({
  ...BaseManifestSourceFields,
  type: Schema.Literals([
    "web_page",
    "gtfs_static_zip",
    "gtfs_realtime_api",
    "pdf_or_doc",
    "standard_doc",
  ]),
  url: NonEmptyString,
});

const FileDownloadManifestSourceSchema = Schema.Struct({
  ...BaseManifestSourceFields,
  type: Schema.Literal("file_download"),
  url: NonEmptyString,
});

const NoaaGhcnStationSchema = Schema.Struct({
  id: NonEmptyString,
  name: NonEmptyString,
});

const NoaaGhcnManifestSourceSchema = Schema.Struct({
  ...BaseManifestSourceFields,
  id: Schema.Literal("noaa_ghcn_daily_nyc"),
  type: Schema.Literal("file_download"),
  domain: NonEmptyString,
  url: NonEmptyString,
  stations: Schema.Array(NoaaGhcnStationSchema).check(Schema.isMinLength(1)),
});

export const ManifestSourceSchema = Schema.Union([
  SocrataManifestSourceSchema,
  UrlManifestSourceSchema,
  NoaaGhcnManifestSourceSchema,
  FileDownloadManifestSourceSchema,
]);

export const SourceManifestSchema = Schema.Struct({
  verified_at: NonEmptyString,
  sources: Schema.Array(ManifestSourceSchema).check(Schema.isMinLength(1)),
});

export type SourceManifest = typeof SourceManifestSchema.Type;
export type ManifestSource = typeof ManifestSourceSchema.Type;
export type SocrataManifestSource = typeof SocrataManifestSourceSchema.Type;

export function parseSourceManifestObject(input: unknown): SourceManifest {
  // All union members use one strict policy; the former file-download passthrough was accidental.
  return decodeStrict(SourceManifestSchema)(input);
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
