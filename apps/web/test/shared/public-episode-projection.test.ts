import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { decodeStrict } from "@bp/domain/decode";
import { PublicEpisodeResolutionAuditArtifactSchema } from "@bp/domain/studio/public-intervention-episode-audit";
import {
  type PublicInterventionEpisode,
  PublicInterventionEpisodesArtifactSchema,
} from "@bp/domain/studio/public-intervention-episodes";
import { createElement } from "react";
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

const REPO_ROOT = new URL("../../../../", import.meta.url);
const artifact = decodeStrict(PublicInterventionEpisodesArtifactSchema)(
  JSON.parse(
    readFileSync(
      new URL("data/artifacts/studio/v2/interventions/public-episodes.json", REPO_ROOT),
      "utf8",
    ),
  ),
);
const audit = decodeStrict(PublicEpisodeResolutionAuditArtifactSchema)(
  JSON.parse(
    readFileSync(
      new URL("data/artifacts/quality/intervention-episode-resolution.json", REPO_ROOT),
      "utf8",
    ),
  ),
);

const FORBIDDEN_IN_PUBLIC: readonly RegExp[] = [
  /occurrence[:_]/iu,
  /\bevent_/u,
  /\btreatment_/u,
  /\bproject_/u,
  /\brelation_/u,
  /\bace:[A-Z]/u,
  /study-event/iu,
  /document_intervention/iu,
  /v1-rc\d/iu,
  /\bdisposition/iu,
  /\bcorpus\b/iu,
  /\bfixture\b/iu,
  /\brelease id\b/iu,
  /\bprojection\b/iu,
  /\batomic\b/iu,
  /\bbundle\b/iu,
  /\bcohort\b/iu,
];

function publicStrings(episode: PublicInterventionEpisode): string[] {
  return [
    episode.title,
    episode.summary,
    episode.caveat ?? "",
    ...episode.components.flatMap((component) => [component.label, component.detail ?? ""]),
    ...episode.citations.map((citation) => citation.label),
    ...episode.routes.map((route) => route.label),
    episode.finding?.headline ?? "",
    episode.finding?.comparison ?? "",
    episode.finding?.caveat ?? "",
  ];
}

describe("generated public episode contract", () => {
  test("contains display fields only and keeps the operator audit separate", () => {
    expect(artifact.episodes).toHaveLength(204);
    expect(audit.scope.upstreamOccurrenceCount).toBe(131);
    expect(audit.scope.localMintedEpisodeCount).toBe(8);
    expect(audit.scope.registryEventCount).toBe(78);
    expect(audit.scope.registryAttachedEventCount).toBe(13);
    expect(audit.scope.registryMintedEpisodeCount).toBe(65);
    expect(audit.audits).toHaveLength(artifact.episodes.length);

    for (const episode of artifact.episodes) {
      expect(Object.keys(episode).sort()).toEqual([
        "caveat",
        "citations",
        "components",
        "date",
        "episodeId",
        "finding",
        "kindKeys",
        "lifecycle",
        "phase",
        "routes",
        "summary",
        "title",
      ]);
      expect(Object.keys(episode)).not.toContain("records");
      for (const value of publicStrings(episode)) {
        for (const pattern of FORBIDDEN_IN_PUBLIC) {
          expect(pattern.test(value), `${episode.episodeId}: ${value}`).toBe(false);
        }
      }
    }
  });

  test("keeps one identity for multi-route changes and exact route filtering", () => {
    const ids = artifact.episodes.map((episode) => episode.episodeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^ep_[0-9a-f]{16}$/u);

    const local = episodesForRoute(artifact.episodes, "B44");
    const sbs = episodesForRoute(artifact.episodes, "B44+");
    const shared = local.find((episode) =>
      episode.routes.some((route) => route.routeId === "B44+"),
    );
    expect(shared).toBeDefined();
    expect(sbs.some((episode) => episode.episodeId === shared?.episodeId)).toBe(true);
    expect(shared?.routes.map((route) => [route.routeId, route.label, route.role])).toEqual([
      ["B44+", "B44-SBS", "introduced"],
      ["B44", "B44", "continued"],
    ]);
  });

  test("uses the ACE registry for both public episodes and camera spread", () => {
    const cameraEpisodes = artifact.episodes.filter((episode) =>
      episode.kindKeys.includes("camera_enforcement"),
    );
    expect(cameraEpisodes).toHaveLength(71);
    const buildout = networkBuildoutModel(artifact.networkBuildout);
    expect(buildout.routesWithAnyChange).toBe(294);
    expect(buildout.routesWithNoChange).toBe(95);
    expect(
      buildout.series.find((series) => series.familyKey === "camera_enforcement")?.endValue,
    ).toBe(58);
    expect(buildout.series).toHaveLength(6);
  });
});

describe("public view helpers", () => {
  test("groups a redesign date without merging episode identities", () => {
    const groups = networkChangeGroups(artifact.episodes);
    expect(groups.length).toBeLessThan(artifact.episodes.length);
    const groupedIds = groups.flatMap((group) =>
      group.episodes.map((episode) => episode.episodeId),
    );
    expect(new Set(groupedIds).size).toBe(artifact.episodes.length);
  });

  test("uses public facet labels", () => {
    for (const facet of publicKindFacets(artifact.episodes)) {
      expect(facet.label).not.toContain("_");
      expect(facet.episodeCount).toBeGreaterThan(0);
    }
  });

  test("computes overlap from dated intervals", () => {
    const [first, second] = artifact.episodes;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const left = {
      ...(first as PublicInterventionEpisode),
      episodeId: "ep_aaaaaaaaaaaaaaaa",
      date: {
        precision: "range" as const,
        start: "2013-03-20",
        end: "2013-07-31",
        display: "March to July 2013",
        raw: "2013-03-20/2013-07-31",
      },
    };
    const right = {
      ...(second as PublicInterventionEpisode),
      episodeId: "ep_bbbbbbbbbbbbbbbb",
      date: {
        precision: "day" as const,
        start: "2013-06-30",
        end: "2013-06-30",
        display: "June 30, 2013",
        raw: "2013-06-30",
      },
    };
    expect(chronologyOverlaps([left, right])[0]?.episodeIds).toEqual([
      "ep_aaaaaaaaaaaaaaaa",
      "ep_bbbbbbbbbbbbbbbb",
    ]);
  });

  test("selects the trend only when a dated episode falls inside the speed record", () => {
    const bx41 = audit.reviewRoutes.find((route) => route.slug === "bx41");
    const bx38 = audit.reviewRoutes.find((route) => route.slug === "bx38");
    expect(bx41).toBeDefined();
    expect(bx38).toBeDefined();
    expect(
      hasEpisodeInsideSeries(
        episodesForRoute(artifact.episodes, "BX41"),
        (bx41?.speed ?? []).map((point) => point.month),
      ),
    ).toBe(false);
    expect(
      hasEpisodeInsideSeries(
        episodesForRoute(artifact.episodes, "BX38"),
        (bx38?.speed ?? []).map((point) => point.month),
      ),
    ).toBe(true);
    expect(
      trendMarkers(
        episodesForRoute(artifact.episodes, "BX38"),
        (bx38?.speed ?? []).map((point) => point.month),
      ).length,
    ).toBeGreaterThan(0);
  });

  test("packs dated changes into chronology rows", () => {
    const episodes = episodesForRoute(artifact.episodes, "BX41");
    const axis = chronologyAxis(episodes, []);
    const bands = packChronologyBands(episodes, axis);
    expect(bands.length).toBeGreaterThanOrEqual(4);
    expect(bands.some((band) => band.shape === "point")).toBe(true);
    expect(bands.some((band) => band.shape === "bar")).toBe(true);
  });
});

describe("consumer markup", () => {
  test("renders public copy without reviewer or pipeline vocabulary", () => {
    const route = audit.reviewRoutes.find((candidate) => candidate.slug === "m15-sbs");
    expect(route).toBeDefined();
    const pages = [
      renderToStaticMarkup(createElement(PublicInterventions, { artifact })),
      renderToStaticMarkup(
        createElement(PublicRouteHistory, {
          input: {
            routeId: route?.routeId ?? "M15+",
            routeLabel: route?.label ?? "M15-SBS",
            corridor: route?.corridor ?? null,
            episodes: episodesForRoute(artifact.episodes, route?.routeId ?? "M15+"),
            speed: route?.speed ?? [],
          },
        }),
      ),
    ];
    for (const html of pages) {
      const text = html.replaceAll(/<[^>]*>/gu, " ");
      for (const pattern of FORBIDDEN_IN_PUBLIC) expect(pattern.test(text), text).toBe(false);
      expect(text).not.toContain("293 of");
      expect(text).not.toContain("reviewed");
      expect(text).not.toContain("release");
    }
  });

  test("renders fixed numbered chronology markers for narrow layouts", () => {
    const route = audit.reviewRoutes.find((candidate) => candidate.slug === "bx41");
    const html = renderToStaticMarkup(
      createElement(PublicRouteHistory, {
        variant: "chronology",
        input: {
          routeId: route?.routeId ?? "BX41",
          routeLabel: route?.label ?? "Bx41",
          corridor: route?.corridor ?? null,
          episodes: episodesForRoute(artifact.episodes, route?.routeId ?? "BX41"),
          speed: route?.speed ?? [],
        },
      }),
    );
    expect(html).toContain(">1<");
    expect(html).toContain("No documented change intervals overlap.");
    expect(html).not.toContain('@max-lg:hidden"></span>');
  });
});
