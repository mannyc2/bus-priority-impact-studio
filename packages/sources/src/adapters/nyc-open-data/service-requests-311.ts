import * as z from "zod";
import type { SocrataRow } from "../../clients/socrata/index.js";
import { schemaVersion } from "../../core/index.js";

export const ServiceRequestEraSchema = z.enum(["current", "historical"]);
export type ServiceRequestEra = z.output<typeof ServiceRequestEraSchema>;

// Bus-relevant complaint types (used as the default $where filter for ingest).
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
      } satisfies Normalized311ServiceRequest;
    })
    .sort((a, b) => a.uniqueKey.localeCompare(b.uniqueKey));
}
