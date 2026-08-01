import { describe, expect, test } from "bun:test";
import { decodeStrict } from "../src/decode.ts";
import {
  type ResolvedTransitPublicPack,
  ResolvedTransitPublicPackSchema,
  validateResolvedTransitPublicPack,
} from "../src/studio/resolved-transit-public-pack.ts";

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function completePack(): ResolvedTransitPublicPack {
  return decodeStrict(ResolvedTransitPublicPackSchema)({
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
        intervention_id: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
        display_name: "Reviewed bus lane change",
        aliases: [],
        onset: { date: "2024-09", precision: "month" },
        route_keys: ["b44-sbs"],
        intervention_component_keys: ["b44-sbs-bus-lane-component"],
        treatment_family_keys: ["bus-lane"],
        source_refs: [{ source_key: "reviewed-source" }],
        classification: "historical_episode",
      },
    ],
    components: [
      {
        schema_version: 1,
        intervention_id: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
        intervention_component_key: "b44-sbs-bus-lane-component",
        route_key: "b44-sbs",
        gtfs_route_id: "B44+",
        treatment_family_key: "bus-lane",
        treatment_family_label: "Bus lane",
        applicability: "applies",
        action: "add",
        action_label: "Added",
        extent: { kind: "route_wide", label: "Route-wide", description: null },
        details: "Reviewed lane implementation",
        caveats: [],
        source_refs: [{ source_key: "reviewed-source" }],
      },
    ],
    placements: [
      {
        schema_version: 1,
        placement_key: "b44-sbs-bus-lane-placement",
        founding_intervention_component_key: "b44-sbs-bus-lane-component",
        route_key: "b44-sbs",
        treatment_family_key: "bus-lane",
        scope: { kind: "route_wide" },
        state_as_of: "last_confirmed_active",
        as_of_date: "2026-07-27",
      },
    ],
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
      { schema_version: 1, treatment_family_key: "bus-lane", display_name: "Bus lane" },
    ],
    route_index: [
      {
        schema_version: 1,
        route_key: "b44-sbs",
        intervention_id: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
        intervention_component_key: "b44-sbs-bus-lane-component",
        treatment_family_key: "bus-lane",
        action: "add",
      },
    ],
    history: [
      {
        schema_version: 1,
        history_kind: "component_application",
        route_key: "b44-sbs",
        intervention_id: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
        intervention_component_key: "b44-sbs-bus-lane-component",
        treatment_family_key: "bus-lane",
        action: "add",
        onset: { date: "2024-09", precision: "month" },
      },
      {
        schema_version: 1,
        history_kind: "placement_transition",
        intervention_id: "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa",
        intervention_component_key: "b44-sbs-bus-lane-component",
        action: "add",
        target_placement_keys: [],
        result_placement_keys: ["b44-sbs-bus-lane-placement"],
      },
    ],
    current_footprint: [],
    summary: {
      schema_version: 1,
      as_of_date: "2026-07-27",
      reviewed_historical_episode_count: 1,
      exact_component_count: 1,
      exact_route_component_incidence_count: 1,
      resolved_placement_count: 1,
      confirmed_current_placement_count: 0,
      confirmed_current_route_count: 0,
      placement_counts_by_state: {
        confirmed_active: 0,
        last_confirmed_active: 1,
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
  });
}

function mutablePack(): Mutable<ResolvedTransitPublicPack> {
  return structuredClone(completePack()) as Mutable<ResolvedTransitPublicPack>;
}

describe("resolved transit public pack", () => {
  test("strictly decodes and reconciles a complete pack", () => {
    const pack = completePack();
    expect(validateResolvedTransitPublicPack(pack)).toBe(pack);
    expect(pack.routes[0]?.gtfs_route_id).toBe("B44+");
    expect(pack.current_footprint).toEqual([]);
  });

  test("rejects excess public fields", () => {
    const value = structuredClone(completePack()) as ResolvedTransitPublicPack & {
      reviewer?: string;
    };
    value.reviewer = "operator";
    expect(() => decodeStrict(ResolvedTransitPublicPackSchema)(value)).toThrow();
  });

  test("rejects duplicate identities and dangling joins", () => {
    const duplicate = mutablePack();
    const episode = duplicate.episodes[0];
    if (episode === undefined) throw new Error("fixture needs an episode");
    duplicate.episodes.push(episode);
    expect(() => validateResolvedTransitPublicPack(duplicate)).toThrow(/duplicate/u);

    const dangling = mutablePack();
    const danglingComponent = dangling.components[0];
    if (danglingComponent === undefined) throw new Error("fixture needs a component");
    danglingComponent.route_key = "missing-route";
    expect(() => validateResolvedTransitPublicPack(dangling)).toThrow(/route join/u);
  });

  test("preserves reviewed unknown semantics and requires their caveat", () => {
    const pack = mutablePack();
    const component = pack.components[0];
    const routeIndex = pack.route_index[0];
    const history = pack.history[0];
    if (component === undefined || routeIndex === undefined || history === undefined) {
      throw new Error("fixture needs component/index/history rows");
    }
    component.action = "unknown";
    component.action_label = "Action not established";
    component.caveats = ["The reviewed source does not establish the action."];
    routeIndex.action = "unknown";
    history.action = "unknown";
    pack.history = [history];
    pack.placements = [];
    pack.summary.resolved_placement_count = 0;
    pack.summary.placement_counts_by_state.last_confirmed_active = 0;
    expect(validateResolvedTransitPublicPack(pack).components[0]?.action).toBe("unknown");

    component.caveats = [];
    expect(() => validateResolvedTransitPublicPack(pack)).toThrow(/require a caveat/u);
  });
});
