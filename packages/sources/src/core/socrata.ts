import { decodePreserve } from "@bp/domain/decode";
import { Effect, Schema } from "effect";

export const SocrataDatasetIdSchema = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]{4}-[a-z0-9]{4}$/),
).pipe(Schema.brand("SocrataDatasetId"));

export type SocrataDatasetId = typeof SocrataDatasetIdSchema.Type;

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

export const SocrataColumnSchema = Schema.Struct({
  id: Schema.optionalKey(NonNegativeInteger),
  name: NonEmptyString,
  dataTypeName: Schema.optionalKey(NonEmptyString),
  fieldName: Schema.optionalKey(NonEmptyString),
});

export const SocrataMetadataSchema = Schema.Struct({
  id: SocrataDatasetIdSchema,
  name: NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  attribution: Schema.optionalKey(Schema.String),
  rowsUpdatedAt: Schema.optionalKey(NonNegativeInteger),
  columns: Schema.Array(SocrataColumnSchema).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed([])),
  ),
});

export const SocrataRowSchema = Schema.Record(Schema.String, Schema.Unknown);
export const SocrataRowsSchema = Schema.Array(SocrataRowSchema);

export type SocrataMetadata = typeof SocrataMetadataSchema.Type;
export type SocrataRow = typeof SocrataRowSchema.Type;
export type SocrataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;
export type Soda3ExportFormat = "csv" | "json" | "geojson";

export function buildSocrataMetadataUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}`, `https://${domain}`);
}

export function buildSocrataColumnsUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}/columns.json`, `https://${domain}`);
}

export function soda3QueryUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/v3/views/${datasetId}/query.json`, `https://${domain}`);
}

export function soda3ExportUrl(
  domain: string,
  datasetId: SocrataDatasetId,
  format: Soda3ExportFormat,
): URL {
  return new URL(`/api/v3/views/${datasetId}/export.${format}`, `https://${domain}`);
}

export function parseSocrataMetadata(input: unknown): SocrataMetadata {
  return decodePreserve(SocrataMetadataSchema)(input);
}

export function summarizeSocrataMetadata(metadata: SocrataMetadata): string {
  const columnCount = metadata.columns.length;
  const updated = metadata.rowsUpdatedAt === undefined ? "unknown" : String(metadata.rowsUpdatedAt);

  return `${metadata.id} | ${metadata.name} | columns=${columnCount} | rowsUpdatedAt=${updated}`;
}
