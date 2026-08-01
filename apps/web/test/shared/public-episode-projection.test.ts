import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import {
  type PublicInterventionEpisode,
  PublicInterventionEpisodesArtifactSchema,
  PublicRouteInterventionHistoryArtifactSchema,
} from "@bp/domain/studio/public-intervention-episodes";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PublicInterventions } from "../../src/components/interventions/PublicInterventions.js";
import { PublicRouteHistory } from "../../src/components/route/PublicRouteHistory.js";
import {
  chronologyAxis,
  chronologyOverlaps,
  episodesForRoute,
  hasEpisodeInsideSeries,
  networkBuildoutModel,
  networkChangeGroups,
  packChronologyBands,
  publicKindFacets,
  trendMarkers,
} from "../../src/studio/public-episode-view.js";

async function renderWithRouter(node: ReactNode): Promise<string> {
  const rootRoute = createRootRoute({ component: () => node });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

const candidate = {
  candidateId: "a".repeat(64),
  builderVersion: "resolved-transit-candidate-v2",
  producer: {
    releaseId: "resolved-pack-v1-production",
    tagTarget: "b".repeat(40),
    generatorCommit: "c".repeat(40),
    buildId: "d".repeat(64),
    asOfDate: "2026-07-27",
    releaseManifestSha256: "e".repeat(64),
    publicManifestSha256: "f".repeat(64),
  },
  trackerEnrichment: {
    aceRegistrySha256: "3".repeat(64),
    aceEventCount: 1,
    studyIndexSha256: "4".repeat(64),
    editorialCorpusSha256: "5".repeat(64),
  },
} as const;

function producerEpisode(input: {
  id: string;
  routeKey: string;
  routeId: string;
  label: string;
  title: string;
  date: string;
  action?: "add" | "remove" | "unknown";
}): PublicInterventionEpisode {
  const action = input.action ?? "unknown";
  return {
    authority: "producer",
    episodeId: input.id,
    aliases: [],
    title: input.title,
    summary: "",
    date: {
      precision: "day",
      value: input.date,
      display: input.date,
      intervalStart: input.date,
      intervalEnd: input.date,
    },
    routes: [
      {
        routeKey: input.routeKey,
        routeId: input.routeId,
        label: input.label,
        slug: input.routeKey,
      },
    ],
    treatmentFamilies: [{ treatmentFamilyKey: "service-pattern", label: "Service pattern" }],
    components: [
      {
        authority: "producer",
        componentId: `${input.routeKey}-service-pattern-component`,
        routeKey: input.routeKey,
        gtfsRouteId: input.routeId,
        treatmentFamilyKey: "service-pattern",
        treatmentFamilyLabel: "Service pattern",
        applicability: "applies",
        action,
        actionLabel:
          action === "unknown" ? "Action not established" : action === "add" ? "Added" : "Removed",
        extent: {
          kind: "unknown",
          label: "Exact extent not established",
          description: null,
        },
        details: "Reviewed service-pattern change",
        caveats: ["The source does not establish the exact extent."],
      },
    ],
    placements:
      input.routeKey === "b44-sbs"
        ? [
            {
              placementKey: "b44-sbs-service-pattern-placement",
              foundingComponentId: "b44-sbs-service-pattern-component",
              routeKey: input.routeKey,
              treatmentFamilyKey: "service-pattern",
              scope: { kind: "unknown" },
              stateAsOf: "last_confirmed_active",
              asOfDate: "2026-07-27",
              confirmedCurrent: null,
            },
          ]
        : [],
    citations: [
      {
        citationId: "reviewed-source",
        label: "MTA service notice",
        publisher: "MTA",
        published: input.date,
        url: "https://example.com/source",
        urlStatus: "source_provided",
      },
    ],
    caveat: null,
    finding: null,
  };
}

const episodes: PublicInterventionEpisode[] = [
  producerEpisode({
    id: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
    routeKey: "b44-sbs",
    routeId: "B44+",
    label: "B44 SBS",
    title: "Reviewed B44 change",
    date: "2024-09-16",
  }),
  producerEpisode({
    id: "occurrence:bbbbbbbbbbbbbbbbbbbbbbbb",
    routeKey: "q52-limited",
    routeId: "Q52+",
    label: "Q52 Limited",
    title: "Q52 Limited change",
    date: "2024-08-01",
    action: "add",
  }),
  producerEpisode({
    id: "occurrence:cccccccccccccccccccccccc",
    routeKey: "q52-sbs",
    routeId: "Q52+",
    label: "Q52 SBS",
    title: "Q52 SBS change",
    date: "2024-08-01",
    action: "remove",
  }),
  {
    authority: "tracker_enrichment",
    episodeId: "ep_0162fc3e1ab1f2fa",
    title: "Automated camera enforcement on BX12+",
    summary: "Tracker-owned MTA camera-enforcement registry event.",
    date: {
      precision: "day",
      value: "2022-11-18",
      display: "November 18, 2022",
      intervalStart: "2022-11-18",
      intervalEnd: "2022-11-18",
    },
    routes: [{ routeKey: "bx12-sbs", routeId: "BX12+", label: "BX12+", slug: "bx12-sbs" }],
    treatmentFamilies: [
      {
        treatmentFamilyKey: "automated-bus-lane-enforcement",
        label: "Automated bus lane enforcement",
      },
    ],
    components: [
      {
        authority: "tracker_enrichment",
        componentId: "ace:BX12+:ABLE:2022-11-18",
        label: "Automated bus lane enforcement (ABLE)",
        detail: null,
      },
    ],
    citations: [
      {
        citationId: "mta-ace-routes",
        label: "MTA Automated Camera Enforcement routes",
        publisher: "MTA",
        published: null,
        url: "https://example.com/ace",
        urlStatus: "source_provided",
      },
    ],
    caveat: null,
    finding: null,
    lineage: {
      sourceId: "mta_ace_routes",
      originIds: ["ace:BX12+:ABLE:2022-11-18"],
      sourceEventIds: ["ace:BX12+:ABLE:2022-11-18"],
    },
  },
];

const artifact = decodeStrict(PublicInterventionEpisodesArtifactSchema)({
  artifactKind: "bp.studio.public_intervention_episodes.v2",
  schemaVersion: 2,
  candidate,
  networkBuildout: {
    authority: "tracker_presentation",
    firstYear: 2022,
    lastYear: 2024,
    lastCompleteYear: 2024,
    partialFinalYear: false,
    coverageEndMonth: "2024-12",
    routeCount: 4,
    routesWithDocumentedWork: 4,
    series: [
      { familyKey: "camera_enforcement", label: "Camera enforcement", routesByYear: [1, 1, 1] },
    ],
    inputSha256: "6".repeat(64),
  },
  proposedPlans: {
    authority: "tracker_editorial",
    inputSha256: "7".repeat(64),
    plans: [],
    changeCount: 0,
    planCount: 0,
  },
  episodes,
});

describe("authority-tagged public projection", () => {
  test("keeps exact producer route keys with duplicate GTFS identity", () => {
    expect(episodesForRoute(artifact.episodes, "q52-limited")).toHaveLength(1);
    expect(episodesForRoute(artifact.episodes, "q52-sbs")).toHaveLength(1);
    expect(episodesForRoute(artifact.episodes, "Q52+")).toHaveLength(0);
    expect(
      artifact.episodes
        .flatMap((episode) => episode.routes)
        .filter((route) => route.routeId === "Q52+")
        .map((route) => route.routeKey)
        .sort(),
    ).toEqual(["q52-limited", "q52-sbs"]);
  });

  test("derives facets from exact reviewed family labels", () => {
    const facets = publicKindFacets(artifact.episodes);
    expect(facets).toContainEqual({
      kindKey: "service-pattern",
      label: "Service pattern",
      episodeCount: 3,
    });
    expect(facets.every((facet) => !facet.label.includes("_"))).toBe(true);
  });

  test("keeps one identity through grouping", () => {
    const grouped = networkChangeGroups(artifact.episodes).flatMap((group) => group.episodes);
    expect(grouped).toHaveLength(artifact.episodes.length);
    expect(new Set(grouped.map((episode) => episode.episodeId)).size).toBe(
      artifact.episodes.length,
    );
  });

  test("keeps global and per-route shared fields byte-equivalent", () => {
    const routeArtifact = decodeStrict(PublicRouteInterventionHistoryArtifactSchema)({
      artifactKind: "bp.studio.route_intervention_history.v2",
      schemaVersion: 2,
      candidateId: candidate.candidateId,
      producerAsOfDate: "2026-07-27",
      route: {
        routeKey: "b44-sbs",
        routeId: "B44+",
        slug: "b44-sbs",
        label: "B44 SBS",
        corridor: null,
      },
      episodes: episodesForRoute(artifact.episodes, "b44-sbs"),
    });
    const global = artifact.episodes.find(
      (episode) => episode.episodeId === routeArtifact.episodes[0]?.episodeId,
    );
    expect(routeArtifact.episodes[0]).toEqual(global);
  });
});

describe("public chronology helpers", () => {
  test("computes overlap and chronology from explicit intervals", () => {
    const [first, second] = artifact.episodes;
    if (first === undefined || second === undefined) throw new Error("fixture episodes missing");
    const left = {
      ...first,
      date: {
        precision: "range" as const,
        value: "2013 interval",
        display: "March to July 2013",
        intervalStart: "2013-03-20",
        intervalEnd: "2013-07-31",
      },
    };
    const right = {
      ...second,
      date: {
        precision: "day" as const,
        value: "2013-06-30",
        display: "June 30, 2013",
        intervalStart: "2013-06-30",
        intervalEnd: "2013-06-30",
      },
    };
    expect(chronologyOverlaps([left, right])[0]?.episodeIds).toEqual(
      [left.episodeId, right.episodeId].sort(),
    );
    const axis = chronologyAxis([left, right], []);
    expect(packChronologyBands([left, right], axis)).toHaveLength(2);
  });

  test("annotates only changes inside a speed window", () => {
    const b44 = episodesForRoute(artifact.episodes, "b44-sbs");
    expect(hasEpisodeInsideSeries(b44, ["2024-08", "2024-09", "2024-10"])).toBe(true);
    expect(trendMarkers(b44, ["2024-08", "2024-09", "2024-10"])).toHaveLength(1);
    expect(hasEpisodeInsideSeries(b44, ["2025-01"])).toBe(false);
  });

  test("keeps build-out presentation explicitly Tracker-owned", () => {
    expect(artifact.networkBuildout.authority).toBe("tracker_presentation");
    const buildout = networkBuildoutModel(artifact.networkBuildout);
    expect(buildout.routesWithAnyChange).toBe(4);
    expect(buildout.routesWithNoChange).toBe(0);
  });
});

describe("consumer markup", () => {
  test("uses neutral unknown copy, exact route links, and no false current claim", async () => {
    const html = await renderWithRouter(createElement(PublicInterventions, { artifact }));
    expect(html).toContain("Action not established: Service pattern");
    expect(html).toContain("b44-sbs");
    expect(html).toContain("/routes/b44-sbs");
    expect(html).toContain("this is not a confirmed-current claim");
    expect(html).not.toContain("New service");
    expect(html).not.toContain("Kept running");
    expect(html).not.toContain("currently active");
  });

  test("renders route history from the same exact episode", async () => {
    const routeEpisodes = episodesForRoute(artifact.episodes, "b44-sbs");
    const html = await renderWithRouter(
      createElement(PublicRouteHistory, {
        variant: "chronology",
        input: {
          routeKey: "b44-sbs",
          routeId: "B44+",
          routeLabel: "B44 SBS",
          corridor: null,
          episodes: routeEpisodes,
          speed: [],
        },
      }),
    );
    expect(html).toContain("Reviewed B44 change");
    expect(html).toContain("b44-sbs");
    expect(html).not.toContain("currently active");
  });
});
