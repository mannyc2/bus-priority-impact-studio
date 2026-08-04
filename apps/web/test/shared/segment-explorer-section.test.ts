import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SegmentExplorerSection } from "../../src/components/route/SegmentExplorer";
import type {
  StudioRouteDetailResponse,
  StudioRoute,
  StudioSegment,
} from "../../src/studio/api-contract";
import { isoMonthFixture } from "./schema-fixtures";

const route = {
  slug: "m15-sbs",
  routeId: "M15+",
  label: "M15-SBS",
  corridor: "First / Second",
  corridorFull: "First Avenue / Second Avenue",
  borough: "Manhattan",
  sbs: true,
  speedMph: 5.8,
  scheduledMph: 9.2,
  weightedAvgSpeed: 5.8,
  speedPercentile: 18,
  dailyRiders: 42_000,
  ridersYoyPct: 2.1,
  riderHoursLost: 140,
  laneCoverage: 38,
  aceStatus: "active",
  aceSince: "2021-10-01",
  tspCoverage: "partial",
  reliability: "Building",
  observedReliability: null,
  diagnosis: "M15-SBS runs at 5.8 mph in the release projection.",
  spark: [6.2, 5.8],
  termini: { north: "125 St", south: "South Ferry" },
  miles: 8.1,
  stops: 28,
  flags: [],
  peerSlug: null,
  interventions: [],
  movement6mPct: null,
  context12mPct: null,
} satisfies StudioRoute;

function segment(overrides: Partial<StudioSegment>): StudioSegment {
  return {
    id: "seg-1",
    spineSegmentId: "m15-s-seg-1",
    spineJoinStatus: "matched",
    routeSlug: "m15-sbs",
    direction: "SB",
    from: "86 St",
    to: "59 St",
    speedMph: 4.8,
    scheduledMph: 9.2,
    riderHours: 1234,
    lane: "partial",
    ace: true,
    tsp: false,
    hours: [],
    ...overrides,
  };
}

function detail(segments: readonly StudioSegment[]): StudioRouteDetailResponse {
  return {
    schemaVersion: 3,
    generatedAt: "2026-06-12T00:00:00.000Z",
    releaseId: "pub_20260612T000000000Z",
    publishedAt: "2026-06-12T00:00:00.000Z",
    coverage: { start: isoMonthFixture("2023-04"), end: isoMonthFixture("2026-03") },
    route,
    segments,
    artifactRefs: [],
    insights: [],
    peakWindows: [],
    slowestWindows: [],
    reliabilitySamples: [],
    capability: null,
    dossier: null,
    equityContext: null,
    quality: {
      releaseLayer: "current_signal",
      completenessStatus: "complete",
      confidence: "high",
      caveats: [],
    },
  };
}

function render(search: Parameters<typeof SegmentExplorerSection>[0]["search"] = {}): string {
  return renderToStaticMarkup(
    createElement(SegmentExplorerSection, {
      data: detail([segment({}), segment({ id: "seg-2", spineSegmentId: "m15-s-seg-2" })]),
      search,
      onSearchChange: () => undefined,
    }),
  );
}

describe("SegmentExplorerSection after the map moved to Overview (plan 126)", () => {
  test("the ranked list is the surface; the readout rail is gone", () => {
    const markup = render();

    expect(markup).toContain("Slowest segments");
    expect(markup).toContain("86 St");
    expect(markup).toContain("59 St");
    expect(markup).toContain("Speed by hour");

    /* The rail described one selected segment; the map popup does that now, on
       the map surface. Its distinctive copy must not survive here. */
    expect(markup).not.toContain("Pin a segment for its 36-month speed history.");
    expect(markup).not.toContain("Previewing — click to pin.");
    expect(markup).not.toContain("Clear ✕");
    expect(markup).not.toContain("Copy link");
    expect(markup).not.toContain("Severity by hour");
  });

  test("no second map: neither the interactive canvas nor the legend renders here", () => {
    const markup = render();

    expect(markup).not.toContain("bp-bus-map");
    expect(markup).not.toContain("Interactive route segment map");
    expect(markup).not.toContain("under 5 mph");
    expect(markup).not.toContain("Painted bus lanes (DOT)");
  });

  test("a shared ?segment= link marks the row it names as the selection", () => {
    const pinned = render({ tab: "segments", segment: "m15-s-seg-2" });
    // The pinned row carries the accent rail; nothing else on the tab does.
    expect(pinned).toContain("bg-[var(--bp-color-accent-bg)]");

    const unpinned = render({ tab: "segments" });
    expect(unpinned).not.toContain("bg-[var(--bp-color-accent-bg)]");
  });
});
