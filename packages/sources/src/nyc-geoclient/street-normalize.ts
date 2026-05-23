/**
 * Normalize street names so the fallback resolver can match LION's
 * `street_name` field even when source data uses a different abbreviation,
 * spelled-out form, or ordinal style.
 *
 * Examples:
 *   "1st Avenue"    -> "1 AVENUE"
 *   "1 AVE"         -> "1 AVENUE"
 *   "FIRST AVE"     -> "1 AVENUE"
 *   "broadway"      -> "BROADWAY"
 *   "MLK Jr Blvd"   -> "MARTIN LUTHER KING JUNIOR BOULEVARD"
 *
 * This is intentionally rule-based and not exhaustive; Geoclient handles the
 * 95% case and this fallback covers a long tail with predictable transforms.
 */

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

const SUFFIX_TO_REMOVE_FROM_ORDINAL = /^(\d+)(ST|ND|RD|TH)$/;

export function normalizeStreetName(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const tokens = trimmed
    .toUpperCase()
    .replace(/\./g, " ")
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const out: string[] = [];
  for (const token of tokens) {
    // Strip ordinal suffix: 1ST -> 1
    const ordinalMatch = SUFFIX_TO_REMOVE_FROM_ORDINAL.exec(token);
    if (ordinalMatch && ordinalMatch[1]) {
      out.push(ordinalMatch[1]);
      continue;
    }
    const ordinalReplacement = ORDINAL_WORDS[token];
    if (ordinalReplacement) {
      out.push(ordinalReplacement);
      continue;
    }
    const suffixReplacement = SUFFIX_MAP[token];
    if (suffixReplacement) {
      out.push(suffixReplacement);
      continue;
    }
    const acronymReplacement = ACRONYM_EXPANSIONS[token];
    if (acronymReplacement) {
      out.push(acronymReplacement);
      continue;
    }
    const directionReplacement = ABBREV_DIRECTIONS[token];
    if (directionReplacement && out.length === 0) {
      out.push(directionReplacement);
      continue;
    }
    out.push(token);
  }

  return out.join(" ");
}

/**
 * Parse a single-field NYC address string like "203       E 197 ST" or
 * "64-40  219 ST" into {houseNumber, street}. Returns null when the leading
 * token isn't an obvious house number. Used to recover NYPD `off_street_name`
 * and 311 `incident_address` fields that come as a single combined string.
 *
 * Accepts:
 *   "203 E 197 ST"
 *   "64-40 219 ST"      (Queens hyphenated)
 *   "1050 RIVERSIDE DR"
 *   "26A WEST 4 ST"     (apartment letter suffix)
 *   "300       WILD AVE"
 */
export function parseHouseAddress(
  raw: string | null | undefined,
): { houseNumber: string; street: string } | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Leading: digits, optional hyphen+digits (Queens), optional single letter
  // suffix (apartment). Then whitespace, then street.
  const match = trimmed.match(/^(\d+(?:-\d+)?[A-Za-z]?)\s+(.+)$/);
  if (!match || !match[1] || !match[2]) return null;
  const street = match[2].replace(/\s+/g, " ").trim();
  if (street.length === 0) return null;
  return { houseNumber: match[1], street };
}

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
  // LION publishes borough_indicator as single-letter codes.
  m: "1",
  b: "3", // Brooklyn
  k: "3",
  x: "2", // Bronx
  q: "4",
  r: "5", // Richmond/SI
  s: "5",
  "1": "1",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
};

export function canonicalBoroughCode(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0) return null;

  const candidates: string[] = [trimmed];

  // Strip a leading community-board prefix like "01 BROOKLYN".
  const cbMatch = trimmed.match(/^\d+\s+(.+)$/);
  if (cbMatch && cbMatch[1]) candidates.push(cbMatch[1]);

  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);

  // Last two tokens — handles "Staten Island", or "Unspecified Staten Island".
  if (tokens.length >= 2) {
    candidates.push(`${tokens[tokens.length - 2]} ${tokens[tokens.length - 1]}`);
  }
  // Each individual token — handles "Unspecified BRONX", "Some prefix QUEENS".
  for (const t of tokens) candidates.push(t);

  for (const c of candidates) {
    const code = BOROUGH_CODES[c] ?? LION_BOROUGH_CODES[c];
    if (code) return code;
  }
  return null;
}

const CODE_TO_GEOCLIENT_NAME: Record<string, string> = {
  "1": "manhattan",
  "2": "bronx",
  "3": "brooklyn",
  "4": "queens",
  "5": "staten island",
};

/**
 * Map any of {full name, two-letter code, single-letter LION code, numeric
 * borough code, "NY"/"K"/"BX"/"Q"/"R" county codes, "01 BROOKLYN" community
 * board strings} → a borough name Geoclient v2 accepts. Returns null if the
 * input cannot be resolved; callers should treat that as a hard miss rather
 * than send the API a guess.
 */
export function canonicalBoroughName(input: string | null | undefined): string | null {
  const code = canonicalBoroughCode(input);
  if (code == null) return null;
  return CODE_TO_GEOCLIENT_NAME[code] ?? null;
}
