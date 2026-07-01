import { asc, eq } from "drizzle-orm";
import { insertAll, type LocalPipelineDb } from "../client.js";
import { localCensusTractEquityContext } from "../schema.js";

export type LocalCensusTractEquityContext = {
  acsYear: number;
  geoid: string;
  stateFips: string;
  countyFips: string;
  tractCode: string;
  countyName: string;
  tractName: string;
  totalPopulation: number | null;
  occupiedHousingUnits: number | null;
  noVehicleHouseholds: number | null;
  noVehicleHouseholdShare: number | null;
  medianHouseholdIncome: number | null;
  povertyRate: number | null;
  publicTransitCommuters: number | null;
  publicTransitCommuterShare: number | null;
  raceEthnicityShare: {
    hispanic: number | null;
    nonHispanicWhite: number | null;
    nonHispanicBlack: number | null;
    nonHispanicAsian: number | null;
  };
};

export function replaceCensusTractEquityContext(
  db: LocalPipelineDb,
  acsYear: number,
  rows: readonly LocalCensusTractEquityContext[],
): void {
  db.transaction((tx) => {
    tx.delete(localCensusTractEquityContext)
      .where(eq(localCensusTractEquityContext.acsYear, acsYear))
      .run();

    insertAll(
      tx,
      localCensusTractEquityContext,
      rows.map((row) => ({
        acsYear,
        geoid: row.geoid,
        stateFips: row.stateFips,
        countyFips: row.countyFips,
        tractCode: row.tractCode,
        countyName: row.countyName,
        tractName: row.tractName,
        totalPopulation: row.totalPopulation,
        occupiedHousingUnits: row.occupiedHousingUnits,
        noVehicleHouseholds: row.noVehicleHouseholds,
        noVehicleHouseholdShare: row.noVehicleHouseholdShare,
        medianHouseholdIncome: row.medianHouseholdIncome,
        povertyRate: row.povertyRate,
        publicTransitCommuters: row.publicTransitCommuters,
        publicTransitCommuterShare: row.publicTransitCommuterShare,
        hispanicShare: row.raceEthnicityShare.hispanic,
        nonHispanicWhiteShare: row.raceEthnicityShare.nonHispanicWhite,
        nonHispanicBlackShare: row.raceEthnicityShare.nonHispanicBlack,
        nonHispanicAsianShare: row.raceEthnicityShare.nonHispanicAsian,
      })),
    );
  });
}

export async function listCensusTractEquityContext(
  db: LocalPipelineDb,
  acsYear: number,
): Promise<LocalCensusTractEquityContext[]> {
  const rows = await db
    .select()
    .from(localCensusTractEquityContext)
    .where(eq(localCensusTractEquityContext.acsYear, acsYear))
    .orderBy(
      asc(localCensusTractEquityContext.countyFips),
      asc(localCensusTractEquityContext.tractCode),
    );

  return rows.map((row) => ({
    acsYear: row.acsYear,
    geoid: row.geoid,
    stateFips: row.stateFips,
    countyFips: row.countyFips,
    tractCode: row.tractCode,
    countyName: row.countyName,
    tractName: row.tractName,
    totalPopulation: row.totalPopulation,
    occupiedHousingUnits: row.occupiedHousingUnits,
    noVehicleHouseholds: row.noVehicleHouseholds,
    noVehicleHouseholdShare: row.noVehicleHouseholdShare,
    medianHouseholdIncome: row.medianHouseholdIncome,
    povertyRate: row.povertyRate,
    publicTransitCommuters: row.publicTransitCommuters,
    publicTransitCommuterShare: row.publicTransitCommuterShare,
    raceEthnicityShare: {
      hispanic: row.hispanicShare,
      nonHispanicWhite: row.nonHispanicWhiteShare,
      nonHispanicBlack: row.nonHispanicBlackShare,
      nonHispanicAsian: row.nonHispanicAsianShare,
    },
  }));
}
