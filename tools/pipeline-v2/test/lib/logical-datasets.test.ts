import { describe, expect, test } from "bun:test";
import { assertCandidateSourceRegistry, LOGICAL_DATASETS } from "../../src/lib/logical-datasets.ts";

describe("logical dataset registry", () => {
  test("coalesces historical/current families and maps candidate sources exactly once", () => {
    const speed = LOGICAL_DATASETS.find((entry) => entry.datasetId === "route-speed");
    const ridership = LOGICAL_DATASETS.find((entry) => entry.datasetId === "route-ridership");
    expect(speed?.sourceIds).toEqual(["bus_segment_speeds_2023_2024", "bus_segment_speeds_2025"]);
    expect(ridership?.sourceIds).toEqual([
      "bus_hourly_ridership_2020_2024",
      "bus_hourly_ridership_2025",
    ]);
    expect(() =>
      assertCandidateSourceRegistry({
        datasets: LOGICAL_DATASETS.map((entry) => ({
          datasetId: entry.datasetId,
          sourceIds: entry.sourceIds,
        })),
      }),
    ).not.toThrow();
  });

  test("rejects an unregistered or incorrectly owned candidate source", () => {
    expect(() =>
      assertCandidateSourceRegistry({
        datasets: [{ datasetId: "route-speed", sourceIds: ["unknown-source"] }],
      }),
    ).toThrow("not registered");
    expect(() =>
      assertCandidateSourceRegistry({
        datasets: [{ datasetId: "route-speed", sourceIds: ["bus_hourly_ridership_2020_2024"] }],
      }),
    ).toThrow("belongs to route-ridership");
  });
});
