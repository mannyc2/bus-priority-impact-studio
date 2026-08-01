import { Schema } from "effect";

export const RESOLVED_TRANSIT_PUBLIC_PACK_CONTRACT_ID = "resolved-transit-public-pack-v1" as const;

export const RESOLVED_TRANSIT_PUBLIC_RESOURCE_ROLES = [
  ["public_intervention_episodes.jsonl", "historical_episodes"],
  ["public_intervention_components.jsonl", "exact_components"],
  ["public_intervention_placements.jsonl", "stable_placements"],
  ["public_routes.jsonl", "route_dictionary"],
  ["public_treatment_families.jsonl", "treatment_dictionary"],
  ["public_route_intervention_index.jsonl", "route_component_index"],
  ["public_intervention_history.jsonl", "history"],
  ["public_current_footprint.jsonl", "confirmed_current"],
  ["public_network_summary.json", "completeness_summary"],
  ["public_sources.jsonl", "source_dictionary"],
] as const;

const NonEmptyStringSchema = Schema.String.check(Schema.isMinLength(1));
const NonNegativeSafeIntegerSchema = Schema.Number.check(Schema.isInt()).check(
  Schema.isGreaterThanOrEqualTo(0),
);
const Sha256Schema = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u));
const PublicKeySchema = NonEmptyStringSchema.check(Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u));
const ProducerInterventionIdSchema = NonEmptyStringSchema.check(
  Schema.isPattern(/^occurrence:[a-f0-9]{24}$/u),
);
const TrackerEpisodeIdSchema = NonEmptyStringSchema.check(Schema.isPattern(/^ep_[a-f0-9]{16}$/u));
const IsoDaySchema = NonEmptyStringSchema.check(
  Schema.isPattern(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u),
);

export const ResolvedTransitPublicActionSchema = Schema.Literals([
  "add",
  "modify",
  "remove",
  "suspend",
  "resume",
  "retain",
  "unknown",
]);

export const ResolvedTransitPublicExtentKindSchema = Schema.Literals([
  "route_wide",
  "bounded_segment",
  "stop_set",
  "service_pattern",
  "unknown",
]);

export const ResolvedTransitPublicPlacementStateSchema = Schema.Literals([
  "confirmed_active",
  "last_confirmed_active",
  "confirmed_inactive",
  "planned",
  "suspended",
  "conflicted",
  "unknown",
]);

export const ResolvedTransitPublicOnsetSchema = Schema.Struct({
  date: NonEmptyStringSchema,
  precision: Schema.Literals(["day", "month", "season", "year", "upper_bound_day"]),
});

export const ResolvedTransitPublicSourceRefSchema = Schema.Struct({
  source_key: PublicKeySchema,
});

export const ResolvedTransitPublicPackManifestSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  contract_id: Schema.Literal(RESOLVED_TRANSIT_PUBLIC_PACK_CONTRACT_ID),
  as_of_date: IsoDaySchema,
  resources: Schema.Array(
    Schema.Struct({
      name: Schema.Literals(RESOLVED_TRANSIT_PUBLIC_RESOURCE_ROLES.map(([name]) => name)),
      role: Schema.Literals(RESOLVED_TRANSIT_PUBLIC_RESOURCE_ROLES.map(([, role]) => role)),
    }),
  ),
});

export const ResolvedTransitPublicEpisodeSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  intervention_id: ProducerInterventionIdSchema,
  display_name: NonEmptyStringSchema,
  aliases: Schema.Array(NonEmptyStringSchema),
  onset: ResolvedTransitPublicOnsetSchema,
  route_keys: Schema.Array(PublicKeySchema),
  intervention_component_keys: Schema.Array(PublicKeySchema),
  treatment_family_keys: Schema.Array(PublicKeySchema),
  source_refs: Schema.Array(ResolvedTransitPublicSourceRefSchema),
  classification: Schema.Literal("historical_episode"),
});

export const ResolvedTransitPublicComponentSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  intervention_id: ProducerInterventionIdSchema,
  intervention_component_key: PublicKeySchema,
  route_key: PublicKeySchema,
  gtfs_route_id: NonEmptyStringSchema,
  treatment_family_key: PublicKeySchema,
  treatment_family_label: NonEmptyStringSchema,
  applicability: Schema.Literal("applies"),
  action: ResolvedTransitPublicActionSchema,
  action_label: NonEmptyStringSchema,
  extent: Schema.Struct({
    kind: ResolvedTransitPublicExtentKindSchema,
    label: NonEmptyStringSchema,
    description: Schema.NullOr(NonEmptyStringSchema),
  }),
  details: NonEmptyStringSchema,
  caveats: Schema.Array(NonEmptyStringSchema),
  source_refs: Schema.Array(ResolvedTransitPublicSourceRefSchema),
});

export const ResolvedTransitPublicPlacementSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  placement_key: PublicKeySchema,
  founding_intervention_component_key: Schema.NullOr(PublicKeySchema),
  route_key: PublicKeySchema,
  treatment_family_key: PublicKeySchema,
  scope: Schema.Struct({ kind: ResolvedTransitPublicExtentKindSchema }),
  state_as_of: ResolvedTransitPublicPlacementStateSchema,
  as_of_date: IsoDaySchema,
});

export const ResolvedTransitPublicRouteSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  route_key: PublicKeySchema,
  gtfs_route_id: NonEmptyStringSchema,
  display_name: NonEmptyStringSchema,
  aliases: Schema.Array(NonEmptyStringSchema),
});

export const ResolvedTransitPublicTreatmentFamilySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  treatment_family_key: PublicKeySchema,
  display_name: NonEmptyStringSchema,
});

export const ResolvedTransitPublicRouteIndexRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  route_key: PublicKeySchema,
  intervention_id: ProducerInterventionIdSchema,
  intervention_component_key: PublicKeySchema,
  treatment_family_key: PublicKeySchema,
  action: ResolvedTransitPublicActionSchema,
});

export const ResolvedTransitPublicComponentHistorySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  history_kind: Schema.Literal("component_application"),
  route_key: PublicKeySchema,
  intervention_id: ProducerInterventionIdSchema,
  intervention_component_key: PublicKeySchema,
  treatment_family_key: PublicKeySchema,
  action: ResolvedTransitPublicActionSchema,
  onset: ResolvedTransitPublicOnsetSchema,
});

export const ResolvedTransitPublicPlacementTransitionHistorySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  history_kind: Schema.Literal("placement_transition"),
  intervention_id: ProducerInterventionIdSchema,
  intervention_component_key: PublicKeySchema,
  action: ResolvedTransitPublicActionSchema,
  target_placement_keys: Schema.Array(PublicKeySchema),
  result_placement_keys: Schema.Array(PublicKeySchema),
});

export const ResolvedTransitPublicHistorySchema = Schema.Union([
  ResolvedTransitPublicComponentHistorySchema,
  ResolvedTransitPublicPlacementTransitionHistorySchema,
]);

export const ResolvedTransitPublicCurrentFootprintSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  placement_key: PublicKeySchema,
  route_key: PublicKeySchema,
  treatment_family_key: PublicKeySchema,
  scope: Schema.Struct({ kind: ResolvedTransitPublicExtentKindSchema }),
  state: Schema.Literal("confirmed_active"),
  as_of_date: IsoDaySchema,
});

export const ResolvedTransitPublicSourceSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  source_key: PublicKeySchema,
  title: NonEmptyStringSchema,
  publisher: Schema.NullOr(NonEmptyStringSchema),
  date: Schema.NullOr(NonEmptyStringSchema),
  url: Schema.NullOr(NonEmptyStringSchema),
  url_status: Schema.Literals(["source_provided", "accepted_override", "unavailable"]),
});

const PlacementStateCountsSchema = Schema.Struct({
  confirmed_active: NonNegativeSafeIntegerSchema,
  last_confirmed_active: NonNegativeSafeIntegerSchema,
  confirmed_inactive: NonNegativeSafeIntegerSchema,
  planned: NonNegativeSafeIntegerSchema,
  suspended: NonNegativeSafeIntegerSchema,
  conflicted: NonNegativeSafeIntegerSchema,
  unknown: NonNegativeSafeIntegerSchema,
});

export const ResolvedTransitPublicNetworkSummarySchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  as_of_date: IsoDaySchema,
  reviewed_historical_episode_count: NonNegativeSafeIntegerSchema,
  exact_component_count: NonNegativeSafeIntegerSchema,
  exact_route_component_incidence_count: NonNegativeSafeIntegerSchema,
  resolved_placement_count: NonNegativeSafeIntegerSchema,
  confirmed_current_placement_count: NonNegativeSafeIntegerSchema,
  confirmed_current_route_count: NonNegativeSafeIntegerSchema,
  placement_counts_by_state: PlacementStateCountsSchema,
  placement_frontier_candidate_count: NonNegativeSafeIntegerSchema,
  placement_frontier_pending_count: NonNegativeSafeIntegerSchema,
  frontier_profile: NonEmptyStringSchema,
});

export const ResolvedTransitPublicPackSchema = Schema.Struct({
  manifest: ResolvedTransitPublicPackManifestSchema,
  episodes: Schema.Array(ResolvedTransitPublicEpisodeSchema),
  components: Schema.Array(ResolvedTransitPublicComponentSchema),
  placements: Schema.Array(ResolvedTransitPublicPlacementSchema),
  routes: Schema.Array(ResolvedTransitPublicRouteSchema),
  treatment_families: Schema.Array(ResolvedTransitPublicTreatmentFamilySchema),
  route_index: Schema.Array(ResolvedTransitPublicRouteIndexRowSchema),
  history: Schema.Array(ResolvedTransitPublicHistorySchema),
  current_footprint: Schema.Array(ResolvedTransitPublicCurrentFootprintSchema),
  summary: ResolvedTransitPublicNetworkSummarySchema,
  sources: Schema.Array(ResolvedTransitPublicSourceSchema),
});

export const TrackerConformanceDateSchema = Schema.Struct({
  precision: Schema.Literals(["day", "month", "range", "season"]),
  value: NonEmptyStringSchema,
});

export const TrackerConformanceAcceptedDiffRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  row_kind: Schema.Literals(["tracker_episode", "producer_addition"]),
  consumer_disposition: Schema.Literals([
    "use_producer_identity",
    "enrichment_only",
    "drop_legacy_episode",
    "add_producer_episode",
  ]),
  classification: Schema.Literals([
    "mta_wiki_owned_producer_truth",
    "tracker_owned_enrichment",
    "explicitly_justified_exclusion",
  ]),
  tracker_episode_id: Schema.NullOr(TrackerEpisodeIdSchema),
  tracker_origin: Schema.NullOr(
    Schema.Literals(["ace_registry", "reviewed_occurrence", "reviewed_reconciliation"]),
  ),
  tracker_date: Schema.NullOr(TrackerConformanceDateSchema),
  tracker_route_ids: Schema.Array(NonEmptyStringSchema),
  tracker_route_keys: Schema.Array(PublicKeySchema),
  origin_ids: Schema.Array(NonEmptyStringSchema),
  producer_intervention_ids: Schema.Array(ProducerInterventionIdSchema),
  producer_onset: Schema.NullOr(ResolvedTransitPublicOnsetSchema),
  producer_route_keys: Schema.Array(PublicKeySchema),
  field_diffs: Schema.Array(
    Schema.Literals([
      "date_representation",
      "episode_identity",
      "onset",
      "presentation_copy",
      "producer_episode_absent",
      "tracker_episode_absent",
    ]),
  ),
  reason_code: Schema.Literals([
    "ace_registry_event_remains_tracker_enrichment_without_local_episode_identity",
    "bounded_local_demo_identity_is_stale_against_final_producer_review",
    "final_producer_episode_missing_from_legacy_tracker_projection",
    "final_producer_occurrence_supersedes_tracker_local_projection",
  ]),
  acceptance_receipt_id: Schema.Literal("plan-056-owner-approval:2026-08-01"),
  accepted_at: Schema.Literal("2026-08-01"),
  accepted_by: Schema.Literal("project-owner"),
});

export const TrackerConformanceBaselineRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  tracker_episode_id: TrackerEpisodeIdSchema,
  tracker_origin: Schema.Literals([
    "ace_registry",
    "reviewed_occurrence",
    "reviewed_reconciliation",
  ]),
  tracker_date: TrackerConformanceDateSchema,
  tracker_route_ids: Schema.Array(NonEmptyStringSchema),
  tracker_route_keys: Schema.Array(PublicKeySchema),
  origin_ids: Schema.Array(NonEmptyStringSchema),
  producer_intervention_id: Schema.NullOr(ProducerInterventionIdSchema),
  global_episode_sha256: Sha256Schema,
});

export const TrackerConformanceRouteSurfaceRowSchema = Schema.Struct({
  schema_version: Schema.Literal(1),
  tracker_route_id: NonEmptyStringSchema,
  tracker_route_key: PublicKeySchema,
  route_artifact_sha256: Sha256Schema,
  episode_memberships: Schema.Array(
    Schema.Struct({
      tracker_episode_id: TrackerEpisodeIdSchema,
      episode_sha256: Sha256Schema,
    }),
  ),
});

export type ResolvedTransitPublicAction = typeof ResolvedTransitPublicActionSchema.Type;
export type ResolvedTransitPublicExtentKind = typeof ResolvedTransitPublicExtentKindSchema.Type;
export type ResolvedTransitPublicPlacementState =
  typeof ResolvedTransitPublicPlacementStateSchema.Type;
export type ResolvedTransitPublicOnset = typeof ResolvedTransitPublicOnsetSchema.Type;
export type ResolvedTransitPublicPackManifest = typeof ResolvedTransitPublicPackManifestSchema.Type;
export type ResolvedTransitPublicEpisode = typeof ResolvedTransitPublicEpisodeSchema.Type;
export type ResolvedTransitPublicComponent = typeof ResolvedTransitPublicComponentSchema.Type;
export type ResolvedTransitPublicPlacement = typeof ResolvedTransitPublicPlacementSchema.Type;
export type ResolvedTransitPublicRoute = typeof ResolvedTransitPublicRouteSchema.Type;
export type ResolvedTransitPublicTreatmentFamily =
  typeof ResolvedTransitPublicTreatmentFamilySchema.Type;
export type ResolvedTransitPublicRouteIndexRow =
  typeof ResolvedTransitPublicRouteIndexRowSchema.Type;
export type ResolvedTransitPublicHistory = typeof ResolvedTransitPublicHistorySchema.Type;
export type ResolvedTransitPublicCurrentFootprint =
  typeof ResolvedTransitPublicCurrentFootprintSchema.Type;
export type ResolvedTransitPublicSource = typeof ResolvedTransitPublicSourceSchema.Type;
export type ResolvedTransitPublicNetworkSummary =
  typeof ResolvedTransitPublicNetworkSummarySchema.Type;
export type ResolvedTransitPublicPack = typeof ResolvedTransitPublicPackSchema.Type;
export type TrackerConformanceAcceptedDiffRow = typeof TrackerConformanceAcceptedDiffRowSchema.Type;
export type TrackerConformanceBaselineRow = typeof TrackerConformanceBaselineRowSchema.Type;
export type TrackerConformanceRouteSurfaceRow = typeof TrackerConformanceRouteSurfaceRowSchema.Type;

const PUBLIC_ONSET_PATTERNS: Readonly<Record<ResolvedTransitPublicOnset["precision"], RegExp>> = {
  day: /^\d{4}-\d{2}-\d{2}$/u,
  upper_bound_day: /^\d{4}-\d{2}-\d{2}$/u,
  month: /^\d{4}-(?:0[1-9]|1[0-2])$/u,
  season: /^\d{4}-(?:spring|summer|fall|winter)$/u,
  year: /^\d{4}$/u,
};

const FORBIDDEN_PUBLIC_KEY =
  /(?:^|_)(?:record_id|reviewer|review|decision|fingerprint|hash|sha256|gap_id|queue|validation_code|source_path|file_path)(?:$|_)/iu;
const INTERNAL_PUBLIC_VALUE =
  /^(?:application|placement|candidate|transition|assertion|review|decision):/u;
const REPOSITORY_PATH_VALUE = /(?:^|\/)(?:data|raw|wiki|packages|docs)\//u;
const HASH_VALUE = /^(?:sha256:)?[a-f0-9]{32,64}$/iu;

function assertPublicSafe(value: unknown, path = "public pack"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertPublicSafe(entry, `${path}[${index}]`);
    });
    return;
  }
  if (value === null || typeof value !== "object") {
    if (
      typeof value === "string" &&
      (INTERNAL_PUBLIC_VALUE.test(value) ||
        REPOSITORY_PATH_VALUE.test(value) ||
        (HASH_VALUE.test(value) && !path.endsWith(".intervention_id")))
    ) {
      throw new Error(`${path}: internal value is forbidden`);
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_PUBLIC_KEY.test(key) || key.endsWith("_record_id")) {
      throw new Error(`${path}.${key}: operator-only field is forbidden`);
    }
    assertPublicSafe(entry, `${path}.${key}`);
  }
}

function assertUnique<T>(rows: readonly T[], key: (row: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`${label}: duplicate ${value}`);
    seen.add(value);
  }
}

function assertUniqueSorted(values: readonly string[], label: string, nonempty = false): void {
  if (nonempty && values.length === 0) throw new Error(`${label}: expected nonempty array`);
  if (new Set(values).size !== values.length) throw new Error(`${label}: duplicate value`);
  if (JSON.stringify([...values].sort()) !== JSON.stringify(values)) {
    throw new Error(`${label}: expected sorted values`);
  }
}

function assertSetEqual(actual: Iterable<string>, expected: Iterable<string>, label: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label}: exact set/multiset mismatch`);
  }
}

function routeIndexIdentity(row: ResolvedTransitPublicRouteIndexRow): string {
  return [
    row.route_key,
    row.intervention_id,
    row.intervention_component_key,
    row.treatment_family_key,
    row.action,
  ].join("|");
}

export function validateResolvedTransitPublicPack(
  pack: ResolvedTransitPublicPack,
): ResolvedTransitPublicPack {
  assertPublicSafe(pack);
  const expectedResources = RESOLVED_TRANSIT_PUBLIC_RESOURCE_ROLES.map(([name, role]) => ({
    name,
    role,
  }));
  if (JSON.stringify(pack.manifest.resources) !== JSON.stringify(expectedResources)) {
    throw new Error("public manifest resource set/order/roles mismatch");
  }

  assertUnique(pack.episodes, (row) => row.intervention_id, "episodes");
  assertUnique(pack.components, (row) => row.intervention_component_key, "components");
  assertUnique(pack.placements, (row) => row.placement_key, "placements");
  assertUnique(pack.routes, (row) => row.route_key, "routes");
  assertUnique(pack.treatment_families, (row) => row.treatment_family_key, "treatment families");
  assertUnique(pack.sources, (row) => row.source_key, "sources");
  assertUnique(pack.route_index, routeIndexIdentity, "route index");

  const episodeById = new Map(pack.episodes.map((row) => [row.intervention_id, row]));
  const componentByKey = new Map(
    pack.components.map((row) => [row.intervention_component_key, row]),
  );
  const placementByKey = new Map(pack.placements.map((row) => [row.placement_key, row]));
  const routeByKey = new Map(pack.routes.map((row) => [row.route_key, row]));
  const familyByKey = new Map(
    pack.treatment_families.map((row) => [row.treatment_family_key, row]),
  );
  const sourceKeys = new Set(pack.sources.map((row) => row.source_key));

  for (const episode of pack.episodes) {
    if (!PUBLIC_ONSET_PATTERNS[episode.onset.precision].test(episode.onset.date)) {
      throw new Error(`${episode.intervention_id}: malformed ${episode.onset.precision} onset`);
    }
    assertUniqueSorted(episode.aliases, `${episode.intervention_id} aliases`);
    assertUniqueSorted(episode.route_keys, `${episode.intervention_id} route keys`, true);
    assertUniqueSorted(
      episode.intervention_component_keys,
      `${episode.intervention_id} component keys`,
      true,
    );
    assertUniqueSorted(
      episode.treatment_family_keys,
      `${episode.intervention_id} family keys`,
      true,
    );
    const sourceRefs = episode.source_refs.map((ref) => ref.source_key);
    assertUniqueSorted(sourceRefs, `${episode.intervention_id} source refs`, true);
    sourceRefs.forEach((key) => {
      if (!sourceKeys.has(key)) throw new Error("episode has a broken source join");
    });
    const owned = pack.components.filter(
      (component) => component.intervention_id === episode.intervention_id,
    );
    assertSetEqual(
      episode.intervention_component_keys,
      owned.map((row) => row.intervention_component_key),
      `${episode.intervention_id} component join`,
    );
    assertSetEqual(
      episode.route_keys,
      new Set(owned.map((row) => row.route_key)),
      `${episode.intervention_id} route join`,
    );
    assertSetEqual(
      episode.treatment_family_keys,
      new Set(owned.map((row) => row.treatment_family_key)),
      `${episode.intervention_id} family join`,
    );
  }

  for (const component of pack.components) {
    const route = routeByKey.get(component.route_key);
    const family = familyByKey.get(component.treatment_family_key);
    if (
      !episodeById.has(component.intervention_id) ||
      route === undefined ||
      family === undefined
    ) {
      throw new Error("component has a broken episode/route/family join");
    }
    if (component.gtfs_route_id !== route.gtfs_route_id) {
      throw new Error("component GTFS route identity drift");
    }
    if (component.treatment_family_label !== family.display_name) {
      throw new Error("component treatment family label drift");
    }
    const refs = component.source_refs.map((ref) => ref.source_key);
    assertUniqueSorted(refs, `${component.intervention_component_key} source refs`, true);
    refs.forEach((key) => {
      if (!sourceKeys.has(key)) throw new Error("component has a broken source join");
    });
    assertUniqueSorted(component.caveats, `${component.intervention_component_key} caveats`);
    if (
      (component.action === "unknown" || component.extent.kind === "unknown") &&
      component.caveats.length === 0
    ) {
      throw new Error("reviewed unknown semantics require a caveat");
    }
  }

  assertSetEqual(
    routeByKey.keys(),
    new Set([
      ...pack.components.map((row) => row.route_key),
      ...pack.placements.map((row) => row.route_key),
    ]),
    "route dictionary",
  );
  assertSetEqual(
    familyByKey.keys(),
    new Set([
      ...pack.components.map((row) => row.treatment_family_key),
      ...pack.placements.map((row) => row.treatment_family_key),
    ]),
    "treatment family dictionary",
  );

  for (const placement of pack.placements) {
    if (
      !routeByKey.has(placement.route_key) ||
      !familyByKey.has(placement.treatment_family_key) ||
      placement.as_of_date !== pack.manifest.as_of_date
    ) {
      throw new Error("placement has a broken join/as-of");
    }
    if (
      placement.founding_intervention_component_key !== null &&
      !componentByKey.has(placement.founding_intervention_component_key)
    ) {
      throw new Error("placement has a broken founding-component join");
    }
  }

  assertSetEqual(
    pack.route_index.map(routeIndexIdentity),
    pack.components.map((component) =>
      routeIndexIdentity({
        schema_version: 1,
        route_key: component.route_key,
        intervention_id: component.intervention_id,
        intervention_component_key: component.intervention_component_key,
        treatment_family_key: component.treatment_family_key,
        action: component.action,
      }),
    ),
    "route index",
  );

  const componentHistory = pack.history.filter(
    (row): row is typeof ResolvedTransitPublicComponentHistorySchema.Type =>
      row.history_kind === "component_application",
  );
  const transitionHistory = pack.history.filter(
    (row): row is typeof ResolvedTransitPublicPlacementTransitionHistorySchema.Type =>
      row.history_kind === "placement_transition",
  );
  assertSetEqual(
    componentHistory.map(
      (row) => `${routeIndexIdentity(row)}|${row.onset.date}|${row.onset.precision}`,
    ),
    pack.components.map((component) => {
      const onset = episodeById.get(component.intervention_id)?.onset;
      if (onset === undefined) throw new Error("component history has a broken episode join");
      return `${routeIndexIdentity(component)}|${onset.date}|${onset.precision}`;
    }),
    "component history",
  );
  assertUnique(
    transitionHistory,
    (row) => row.intervention_component_key,
    "placement transition components",
  );
  for (const row of pack.history) {
    const component = componentByKey.get(row.intervention_component_key);
    if (component === undefined || !episodeById.has(row.intervention_id)) {
      throw new Error("history has a broken episode/component join");
    }
    if (row.history_kind === "placement_transition") {
      assertUniqueSorted(row.target_placement_keys, `${row.intervention_component_key} targets`);
      assertUniqueSorted(row.result_placement_keys, `${row.intervention_component_key} results`);
      if (
        row.intervention_id !== component.intervention_id ||
        row.action !== component.action ||
        row.action !== "add" ||
        row.target_placement_keys.length !== 0 ||
        row.result_placement_keys.length !== 1
      ) {
        throw new Error("placement establishment transition shape drifted");
      }
      for (const key of [...row.target_placement_keys, ...row.result_placement_keys]) {
        if (!placementByKey.has(key)) throw new Error("history has a broken placement join");
      }
      const expectedResults = pack.placements.filter(
        (placement) =>
          placement.founding_intervention_component_key === row.intervention_component_key,
      );
      assertSetEqual(
        row.result_placement_keys,
        expectedResults.map((placement) => placement.placement_key),
        `${row.intervention_component_key} transition result ownership`,
      );
      for (const placement of expectedResults) {
        if (
          placement.route_key !== component.route_key ||
          placement.treatment_family_key !== component.treatment_family_key ||
          placement.scope.kind !== component.extent.kind
        ) {
          throw new Error("transition result has a broken placement claim join");
        }
      }
    }
  }
  assertSetEqual(
    transitionHistory.map((row) => row.intervention_component_key),
    pack.components
      .filter((row) => row.action === "add")
      .map((row) => row.intervention_component_key),
    "add-component transition coverage",
  );

  for (const current of pack.current_footprint) {
    const placement = placementByKey.get(current.placement_key);
    if (
      placement === undefined ||
      placement.route_key !== current.route_key ||
      placement.treatment_family_key !== current.treatment_family_key ||
      placement.scope.kind !== current.scope.kind ||
      placement.state_as_of !== "confirmed_active" ||
      current.as_of_date !== pack.manifest.as_of_date ||
      placement.as_of_date !== current.as_of_date
    ) {
      throw new Error("current footprint has a broken placement/as-of join");
    }
  }
  assertSetEqual(
    pack.current_footprint.map((row) => row.placement_key),
    pack.placements
      .filter((row) => row.state_as_of === "confirmed_active")
      .map((row) => row.placement_key),
    "confirmed-current footprint",
  );

  for (const source of pack.sources) {
    if (
      (source.url_status === "unavailable") !== (source.url === null) ||
      (source.url !== null && !/^https:\/\/[^/\s]+(?:\/.*)?$/u.test(source.url))
    ) {
      throw new Error(`${source.source_key}: URL/status is inconsistent`);
    }
  }
  const cited = new Set(
    [...pack.episodes, ...pack.components].flatMap((row) =>
      row.source_refs.map((ref) => ref.source_key),
    ),
  );
  assertSetEqual(sourceKeys, cited, "source dictionary");

  const placementStateCounts = {
    confirmed_active: pack.placements.filter((row) => row.state_as_of === "confirmed_active")
      .length,
    last_confirmed_active: pack.placements.filter(
      (row) => row.state_as_of === "last_confirmed_active",
    ).length,
    confirmed_inactive: pack.placements.filter((row) => row.state_as_of === "confirmed_inactive")
      .length,
    planned: pack.placements.filter((row) => row.state_as_of === "planned").length,
    suspended: pack.placements.filter((row) => row.state_as_of === "suspended").length,
    conflicted: pack.placements.filter((row) => row.state_as_of === "conflicted").length,
    unknown: pack.placements.filter((row) => row.state_as_of === "unknown").length,
  };
  const summary = pack.summary;
  if (
    summary.as_of_date !== pack.manifest.as_of_date ||
    summary.reviewed_historical_episode_count !== pack.episodes.length ||
    summary.exact_component_count !== pack.components.length ||
    summary.exact_route_component_incidence_count !== pack.route_index.length ||
    summary.resolved_placement_count !== pack.placements.length ||
    summary.confirmed_current_placement_count !== pack.current_footprint.length ||
    summary.confirmed_current_route_count !==
      new Set(pack.current_footprint.map((row) => row.route_key)).size ||
    JSON.stringify(summary.placement_counts_by_state) !== JSON.stringify(placementStateCounts)
  ) {
    throw new Error("public network summary reconciliation mismatch");
  }

  return pack;
}
