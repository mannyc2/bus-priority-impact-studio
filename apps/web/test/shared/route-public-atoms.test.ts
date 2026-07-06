import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RPubInterventionCard } from "../../src/components/route/RoutePublicAtoms";
import type { StudioRouteEvidenceBundle } from "../../src/studio/api-contract";

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
