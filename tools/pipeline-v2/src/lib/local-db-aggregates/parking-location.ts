import { createHash } from "node:crypto";

export type ParsedParkingCameraLocation = {
  direction: string | null;
  primaryStreet: string;
  crossStreet: string | null;
};

const SUFFIX_MAP: Record<string, string> = {
  AVE: "AVENUE",
  AV: "AVENUE",
  ST: "STREET",
  STR: "STREET",
  RD: "ROAD",
  BLVD: "BOULEVARD",
  BLV: "BOULEVARD",
  DR: "DRIVE",
  PL: "PLACE",
  PLZ: "PLAZA",
  CT: "COURT",
  EXPY: "EXPRESSWAY",
  PKWY: "PARKWAY",
  PKY: "PARKWAY",
  HWY: "HIGHWAY",
  TPKE: "TURNPIKE",
  TER: "TERRACE",
  CIR: "CIRCLE",
  LN: "LANE",
  SQ: "SQUARE",
  XING: "CROSSING",
};

const ORDINAL_WORDS: Record<string, string> = {
  FIRST: "1",
  SECOND: "2",
  THIRD: "3",
  FOURTH: "4",
  FIFTH: "5",
  SIXTH: "6",
  SEVENTH: "7",
  EIGHTH: "8",
  NINTH: "9",
  TENTH: "10",
  ELEVENTH: "11",
  TWELFTH: "12",
};

const ACRONYM_EXPANSIONS: Record<string, string> = {
  MLK: "MARTIN LUTHER KING",
  JFK: "JOHN F KENNEDY",
  FDR: "FRANKLIN D ROOSEVELT",
};

const ABBREV_DIRECTIONS: Record<string, string> = {
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
  NE: "NORTHEAST",
  NW: "NORTHWEST",
  SE: "SOUTHEAST",
  SW: "SOUTHWEST",
};

const BOROUGH_CODES: Record<string, string> = {
  manhattan: "1",
  "new york": "1",
  ny: "1",
  mn: "1",
  bronx: "2",
  bx: "2",
  brooklyn: "3",
  kings: "3",
  bk: "3",
  queens: "4",
  qn: "4",
  qns: "4",
  "staten island": "5",
  richmond: "5",
  si: "5",
  st: "5",
};

const LION_BOROUGH_CODES: Record<string, string> = {
  m: "1",
  b: "3",
  k: "3",
  x: "2",
  q: "4",
  r: "5",
  s: "5",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

const DIRECTION_PREFIX = /^(NB|SB|EB|WB)\s+(.+)$/i;
const NONZERO_STREET_CODE = /^[1-9]\d*$/;
const SUFFIX_TO_REMOVE_FROM_ORDINAL = /^(\d+)(ST|ND|RD|TH)$/;

export function normalizeParkingStreetName(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const tokens = trimmed
    .toUpperCase()
    .replace(/\./g, " ")
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);

  const output: string[] = [];
  for (const token of tokens) {
    const ordinalMatch = SUFFIX_TO_REMOVE_FROM_ORDINAL.exec(token);
    if (ordinalMatch?.[1]) {
      output.push(ordinalMatch[1]);
      continue;
    }
    const ordinalReplacement = ORDINAL_WORDS[token];
    if (ordinalReplacement) {
      output.push(ordinalReplacement);
      continue;
    }
    const suffixReplacement = SUFFIX_MAP[token];
    if (suffixReplacement) {
      output.push(suffixReplacement);
      continue;
    }
    const acronymReplacement = ACRONYM_EXPANSIONS[token];
    if (acronymReplacement) {
      output.push(acronymReplacement);
      continue;
    }
    const directionReplacement = ABBREV_DIRECTIONS[token];
    if (directionReplacement && output.length === 0) {
      output.push(directionReplacement);
      continue;
    }
    output.push(token);
  }

  return output.join(" ");
}

export function canonicalParkingBoroughCode(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  const candidates: string[] = [trimmed];
  const communityBoardMatch = trimmed.match(/^\d+\s+(.+)$/);
  if (communityBoardMatch?.[1]) candidates.push(communityBoardMatch[1]);

  const tokens = trimmed.split(/\s+/).filter((token) => token.length > 0);
  if (tokens.length >= 2) {
    candidates.push(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
  }
  candidates.push(...tokens);

  for (const candidate of candidates) {
    const code = BOROUGH_CODES[candidate] ?? LION_BOROUGH_CODES[candidate];
    if (code) return code;
  }
  return null;
}

export function normalizeParkingStreetCode(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed || !NONZERO_STREET_CODE.test(trimmed)) return null;
  return trimmed.padStart(5, "0");
}

export function numericHouseNumber(input: string | null | undefined): number | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/[^0-9]/gu, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parkingCameraLocationKey(input: {
  violationCounty: string | null | undefined;
  streetName: string | null | undefined;
  intersectingStreet: string | null | undefined;
}): string | null {
  const boroughCode = canonicalParkingBoroughCode(input.violationCounty);
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
  const boroughCode = canonicalParkingBoroughCode(input.violationCounty);
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
  const street = normalizeParkingStreetName(input.streetName);
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

  const prefixTokens = prefix.split(/\s+/u);
  const suffixTokens = suffix.split(/\s+/u);
  const lastPrefix = prefixTokens[prefixTokens.length - 1] ?? "";
  const firstSuffix = suffixTokens[0] ?? "";

  if (/^\d+$/u.test(lastPrefix) && /^(ST|ND|RD|TH)$/i.test(firstSuffix)) {
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
  const trimmed = input?.replace(/\s+/gu, " ").trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
