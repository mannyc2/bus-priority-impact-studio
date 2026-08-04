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
  mergeIdenticalEpisodes,
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
    const grouped = networkChangeGroups(mergeIdenticalEpisodes(artifact.episodes)).flatMap(
      (group) => group.episodes,
    );
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

function trackerEpisode(input: {
  id: string;
  routeKey: string;
  routeId: string;
  label: string;
  date: string;
  title?: string;
}): PublicInterventionEpisode {
  return {
    authority: "tracker_enrichment",
    episodeId: input.id,
    title: input.title ?? `Automated camera enforcement on ${input.label}`,
    summary: "Tracker-owned MTA camera-enforcement registry event.",
    date: {
      precision: "day",
      value: input.date,
      display: input.date,
      intervalStart: input.date,
      intervalEnd: input.date,
    },
    routes: [
      { routeKey: input.routeKey, routeId: input.routeId, label: input.label, slug: input.routeKey },
    ],
    treatmentFamilies: [
      {
        treatmentFamilyKey: "automated-bus-lane-enforcement",
        label: "Automated bus lane enforcement",
      },
    ],
    components: [
      {
        authority: "tracker_enrichment",
        componentId: `ace:${input.routeId}:ABLE:${input.date}`,
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
      originIds: [`ace:${input.routeId}:ABLE:${input.date}`],
      sourceEventIds: [`ace:${input.routeId}:ABLE:${input.date}`],
    },
  };
}

const cameraWave: PublicInterventionEpisode[] = [
  trackerEpisode({
    id: "ep_1111111111111111",
    routeKey: "bx3",
    routeId: "BX3",
    label: "BX3",
    date: "2024-06-20",
  }),
  trackerEpisode({
    id: "ep_2222222222222222",
    routeKey: "bx7",
    routeId: "BX7",
    label: "BX7",
    date: "2024-06-20",
  }),
  trackerEpisode({
    id: "ep_3333333333333333",
    routeKey: "bx20",
    routeId: "BX20",
    label: "BX20",
    date: "2024-06-20",
  }),
];

describe("one real change renders once", () => {
  test("folds one dated rollout spread across routes into a single entry", () => {
    const merged = mergeIdenticalEpisodes(cameraWave);
    expect(merged).toHaveLength(1);
    const [entry] = merged;
    expect(entry?.title).toBe("Automated camera enforcement on 3 routes");
    expect(entry?.routes.map((route) => route.routeId).toSorted()).toEqual(["BX20", "BX3", "BX7"]);
    expect(entry?.mergedEpisodeIds).toEqual([
      "ep_1111111111111111",
      "ep_2222222222222222",
      "ep_3333333333333333",
    ]);
    expect(mergeIdenticalEpisodes(cameraWave.slice(0, 2))[0]?.title).toBe(
      "Automated camera enforcement on BX3 and BX7",
    );
  });

  test("never folds two changes whose titles differ beyond the routes", () => {
    const merged = mergeIdenticalEpisodes([
      producerEpisode({
        id: "occurrence:dddddddddddddddddddddddd",
        routeKey: "q27",
        routeId: "Q27",
        label: "Q27",
        title: "Queens Bus Network Redesign — Service pattern",
        date: "2025-06-29",
      }),
      producerEpisode({
        id: "occurrence:eeeeeeeeeeeeeeeeeeeeeeee",
        routeKey: "q76",
        routeId: "Q76",
        label: "Q76",
        title: "Bruckner Boulevard busway",
        date: "2025-06-29",
      }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.every((entry) => entry.mergedEpisodeIds.length === 1)).toBe(true);
  });

  test("never folds across authority", () => {
    const merged = mergeIdenticalEpisodes([
      trackerEpisode({
        id: "ep_4444444444444444",
        routeKey: "bx3",
        routeId: "BX3",
        label: "BX3",
        date: "2024-06-20",
        title: "Automated camera enforcement",
      }),
      producerEpisode({
        id: "occurrence:ffffffffffffffffffffffff",
        routeKey: "bx7",
        routeId: "BX7",
        label: "BX7",
        title: "Automated camera enforcement",
        date: "2024-06-20",
      }),
    ]);
    expect(merged).toHaveLength(2);
  });

  test("unions routes, components, placements and citations without duplicates", () => {
    const [entry] = mergeIdenticalEpisodes([
      producerEpisode({
        id: "occurrence:111111111111111111111111",
        routeKey: "b44-sbs",
        routeId: "B44+",
        label: "B44 SBS",
        title: "Queens Bus Network Redesign — Service pattern",
        date: "2025-06-29",
      }),
      producerEpisode({
        id: "occurrence:222222222222222222222222",
        routeKey: "b44-sbs",
        routeId: "B44+",
        label: "B44 SBS",
        title: "Queens Bus Network Redesign — Service pattern",
        date: "2025-06-29",
      }),
      producerEpisode({
        id: "occurrence:333333333333333333333333",
        routeKey: "q52-sbs",
        routeId: "Q52+",
        label: "Q52 SBS",
        title: "Queens Bus Network Redesign — Service pattern",
        date: "2025-06-29",
      }),
    ]);
    expect(entry?.routes.map((route) => route.routeKey)).toEqual(["b44-sbs", "q52-sbs"]);
    expect(entry?.components.map((component) => component.componentId)).toEqual([
      "b44-sbs-service-pattern-component",
      "q52-sbs-service-pattern-component",
    ]);
    expect(
      entry?.authority === "producer"
        ? entry.placements.map((placement) => placement.placementKey)
        : [],
    ).toEqual(["b44-sbs-service-pattern-placement"]);
    expect(entry?.citations).toHaveLength(1);
  });

  test("merges the same whatever order the changes arrive in", () => {
    const shuffled = [cameraWave[2], cameraWave[0], cameraWave[1]] as PublicInterventionEpisode[];
    expect(mergeIdenticalEpisodes(shuffled)).toEqual(mergeIdenticalEpisodes(cameraWave));
  });

  test("names the same routes it counts on a group heading", async () => {
    /* Three changes on one day, each already merged across several routes, so
       the badge cap has to count routes rather than the changes holding them. */
    const labels = Array.from(
      { length: 13 },
      (_, index) => `Q1${String(index + 1).padStart(2, "0")}`,
    );
    const stems = ["Automated camera enforcement", "Bus lane enforcement start", "Camera hours"];
    const sameDay = labels.map((label, index) =>
      trackerEpisode({
        id: `ep_${String(index).padStart(16, "a")}`,
        routeKey: label.toLowerCase(),
        routeId: label,
        label,
        date: "2024-06-20",
        title: `${stems[index % stems.length]} on ${label}`,
      }),
    );
    const merged = mergeIdenticalEpisodes(sameDay);
    expect(merged).toHaveLength(3);

    const html = await renderWithRouter(
      createElement(PublicInterventions, {
        artifact: { ...artifact, episodes: sameDay },
      }),
    );
    /* The group header runs from its trigger to its panel: the badge strip
       reads the same open or closed, so it sits outside the control. */
    const triggerAt = html.indexOf('data-slot="collapsible-trigger"');
    const header = html.slice(triggerAt, html.indexOf('data-slot="collapsible-content"', triggerAt));
    expect(labels.filter((label) => header.includes(label))).toHaveLength(10);
    expect(header).toContain("and 3 more");
    /* A real control that says what it will do. */
    expect(header).toContain("Show changes");
    expect(header).not.toContain("Hide changes");
    expect(html.slice(triggerAt - 200, triggerAt)).toContain("<button");
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
    /* An unreviewed action gets a neutral lead, never an invented verb. */
    expect(html).toContain("Recorded change: Service pattern");
    expect(html).toContain("/routes/b44-sbs");
    expect(html).toContain("none is a confirmed-current claim");
    expect(html).not.toContain("New service");
    expect(html).not.toContain("Kept running");
    expect(html).not.toContain("currently active");
  });

  test("speaks product rather than schema", async () => {
    const html = await renderWithRouter(createElement(PublicInterventions, { artifact }));
    const text = html.replaceAll(/<[^>]*>/gu, " ");
    expect(text).not.toContain("Resolved MTA source pack");
    expect(text).not.toContain("Tracker camera-enforcement enrichment");
    expect(text).not.toContain("Tracker-owned MTA camera-enforcement registry event.");
    expect(text).toMatch(/Automated camera enforcement on BX12\+/u);
    for (const pattern of [
      /route incidence/iu,
      /activationRoute/u,
      /last confirmed active as of 20\d\d-/u,
      /\breplaceAll\b/u,
    ]) {
      expect(pattern.test(text), text.slice(0, 400)).toBe(false);
    }
    /* The badge already names the route; its lowercase join key never renders. */
    expect(text).not.toMatch(/\bb44-sbs\b/u);
  });

  test("states the placement disclaimer once and counts repeated states", async () => {
    const [b44] = artifact.episodes;
    if (b44 === undefined || b44.authority !== "producer") throw new Error("fixture missing");
    const repeated = {
      ...b44,
      placements: [
        b44.placements[0],
        { ...b44.placements[0], placementKey: "b44-sbs-second-placement" },
        { ...b44.placements[0], placementKey: "b44-sbs-third-placement" },
      ],
    } as PublicInterventionEpisode;
    const html = await renderWithRouter(
      createElement(PublicInterventions, {
        artifact: { ...artifact, episodes: [repeated] },
      }),
    );
    const text = html.replaceAll(/<[^>]*>/gu, " ");
    expect(text.match(/none is a confirmed-current claim/gu)).toHaveLength(1);
    expect(text).toContain("Last confirmed active as of July 27, 2026 (×3)");
    expect(text).toContain("3 historical placement records");
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
