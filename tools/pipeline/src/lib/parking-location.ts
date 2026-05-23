import { createHash } from "node:crypto";
import { canonicalBoroughCode, normalizeStreetName } from "@bp/sources/nyc-geoclient";

export type ParsedParkingCameraLocation = {
  direction: string | null;
  primaryStreet: string;
  crossStreet: string | null;
};

const DIRECTION_PREFIX = /^(NB|SB|EB|WB)\s+(.+)$/i;
const NONZERO_STREET_CODE = /^[1-9]\d*$/;

export function normalizeParkingStreetCode(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed || !NONZERO_STREET_CODE.test(trimmed)) return null;
  return trimmed.padStart(5, "0");
}

export function numericHouseNumber(input: string | null | undefined): number | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parkingCameraLocationKey(input: {
  violationCounty: string | null | undefined;
  streetName: string | null | undefined;
  intersectingStreet: string | null | undefined;
}): string | null {
  const boroughCode = canonicalBoroughCode(input.violationCounty);
  const street = compactUpper(input.streetName);
  if (!boroughCode || !street) return null;
  const intersecting = compactUpper(input.intersectingStreet) ?? "";
  return `camera|${boroughCode}|${street}|${intersecting}`;
}

export function parkingStreetCodeHouseLocationKey(input: {
  violationCounty: string | null | undefined;
  streetCode1: string | null | undefined;
  houseNumber: string | null | undefined;
}): string | null {
  const boroughCode = canonicalBoroughCode(input.violationCounty);
  const streetCode = normalizeParkingStreetCode(input.streetCode1);
  const houseNumber = numericHouseNumber(input.houseNumber);
  if (!boroughCode || !streetCode || houseNumber === null) return null;
  return `street_code_house|${boroughCode}|${streetCode}|${houseNumber}`;
}

export function parkingLocationKey(input: {
  violationCode: number;
  violationCounty: string | null | undefined;
  streetCode1: string | null | undefined;
  houseNumber: string | null | undefined;
  streetName: string | null | undefined;
  intersectingStreet: string | null | undefined;
}): string | null {
  if (input.violationCode === 5) {
    return parkingCameraLocationKey(input);
  }
  return parkingStreetCodeHouseLocationKey(input);
}

export function parseParkingCameraLocation(input: {
  streetName: string | null | undefined;
  intersectingStreet: string | null | undefined;
}): ParsedParkingCameraLocation | null {
  const street = compactSpaces(input.streetName);
  if (!street) return null;

  const directionMatch = DIRECTION_PREFIX.exec(street);
  const direction = directionMatch?.[1]?.toUpperCase() ?? null;
  const withoutDirection = directionMatch?.[2] ?? street;
  const atIndex = withoutDirection.indexOf("@");
  if (atIndex === -1) {
    return { direction, primaryStreet: withoutDirection.trim(), crossStreet: null };
  }

  const primaryStreet = withoutDirection.slice(0, atIndex).trim();
  const crossPrefix = withoutDirection.slice(atIndex + 1).trim();
  if (!primaryStreet) return null;
  return {
    direction,
    primaryStreet,
    crossStreet: stitchCrossStreet(crossPrefix, input.intersectingStreet),
  };
}

export function streetCorridorKey(input: {
  boroughCode: string | null | undefined;
  streetName: string | null | undefined;
}): string | null {
  const boroughCode = input.boroughCode?.trim();
  const street = normalizeStreetName(input.streetName);
  if (!boroughCode || !street) return null;
  return `${boroughCode}|${street}`;
}

export function stableMatchEvidenceHash(input: unknown): string {
  return createHash("sha1").update(JSON.stringify(input)).digest("hex");
}

function stitchCrossStreet(prefixRaw: string, suffixRaw: string | null | undefined): string | null {
  const prefix = compactSpaces(prefixRaw);
  const suffix = compactSpaces(suffixRaw);
  if (!prefix && !suffix) return null;
  if (!prefix) return suffix;
  if (!suffix) return prefix;
  if (/^[NSEW]$/i.test(suffix)) return prefix;

  const prefixTokens = prefix.split(/\s+/);
  const suffixTokens = suffix.split(/\s+/);
  const lastPrefix = prefixTokens[prefixTokens.length - 1] ?? "";
  const firstSuffix = suffixTokens[0] ?? "";

  if (/^\d+$/.test(lastPrefix) && /^(ST|ND|RD|TH)$/i.test(firstSuffix)) {
    prefixTokens[prefixTokens.length - 1] = `${lastPrefix}${firstSuffix}`;
    return [...prefixTokens, ...suffixTokens.slice(1)].join(" ");
  }

  if (/^[A-Z]{1,8}$/i.test(lastPrefix) && /^[A-Z]{1,12}$/i.test(firstSuffix)) {
    prefixTokens[prefixTokens.length - 1] = `${lastPrefix}${firstSuffix}`;
    return [...prefixTokens, ...suffixTokens.slice(1)].join(" ");
  }

  return `${prefix} ${suffix}`;
}

function compactUpper(input: string | null | undefined): string | null {
  const compacted = compactSpaces(input);
  return compacted ? compacted.toUpperCase() : null;
}

function compactSpaces(input: string | null | undefined): string | null {
  const trimmed = input?.replace(/\s+/g, " ").trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
