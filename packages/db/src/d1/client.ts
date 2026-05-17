import type { D1Database } from "@cloudflare/workers-types";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";

export type D1ServingSchema = typeof schema;
export type D1ServingDb = DrizzleD1Database<D1ServingSchema>;

export function createD1ServingDb(database: D1Database): D1ServingDb {
  return drizzle(database, { schema });
}
