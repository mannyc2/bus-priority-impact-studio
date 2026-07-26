import { describe, expect, test } from "bun:test";
import type {
  StudioInterventionCorpus,
  StudioRoute,
  StudyIndexArtifact,
} from "../../src/studio/api-contract";
import {
  BUILDOUT_FAMILIES,
  BUILDOUT_FIRST_YEAR,
  BUILDOUT_INTERVENTION_TYPES,
  type BuildoutFamilyKey,
  type BuildoutInterventionType,
  buildoutAxisMax,
  buildoutAxisTicks,
  buildoutDescription,
  buildoutEndLabels,
  buildoutFamilyForType,
  networkBuildout,
  proposedPlanGroups,
  ROUTE_CHANGE_GROUPS,
  routeChangeIndex,
} from "../../src/studio/network-change-record";

// The fixture is the real distribution, not a toy: every dated intervention
// record served by release pub_20260725T164123260Z, measured 2026-07-26, as
// "routeId typeCode year". This is the test that proves the derivation, so the
// cumulative table it asserts is the one the deployed page renders.
const TYPE_BY_CODE = {
  L: "bus_lane_infrastructure",
  C: "automated_bus_lane_enforcement",
  S: "select_bus_service",
  T: "transit_signal_priority",
  W: "busway",
  K: "stop_consolidation",
  J: "queue_jump",
  D: "documented_bus_priority_intervention",
} satisfies Record<string, BuildoutInterventionType>;

const RELEASE_RECORDS = `B100 L 2018-10; B103 L 2025-10; B11 C 2025-11; B11 L 2013-11
B111 L 2016-01; B12 C 2026-03; B12 L 2014-08; B13 L 2019-09
B15 C 2026-04; B15 L 2016-06; B17 L 2018-09; B2 L 2024-09
B20 L 2019-09; B25 C 2022-12; B25 C 2024-09; B25 L 2025-10
B26 C 2023-09; B26 C 2024-09; B26 L 2025-10; B3 L 2024-09
B31 L 2018-10; B35 C 2024-09; B35 L 2019-10; B36 L 2013-11
B37 L 2025-10; B38 L 2025-10; B39 L 2024-02; B4 L 2013-11
B41 C 2024-09; B41 L 2025-10; B42 C 2022-12; B42 C 2024-09
B42 L 2018-09; B43 L 2018-08; B44 L 2013-11; B44 L 2013-11
B44 L 2018-10; B44 S 2013-05; B44 S 2013-11; B44 S 2013-11
B44 S 2014-02; B44 S 2014-05; B44 S 2016-04; B44 T 2013-12
B45 L 2025-10; B46 L 2014-08; B46 L 2024-09; B46 S 2016-07
B46 S 2020-01; B46+ C 2020-02; B46+ C 2024-06; B46+ L 2014-08
B46+ L 2020-07; B46+ S 2016-07; B46+ S 2020-01; B47 L 2018-07
B48 L 2018-08; B49 L 2013-11; B49 S 2013-11; B49 S 2014-05
B52 L 2025-10; B54 L 2020-08; B57 L 2023-11; B60 C 2025-12
B60 L 2018-09; B61 L 2023-11; B62 C 2022-12; B62 C 2024-06
B62 L 2023-11; B63 C 2025-11; B63 L 2025-10; B65 L 2023-11
B67 L 2025-10; B68 C 2025-12; B68 L 2019-10; B69 L 2018-06
B7 L 2018-10; B8 L 2015-10; B82 L 2018-10; B82 S 2018-10
B82+ C 2024-09; B82+ L 2018-10; B82+ S 2018-10; B83 L 2018-06
B9 L 2024-09; BM1 L 2025-12; BM2 L 2025-12; BM3 L 2025-12
BM4 L 2025-12; BM5 L 2025-12; BX1 L 2020-08; BX10 L 2023-10
BX12 D 2013-03; BX12 L 2007-10; BX12 L 2008-06; BX12 L 2008-06
BX12 L 2022-11; BX12 L 2023-01; BX12 L 2023-12; BX12 S 2008-05
BX12 S 2008-06; BX12 S 2008-10; BX12 S 2011-10; BX12 S 2011-12
BX12 S 2022-11; BX12 S 2023-01; BX12 S 2023-05; BX12+ C 2022-11
BX12+ C 2024-06; BX12+ D 2013-03; BX12+ L 2007-10; BX12+ L 2008-06
BX12+ L 2008-06; BX12+ L 2022-11; BX12+ L 2023-01; BX12+ L 2023-12
BX12+ S 2008-05; BX12+ S 2008-06; BX12+ S 2008-10; BX12+ S 2011-10
BX12+ S 2011-12; BX12+ S 2022-11; BX12+ S 2023-01; BX12+ S 2023-05
BX13 L 2023-12; BX15 C 2025-11; BX15 L 2020-08; BX15 S 2014-08
BX16 L 2023-10; BX17 L 2020-08; BX18A L 2023-12; BX18B L 2023-12
BX19 C 2022-11; BX19 C 2024-06; BX19 L 2025-11; BX2 C 2025-10
BX2 L 2020-08; BX20 C 2025-09; BX20 L 2008-06; BX21 L 2020-08
BX22 C 2025-10; BX22 L 2023-12; BX23 L 2022-12; BX24 L 2022-12
BX25 L 2023-10; BX26 L 2023-10; BX27 L 2021-12; BX28 C 2024-09
BX28 L 2023-10; BX29 L 2022-12; BX3 C 2025-09; BX3 L 2023-12
BX30 L 2023-12; BX31 L 2023-12; BX32 L 2023-12; BX34 L 2023-10
BX35 C 2023-05; BX35 C 2024-09; BX35 L 2023-12; BX36 C 2023-06
BX36 C 2024-06; BX36 C 2024-06; BX36 D 2022-06; BX36 L 2023-12
BX36 W 2021-04; BX38 C 2024-09; BX38 L 2023-10; BX39 L 2023-12
BX40 D 2022-06; BX40 L 2023-12; BX41 L 2013-03; BX41 L 2013-06
BX41 L 2013-06; BX41 L 2014-08; BX41 L 2019-10; BX41 L 2023-10
BX41 S 2013-06; BX41 S 2013-11; BX41 S 2014-08; BX41 T 2011-11
BX41+ C 2022-11; BX41+ C 2024-06; BX41+ L 2013-03; BX41+ L 2013-06
BX41+ L 2013-06; BX41+ L 2014-08; BX41+ L 2019-10; BX41+ L 2023-10
BX41+ S 2013-06; BX41+ S 2013-11; BX41+ S 2014-08; BX41+ T 2011-11
BX42 D 2022-06; BX42 L 2023-12; BX5 C 2025-05; BX5 L 2025-11
BX6 L 2025-11; BX6 S 2016-10; BX6 S 2017-09; BX7 C 2025-09
BX7 L 2021-06; BX8 L 2023-12; BX9 C 2025-11; BX9 L 2023-12
BXM1 L 2025-12; BXM10 L 2025-08; BXM11 L 2023-12; BXM18 L 2021-06
BXM2 L 2017-05; BXM3 L 2017-05; BXM4 L 2017-09; BXM6 L 2025-08
BXM7 L 2025-08; BXM8 L 2025-08; BXM9 L 2025-08; M1 L 2024-11
M10 L 2024-12; M100 C 2025-05; M100 L 2021-06; M101 C 2024-09
M101 L 2025-12; M102 L 2025-12; M103 L 2025-12; M106 L 2025-08
M11 L 2024-11; M116 C 2025-10; M116 L 2025-08; M12 L 2019-12
M125 L 2025-08; M14A+ L 2024-12; M14A+ S 2019-07; M14A+ S 2019-10
M14A+ W 2019-10; M14D+ L 2024-12; M14D+ S 2019-07; M14D+ S 2019-10
M14D+ W 2019-10; M15+ C 2019-10; M15+ C 2024-06; M15+ D 2013-03
M15+ L 2010-10; M15+ L 2010-10; M15+ L 2011-01; M15+ L 2011-10
M15+ L 2025-07; M15+ S 2010-10; M15+ S 2011-01; M15+ S 2011-03
M15+ S 2011-10; M15+ S 2011-12; M2 C 2025-05; M2 L 2024-11
M20 L 2021-06; M21 L 2024-11; M22 L 2024-02; M23+ C 2020-08
M23+ C 2024-06; M23+ L 2025-12; M3 L 2024-11; M31 C 2026-04
M31 L 2024-09; M34+ C 2020-08; M34+ C 2024-06; M34+ D 2011-11
M34+ L 2011-11; M34+ L 2011-11; M34+ L 2015-11; M34+ L 2025-12
M34+ S 2011-11; M34+ S 2020-08; M34A+ D 2011-11; M34A+ L 2011-11
M34A+ L 2015-11; M34A+ L 2025-12; M34A+ S 2011-11; M34A+ S 2020-08
M35 L 2025-08; M4 C 2025-05; M4 L 2024-11; M42 C 2025-05
M42 L 2024-09; M5 L 2021-06; M50 L 2024-09; M55 L 2021-06
M57 C 2025-12; M57 L 2024-09; M66 L 2023-12; M7 L 2024-11
M72 L 2023-12; M79+ C 2024-09; M79+ J 2018-11; M79+ L 2017-04
M79+ L 2017-05; M79+ L 2018-09; M79+ L 2023-12; M79+ S 2016-09
M79+ S 2017-04; M79+ S 2017-05; M79+ S 2018-11; M79+ S 2020-02
M8 L 2024-11; M86+ C 2020-08; M86+ C 2024-09; M86+ L 2023-12
M86+ S 2015-07; M86+ S 2015-08; M86+ S 2016-06; M96 C 2025-10
M96 L 2025-08; M98 L 2025-08; Q10 L 2023-11; Q100 L 2025-12
Q101 L 2025-12; Q102 L 2025-12; Q104 L 2022-08; Q11 L 2019-09
Q110 L 2025-09; Q111 L 2025-09; Q112 L 2025-09; Q113 L 2025-09
Q114 L 2025-09; Q115 L 2025-09; Q12 L 2021-01; Q13 L 2021-01
Q14 L 2023-08; Q15 L 2021-01; Q17 C 2026-02; Q17 L 2025-09
Q17 S 2017-03; Q18 L 2023-08; Q19 L 2023-08; Q19 S 2017-03
Q2 L 2025-09; Q20 L 2021-10; Q22 L 2019-09; Q23 L 2023-08
Q24 L 2025-09; Q25 L 2025-09; Q25 S 2017-03; Q26 L 2021-01
Q27 C 2026-02; Q27 L 2025-09; Q27 S 2017-03; Q29 L 2016-10
Q3 L 2025-09; Q30 L 2025-09; Q32 L 2025-12; Q33 L 2023-08
Q35 L 2024-09; Q36 L 2025-09; Q37 L 2023-11; Q38 L 2019-09
Q39 L 2025-12; Q40 L 2025-09; Q41 L 2021-10; Q42 L 2021-10
Q43 C 2022-11; Q43 C 2024-09; Q43 L 2025-09; Q44+ C 2022-10
Q44+ C 2024-06; Q44+ L 2025-09; Q44+ S 2015-11; Q44+ S 2017-03
Q45 L 2023-11; Q46 L 2023-11; Q48 L 2023-11; Q5 C 2024-09
Q5 L 2021-10; Q50 L 2022-12; Q50 S 2017-03; Q51 L 2020-12
Q54 C 2023-11; Q54 C 2024-06; Q54 L 2021-10; Q56 L 2021-10
Q58 C 2023-07; Q58 C 2024-06; Q58 L 2021-01; Q59 L 2019-09
Q60 C 2026-03; Q60 L 2025-12; Q61 L 2021-01; Q63 L 2025-12
Q65 D 2019-04; Q65 L 2025-09; Q65 S 2017-03; Q66 L 2025-12
Q66 S 2017-03; Q67 L 2019-09; Q69 C 2024-09; Q69 L 2025-12
Q70+ L 2019-09; Q72 L 2023-08; Q75 L 2025-09; Q76 L 2025-09
Q77 L 2025-09; Q80 L 2023-11; Q82 L 2025-09; Q85 L 2021-10
Q88 L 2025-09; Q89 L 2021-10; Q90 L 2021-01; Q98 L 2021-01
QM1 L 2025-12; QM11 L 2021-06; QM12 L 2025-12; QM15 L 2025-12
QM16 L 2025-12; QM17 L 2025-12; QM18 L 2025-12; QM2 L 2025-12
QM20 L 2025-12; QM21 L 2016-08; QM25 L 2021-06; QM31 L 2023-12
QM32 L 2023-12; QM34 L 2025-12; QM35 L 2023-12; QM36 L 2023-12
QM4 L 2025-12; QM40 L 2025-12; QM42 L 2025-12; QM44 L 2023-12
QM5 L 2025-12; QM65 L 2023-11; QM7 L 2021-06; QM8 L 2021-06
S44 L 2012-09; S46 C 2024-09; S46 L 1963-05; S48 L 1963-05
S51 L 2020-09; S52 L 2010-11; S53 L 2012-09; S54 L 2020-09
S55 L 2012-09; S56 L 2012-09; S57 L 2020-09; S59 L 2012-09
S59 L 2012-09; S59 S 2012-09; S61 L 2012-09; S62 L 1963-05
S66 L 1963-05; S74 L 1963-05; S76 L 2020-09; S78 L 2012-06
S78 L 2012-06; S78 L 2012-09; S78 L 2020-09; S78 S 2012-09
S79+ C 2022-10; S79+ C 2024-09; S79+ L 2012-06; S79+ L 2012-09
S79+ L 2012-09; S79+ L 2020-09; S79+ S 2012-09; S79+ S 2012-09
S79+ S 2013-01; S81 L 2020-09; S84 L 1963-05; S86 L 2020-09
S89 L 2012-09; S91 L 2012-09; S92 L 1963-05; S94 L 2012-09
S96 L 1963-05; S98 L 1963-05; SIM1 L 2021-06; SIM10 L 2025-12
SIM11 L 2025-12; SIM15 L 2021-06; SIM1C L 2021-06; SIM2 L 2021-06
SIM22 L 2012-12; SIM23 L 2015-05; SIM24 L 2015-05; SIM25 L 2012-12
SIM26 L 2012-12; SIM3 L 2025-12; SIM30 L 2012-12; SIM32 L 2021-06
SIM33 L 2019-10; SIM33C L 2021-06; SIM34 L 2021-06; SIM35 L 2021-06
SIM3C L 2021-06; SIM4 L 2021-06; SIM4C L 2021-06; SIM5 L 2021-06
SIM6 L 2025-12; SIM7 L 2020-09; SIM8 L 2012-12; SIM9 L 2020-09
X27 L 2021-06; X28 L 2021-06; X37 L 2025-12; X38 L 2025-12`;

// The 96 routes the release carries with no intervention record at all.
const RELEASE_ROUTES_WITHOUT_CHANGE = `B1 B102 B106 B116 B14 B16 B24 B32 B44+ B6 B64 B70 B74 B84 B90 B93 B94 B96 B99 BX11 BX33 BX4
BX46 BX4A BX6+ BX92 BX95 CPAS ECAS J90 L90 L92 M104 M15 M60+ M9 M90 Q1 Q103 Q108 Q109 Q121
Q16 Q28 Q31 Q4 Q47 Q49 Q52+ Q53+ Q55 Q6 Q64 Q7 Q74 Q8 Q83 Q84 Q86 Q87 Q9 Q96 Q97 QM10 QM24
QM6 QM63 QM64 QM68 S40 S42 S90 S93 SIM31 T102 T103 T113 T117 T127 T204 T232 T260 T300 T320
T321 T323 T340 T354 T403 T410 T426 T430 T433 T434 T464 YOAS`;

function makeRoute(input: {
  routeId: string;
  slug?: string;
  label?: string;
  borough?: string;
  interventions?: StudioRoute["interventions"];
}): StudioRoute {
  const label = input.label ?? input.routeId;
  return {
    slug: input.slug ?? input.routeId.toLowerCase(),
    routeId: input.routeId,
    label,
    corridor: `${label} corridor`,
    corridorFull: `${label} corridor`,
    borough: input.borough ?? "Manhattan",
    sbs: false,
    speedMph: 7.1,
    scheduledMph: 8.4,
    weightedAvgSpeed: 7.1,
    speedPercentile: 40,
    dailyRiders: 10_000,
    ridersYoyPct: 0,
    riderHoursLost: 0,
    laneCoverage: 0,
    aceStatus: "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: "No observed reliability summary",
    observedReliability: null,
    diagnosis: "steady",
    spark: [7, 7.1],
    termini: { north: "North", south: "South" },
    miles: 1,
    stops: 2,
    flags: [],
    peerSlug: null,
    interventions: input.interventions ?? [],
    movement6mPct: null,
    context12mPct: null,
  };
}

function intervention(
  interventionType: string,
  year: string,
): StudioRoute["interventions"][number] {
  return {
    eventId: `${interventionType}:${year}`,
    interventionType,
    year,
    title: "Documented change",
    detail: "Fixture record.",
  };
}

type FixtureRecord = { routeId: string; interventionType: BuildoutInterventionType; year: string };

function parseFixtureRecords(): FixtureRecord[] {
  return RELEASE_RECORDS.split(/[;\n]/u)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const [routeId, code, year] = entry.split(" ");
      const interventionType = TYPE_BY_CODE[code as keyof typeof TYPE_BY_CODE];
      if (routeId === undefined || interventionType === undefined || year === undefined) {
        throw new Error(`Malformed fixture record: ${entry}`);
      }
      return { routeId, interventionType, year };
    });
}

function releaseRoutes(): StudioRoute[] {
  const byRouteId = new Map<string, StudioRoute["interventions"][number][]>();
  for (const record of parseFixtureRecords()) {
    const current = byRouteId.get(record.routeId) ?? [];
    current.push(intervention(record.interventionType, record.year));
    byRouteId.set(record.routeId, current);
  }
  const changed = [...byRouteId.entries()].map(([routeId, interventions]) =>
    makeRoute({ routeId, interventions }),
  );
  const unchanged = RELEASE_ROUTES_WITHOUT_CHANGE.trim()
    .split(/\s+/u)
    .map((routeId) => makeRoute({ routeId }));
  return [...changed, ...unchanged];
}

const RELEASE_ROUTES = releaseRoutes();

function seriesValues(routes: readonly StudioRoute[], familyKey: BuildoutFamilyKey): number[] {
  const series = networkBuildout(routes).series.find((entry) => entry.familyKey === familyKey);
  if (series === undefined) throw new Error(`No series for ${familyKey}`);
  return series.values.map((point) => point.routes);
}

describe("network build-out series", () => {
  test("the fixture reproduces the served release", () => {
    expect(RELEASE_ROUTES).toHaveLength(389);
    expect(parseFixtureRecords()).toHaveLength(500);
    expect(RELEASE_ROUTES.filter((route) => route.interventions.length === 0)).toHaveLength(96);
  });

  test("reproduces the cumulative table for every treatment family, 2007 to 2026", () => {
    const buildout = networkBuildout(RELEASE_ROUTES);
    expect(buildout.firstYear).toBe(2007);
    expect(buildout.lastYear).toBe(2026);
    expect(
      Object.fromEntries(
        buildout.series.map((entry) => [entry.familyKey, entry.values.map((v) => v.routes)]),
      ),
    ).toEqual({
      // prettier-ignore
      bus_lane: [
        11, 12, 12, 14, 16, 32, 39, 42, 45, 49, 53, 66, 78, 93, 134, 139, 187, 208, 293, 293,
      ],
      // prettier-ignore
      camera_enforcement: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, 14, 19, 29, 48, 54],
      // prettier-ignore
      select_bus_service: [
        0, 2, 2, 3, 5, 8, 12, 13, 15, 19, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30,
      ],
      // prettier-ignore
      signal_priority: [0, 0, 0, 0, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      // prettier-ignore
      busway: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 3, 3, 3, 3, 3, 3],
      // prettier-ignore
      other: [0, 0, 0, 0, 2, 2, 5, 5, 5, 5, 5, 6, 7, 7, 7, 10, 10, 10, 10, 10],
    });
    expect(buildout.series.map((entry) => entry.endValue)).toEqual([293, 54, 30, 3, 3, 10]);
  });

  test("reproduces the any-treatment row and the routes with nothing documented", () => {
    // Derived here independently of the module, from the same fixture records.
    const firstYearByRoute = new Map<string, number>();
    for (const record of parseFixtureRecords()) {
      const year = Math.max(BUILDOUT_FIRST_YEAR, Number(record.year.slice(0, 4)));
      const known = firstYearByRoute.get(record.routeId);
      if (known === undefined || year < known) firstYearByRoute.set(record.routeId, year);
    }
    const anyTreatment: number[] = [];
    for (let year = 2007; year <= 2026; year += 1) {
      anyTreatment.push([...firstYearByRoute.values()].filter((first) => first <= year).length);
    }
    // prettier-ignore
    expect(anyTreatment).toEqual([
      11, 12, 12, 14, 18, 34, 39, 43, 48, 54, 64, 77, 91, 106, 148, 158, 201, 223, 293, 293,
    ]);

    const buildout = networkBuildout(RELEASE_ROUTES);
    expect(buildout.routesWithAnyChange).toBe(293);
    expect(buildout.routesWithNoChange).toBe(96);
  });

  test("counts a route once per family however many records it has", () => {
    const routes = [
      makeRoute({
        routeId: "M1",
        interventions: [
          intervention("bus_lane_infrastructure", "2012-04"),
          intervention("bus_lane_infrastructure", "2015-08"),
          intervention("bus_lane_infrastructure", "2020-01"),
        ],
      }),
    ];
    // 1 from 2012 onward, not 3 — first appearance, never record count.
    expect(seriesValues(routes, "bus_lane")).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("folds pre-window records into the opening year without stretching the axis", () => {
    const buildout = networkBuildout([
      makeRoute({
        routeId: "M2",
        interventions: [intervention("bus_lane_infrastructure", "1963-05")],
      }),
      makeRoute({
        routeId: "M3",
        interventions: [intervention("bus_lane_infrastructure", "2009-06")],
      }),
    ]);
    expect(buildout.firstYear).toBe(2007);
    expect(buildout.lastYear).toBe(2009);
    expect(buildout.series[0]?.values).toEqual([
      { year: 2007, routes: 1 },
      { year: 2008, routes: 1 },
      { year: 2009, routes: 2 },
    ]);
  });

  test("keeps exact service identity: B44 and B44+ are two routes", () => {
    const routes = [
      makeRoute({
        routeId: "B44",
        slug: "b44",
        interventions: [intervention("bus_lane_infrastructure", "2013-05")],
      }),
      makeRoute({
        routeId: "B44+",
        slug: "b44-sbs",
        label: "B44 SBS",
        interventions: [intervention("bus_lane_infrastructure", "2013-05")],
      }),
    ];
    expect(seriesValues(routes, "bus_lane")).toEqual([0, 0, 0, 0, 0, 0, 2]);
  });

  test("maps every published intervention type to a display family", () => {
    // `satisfies` is the compile-time gate: a type added to
    // BUILDOUT_INTERVENTION_TYPES without an entry here fails to build.
    const expected = {
      bus_lane_infrastructure: "bus_lane",
      automated_bus_lane_enforcement: "camera_enforcement",
      select_bus_service: "select_bus_service",
      transit_signal_priority: "signal_priority",
      busway: "busway",
      stop_consolidation: "other",
      queue_jump: "other",
      documented_bus_priority_intervention: "other",
    } satisfies Record<BuildoutInterventionType, BuildoutFamilyKey>;

    for (const type of BUILDOUT_INTERVENTION_TYPES) {
      expect(buildoutFamilyForType(type)).toBe(expected[type]);
    }
    expect(BUILDOUT_FAMILIES.map((family) => family.key)).toEqual([
      "bus_lane",
      "camera_enforcement",
      "select_bus_service",
      "signal_priority",
      "busway",
      "other",
    ]);
    // A type the release starts publishing tomorrow still charts.
    expect(buildoutFamilyForType("some_future_treatment")).toBe("other");
    expect(buildoutFamilyForType(undefined)).toBe("other");
  });
});

describe("build-out readings", () => {
  test("derives all three readings from the served distribution", () => {
    const { readings } = networkBuildout(RELEASE_ROUTES);
    expect(readings).toEqual([
      {
        heading: "Bus lanes grew the most",
        sentence:
          "Routes that run on a street with a bus lane went from 11 in 2007 to 293 in 2026. " +
          "The biggest single year was 2025, which added 85 routes.",
      },
      {
        heading: "Camera enforcement is the recent growth",
        sentence:
          "Camera enforcement reached 34 more routes from 2023 to 2025, " +
          "more than any other treatment in those years.",
      },
      {
        heading: "2 treatments have stopped spreading",
        sentence:
          "Select Bus Service has not reached a new route since 2019. " +
          "Signal priority has not reached a new route since 2013.",
      },
    ]);
  });

  test("never says a route has a bus lane and never states a mileage", () => {
    const { readings, series } = networkBuildout(RELEASE_ROUTES);
    const prose = [
      ...readings.flatMap((reading) => [reading.heading, reading.sentence]),
      ...series.flatMap((entry) => [entry.label, entry.endLabel]),
      buildoutDescription(networkBuildout(RELEASE_ROUTES)),
    ].join(" ");
    expect(prose).toContain("run on a street with a bus lane");
    expect(prose).not.toContain("has a bus lane");
    expect(prose).not.toContain("have a bus lane");
    expect(prose).not.toMatch(/\bmiles?\b/iu);
  });

  test("omits the stalled reading rather than emitting an empty one", () => {
    // Nothing here stands still for five complete years, so the third rule has
    // no qualifying family and drops its card.
    const buildout = networkBuildout([
      makeRoute({
        routeId: "A1",
        interventions: [intervention("bus_lane_infrastructure", "2020-06")],
      }),
      makeRoute({
        routeId: "A2",
        interventions: [intervention("bus_lane_infrastructure", "2022-06")],
      }),
      makeRoute({
        routeId: "A3",
        interventions: [intervention("bus_lane_infrastructure", "2024-12")],
      }),
      makeRoute({
        routeId: "A4",
        interventions: [intervention("automated_bus_lane_enforcement", "2023-06")],
      }),
      makeRoute({
        routeId: "A5",
        interventions: [intervention("automated_bus_lane_enforcement", "2024-06")],
      }),
    ]);
    expect(buildout.partialFinalYear).toBe(false);
    expect(buildout.readings.map((reading) => reading.heading)).toEqual([
      "Bus lanes grew the most",
      "Camera enforcement is the recent growth",
    ]);
  });

  test("a family that has not started yet never reads as stopped", () => {
    const buildout = networkBuildout([
      makeRoute({
        routeId: "A6",
        interventions: [intervention("bus_lane_infrastructure", "2024-01")],
      }),
      makeRoute({
        routeId: "A7",
        // Inside the partial frontier year, so outside every complete year.
        interventions: [intervention("automated_bus_lane_enforcement", "2025-01")],
      }),
    ]);
    expect(buildout.lastCompleteYear).toBe(2024);
    expect(buildout.readings.map((reading) => reading.heading)).toEqual([
      "Bus lanes grew the most",
    ]);
  });

  test("names the second reading's family separately from the first", () => {
    const { readings } = networkBuildout(RELEASE_ROUTES);
    expect(readings[0]?.heading).not.toBe(readings[1]?.heading);
  });
});

describe("partial final year", () => {
  test("derives the frontier year from the data, never a hard-coded 2026", () => {
    const buildout = networkBuildout([
      makeRoute({
        routeId: "M6",
        interventions: [
          intervention("bus_lane_infrastructure", "2011-03"),
          intervention("busway", "2029-04"),
        ],
      }),
    ]);
    expect(buildout.lastYear).toBe(2029);
    expect(buildout.partialFinalYear).toBe(true);
    expect(buildoutAxisTicks(buildout).at(-1)).toEqual({
      year: 2029,
      label: "2029 so far",
      leftPercent: 100,
      keepWhenNarrow: true,
    });
    expect(buildoutDescription(buildout)).toContain("2007 to 2029 so far");
  });

  test("a frontier that reaches December is not partial", () => {
    const buildout = networkBuildout([
      makeRoute({
        routeId: "M7",
        interventions: [intervention("bus_lane_infrastructure", "2019-12")],
      }),
    ]);
    expect(buildout.partialFinalYear).toBe(false);
    expect(buildout.lastCompleteYear).toBe(2019);
    expect(buildoutAxisTicks(buildout).at(-1)?.label).toBe("2019");
  });

  test("the served release is partial and stops one complete year back", () => {
    const buildout = networkBuildout(RELEASE_ROUTES);
    expect(buildout.partialFinalYear).toBe(true);
    expect(buildout.lastCompleteYear).toBe(2025);
    const ticks = buildoutAxisTicks(buildout);
    expect(ticks.map((tick) => tick.label)).toEqual([
      "2007",
      "2011",
      "2015",
      "2019",
      "2023",
      "2026 so far",
    ]);
    // A phone keeps only the ends and the midpoint; six ticks collide at 390px.
    expect(ticks.filter((tick) => tick.keepWhenNarrow).map((tick) => tick.label)).toEqual([
      "2007",
      "2015",
      "2026 so far",
    ]);
  });
});

describe("chart geometry", () => {
  test("rounds the axis above the tallest series", () => {
    const buildout = networkBuildout(RELEASE_ROUTES);
    expect(buildoutAxisMax(buildout.series)).toBe(300);
  });

  test("stacks end labels in value order without leaving the plot box", () => {
    const buildout = networkBuildout(RELEASE_ROUTES);
    const labels = buildoutEndLabels(buildout.series, { axisMax: 300 });
    expect(labels.map((label) => label.value)).toEqual([293, 54, 30, 10, 3, 3]);
    // Ties keep the canonical family order rather than an arbitrary sort.
    expect(labels.slice(-2).map((label) => label.familyKey)).toEqual(["signal_priority", "busway"]);
    for (const label of labels) {
      expect(label.topPercent).toBeGreaterThanOrEqual(0);
      expect(label.topPercent).toBeLessThanOrEqual(100);
    }
    for (let index = 1; index < labels.length; index += 1) {
      const gap = (labels[index]?.topPercent ?? 0) - (labels[index - 1]?.topPercent ?? 0);
      expect(gap).toBeGreaterThanOrEqual(7.99);
    }
  });

  test("names the span and every series end value in the accessible description", () => {
    const description = buildoutDescription(networkBuildout(RELEASE_ROUTES));
    expect(description).toBe(
      "Routes reached by each treatment, 2007 to 2026 so far. " +
        "Bus lane reaches 293 routes. Camera enforcement reaches 54 routes. " +
        "Select Bus Service reaches 30 routes. Signal priority reaches 3 routes. " +
        "Busway reaches 3 routes. Other documented reaches 10 routes.",
    );
  });
});

const studies: StudyIndexArtifact = {
  artifactKind: "bp.studio.segment_study_index.v1",
  schemaVersion: 1,
  analysisMonth: "2026-03",
  studies: [
    {
      eventKey: "study-improved",
      routeId: "M10",
      routeSlug: "m10",
      treatmentFamily: "automated_bus_lane_enforcement",
      implementationMonth: "2023-04",
      effectMph: 0.14,
      confidenceInterval: null,
      evaluationLevel: "segment_matched_did",
      claimTier: "gated_estimate",
      direction: "improved",
    },
    {
      eventKey: "study-worsened",
      routeId: "M11",
      routeSlug: "m11",
      treatmentFamily: "automated_bus_lane_enforcement",
      implementationMonth: "2024-09",
      effectMph: -0.21,
      confidenceInterval: null,
      evaluationLevel: "segment_matched_did",
      claimTier: "gated_estimate",
      direction: "worsened",
    },
    {
      eventKey: "study-flat",
      routeId: "M12",
      routeSlug: "m12",
      treatmentFamily: "automated_bus_lane_enforcement",
      implementationMonth: "2022-01",
      effectMph: -0.04,
      confidenceInterval: null,
      evaluationLevel: "descriptive_before_after",
      claimTier: "descriptive",
      direction: "no_detectable_change",
    },
    {
      eventKey: "study-not-estimable",
      routeId: "M13",
      routeSlug: "m13",
      treatmentFamily: "bus_lane",
      implementationMonth: "2021-06",
      effectMph: null,
      confidenceInterval: null,
      evaluationLevel: "descriptive_before_after",
      claimTier: "descriptive",
      direction: "not_estimable",
    },
  ],
};

const corpus: StudioInterventionCorpus = {
  schemaVersion: 1,
  generatedAt: "2026-07-11T23:05:59.357Z",
  sourceCorpus: {
    path: "fixture.json",
    version: 3,
    generatedAt: "2026-05-27T17:20:55.275Z",
    recordCount: 4,
    sha256: "0".repeat(64),
  },
  records: [
    {
      recordId: "record-1",
      routes: ["M14", "M10"],
      primaryTreatments: ["reroute", "stop_consolidation"],
      customTreatments: [],
      title: "Corridor reroute",
      effectiveDate: "2027-01",
      datePrecision: "month",
      recordKind: "proposed",
      statusLatest: "proposed",
      corridorStreets: ["First Avenue"],
      evaluableInWindow: false,
      sourceId: "plan-a",
      sourceLabel: "Big Redesign Plan",
      sourceUrl: null,
      caveatCount: 0,
      matchedRegistryEventIds: [],
    },
    {
      recordId: "record-2",
      routes: ["M14"],
      primaryTreatments: ["reroute"],
      customTreatments: [],
      title: "Second reroute",
      effectiveDate: "2027-02",
      datePrecision: "month",
      recordKind: "proposed",
      statusLatest: "proposed",
      corridorStreets: [],
      evaluableInWindow: false,
      sourceId: "plan-a",
      sourceLabel: "Big Redesign Plan",
      sourceUrl: null,
      caveatCount: 0,
      matchedRegistryEventIds: [],
    },
    {
      recordId: "record-3",
      routes: ["M11"],
      primaryTreatments: ["bus_lane"],
      customTreatments: [],
      title: "Proposed lane",
      effectiveDate: "2027-03",
      datePrecision: "month",
      recordKind: "proposed",
      statusLatest: "proposed",
      corridorStreets: [],
      evaluableInWindow: false,
      sourceId: "plan-b",
      sourceLabel: "Small Plan",
      sourceUrl: null,
      caveatCount: 0,
      matchedRegistryEventIds: [],
    },
    {
      recordId: "record-4",
      routes: ["M11"],
      primaryTreatments: ["bus_lane"],
      customTreatments: [],
      title: "Already built",
      effectiveDate: "2024-03",
      datePrecision: "month",
      recordKind: "implemented",
      statusLatest: "complete",
      corridorStreets: [],
      evaluableInWindow: true,
      sourceId: "plan-b",
      sourceLabel: "Small Plan",
      sourceUrl: null,
      caveatCount: 0,
      matchedRegistryEventIds: [],
    },
  ],
};

const indexRoutes = [
  makeRoute({
    routeId: "M10",
    interventions: [
      intervention("automated_bus_lane_enforcement", "2023-04"),
      intervention("bus_lane_infrastructure", "2019-02"),
    ],
  }),
  makeRoute({
    routeId: "M11",
    interventions: [
      intervention("automated_bus_lane_enforcement", "2024-09"),
      intervention("bus_lane_infrastructure", "2020-05"),
      intervention("busway", "2021-07"),
    ],
  }),
  makeRoute({
    routeId: "M12",
    interventions: [intervention("bus_lane_infrastructure", "2022-01")],
  }),
  makeRoute({
    routeId: "M13",
    interventions: [intervention("select_bus_service", "2026-02")],
  }),
  makeRoute({ routeId: "M14" }),
  makeRoute({ routeId: "M9" }),
];

function index(group: (typeof ROUTE_CHANGE_GROUPS)[number]) {
  return routeChangeIndex(indexRoutes, {
    group,
    studiesIndex: studies,
    corpus,
    lastYear: 2026,
    lastCompleteYear: 2025,
  });
}

describe("route change index", () => {
  test("orders every group by its own rule", () => {
    expect(index("recent").rows.map((row) => row.routeId)).toEqual(["M13", "M11", "M10", "M12"]);
    expect(index("most").rows.map((row) => row.routeId)).toEqual(["M11", "M10", "M12", "M13"]);
    expect(index("measured").rows.map((row) => row.routeId)).toEqual(["M11", "M10", "M12", "M13"]);
    expect(index("proposed").rows.map((row) => row.routeId)).toEqual(["M14", "M10", "M11"]);
    expect(index("never").rows.map((row) => row.routeId)).toEqual(["M9", "M14"]);
  });

  test("never contains exactly the routes with an empty interventions array", () => {
    const never = routeChangeIndex(RELEASE_ROUTES, {
      group: "never",
      studiesIndex: null,
      corpus: null,
      lastYear: 2026,
      lastCompleteYear: 2025,
    });
    expect(never.totalRoutes).toBe(96);
    expect(never.rows.every((row) => row.changeCount === 0)).toBe(true);
  });

  test("bounds the displayed rows without hiding the group total", () => {
    const bounded = routeChangeIndex(RELEASE_ROUTES, {
      group: "recent",
      studiesIndex: null,
      corpus: null,
      lastYear: 2026,
      lastCompleteYear: 2025,
      limit: 8,
    });
    expect(bounded.rows).toHaveLength(8);
    expect(bounded.totalRoutes).toBe(293);
  });

  test("writes the most recent change as a sentence with its own date precision", () => {
    const row = index("recent").rows[0];
    expect(row?.headline).toBe("Select Bus Service began");
    expect(row?.date).toBe("February 2026");
  });

  test("counts changes per year into a bounded sparkline", () => {
    const row = index("most").rows.find((candidate) => candidate.routeId === "M11");
    expect(row?.spark.map((bar) => bar.year)).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(row?.spark.map((bar) => bar.count)).toEqual([1, 1, 0, 0, 1, 0, 0]);
  });
});

describe("route change result cells", () => {
  test("maps each published direction to its display string", () => {
    const results = new Map(index("measured").rows.map((row) => [row.routeId, row.result]));
    expect(results.get("M10")).toEqual({
      kind: "study",
      label: "Speeds rose",
      tone: "good",
      magnitude: "0.14 mph",
    });
    expect(results.get("M11")).toEqual({
      kind: "study",
      label: "Speeds fell",
      tone: "bad",
      magnitude: "0.21 mph",
    });
    expect(results.get("M12")).toEqual({
      kind: "study",
      label: "No clear change",
      tone: "neutral",
      magnitude: null,
    });
    expect(results.get("M13")).toEqual({
      kind: "study",
      label: "Not estimable",
      tone: "neutral",
      magnitude: null,
    });
  });

  test("never renders the artifact enum", () => {
    const labels = ROUTE_CHANGE_GROUPS.flatMap((group) =>
      index(group).rows.map((row) => row.result.label),
    ).join(" ");
    expect(labels).not.toContain("no_detectable_change");
    expect(labels.toLowerCase()).not.toContain("no detectable change");
  });

  test("states a plain state when no study exists", () => {
    const unstudied = routeChangeIndex(indexRoutes, {
      group: "recent",
      studiesIndex: null,
      corpus,
      lastYear: 2026,
      lastCompleteYear: 2025,
    });
    const byRoute = new Map(unstudied.rows.map((row) => [row.routeId, row.result]));
    // 2026 is inside the unpublished tail; 2022 has had years of data.
    expect(byRoute.get("M13")).toEqual({ kind: "state", label: "Too early to say" });
    expect(byRoute.get("M12")).toEqual({ kind: "state", label: "No study yet" });

    const never = routeChangeIndex(indexRoutes, {
      group: "never",
      studiesIndex: null,
      corpus,
      lastYear: 2026,
      lastCompleteYear: 2025,
    });
    expect(never.rows.map((row) => row.result.label)).toEqual([
      "None proposed",
      "2 proposed changes",
    ]);
  });
});

describe("proposed plan groups", () => {
  test("groups proposed records by the plan that proposed them", () => {
    const grouped = proposedPlanGroups(corpus);
    expect(grouped.totalChanges).toBe(3);
    expect(grouped.plans).toEqual([
      {
        sourceId: "plan-a",
        label: "Big Redesign Plan",
        changeCount: 2,
        routeCount: 2,
        mix: [
          {
            label: "Reroute",
            count: 2,
            sharePercent: (2 / 3) * 100,
            color: "var(--bp-color-accent)",
          },
          {
            label: "Stop consolidation",
            count: 1,
            sharePercent: (1 / 3) * 100,
            color: "var(--bp-route-queens)",
          },
        ],
      },
      {
        sourceId: "plan-b",
        label: "Small Plan",
        changeCount: 1,
        routeCount: 1,
        mix: [{ label: "Bus lane", count: 1, sharePercent: 100, color: "var(--bp-color-accent)" }],
      },
    ]);
  });

  test("folds treatments past the fourth into a single Other slice", () => {
    const wide: StudioInterventionCorpus = {
      ...corpus,
      records: [
        {
          ...(corpus.records[0] as StudioInterventionCorpus["records"][number]),
          recordId: "record-wide",
          sourceId: "plan-c",
          sourceLabel: "Wide Plan",
          primaryTreatments: [
            "reroute",
            "stop_consolidation",
            "stop_relocation",
            "bus_lane",
            "queue_jump",
            "red_paint",
          ],
        },
      ],
    };
    const plan = proposedPlanGroups(wide).plans[0];
    expect(plan?.mix.map((slice) => slice.label)).toEqual([
      "Bus lane",
      "Queue jump",
      "Red paint",
      "Reroute",
      "Other",
    ]);
    expect(plan?.mix.at(-1)).toEqual({
      label: "Other",
      count: 2,
      sharePercent: (2 / 6) * 100,
      color: "var(--bp-color-ink-40)",
    });
  });

  test("treats an absent corpus as no proposals rather than an error", () => {
    expect(proposedPlanGroups(null)).toEqual({ plans: [], totalChanges: 0 });
  });
});
