import { RouteIdCodec } from "@bp/domain/primitives";
import * as z from "zod";
import type { SocrataRow } from "../../clients/socrata/index.js";
import { isoCalendarDateTime, schemaVersion } from "../../core/index.js";

export const NormalizedAceRouteSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    program: z.enum(["ABLE", "ACE"]),
    implementationDate: z.iso.datetime(),
  })
  .strict();

export const NormalizedAceViolationSummarySchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    routeId: z.string().min(1),
    violationType: z.string().min(1),
    violationStatus: z.string().min(1),
    violationCount: z.number().int().nonnegative(),
  })
  .strict();

export type NormalizedAceRoute = z.output<typeof NormalizedAceRouteSchema>;
export type NormalizedAceViolationSummary = z.output<typeof NormalizedAceViolationSummarySchema>;

const RawAceRouteRowSchema = z
  .object({
    route: z.string().min(1),
    program: z.enum(["ABLE", "ACE"]),
    implementation_date: z.string().min(1),
  })
  .passthrough();

const RawAceViolationSummaryRowSchema = z
  .object({
    bus_route_id: z.string().min(1),
    violation_type: z.string().min(1),
    violation_status: z.string().min(1),
    violation_count: z.coerce.number().int().nonnegative(),
  })
  .passthrough();

export function normalizeAceRouteRows(rows: SocrataRow[]): NormalizedAceRoute[] {
  return rows
    .map((row) => {
      const parsed = RawAceRouteRowSchema.parse(row);

      return {
        schemaVersion,
        routeId: z.decode(RouteIdCodec, parsed.route),
        program: parsed.program,
        implementationDate: isoCalendarDateTime(parsed.implementation_date),
      } satisfies NormalizedAceRoute;
    })
    .sort((left, right) => {
      const routeCompare = left.routeId.localeCompare(right.routeId);
      if (routeCompare !== 0) {
        return routeCompare;
      }

      return left.implementationDate.localeCompare(right.implementationDate);
    });
}

export function normalizeAceViolationSummaryRows(
  rows: SocrataRow[],
): NormalizedAceViolationSummary[] {
  return rows
    .map((row) => {
      const parsed = RawAceViolationSummaryRowSchema.parse(row);

      return {
        schemaVersion,
        routeId: z.decode(RouteIdCodec, parsed.bus_route_id),
        violationType: parsed.violation_type,
        violationStatus: parsed.violation_status,
        violationCount: parsed.violation_count,
      } satisfies NormalizedAceViolationSummary;
    })
    .sort((left, right) => {
      const routeCompare = left.routeId.localeCompare(right.routeId);
      if (routeCompare !== 0) {
        return routeCompare;
      }

      const typeCompare = left.violationType.localeCompare(right.violationType);
      if (typeCompare !== 0) {
        return typeCompare;
      }

      return left.violationStatus.localeCompare(right.violationStatus);
    });
}
