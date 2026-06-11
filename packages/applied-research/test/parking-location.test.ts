import { describe, expect, test } from "bun:test";
import {
  canonicalParkingBoroughCode,
  normalizeParkingStreetCode,
  normalizeParkingStreetName,
  numericHouseNumber,
  parkingLocationKey,
  parseParkingCameraLocation,
  stableMatchEvidenceHash,
  streetCorridorKey,
} from "../src/local-db";

describe("parking location helpers", () => {
  test("normalizes borough, street, street code, and house-number values", () => {
    expect(canonicalParkingBoroughCode("NY")).toBe("1");
    expect(canonicalParkingBoroughCode("01 BROOKLYN")).toBe("3");
    expect(canonicalParkingBoroughCode("Unspecified Staten Island")).toBe("5");
    expect(normalizeParkingStreetName("1st Ave")).toBe("1 AVENUE");
    expect(normalizeParkingStreetName("MLK Jr Blvd")).toBe("MARTIN LUTHER KING JR BOULEVARD");
    expect(normalizeParkingStreetCode("123")).toBe("00123");
    expect(normalizeParkingStreetCode("00000")).toBeNull();
    expect(numericHouseNumber("64-40")).toBe(6440);
    expect(numericHouseNumber("26A")).toBe(26);
  });

  test("builds stable parking location keys by violation kind", () => {
    expect(
      parkingLocationKey({
        violationCode: 5,
        violationCounty: "Queens",
        streetCode1: null,
        houseNumber: null,
        streetName: "NB Main St @ 39",
        intersectingStreet: "Ave",
      }),
    ).toBe("camera|4|NB MAIN ST @ 39|AVE");
    expect(
      parkingLocationKey({
        violationCode: 46,
        violationCounty: "BK",
        streetCode1: "77",
        houseNumber: "123A",
        streetName: "ignored",
        intersectingStreet: null,
      }),
    ).toBe("street_code_house|3|00077|123");
  });

  test("parses camera location text and builds route corridor keys", () => {
    expect(
      parseParkingCameraLocation({
        streetName: "WB 34 ST @ 7",
        intersectingStreet: "AVE",
      }),
    ).toEqual({
      direction: "WB",
      primaryStreet: "34 ST",
      crossStreet: "7 AVE",
    });
    expect(
      parseParkingCameraLocation({
        streetName: "BROADWAY",
        intersectingStreet: null,
      }),
    ).toEqual({
      direction: null,
      primaryStreet: "BROADWAY",
      crossStreet: null,
    });
    expect(streetCorridorKey({ boroughCode: "1", streetName: "1st Ave" })).toBe("1|1 AVENUE");
  });

  test("hashes match evidence deterministically", () => {
    expect(stableMatchEvidenceHash({ corridorKey: "1|BROADWAY", count: 2 })).toBe(
      stableMatchEvidenceHash({ corridorKey: "1|BROADWAY", count: 2 }),
    );
  });
});
