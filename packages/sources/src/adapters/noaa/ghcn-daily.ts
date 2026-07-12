import { Schema } from "effect";

/**
 * NOAA GHCN-Daily — Global Historical Climatology Network, daily summaries.
 *
 * Source: https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/<STATION>.csv
 *
 * No API key required. One CSV per station, ~17 MB each for the full archive
 * back to the station's start date. We download the file, then filter to the
 * window of interest in code.
 *
 * Values in the raw CSV use GHCN integer encodings:
 *   PRCP, SNOW, SNWD — tenths of mm  → divide by 10 to get mm
 *   TMAX, TMIN, TAVG — tenths of °C  → divide by 10 to get °C
 *   AWND             — tenths of m/s → divide by 10 to get m/s
 *
 * Weather-type indicator columns (`WT01`..`WT22`) hold "1" on days when the
 * condition was observed; only the subset relevant to road operations is
 * surfaced.
 */

export const NOAA_NYC_STATIONS = [
  { id: "USW00094728", name: "NY CITY CENTRAL PARK" },
  { id: "USW00014732", name: "NY LA GUARDIA AP" },
  { id: "USW00094789", name: "JFK INTERNATIONAL" },
] as const;

export type WeatherStationId = (typeof NOAA_NYC_STATIONS)[number]["id"];

const NullableNumber = Schema.NullOr(Schema.Number);
const NullableBoolean = Schema.NullOr(Schema.Boolean);

export const NormalizedWeatherObservationSchema = Schema.Struct({
  stationId: Schema.String.check(Schema.isMinLength(1)),
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  stationName: Schema.NullOr(Schema.String),
  latitude: NullableNumber,
  longitude: NullableNumber,
  elevationM: NullableNumber,
  prcpMm: NullableNumber,
  snowMm: NullableNumber,
  snwdMm: NullableNumber,
  tmaxC: NullableNumber,
  tminC: NullableNumber,
  tavgC: NullableNumber,
  awndMs: NullableNumber,
  hasFog: NullableBoolean,
  hasThunder: NullableBoolean,
  hasSleet: NullableBoolean,
  hasHail: NullableBoolean,
  hasHighWind: NullableBoolean,
  hasRain: NullableBoolean,
  hasSnow: NullableBoolean,
});

export type NormalizedWeatherObservation = typeof NormalizedWeatherObservationSchema.Type;

function tenthsToReal(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n / 10 : null;
}

function flagOne(raw: string | undefined): boolean | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed === "1";
}

function realOrNull(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function dequote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Parse a single line of GHCN CSV. The file uses CSV with quoted string
 * values and trailing commas after empty optional columns, but no embedded
 * commas inside the data we care about, so a simple split is sufficient.
 */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
      buf += ch;
    } else if (ch === "," && !inQuote) {
      fields.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  fields.push(buf);
  return fields;
}

/**
 * Parse a full GHCN-Daily CSV (header + N rows) and return normalized
 * observations for the given inclusive date window. Rows outside the window
 * are skipped — this keeps memory low for the 17MB-per-station archives.
 */
export function parseGhcnDailyCsv(
  csv: string,
  options: { sinceDate: string; untilDate?: string },
): NormalizedWeatherObservation[] {
  const lines = csv.split(/\r?\n/);
  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0] ?? "").map(dequote);
  const idxOf = (name: string): number => header.indexOf(name);

  const STATION = idxOf("STATION");
  const DATE = idxOf("DATE");
  if (STATION === -1 || DATE === -1) return [];

  const cols = [
    "NAME",
    "LATITUDE",
    "LONGITUDE",
    "ELEVATION",
    "PRCP",
    "SNOW",
    "SNWD",
    "TMAX",
    "TMIN",
    "TAVG",
    "AWND",
    "WT01",
    "WT03",
    "WT04",
    "WT05",
    "WT11",
    "WT16",
    "WT18",
  ] as const;
  const colIdx: Record<(typeof cols)[number], number> = {} as Record<(typeof cols)[number], number>;
  for (const c of cols) colIdx[c] = idxOf(c);

  const since = options.sinceDate;
  const until = options.untilDate ?? "9999-12-31";

  const out: NormalizedWeatherObservation[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const fields = splitCsvLine(line).map(dequote);

    const date = fields[DATE];
    if (!date || date < since || date > until) continue;

    const stationId = fields[STATION];
    if (!stationId) continue;

    const get = (name: (typeof cols)[number]): string | undefined => {
      const idx = colIdx[name];
      return idx === -1 ? undefined : fields[idx];
    };

    out.push({
      stationId,
      date,
      stationName: get("NAME") ?? null,
      latitude: realOrNull(get("LATITUDE")),
      longitude: realOrNull(get("LONGITUDE")),
      elevationM: realOrNull(get("ELEVATION")),
      prcpMm: tenthsToReal(get("PRCP")),
      snowMm: tenthsToReal(get("SNOW")),
      snwdMm: tenthsToReal(get("SNWD")),
      tmaxC: tenthsToReal(get("TMAX")),
      tminC: tenthsToReal(get("TMIN")),
      tavgC: tenthsToReal(get("TAVG")),
      awndMs: tenthsToReal(get("AWND")),
      hasFog: flagOne(get("WT01")),
      hasThunder: flagOne(get("WT03")),
      hasSleet: flagOne(get("WT04")),
      hasHail: flagOne(get("WT05")),
      hasHighWind: flagOne(get("WT11")),
      hasRain: flagOne(get("WT16")),
      hasSnow: flagOne(get("WT18")),
    });
  }
  return out;
}
