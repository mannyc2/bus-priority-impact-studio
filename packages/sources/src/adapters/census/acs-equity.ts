import { decodePreserve } from "@bp/domain/decode";
import { Schema } from "effect";

const schemaVersion = 1;

export const censusAcsProfileVariables = {
  name: "NAME",
  totalPopulation: "DP05_0001E",
  medianHouseholdIncome: "DP03_0062E",
  povertyRate: "DP03_0128PE",
  publicTransitCommuters: "DP03_0021E",
  publicTransitCommuterShare: "DP03_0021PE",
  occupiedHousingUnits: "DP04_0045E",
  noVehicleHouseholds: "DP04_0058E",
  noVehicleHouseholdShare: "DP04_0058PE",
  hispanicShare: "DP05_0090PE",
  nonHispanicWhiteShare: "DP05_0096PE",
  nonHispanicBlackShare: "DP05_0097PE",
  nonHispanicAsianShare: "DP05_0099PE",
} as const;

const CensusTableSchema = Schema.Array(Schema.Array(Schema.String));
const Integer = Schema.Number.check(Schema.isInt());
const NonNegativeInteger = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));
const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0));
const NullableNonNegativeInteger = Schema.NullOr(NonNegativeInteger);
const NullableNonNegativeNumber = Schema.NullOr(NonNegativeNumber);

export const NormalizedCensusTractEquityContextSchema = Schema.Struct({
  schemaVersion: Schema.Literal(schemaVersion),
  acsYear: Integer,
  geoid: Schema.String.check(Schema.isPattern(/^\d{11}$/)),
  stateFips: Schema.String.check(Schema.isPattern(/^\d{2}$/)),
  countyFips: Schema.String.check(Schema.isPattern(/^\d{3}$/)),
  tractCode: Schema.String.check(Schema.isPattern(/^\d{6}$/)),
  countyName: Schema.String.check(Schema.isMinLength(1)),
  tractName: Schema.String.check(Schema.isMinLength(1)),
  totalPopulation: NullableNonNegativeInteger,
  occupiedHousingUnits: NullableNonNegativeInteger,
  noVehicleHouseholds: NullableNonNegativeInteger,
  noVehicleHouseholdShare: NullableNonNegativeNumber,
  medianHouseholdIncome: NullableNonNegativeInteger,
  povertyRate: NullableNonNegativeNumber,
  publicTransitCommuters: NullableNonNegativeInteger,
  publicTransitCommuterShare: NullableNonNegativeNumber,
  raceEthnicityShare: Schema.Struct({
    hispanic: NullableNonNegativeNumber,
    nonHispanicWhite: NullableNonNegativeNumber,
    nonHispanicBlack: NullableNonNegativeNumber,
    nonHispanicAsian: NullableNonNegativeNumber,
  }),
});

export type NormalizedCensusTractEquityContext =
  typeof NormalizedCensusTractEquityContextSchema.Type;

type CensusProfileVariable =
  (typeof censusAcsProfileVariables)[keyof typeof censusAcsProfileVariables];
type CensusRowKey = CensusProfileVariable | "state" | "county" | "tract";
type CensusRow = Partial<Record<CensusRowKey, string>>;

function parseCensusNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseCensusInteger(value: string | undefined): number | null {
  const parsed = parseCensusNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function parseName(name: string): { countyName: string; tractName: string } {
  const [tractName, countyName] = name.split(";").map((part) => part.trim());

  return {
    countyName: countyName ?? "Unknown County",
    tractName: tractName ?? name,
  };
}

function tableRows(table: unknown): CensusRow[] {
  const parsed = decodePreserve(CensusTableSchema)(table);
  const [headers, ...rows] = parsed;
  if (headers === undefined) {
    return [];
  }

  return rows.map(
    (row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])) as CensusRow,
  );
}

function normalizeRow(row: CensusRow, acsYear: number): NormalizedCensusTractEquityContext {
  const stateFips = row.state ?? "";
  const countyFips = row.county ?? "";
  const tractCode = row.tract ?? "";
  const { countyName, tractName } = parseName(row.NAME ?? "");

  return {
    schemaVersion,
    acsYear,
    geoid: `${stateFips}${countyFips}${tractCode}`,
    stateFips,
    countyFips,
    tractCode,
    countyName,
    tractName,
    totalPopulation: parseCensusInteger(row.DP05_0001E),
    occupiedHousingUnits: parseCensusInteger(row.DP04_0045E),
    noVehicleHouseholds: parseCensusInteger(row.DP04_0058E),
    noVehicleHouseholdShare: parseCensusNumber(row.DP04_0058PE),
    medianHouseholdIncome: parseCensusInteger(row.DP03_0062E),
    povertyRate: parseCensusNumber(row.DP03_0128PE),
    publicTransitCommuters: parseCensusInteger(row.DP03_0021E),
    publicTransitCommuterShare: parseCensusNumber(row.DP03_0021PE),
    raceEthnicityShare: {
      hispanic: parseCensusNumber(row.DP05_0090PE),
      nonHispanicWhite: parseCensusNumber(row.DP05_0096PE),
      nonHispanicBlack: parseCensusNumber(row.DP05_0097PE),
      nonHispanicAsian: parseCensusNumber(row.DP05_0099PE),
    },
  } satisfies NormalizedCensusTractEquityContext;
}

export function normalizeCensusTractEquityRows(
  table: unknown,
  acsYear: number,
): NormalizedCensusTractEquityContext[] {
  return tableRows(table)
    .map((row) => normalizeRow(row, acsYear))
    .sort((left, right) => left.geoid.localeCompare(right.geoid));
}
