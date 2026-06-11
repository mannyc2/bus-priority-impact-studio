import { describe, expect, test } from "bun:test";
import { normalizeLionSegmentRows } from "@bp/sources/adapters/nyc-open-data/lion-centerline";
import { normalizeParkingViolationRows } from "@bp/sources/adapters/nyc-open-data/parking-violations";
import {
  CURB_FRICTION_311_COMPLAINT_TYPES,
  classify311CurbFriction,
  normalize311ServiceRequestRows,
} from "@bp/sources/adapters/nyc-open-data/service-requests-311";

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

  test("classifies 311 curb-friction rows with deterministic rules", () => {
    expect(CURB_FRICTION_311_COMPLAINT_TYPES).toEqual([
      "Blocked Driveway",
      "Illegal Parking",
      "Bus Stop Condition",
    ]);
    expect([
      classify311CurbFriction({
        complaintType: "Illegal Parking",
        descriptor: "Double Parked Blocking Traffic",
      }),
      classify311CurbFriction({
        complaintType: "Illegal Parking",
        descriptor: "Blocked Hydrant",
      }),
      classify311CurbFriction({
        complaintType: "Illegal Parking",
        descriptor: "Blocked Bike Lane",
      }),
      classify311CurbFriction({
        complaintType: "Bus Stop Condition",
        descriptor: "Obstructed bus stop",
      }),
      classify311CurbFriction({
        complaintType: "Street Condition",
        descriptor: "Cave-in",
      }),
    ]).toEqual([
      {
        category: "double_parking",
        rule: "illegal_parking_descriptor:double_parked",
      },
      {
        category: "blocked_hydrant",
        rule: "illegal_parking_descriptor:hydrant",
      },
      {
        category: "blocked_lane",
        rule: "illegal_parking_descriptor:blocked_lane",
      },
      {
        category: "blocked_bus_stop",
        rule: "bus_stop_condition_descriptor:blocked_or_obstructed",
      },
      null,
    ]);
  });

  test("normalizes 311 rows with curb-friction taxonomy fields", () => {
    const rows = normalize311ServiceRequestRows(
      [
        {
          unique_key: "2",
          created_date: "2026-03-02T12:00:00.000",
          closed_date: null,
          agency: null,
          agency_name: null,
          complaint_type: "Illegal Parking",
          descriptor: "Blocked Hydrant",
          location_type: null,
          incident_zip: null,
          incident_address: null,
          street_name: null,
          cross_street_1: null,
          cross_street_2: null,
          city: null,
          status: null,
          resolution_description: null,
          community_board: null,
          latitude: "40.1",
          longitude: "-73.9",
        },
        {
          unique_key: "1",
          created_date: "2026-03-01T12:00:00.000",
          closed_date: null,
          agency: null,
          agency_name: null,
          complaint_type: "Traffic Signal Condition",
          descriptor: "Controller",
          location_type: null,
          incident_zip: null,
          incident_address: null,
          street_name: null,
          cross_street_1: null,
          cross_street_2: null,
          city: null,
          status: null,
          resolution_description: null,
          community_board: null,
          latitude: null,
          longitude: null,
        },
      ],
      "current",
    );

    expect(rows.map((row) => row.uniqueKey)).toEqual(["1", "2"]);
    expect(rows[0]).toMatchObject({
      uniqueKey: "1",
      curbFrictionCategory: null,
      curbFrictionRule: null,
    });
    expect(rows[1]).toMatchObject({
      uniqueKey: "2",
      curbFrictionCategory: "blocked_hydrant",
      curbFrictionRule: "illegal_parking_descriptor:hydrant",
      latitude: 40.1,
      longitude: -73.9,
    });
  });
});
