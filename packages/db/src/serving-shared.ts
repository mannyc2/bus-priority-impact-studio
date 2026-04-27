import * as z from "zod";

export const IsoMonthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export function parseJsonField(value: string): unknown {
  return JSON.parse(value) as unknown;
}
