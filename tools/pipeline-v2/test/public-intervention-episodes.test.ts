import { describe, expect, test } from "bun:test";
import type { LocalInterventionEvent } from "@bp/db/local";
import type { StudioInterventionCorpus } from "@bp/domain/studio";
import type {
  ResolvedTransitPublicPack,
  TrackerConformanceAcceptedDiffRow,
  TrackerConformanceBaselineRow,
  TrackerConformanceRouteSurfaceRow,
} from "@bp/domain/studio/resolved-transit-public-pack";
import type { StudyIndexArtifact } from "@bp/domain/studio/study";
import { buildPublicInterventionEpisodes } from "../src/lib/public-intervention-episodes.ts";
import type { ResolvedTransitPublicPackImport } from "../src/lib/resolved-transit-public-pack.ts";

const PRODUCER_ID = "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa";
const TRACKER_ID = "ep_0162fc3e1ab1f2fa";
const ACE_ID = "ace:BX12+:ABLE:2022-11-18";

function producerPack(): ResolvedTransitPublicPack {
  return {
    manifest: {
      schema_version: 1,
      contract_id: "resolved-transit-public-pack-v1",
      as_of_date: "2026-07-27",
      resources: [
        { name: "public_intervention_episodes.jsonl", role: "historical_episodes" },
        { name: "public_intervention_components.jsonl", role: "exact_components" },
        { name: "public_intervention_placements.jsonl", role: "stable_placements" },
        { name: "public_routes.jsonl", role: "route_dictionary" },
        { name: "public_treatment_families.jsonl", role: "treatment_dictionary" },
        { name: "public_route_intervention_index.jsonl", role: "route_component_index" },
        { name: "public_intervention_history.jsonl", role: "history" },
        { name: "public_current_footprint.jsonl", role: "confirmed_current" },
        { name: "public_network_summary.json", role: "completeness_summary" },
        { name: "public_sources.jsonl", role: "source_dictionary" },
      ],
    },
    episodes: [
      {
        schema_version: 1,
        intervention_id: PRODUCER_ID,
        display_name: "Reviewed B44 service-pattern change",
        aliases: [],
        onset: { date: "2024-09", precision: "month" },
        route_keys: ["b44-sbs"],
        intervention_component_keys: ["b44-sbs-service-pattern-component"],
        treatment_family_keys: ["service-pattern"],
        source_refs: [{ source_key: "reviewed-source" }],
        classification: "historical_episode",
      },
    ],
    components: [
      {
        schema_version: 1,
        intervention_id: PRODUCER_ID,
        intervention_component_key: "b44-sbs-service-pattern-component",
        route_key: "b44-sbs",
        gtfs_route_id: "B44+",
        treatment_family_key: "service-pattern",
        treatment_family_label: "Service pattern",
        applicability: "applies",
        action: "unknown",
        action_label: "Action not established",
        extent: {
          kind: "unknown",
          label: "Exact extent not established",
          description: null,
        },
        details: "Reviewed service-pattern change",
        caveats: ["The reviewed source does not establish action or extent."],
        source_refs: [{ source_key: "reviewed-source" }],
      },
    ],
    placements: [],
    routes: [
      {
        schema_version: 1,
        route_key: "b44-sbs",
        gtfs_route_id: "B44+",
        display_name: "B44 SBS",
        aliases: ["B44+"],
      },
    ],
    treatment_families: [
      {
        schema_version: 1,
        treatment_family_key: "service-pattern",
        display_name: "Service pattern",
      },
    ],
    route_index: [
      {
        schema_version: 1,
        route_key: "b44-sbs",
        intervention_id: PRODUCER_ID,
        intervention_component_key: "b44-sbs-service-pattern-component",
        treatment_family_key: "service-pattern",
        action: "unknown",
      },
    ],
    history: [
      {
        schema_version: 1,
        history_kind: "component_application",
        route_key: "b44-sbs",
        intervention_id: PRODUCER_ID,
        intervention_component_key: "b44-sbs-service-pattern-component",
        treatment_family_key: "service-pattern",
        action: "unknown",
        onset: { date: "2024-09", precision: "month" },
      },
    ],
    current_footprint: [],
    summary: {
      schema_version: 1,
      as_of_date: "2026-07-27",
      reviewed_historical_episode_count: 1,
      exact_component_count: 1,
      exact_route_component_incidence_count: 1,
      resolved_placement_count: 0,
      confirmed_current_placement_count: 0,
      confirmed_current_route_count: 0,
      placement_counts_by_state: {
        confirmed_active: 0,
        last_confirmed_active: 0,
        confirmed_inactive: 0,
        planned: 0,
        suspended: 0,
        conflicted: 0,
        unknown: 0,
      },
      placement_frontier_candidate_count: 1,
      placement_frontier_pending_count: 0,
      frontier_profile: "closed_nonauthorizing_v1",
    },
    sources: [
      {
        schema_version: 1,
        source_key: "reviewed-source",
        title: "Reviewed source",
        publisher: "MTA",
        date: "2024-09",
        url: "https://example.com/source",
        url_status: "source_provided",
      },
    ],
  };
}

function acceptedDiff(): TrackerConformanceAcceptedDiffRow[] {
  return [
    {
      schema_version: 1,
      row_kind: "producer_addition",
      consumer_disposition: "add_producer_episode",
      classification: "mta_wiki_owned_producer_truth",
      tracker_episode_id: null,
      tracker_origin: null,
      tracker_date: null,
      tracker_route_ids: [],
      tracker_route_keys: [],
      origin_ids: [],
      producer_intervention_ids: [PRODUCER_ID],
      producer_onset: { date: "2024-09", precision: "month" },
      producer_route_keys: ["b44-sbs"],
      field_diffs: ["tracker_episode_absent"],
      reason_code: "final_producer_episode_missing_from_legacy_tracker_projection",
      acceptance_receipt_id: "plan-056-owner-approval:2026-08-01",
      accepted_at: "2026-08-01",
      accepted_by: "project-owner",
    },
    {
      schema_version: 1,
      row_kind: "tracker_episode",
      consumer_disposition: "enrichment_only",
      classification: "tracker_owned_enrichment",
      tracker_episode_id: TRACKER_ID,
      tracker_origin: "ace_registry",
      tracker_date: { precision: "day", value: "2022-11-18" },
      tracker_route_ids: ["BX12+"],
      tracker_route_keys: ["bx12-sbs"],
      origin_ids: [ACE_ID],
      producer_intervention_ids: [],
      producer_onset: null,
      producer_route_keys: [],
      field_diffs: ["episode_identity", "presentation_copy", "producer_episode_absent"],
      reason_code: "ace_registry_event_remains_tracker_enrichment_without_local_episode_identity",
      acceptance_receipt_id: "plan-056-owner-approval:2026-08-01",
      accepted_at: "2026-08-01",
      accepted_by: "project-owner",
    },
  ];
}

function imported(): ResolvedTransitPublicPackImport {
  const baseline: TrackerConformanceBaselineRow = {
    schema_version: 1,
    tracker_episode_id: TRACKER_ID,
    tracker_origin: "ace_registry",
    tracker_date: { precision: "day", value: "2022-11-18" },
    tracker_route_ids: ["BX12+"],
    tracker_route_keys: ["bx12-sbs"],
    origin_ids: [ACE_ID],
    producer_intervention_id: null,
    global_episode_sha256: "1".repeat(64),
  };
  const routeSurface: TrackerConformanceRouteSurfaceRow = {
    schema_version: 1,
    tracker_route_id: "BX12+",
    tracker_route_key: "bx12-sbs",
    route_artifact_sha256: "2".repeat(64),
    episode_memberships: [{ tracker_episode_id: TRACKER_ID, episode_sha256: "3".repeat(64) }],
  };
  return {
    releaseRoot: "/fixture/release",
    pack: producerPack(),
    conformance: {
      acceptedDiff: acceptedDiff(),
      trackerBaseline: [baseline],
      trackerRouteSurface: [routeSurface],
      acceptanceReceiptId: "fixture-receipt",
      dispositionCounts: {
        useProducerIdentity: 0,
        trackerEnrichmentOnly: 1,
        dropLegacyEpisode: 0,
        addProducerEpisode: 1,
      },
      targetComposition: {
        episodeCount: 2,
        routeArtifactCount: 2,
        episodeRouteMembershipCount: 2,
      },
    },
    verified: {
      releaseManifestSha256: "4".repeat(64),
      publicManifestSha256: "5".repeat(64),
      acceptedDiffLedgerSha256: "6".repeat(64),
      acceptedLedgerReceiptSha256: "7".repeat(64),
      verifiedOuterResourceCount: 17,
    },
  };
}

function registryEvent(id = ACE_ID): LocalInterventionEvent {
  return {
    eventId: id,
    routeId: "BX12+",
    interventionType: "automated_bus_lane_enforcement",
    sourceId: "mta_ace_routes",
    program: "ABLE",
    implementationDate: "2022-11-18T00:00:00.000Z",
    implementationMonth: "2022-11",
    eventStatus: "implemented",
    description: "ABLE automated bus lane enforcement for BX12+",
  };
}

function build(aceHash = "8".repeat(64)) {
  return buildPublicInterventionEpisodes({
    imported: imported(),
    corpus: { records: [] } as unknown as StudioInterventionCorpus,
    studies: { studies: [] } as unknown as StudyIndexArtifact,
    registryEvents: [registryEvent()],
    sourceHashes: {
      corpusArtifact: "9".repeat(64),
      studyIndexArtifact: "a".repeat(64),
      aceRegistry: aceHash,
    },
  });
}

describe("resolved public intervention candidate", () => {
  test("uses exact producer and accepted Tracker identities without local minting", () => {
    const result = build();
    expect(result.publicArtifact.episodes.map((episode) => episode.episodeId).sort()).toEqual([
      TRACKER_ID,
      PRODUCER_ID,
    ]);
    expect(result.routeArtifacts.map((artifact) => artifact.route.routeKey)).toEqual([
      "b44-sbs",
      "bx12-sbs",
    ]);
    expect(result.publicArtifact.episodes.flatMap((episode) => episode.routes)).toContainEqual({
      routeKey: "b44-sbs",
      routeId: "B44+",
      label: "B44 SBS",
      slug: "b44-sbs",
    });
  });

  test("preserves reviewed unknown action/extent without a current claim", () => {
    const producer = build().publicArtifact.episodes.find(
      (episode) => episode.authority === "producer",
    );
    expect(producer?.authority).toBe("producer");
    if (producer?.authority !== "producer") throw new Error("missing producer episode");
    expect(producer.components[0]?.action).toBe("unknown");
    expect(producer.components[0]?.extent.kind).toBe("unknown");
    expect(producer.components[0]?.caveats).toHaveLength(1);
    expect(producer.placements).toEqual([]);
  });

  test("keeps global and route projections byte-equivalent", () => {
    const result = build();
    const globalById = new Map(
      result.publicArtifact.episodes.map((episode) => [episode.episodeId, episode]),
    );
    for (const artifact of result.routeArtifacts) {
      for (const episode of artifact.episodes) {
        const global = globalById.get(episode.episodeId);
        if (global === undefined) throw new Error("route projection lacks a global episode");
        expect(episode).toEqual(global);
      }
    }
  });

  test("derives candidate identity only from semantic hashes", () => {
    expect(build().candidateId).toBe(build().candidateId);
    expect(build("b".repeat(64)).candidateId).not.toBe(build().candidateId);
  });

  test("fails closed when a local ACE event is outside the accepted ledger", () => {
    expect(() =>
      buildPublicInterventionEpisodes({
        imported: imported(),
        corpus: { records: [] } as unknown as StudioInterventionCorpus,
        studies: { studies: [] } as unknown as StudyIndexArtifact,
        registryEvents: [registryEvent("ace:BX12+:ABLE:2022-11-19")],
        sourceHashes: {
          corpusArtifact: "9".repeat(64),
          studyIndexArtifact: "a".repeat(64),
          aceRegistry: "8".repeat(64),
        },
      }),
    ).toThrow(/accepted ACE event coverage/u);
  });
});
