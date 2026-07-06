import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RPubInterventionCard, RPubSlowCard } from "../../src/components/route/RoutePublicAtoms";
import type { StudioRouteEvidenceBundle, StudioSegment } from "../../src/studio/api-contract";

const segment = {
  id: "seg-1",
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
  hours: Array.from({ length: 24 }, (_, hour) => (hour >= 7 && hour <= 9 ? 3.8 : 6.1)),
  miles: 0.7,
} satisfies StudioSegment;

const evidence = {
  routeId: "M15+",
  routeSlug: "m15-sbs",
  wikiRouteRecordId: "route_m15",
  wikiRouteIds: ["M15"],
  wikiAliases: ["M15 SBS"],
  coverage: {
    timelineCount: 1,
    interventionCount: 0,
    metricClaimCount: 0,
    projectCount: 0,
    sourceGapCount: 0,
    citationCount: 1,
  },
  timeline: [],
  interventions: [],
  metricClaims: [],
  projects: [],
  sourceGaps: [],
  citations: [
    {
      key: "m15#progress",
      sourceId: "m15-progress",
      blockId: "block-1",
      evidenceId: "m15#progress",
      sourcePath: "raw/m15-progress.jsonl",
      sourceTitle: "M15 Progress Report",
      publisher: "MTA",
      publishedDate: "2025-01",
    },
  ],
} satisfies StudioRouteEvidenceBundle;

describe("route public atoms", () => {
  test("renders slow cards with and without served hourly profile data", () => {
    const withHours = renderToStaticMarkup(
      createElement(RPubSlowCard, {
        segment,
        rank: 1,
        routeMedianMph: 6.7,
        badge: "Slowest stretch",
        note: createElement("span", null, "Source note"),
      }),
    );
    const withoutHours = renderToStaticMarkup(
      createElement(RPubSlowCard, {
        segment: { ...segment, hours: [] },
        rank: 1,
        routeMedianMph: 6.7,
        badge: null,
        note: null,
      }),
    );

    expect(withHours).toContain("Hourly speed profile");
    expect(withHours).toContain("4.8 mph");
    expect(withHours).toContain("1.9 mph below the route median");
    expect(withoutHours).not.toContain("Hourly speed profile");
    expect(
      renderToStaticMarkup(
        createElement(RPubSlowCard, {
          segment: { ...segment, scheduledMph: null },
          rank: 1,
          routeMedianMph: 6.7,
          badge: null,
          note: null,
        }),
      ),
    ).not.toContain("Hourly speed profile");
  });

  test("renders intervention card citations from wiki evidence", () => {
    const markup = renderToStaticMarkup(
      createElement(RPubInterventionCard, {
        dateLabel: "2025-01",
        yearLabel: "2025",
        kind: "bus_lane",
        title: "Bus lane begins",
        detail: "A documented intervention appears in the route source record.",
        tone: "good",
        sourceLabel: "MTA-wiki",
        citationKeys: ["m15#progress"],
        evidence,
      }),
    );

    expect(markup).toContain("M15 Progress Report");
    expect(markup).toContain("MTA");
    expect(markup).toContain("2025-01");
  });
});
