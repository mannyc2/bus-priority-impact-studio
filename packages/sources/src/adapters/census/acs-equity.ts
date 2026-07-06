import * as z from "@bp/domain/schema-compat";

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

const CensusTableSchema = z.array(z.array(z.string()));

export const NormalizedCensusTractEquityContextSchema = z
  .object({
    schemaVersion: z.literal(schemaVersion),
    acsYear: z.number().int(),
    geoid: z.string().regex(/^\d{11}$/),
    stateFips: z.string().regex(/^\d{2}$/),
    countyFips: z.string().regex(/^\d{3}$/),
    tractCode: z.string().regex(/^\d{6}$/),
    countyName: z.string().min(1),
    tractName: z.string().min(1),
    totalPopulation: z.number().int().nonnegative().nullable(),
    occupiedHousingUnits: z.number().int().nonnegative().nullable(),
    noVehicleHouseholds: z.number().int().nonnegative().nullable(),
    noVehicleHouseholdShare: z.number().nonnegative().nullable(),
    medianHouseholdIncome: z.number().int().nonnegative().nullable(),
    povertyRate: z.number().nonnegative().nullable(),
    publicTransitCommuters: z.number().int().nonnegative().nullable(),
    publicTransitCommuterShare: z.number().nonnegative().nullable(),
    raceEthnicityShare: z
      .object({
        hispanic: z.number().nonnegative().nullable(),
        nonHispanicWhite: z.number().nonnegative().nullable(),
        nonHispanicBlack: z.number().nonnegative().nullable(),
        nonHispanicAsian: z.number().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();

export type NormalizedCensusTractEquityContext = z.output<
  typeof NormalizedCensusTractEquityContextSchema
>;

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
  const parsed = CensusTableSchema.parse(table);
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
