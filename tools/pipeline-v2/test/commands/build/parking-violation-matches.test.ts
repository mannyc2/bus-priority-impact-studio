import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const commandPath = join(
  import.meta.dir,
  "../../../src/commands/build/parking-violation-matches.ts",
);
const legacyHelperPath = join(import.meta.dir, "../../../src/lib/parking-location.ts");

describe("build parking-violation-matches command boundary", () => {
  test("keeps parking location normalization in applied-research", () => {
    const source = readFileSync(commandPath, "utf8");
    const legacyHelper = readFileSync(legacyHelperPath, "utf8");

    expect(source).toContain('from "@bp/applied-research/artifacts"');
    expect(source).toContain('from "@bp/applied-research/local-db"');
    expect(source).toContain("parkingViolationMatchAuditPath");
    expect(source).toContain("countParkingViolationLocationGroups");
    expect(source).toContain("hydrateParkingViolationRawFields");
    expect(source).toContain("hydrateParkingViolationLionRawFields");
    expect(source).toContain("refreshParkingViolationLocationKeys");
    expect(source).toContain("runBuildParkingViolationMatchesLocalDb");
    expect(source).toContain("summarizeParkingViolationMatches");
    expect(source).toContain("buildParkingViolationMatchAuditArtifact");
    expect(source).not.toContain("parkingLocationKey");
    expect(source).not.toContain("UPDATE local_parking_violation");
    expect(source).not.toContain("UPDATE local_lion_segment");
    expect(source).not.toContain("street_code_master = ?");
    expect(source).not.toContain("textValue(");
    expect(source).not.toContain("numberValue(");
    expect(source).not.toContain("GROUP BY match_kind, confidence");
    expect(source).not.toContain("count(DISTINCT match_location_key)");
    expect(source).not.toContain("GROUP BY violation_code, violation_county");
    expect(source).not.toContain("SELECT match_location_key AS location_key");
    expect(source).not.toContain("WITH fanout AS");
    expect(source).not.toContain("FROM local_route_lion_link");
    expect(source).not.toContain("clearParkingViolationMatches");
    expect(source).not.toContain("insertParkingViolationMatch");
    expect(source).not.toContain("listParkingViolationCameraGroups");
    expect(source).not.toContain("listParkingViolationAddressGroups");
    expect(source).not.toContain("parkingViolationCameraGeocodeRequest");
    expect(source).not.toContain("buildParkingViolationStreetRouteIndex");
    expect(source).not.toContain("resolveParkingViolationCameraMatch");
    expect(source).not.toContain("resolveParkingViolationStreetCodeHouseMatch");
    expect(source).not.toContain("listParkingViolationLionSegments");
    expect(source).not.toContain("loadParkingViolationRoutesForPhysicalIds");
    expect(source).not.toContain("parseParkingCameraLocation");
    expect(source).not.toContain("camera_intersection_geoclient");
    expect(source).not.toContain("camera_street_corridor");
    expect(source).not.toContain("street_code_house_range");
    expect(source).not.toContain("INSERT INTO local_parking_violation_match");
    expect(source).not.toContain("CAMERA_CONFIDENCE_WEIGHT");
    expect(source).not.toContain("match_weight");
    expect(source).not.toContain('artifactKind: "parking_violation_match_audit"');
    expect(source).not.toContain('from "../../lib/parking-location');
    expect(source).not.toContain("canonicalBoroughCode");
    expect(source).not.toContain("normalizeStreetName");

    expect(legacyHelper).toContain('from "@bp/applied-research/local-db"');
    expect(legacyHelper).not.toContain("@bp/sources");
    expect(legacyHelper).not.toContain("createHash");
  });
});
