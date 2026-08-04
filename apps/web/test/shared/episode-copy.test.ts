import { describe, expect, test } from "bun:test";
import type {
  PublicProducerEpisodeComponent,
  PublicProducerPlacement,
} from "@bp/domain/studio/public-intervention-episodes";

import {
  authorityNote,
  componentSentence,
  extentLine,
  formatEpisodeDay,
  placementLines,
  placementStateLabel,
  trackerSummaryVisible,
} from "../../src/studio/episode-copy.js";

function producerComponent(
  overrides: Partial<PublicProducerEpisodeComponent> = {},
): PublicProducerEpisodeComponent {
  return {
    authority: "producer",
    componentId: "bx20-able-component",
    routeKey: "bx20",
    gtfsRouteId: "BX20",
    treatmentFamilyKey: "automated-bus-lane-enforcement",
    treatmentFamilyLabel: "Automated bus lane enforcement",
    applicability: "applies",
    action: "add",
    actionLabel: "Added",
    extent: { kind: "route_wide", label: "Route-wide", description: null },
    details: "Camera enforcement started on the corridor",
    caveats: [],
    ...overrides,
  };
}

function placement(overrides: Partial<PublicProducerPlacement> = {}): PublicProducerPlacement {
  return {
    placementKey: "bx20-able-placement",
    foundingComponentId: "bx20-able-component",
    routeKey: "bx20",
    treatmentFamilyKey: "automated-bus-lane-enforcement",
    scope: { kind: "unknown" },
    stateAsOf: "last_confirmed_active",
    asOfDate: "2026-07-27",
    confirmedCurrent: null,
    ...overrides,
  };
}

describe("episode copy", () => {
  test("renders no provenance eyebrow for either authority", () => {
    expect(authorityNote("producer")).toBeNull();
    expect(authorityNote("tracker_enrichment")).toBeNull();
  });

  test("names every placement state and falls back on an unseen one", () => {
    expect(placementStateLabel("last_confirmed_active")).toBe("Last confirmed active");
    expect(placementStateLabel("confirmed_active")).toBe("Confirmed active");
    expect(placementStateLabel("confirmed_inactive")).toBe("Confirmed inactive");
    expect(placementStateLabel("planned")).toBe("Planned");
    expect(placementStateLabel("suspended")).toBe("Suspended");
    expect(placementStateLabel("conflicted")).toBe("Conflicting records");
    expect(placementStateLabel("unknown")).toBe("Status not established");
    expect(placementStateLabel("newly_minted_state")).toBe("newly minted state");
  });

  test("formats a day the way the change dates already read", () => {
    expect(formatEpisodeDay("2026-07-27")).toBe("July 27, 2026");
    expect(formatEpisodeDay("2024-06-01")).toBe("June 1, 2024");
    expect(formatEpisodeDay("not-a-day")).toBe("not-a-day");
  });

  test("drops an extent description that only renames a route already shown", () => {
    expect(
      extentLine({ kind: "unknown", label: "Exact extent not established", description: null }),
    ).toBe("Extent not established");
    expect(
      extentLine({
        kind: "route_wide",
        label: "Whole route",
        description: "Exact BX20 route incidence",
      }),
    ).toBe("Route-wide");
    expect(
      extentLine({
        kind: "bounded_segment",
        label: "Bounded segment",
        description: "Fordham Road between Jerome and Webster",
      }),
    ).toBe("Bounded segment — Fordham Road between Jerome and Webster");
  });

  test("keeps a reviewed action's verb and never invents one", () => {
    expect(componentSentence(producerComponent()).lead).toBe(
      "Added: Automated bus lane enforcement",
    );
    expect(
      componentSentence(
        producerComponent({ action: "unknown", actionLabel: "Action not established" }),
      ).lead,
    ).toBe("Recorded change: Automated bus lane enforcement");
  });

  test("drops a detail that only restates its own family label", () => {
    expect(
      componentSentence(producerComponent({ details: "Automated bus lane enforcement" })).detail,
    ).toBeNull();
    expect(
      componentSentence(producerComponent({ details: "automated bus lane enforcement route" }))
        .detail,
    ).toBeNull();
    expect(componentSentence(producerComponent({ details: "Q27 limited stops" })).detail).toBe(
      "Q27 limited stops",
    );
  });

  test("carries tracker components through the same shape", () => {
    expect(
      componentSentence({
        authority: "tracker_enrichment",
        componentId: "ace:BX20:ABLE:2024-06-20",
        label: "Automated bus lane enforcement (ABLE)",
        detail: "ACE automated bus lane enforcement for BX20",
      }),
    ).toEqual({
      lead: "Automated bus lane enforcement (ABLE)",
      detail: "ACE automated bus lane enforcement for BX20",
      extent: null,
    });
  });

  test("says one dated placement state once, with its count", () => {
    expect(
      placementLines([
        placement(),
        placement({ placementKey: "b" }),
        placement({ placementKey: "c" }),
      ]),
    ).toEqual([{ text: "Last confirmed active as of July 27, 2026", count: 3 }]);
    expect(
      placementLines([
        placement(),
        placement({ placementKey: "b", stateAsOf: "unknown" }),
        placement({
          placementKey: "c",
          confirmedCurrent: { state: "confirmed_active", asOfDate: "2026-07-27" },
        }),
      ]),
    ).toEqual([
      { text: "Last confirmed active as of July 27, 2026", count: 1 },
      { text: "Status not established as of July 27, 2026", count: 1 },
      { text: "Confirmed active as of July 27, 2026", count: 1 },
    ]);
  });

  test("suppresses the builder's summary boilerplate only", () => {
    expect(trackerSummaryVisible("Tracker-owned MTA camera-enforcement registry event.")).toBe(
      false,
    );
    expect(trackerSummaryVisible("Cameras began issuing violations along the corridor.")).toBe(
      true,
    );
  });
});
