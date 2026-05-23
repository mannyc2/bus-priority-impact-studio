import { describe, expect, test } from "bun:test";
import { normalizeLionSegmentRows, normalizeParkingViolationRows } from "../src/index.js";

describe("NYC public data normalization", () => {
  test("keeps parking street codes and intersecting street fields", () => {
    const [row] = normalizeParkingViolationRows([
      {
        summons_number: "4051249426",
        issue_date: "2026-02-28T00:00:00.000",
        violation_code: "5",
        street_code1: "0",
        street_code2: "0",
        street_code3: "0",
        violation_county: "MN",
        street_name: "NB 1ST AVE @ E 62ND",
        intersecting_street: "ST",
        violation_description: "BUS LANE VIOLATION",
      },
    ]);

    expect(row).toEqual(
      expect.objectContaining({
        summonsNumber: "4051249426",
        issueDate: "2026-02-28",
        streetCode1: "0",
        streetCode2: "0",
        streetCode3: "0",
        intersectingStreet: "ST",
      }),
    );
  });

  test("keeps LION street code, borough code, and house ranges", () => {
    const [row] = normalizeLionSegmentRows([
      {
        physicalid: "3",
        b5sc: "112670",
        boroughcode: "1",
        full_street_name: "BATTERY PL",
        l_low_hn: "50",
        l_high_hn: "64",
        r_low_hn: "51",
        r_high_hn: "63",
      },
    ]);

    expect(row).toEqual(
      expect.objectContaining({
        physicalId: "3",
        streetCodeMaster: "112670",
        borough: "1",
        boroughCode: "1",
        leftLowHouseNumber: "50",
        leftHighHouseNumber: "64",
        rightLowHouseNumber: "51",
        rightHighHouseNumber: "63",
      }),
    );
  });
});
