import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  assertInjectiveStudioRouteIdentityUniverse,
  emptyStudioRouteEvidenceBundle,
  StudioRouteEvidenceBundleSchema,
  StudioRouteIndex3RowSchema,
  studioRouteHasSbsMode,
  studioRouteServiceModesForLegacyTrackerTypes,
  studioRouteServiceModesForOfficialTypes,
} from "@bp/domain/studio";

function exactIndexRow() {
  return {
    releaseId: "pub_20260718T000000000Z",
    publishedAt: "2026-07-18T00:00:00.000Z",
    coverage: { start: "2023-04", end: "2026-07" },
    routeId: "B44+",
    slug: "b44-sbs",
    label: "B44-SBS",
    longName: "Sheepshead Bay - Williamsburg",
    borough: "Brooklyn" as const,
    routeFamily: "select_bus_service" as const,
    publicUrl: "/routes/b44-sbs",
    capability: {
      overallState: "ready" as const,
      surfaces: {},
      caveats: [],
    },
    historyCoverage: {
      startMonth: null,
      endMonth: null,
      pointCount: 0,
      speedMonthCount: 0,
      ridershipMonthCount: 0,
    },
    caveats: [],
    projectionRefs: [],
    updatedAt: "2026-07-18T00:00:00.000Z",
    routeSchemaVersion: 2 as const,
    routeFamilyId: "B44",
    displayLabel: "B44-SBS",
    officialLongName: "Sheepshead Bay - Williamsburg",
    designationLiterals: ["route_type:SBS", "trip_type:14"],
    serviceModes: ["sbs" as const],
    routeTypes: ["SBS" as const],
    tripTypes: ["14" as const],
  };
}

describe("Studio route identity presentation", () => {
  test.each([
    ["plus and legacy SBS spellings", ["B44+", "B44-SBS"], "b44-sbs"],
    ["case-distinct exact IDs", ["B44", "b44"], "b44"],
  ])("rejects non-injective slugs for %s", (_name, routeIds, slug) => {
    expect(() =>
      assertInjectiveStudioRouteIdentityUniverse(routeIds.map((routeId) => ({ routeId }))),
    ).toThrow(`non-injective slug ${slug}`);
  });

  test("strictly decodes a semantically complete route-index v3 row", () => {
    const row = exactIndexRow();
    expect(decodeStrict(StudioRouteIndex3RowSchema)(row) as unknown).toEqual(row);
  });

  test.each([
    ["family collapse", { routeFamilyId: "B44+" }],
    ["noncanonical slug", { slug: "b44-plus" }],
    ["invented label", { label: "B44 SBS" }],
    [
      "duplicate designation",
      { designationLiterals: ["route_type:SBS", "trip_type:14", "trip_type:14"] },
    ],
    ["mode disagreement", { serviceModes: ["local"] }],
    ["designation disagreement", { designationLiterals: ["route_type:Local", "trip_type:14"] }],
  ])("rejects %s in route-index v3", (_name, mutation) => {
    expect(() =>
      decodeStrict(StudioRouteIndex3RowSchema)({ ...exactIndexRow(), ...mutation }),
    ).toThrow();
  });

  test("cross-checks plural official route and trip designations without collapsing modes", () => {
    const serviceModes = studioRouteServiceModesForOfficialTypes(
      ["Express", "Limited", "Local", "SBS", "School"],
      ["13", 12, 1, "14", 10, "11"],
    );

    expect(serviceModes).toEqual([
      "express",
      "limited_stop",
      "local",
      "sbs",
      "school_limited",
      "school_local",
    ]);
    expect(studioRouteHasSbsMode({ serviceModes })).toBe(true);
    expect(studioRouteHasSbsMode({ serviceModes: ["local"] })).toBe(false);
  });

  test("fails closed on unknown, ambiguous School, and disagreeing official literals", () => {
    expect(() => studioRouteServiceModesForOfficialTypes(["Future Service"], ["1"])).toThrow(
      "Unsupported official route_type literal: Future Service",
    );
    expect(() => studioRouteServiceModesForOfficialTypes(["Local"], ["01"])).toThrow(
      "Unsupported official trip_type literal: 01",
    );
    expect(() => studioRouteServiceModesForOfficialTypes(["School"], ["1"])).toThrow(
      "Official route_type School requires trip_type 10 and/or 11",
    );
    expect(() => studioRouteServiceModesForOfficialTypes(["Local"], ["12"])).toThrow(
      "Official route_type/trip_type disagreement",
    );
  });

  test("isolates the legacy Tracker spelling from the named official mapper", () => {
    expect(studioRouteServiceModesForLegacyTrackerTypes(["Select Bus Service", "Local"])).toEqual([
      "local",
      "sbs",
    ]);
    expect(() => studioRouteServiceModesForOfficialTypes(["Select Bus Service"], ["14"])).toThrow(
      "Unsupported official route_type literal: Select Bus Service",
    );
  });

  test("keeps legacy bundles readable but rejects future tagged bundle versions", () => {
    const legacy = emptyStudioRouteEvidenceBundle({ routeId: "B44", routeSlug: "b44" });
    expect(decodeStrict(StudioRouteEvidenceBundleSchema)(legacy)).toEqual(legacy);
    expect(() =>
      decodeStrict(StudioRouteEvidenceBundleSchema)({
        ...legacy,
        artifactKind: "bp.studio.route_evidence_bundle.v3",
        schemaVersion: 3,
      }),
    ).toThrow();
  });
});
