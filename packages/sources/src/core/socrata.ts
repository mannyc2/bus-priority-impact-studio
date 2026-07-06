import * as z from "@bp/domain/schema-compat";

export const SocrataDatasetIdSchema = z
  .string()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
  .brand<"SocrataDatasetId">();

export type SocrataDatasetId = z.output<typeof SocrataDatasetIdSchema>;

export const SocrataColumnSchema = z
  .object({
    id: z.number().int().nonnegative().optional(),
    name: z.string().min(1),
    dataTypeName: z.string().min(1).optional(),
    fieldName: z.string().min(1).optional(),
  })
  .passthrough();

export const SocrataMetadataSchema = z
  .object({
    id: SocrataDatasetIdSchema,
    name: z.string().min(1),
    description: z.string().optional(),
    attribution: z.string().optional(),
    rowsUpdatedAt: z.number().int().nonnegative().optional(),
    columns: z.array(SocrataColumnSchema).default([]),
  })
  .passthrough();

export const SocrataRowSchema = z.record(z.string(), z.unknown());
export const SocrataRowsSchema = z.array(SocrataRowSchema);

export type SocrataMetadata = z.output<typeof SocrataMetadataSchema>;
export type SocrataRow = z.output<typeof SocrataRowSchema>;
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
  return SocrataMetadataSchema.parse(input);
}

export function summarizeSocrataMetadata(metadata: SocrataMetadata): string {
  const columnCount = metadata.columns.length;
  const updated = metadata.rowsUpdatedAt === undefined ? "unknown" : String(metadata.rowsUpdatedAt);

  return `${metadata.id} | ${metadata.name} | columns=${columnCount} | rowsUpdatedAt=${updated}`;
}
