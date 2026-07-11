import { decodePreserve } from "@bp/domain/decode";
import { RouteIdCodec } from "@bp/domain/primitives";
import { Schema, SchemaGetter } from "effect";
import type { SocrataRow } from "../../core/index.js";
import { isoCalendarDateTime, schemaVersion } from "../../core/index.js";

const NonEmptyString = Schema.String.check(Schema.isMinLength(1));
const IsoDateTimeString = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/),
);
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const CoercedNonNegativeInteger = Schema.Unknown.pipe(
  Schema.decodeTo(NonNegativeInteger, {
    decode: SchemaGetter.transform((value) => Number(value)),
    encode: SchemaGetter.passthrough(),
  }),
);

export const NormalizedAceRouteSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  program: Schema.Literals(["ABLE", "ACE"]),
  implementationDate: IsoDateTimeString,
});

export const NormalizedAceViolationSummarySchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  routeId: NonEmptyString,
  violationType: NonEmptyString,
  violationStatus: NonEmptyString,
  violationCount: NonNegativeInteger,
});

export type NormalizedAceRoute = typeof NormalizedAceRouteSchema.Type;
export type NormalizedAceViolationSummary = typeof NormalizedAceViolationSummarySchema.Type;

const RawAceRouteRowSchema = Schema.Struct({
  route: NonEmptyString,
  program: Schema.Literals(["ABLE", "ACE"]),
  implementation_date: NonEmptyString,
});

const RawAceViolationSummaryRowSchema = Schema.Struct({
  bus_route_id: NonEmptyString,
  violation_type: NonEmptyString,
  violation_status: NonEmptyString,
  violation_count: CoercedNonNegativeInteger,
});

export function normalizeAceRouteRows(rows: SocrataRow[]): NormalizedAceRoute[] {
  return rows
    .map((row) => {
      const parsed = decodePreserve(RawAceRouteRowSchema)(row);

      return {
        schemaVersion,
        routeId: RouteIdCodec.parse(parsed.route),
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
      const parsed = decodePreserve(RawAceViolationSummaryRowSchema)(row);

      return {
        schemaVersion,
        routeId: RouteIdCodec.parse(parsed.bus_route_id),
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
