import { describe, expect, test } from "bun:test";
import { type CorpusProfileObservation, summarizeCorpusProfile } from "@bp/analytics/corpus";

function routeMonths(
  sourceId: string,
  family: string,
  routeId: string,
  months: readonly string[],
): CorpusProfileObservation[] {
  return months.map((month) => ({
    sourceId,
    family,
    month,
    routeId,
    rowCount: 1,
    sampleCount: 10,
  }));
}

describe("summarizeCorpusProfile", () => {
  test("separates historical-ready sources from release-only sources", () => {
    const profile = summarizeCorpusProfile({
      releaseMonth: "2026-03",
      historyStartMonth: "2025-04",
      minHistoricalMonths: 6,
      observations: [
        ...routeMonths("route_trends_speed", "speed", "M15", [
          "2025-04",
          "2025-05",
          "2025-06",
          "2025-07",
          "2025-08",
          "2025-09",
          "2025-10",
          "2025-11",
          "2025-12",
          "2026-01",
          "2026-02",
          "2026-03",
        ]),
        ...routeMonths("release_appendix", "current_signal", "M15", ["2026-03"]),
      ],
    });

    expect(profile.requestedWindowMonthCount).toBe(12);
    expect(profile.summary.sourceCount).toBe(2);
    expect(profile.summary.historicalReadySourceCount).toBe(1);
    expect(profile.summary.releaseOnlySourceCount).toBe(1);
    expect(profile.sources.find((source) => source.sourceId === "route_trends_speed")?.status).toBe(
      "historical_ready",
    );
    expect(profile.sources.find((source) => source.sourceId === "release_appendix")?.status).toBe(
      "release_only",
    );
  });

  test("flags historical sources that are useful but missing the release month", () => {
    const profile = summarizeCorpusProfile({
      releaseMonth: "2026-03",
      historyStartMonth: "2025-04",
      minHistoricalMonths: 6,
      observations: routeMonths("bus_wait_assessment", "reliability", "B41", [
        "2025-04",
        "2025-05",
        "2025-06",
        "2025-07",
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
      ]),
    });

    expect(profile.sources[0]?.status).toBe("historical_ready_missing_release");
    expect(profile.sources[0]?.releaseMonthRows).toBe(0);
  });

  test("rejects invalid months and negative counts", () => {
    expect(() =>
      summarizeCorpusProfile({
        releaseMonth: "2026-13",
        historyStartMonth: "2025-04",
        observations: [],
      }),
    ).toThrow("Invalid ISO month");

    expect(() =>
      summarizeCorpusProfile({
        releaseMonth: "2026-03",
        historyStartMonth: "2025-04",
        observations: [
          {
            sourceId: "bad",
            family: "speed",
            month: "2026-03",
            routeId: "M15",
            rowCount: -1,
            sampleCount: null,
          },
        ],
      }),
    ).toThrow("rowCount");
  });
});
