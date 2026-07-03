import * as z from "zod";
import type { SocrataRow } from "../../core/index.js";
import { schemaVersion } from "../../core/index.js";

export const ServiceRequestEraSchema = z.enum(["current", "historical"]);
export type ServiceRequestEra = z.output<typeof ServiceRequestEraSchema>;

export const CurbFriction311CategorySchema = z.enum([
  "double_parking",
  "blocked_lane",
  "blocked_driveway",
  "blocked_hydrant",
  "blocked_bus_stop",
]);
export type CurbFriction311Category = z.output<typeof CurbFriction311CategorySchema>;

export type CurbFriction311Classification = {
  category: CurbFriction311Category;
  rule: string;
};

// Deterministic complaint-type allowlist for curb-friction 311 ingest.
export const CURB_FRICTION_311_COMPLAINT_TYPES = [
  "Blocked Driveway",
  "Illegal Parking",
  "Bus Stop Condition",
] as const;

// Older broad bus-relevant complaint list, retained for explicit exploratory overrides.
export const BUS_RELEVANT_311_COMPLAINTS = [
  "Blocked Driveway",
  "Illegal Parking",
  "Traffic Signal Condition",
  "Street Condition",
  "Bus Stop Condition",
  "Posted Parking Sign Violation",
  "Drag Racing",
  "Derelict Vehicle",
  "Traffic",
] as const;

function normalizedText(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function hasAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

export function classify311CurbFriction(input: {
  complaintType: string | null;
  descriptor: string | null;
}): CurbFriction311Classification | null {
  const complaintType = normalizedText(input.complaintType);
  const descriptor = normalizedText(input.descriptor);

  if (complaintType === "blocked driveway") {
    return {
      category: "blocked_driveway",
      rule: "complaint_type:blocked_driveway",
    };
  }

  if (complaintType === "illegal parking") {
    if (descriptor.includes("double park")) {
      return {
        category: "double_parking",
        rule: "illegal_parking_descriptor:double_parked",
      };
    }
    if (descriptor.includes("hydrant")) {
      return {
        category: "blocked_hydrant",
        rule: "illegal_parking_descriptor:hydrant",
      };
    }
    if (descriptor.includes("bus stop")) {
      return {
        category: "blocked_bus_stop",
        rule: "illegal_parking_descriptor:bus_stop",
      };
    }
    if (hasAny(descriptor, ["blocked lane", "blocking traffic", "blocked bike lane", "bus lane"])) {
      return {
        category: "blocked_lane",
        rule: "illegal_parking_descriptor:blocked_lane",
      };
    }
  }

  if (
    complaintType === "bus stop condition" &&
    hasAny(descriptor, ["blocked", "obstruct", "illegal parking", "no standing"])
  ) {
    return {
      category: "blocked_bus_stop",
      rule: "bus_stop_condition_descriptor:blocked_or_obstructed",
    };
  }

  return null;
}

export const Normalized311ServiceRequestSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    uniqueKey: z.string().min(1),
    era: ServiceRequestEraSchema,
    createdDate: z.string().min(1),
    closedDate: z.string().nullable(),
    agency: z.string().nullable(),
    agencyName: z.string().nullable(),
    complaintType: z.string().nullable(),
    descriptor: z.string().nullable(),
    locationType: z.string().nullable(),
    incidentZip: z.string().nullable(),
    incidentAddress: z.string().nullable(),
    streetName: z.string().nullable(),
    crossStreet1: z.string().nullable(),
    crossStreet2: z.string().nullable(),
    city: z.string().nullable(),
    status: z.string().nullable(),
    resolutionDescription: z.string().nullable(),
    communityBoard: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    curbFrictionCategory: CurbFriction311CategorySchema.nullable(),
    curbFrictionRule: z.string().nullable(),
  })
  .strict();

export type Normalized311ServiceRequest = z.output<typeof Normalized311ServiceRequestSchema>;

const strN = z
  .union([z.null(), z.undefined(), z.string()])
  .transform((v) => (v === undefined ? null : v));
const numN = z
  .union([z.null(), z.undefined(), z.coerce.number()])
  .transform((v) => (v === undefined ? null : v));

const Raw311RowSchema = z
  .object({
    unique_key: z.coerce.string(),
    created_date: z.string().min(1),
    closed_date: strN,
    agency: strN,
    agency_name: strN,
    complaint_type: strN,
    descriptor: strN,
    location_type: strN,
    incident_zip: strN,
    incident_address: strN,
    street_name: strN,
    cross_street_1: strN,
    cross_street_2: strN,
    city: strN,
    status: strN,
    resolution_description: strN,
    community_board: strN,
    latitude: numN,
    longitude: numN,
  })
  .passthrough();

export function normalize311ServiceRequestRows(
  rows: SocrataRow[],
  era: ServiceRequestEra,
): Normalized311ServiceRequest[] {
  return rows
    .map((row) => {
      const p = Raw311RowSchema.parse(row);
      const curbFriction = classify311CurbFriction({
        complaintType: p.complaint_type,
        descriptor: p.descriptor,
      });
      return {
        schemaVersion,
        uniqueKey: p.unique_key,
        era,
        createdDate: p.created_date,
        closedDate: p.closed_date,
        agency: p.agency,
        agencyName: p.agency_name,
        complaintType: p.complaint_type,
        descriptor: p.descriptor,
        locationType: p.location_type,
        incidentZip: p.incident_zip,
        incidentAddress: p.incident_address,
        streetName: p.street_name,
        crossStreet1: p.cross_street_1,
        crossStreet2: p.cross_street_2,
        city: p.city,
        status: p.status,
        resolutionDescription: p.resolution_description,
        communityBoard: p.community_board,
        latitude: p.latitude,
        longitude: p.longitude,
        curbFrictionCategory: curbFriction?.category ?? null,
        curbFrictionRule: curbFriction?.rule ?? null,
      } satisfies Normalized311ServiceRequest;
    })
    .sort((a, b) => a.uniqueKey.localeCompare(b.uniqueKey));
}
