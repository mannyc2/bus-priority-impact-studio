import { sql } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import { localContextEvent } from "../schema.js";

export async function countContextEvents(db: LocalPipelineDb): Promise<number> {
  const rows = (await db
    .select({ n: sql<number>`count(*)` })
    .from(localContextEvent)) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}
