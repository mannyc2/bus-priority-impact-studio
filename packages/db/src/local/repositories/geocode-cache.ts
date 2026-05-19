import { eq, sql } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import { localAddressGeocode } from "../schema.js";

export type LocalGeocodeCacheRow = {
  rawKey: string;
  sourceLabel: string;
  inputKind: "address" | "intersection" | "search" | "latlng" | "fuzzy";
  inputJson: string;
  physicalId: string | null;
  lat: number | null;
  lng: number | null;
  confidence: string | null;
  errorReason: string | null;
  geocodedAt: string;
  rawResponse: string | null;
};

export async function getGeocodeCacheRow(
  db: LocalPipelineDb,
  rawKey: string,
): Promise<LocalGeocodeCacheRow | null> {
  const rows = await db
    .select()
    .from(localAddressGeocode)
    .where(eq(localAddressGeocode.rawKey, rawKey))
    .limit(1);
  return (rows[0] as LocalGeocodeCacheRow | undefined) ?? null;
}

export async function upsertGeocodeCacheRow(
  db: LocalPipelineDb,
  row: LocalGeocodeCacheRow,
): Promise<void> {
  await db
    .insert(localAddressGeocode)
    .values(row)
    .onConflictDoUpdate({
      target: localAddressGeocode.rawKey,
      set: {
        sourceLabel: sql`excluded.source_label`,
        inputKind: sql`excluded.input_kind`,
        inputJson: sql`excluded.input_json`,
        physicalId: sql`excluded.physical_id`,
        lat: sql`excluded.lat`,
        lng: sql`excluded.lng`,
        confidence: sql`excluded.confidence`,
        errorReason: sql`excluded.error_reason`,
        geocodedAt: sql`excluded.geocoded_at`,
        rawResponse: sql`excluded.raw_response`,
      },
    });
}
