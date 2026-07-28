import { describe, expect, test } from "bun:test";
import type { LocalInterventionEvent } from "@bp/db/local";
import type { PublicEpisodeResolutionAuditArtifact } from "@bp/domain/studio/public-intervention-episode-audit";
import type { PublicInterventionEpisode } from "@bp/domain/studio/public-intervention-episodes";
import {
  admitAceRegistry,
  componentLabel,
  episodeIdFor,
} from "../src/lib/public-intervention-episodes.ts";

type AuditRow = PublicEpisodeResolutionAuditArtifact["audits"][number];

const routeById = new Map([
  [
    "B1",
    {
      routeId: "B1",
      slug: "b1",
      label: "B1",
      corridor: "Bay Ridge - Manhattan Beach",
    },
  ],
]);

function episode(id: string): PublicInterventionEpisode {
  return {
    episodeId: id,
    title: "Camera enforcement began on the B1",
    summary: "",
    date: {
      precision: "day",
      start: "2024-09-16",
      end: "2024-09-16",
      display: "September 16, 2024",
      raw: "2024-09-16",
    },
    phase: "switched_on",
    lifecycle: "in_place",
    kindKeys: ["camera_enforcement"],
    routes: [{ routeId: "B1", slug: "b1", label: "B1", role: "affected" }],
    components: [],
    citations: [],
    caveat: null,
    finding: null,
  };
}

function audit(episodeId: string): AuditRow {
  return {
    episodeId,
    decisionKind: "reviewed_occurrence",
    decisionIds: ["decision:b1"],
    occurrenceId: "occurrence:b1",
    sourceEventIds: [],
    records: [],
    reviewerNotes: [],
    replacementState: null,
  };
}

function registryEvent(date: string, program: "ABLE" | "ACE"): LocalInterventionEvent {
  return {
    eventId: `ace:B1:${program}:${date}`,
    routeId: "B1",
    interventionType: "automated_bus_lane_enforcement",
    sourceId: "mta_ace_routes",
    program,
    implementationDate: `${date}T00:00:00.000Z`,
    implementationMonth: date.slice(0, 7),
    eventStatus: "implemented",
    description: `${program} automated bus lane enforcement for B1`,
  };
}

describe("public intervention episode admission", () => {
  test("attaches only an exact route-and-day registry event and mints the other date", () => {
    const base = episode("ep_aaaaaaaaaaaaaaaa");
    const result = admitAceRegistry({
      episodes: [base],
      audits: [audit(base.episodeId)],
      events: [registryEvent("2024-09-16", "ABLE"), registryEvent("2025-01-06", "ACE")],
      routeById,
    });
    expect(result.attachedCount).toBe(1);
    expect(result.mintedCount).toBe(1);
    expect(result.episodes).toHaveLength(2);
    expect(result.audits[0]?.sourceEventIds).toEqual(["ace:B1:ABLE:2024-09-16"]);
    expect(result.episodes[0]?.components[0]?.label).toBe("Automated bus lane enforcement (ABLE)");
    expect(result.episodes[1]?.components[0]?.label).toBe("Automated camera enforcement (ACE)");
  });

  test("rejects an ambiguous exact match instead of guessing", () => {
    const left = episode("ep_aaaaaaaaaaaaaaaa");
    const right = episode("ep_bbbbbbbbbbbbbbbb");
    expect(() =>
      admitAceRegistry({
        episodes: [left, right],
        audits: [audit(left.episodeId), audit(right.episodeId)],
        events: [registryEvent("2024-09-16", "ACE")],
        routeById,
      }),
    ).toThrow(/ambiguously matches 2 public episodes/u);
  });

  test("keeps stable source-neutral ids and public component labels", () => {
    expect(episodeIdFor("occurrence|x")).toBe(episodeIdFor("occurrence|x"));
    expect(episodeIdFor("occurrence|x")).not.toBe(episodeIdFor("reconciliation|x"));
    expect(componentLabel("transit_signal_priority", "")).toBe("Signal priority");
  });
});
