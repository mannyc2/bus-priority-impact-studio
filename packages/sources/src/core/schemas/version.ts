import { Schema } from "effect";

export const schemaVersion = 1;
export const IsoMonthStringSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}$/));

export function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function isoCalendarDateTime(value: string): string {
  return value.endsWith("Z") ? value : `${value}Z`;
}
