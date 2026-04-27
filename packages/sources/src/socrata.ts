import * as z from "zod";

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

export type SocrataMetadata = z.output<typeof SocrataMetadataSchema>;

export function buildSocrataMetadataUrl(domain: string, datasetId: SocrataDatasetId): URL {
  return new URL(`/api/views/${datasetId}`, `https://${domain}`);
}

export function parseSocrataMetadata(input: unknown): SocrataMetadata {
  return SocrataMetadataSchema.parse(input);
}

export function summarizeSocrataMetadata(metadata: SocrataMetadata): string {
  const columnCount = metadata.columns.length;
  const updated = metadata.rowsUpdatedAt === undefined ? "unknown" : String(metadata.rowsUpdatedAt);

  return `${metadata.id} | ${metadata.name} | columns=${columnCount} | rowsUpdatedAt=${updated}`;
}
