import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  importResolvedTransitPublicPackForFixture,
  type ResolvedTransitImportPin,
} from "../src/lib/resolved-transit-public-pack.ts";

const temporaryRoots: string[] = [];
const PRODUCER_ID = "occurrence:aaaaaaaaaaaaaaaaaaaaaaaa";
const TRACKER_ID = "ep_0162fc3e1ab1f2fa";
const ACE_ID = "ace:BX12+:ABLE:2022-11-18";

afterAll(async () => {
  await Promise.all(temporaryRoots.map((path) => rm(path, { recursive: true, force: true })));
});

type FixtureOptions = {
  excessEpisodeField?: boolean;
  omitProducerAddition?: boolean;
};

async function createFixture(options: FixtureOptions = {}) {
  const inputRoot = await mkdtemp(join(tmpdir(), "bp-resolved-pack-fixture-"));
  temporaryRoots.push(inputRoot);
  const releaseRoot = join(inputRoot, "fixture-release");
  await mkdir(releaseRoot, { recursive: true });
  const resources = new Map<string, Uint8Array>();

  const publicManifest = {
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
  };
  const episode = {
    schema_version: 1,
    intervention_id: PRODUCER_ID,
    display_name: "Reviewed B44 change",
    aliases: [],
    onset: { date: "2024-09", precision: "month" },
    route_keys: ["b44-sbs"],
    intervention_component_keys: ["b44-sbs-service-pattern-component"],
    treatment_family_keys: ["service-pattern"],
    source_refs: [{ source_key: "reviewed-source" }],
    classification: "historical_episode",
    ...(options.excessEpisodeField ? { reviewer: "operator" } : {}),
  };
  const component = {
    schema_version: 1,
    intervention_id: PRODUCER_ID,
    intervention_component_key: "b44-sbs-service-pattern-component",
    route_key: "b44-sbs",
    gtfs_route_id: "B44+",
    treatment_family_key: "service-pattern",
    treatment_family_label: "Service pattern",
    applicability: "applies",
    action: "modify",
    action_label: "Modified",
    extent: { kind: "unknown", label: "Exact extent not established", description: null },
    details: "Reviewed service-pattern change",
    caveats: ["The reviewed source does not establish the exact extent."],
    source_refs: [{ source_key: "reviewed-source" }],
  };
  const route = {
    schema_version: 1,
    route_key: "b44-sbs",
    gtfs_route_id: "B44+",
    display_name: "B44 SBS",
    aliases: ["B44+"],
  };
  const family = {
    schema_version: 1,
    treatment_family_key: "service-pattern",
    display_name: "Service pattern",
  };
  const routeIndex = {
    schema_version: 1,
    route_key: "b44-sbs",
    intervention_id: PRODUCER_ID,
    intervention_component_key: "b44-sbs-service-pattern-component",
    treatment_family_key: "service-pattern",
    action: "modify",
  };
  const history = {
    ...routeIndex,
    history_kind: "component_application",
    onset: { date: "2024-09", precision: "month" },
  };
  const summary = {
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
  };
  const source = {
    schema_version: 1,
    source_key: "reviewed-source",
    title: "Reviewed source",
    publisher: "MTA",
    date: "2024-09",
    url: "https://example.com/source",
    url_status: "source_provided",
  };

  addJson(resources, "resolved-pack/public/manifest.json", publicManifest);
  addJsonl(resources, "resolved-pack/public/public_intervention_episodes.jsonl", [episode]);
  addJsonl(resources, "resolved-pack/public/public_intervention_components.jsonl", [component]);
  addJsonl(resources, "resolved-pack/public/public_intervention_placements.jsonl", []);
  addJsonl(resources, "resolved-pack/public/public_routes.jsonl", [route]);
  addJsonl(resources, "resolved-pack/public/public_treatment_families.jsonl", [family]);
  addJsonl(resources, "resolved-pack/public/public_route_intervention_index.jsonl", [routeIndex]);
  addJsonl(resources, "resolved-pack/public/public_intervention_history.jsonl", [history]);
  addJsonl(resources, "resolved-pack/public/public_current_footprint.jsonl", []);
  addJson(resources, "resolved-pack/public/public_network_summary.json", summary);
  addJsonl(resources, "resolved-pack/public/public_sources.jsonl", [source]);

  const enrichment = {
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
  };
  const addition = {
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
  };
  const acceptedDiff = options.omitProducerAddition ? [enrichment] : [addition, enrichment];
  const baseline = {
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
  const routeSurface = {
    schema_version: 1,
    tracker_route_id: "BX12+",
    tracker_route_key: "bx12-sbs",
    route_artifact_sha256: "2".repeat(64),
    episode_memberships: [{ tracker_episode_id: TRACKER_ID, episode_sha256: "3".repeat(64) }],
  };
  const receipt = {
    schema_version: 1,
    contract_id: "fixture-acceptance-v1",
    receipt_id: "fixture-accepted-receipt",
    as_of_date: "2026-07-27",
    acceptance: {},
    artifacts: [],
    counts: {
      accepted_diff_rows: acceptedDiff.length,
      justified_exclusions: 0,
      mapped_producer_truth: 0,
      producer_additions: options.omitProducerAddition ? 0 : 1,
      producer_episodes: 1,
      producer_route_keys: 1,
      producer_unique_gtfs_routes: 1,
      tracker_baseline_episodes: 1,
      tracker_baseline_route_memberships: 1,
      tracker_baseline_routes: 1,
      tracker_enrichment_only: 1,
    },
    partitions: {},
    provider_usage: {},
  };
  const conformanceSummary = {
    schema_version: 1,
    contract_id: "fixture-conformance-v1",
    acceptance_receipt_id: "plan-056-owner-approval:2026-08-01",
    accepted_at: "2026-08-01",
    accepted_by: "project-owner",
    accepted_result: {
      date_representation_differences: 0,
      exact_components: 1,
      justified_exclusions: 0,
      mapped_producer_truth: 0,
      onset_differences: 0,
      producer_additions: options.omitProducerAddition ? 0 : 1,
      producer_episodes: 1,
      producer_route_keys: 1,
      producer_unique_gtfs_routes: 1,
      tracker_enrichment_only: 1,
    },
    black_box_surface_parity: {},
    downstream_ownership: {},
    provider_usage: {},
    route_differences: {},
    source_artifacts: {},
    tracker_counts: {},
    tracker_repository_head: "fixture",
    tracker_worktree_state: "fixture",
  };
  addJsonl(
    resources,
    "resolved-pack/operator/tracker-conformance/accepted-diff-ledger.jsonl",
    acceptedDiff,
  );
  addJson(
    resources,
    "resolved-pack/operator/tracker-conformance/accepted-ledger-receipt.json",
    receipt,
  );
  addJson(resources, "resolved-pack/operator/tracker-conformance/summary.json", conformanceSummary);
  addJsonl(resources, "resolved-pack/operator/tracker-conformance/tracker-baseline.jsonl", [
    baseline,
  ]);
  addJsonl(resources, "resolved-pack/operator/tracker-conformance/tracker-route-surface.jsonl", [
    routeSurface,
  ]);

  const publicFingerprint = "4".repeat(64);
  addJson(resources, "resolved-pack/manifest.json", {
    schema_version: 1,
    contract_id: "resolved-transit-knowledge-pack-v1",
    as_of_date: "2026-07-27",
    operator_role: "complete_resolved_audit_contract",
    public_role: "consumer_safe_product_contract",
    public_resource_count: 11,
    public_fingerprint: publicFingerprint,
  });
  addJson(resources, "build_receipt.json", {
    build_id: "5".repeat(64),
    generator_commit: "6".repeat(40),
    production_content_eligible: true,
    verification_candidate_eligible: true,
  });

  for (const [path, bytes] of resources) await writeResource(releaseRoot, path, bytes);
  const files = Object.fromEntries(
    [...resources.entries()].map(([path, bytes]) => [
      path,
      { bytes: bytes.byteLength, sha256: sha256(bytes) },
    ]),
  );
  const releaseManifest = {
    as_of_date: "2026-07-27",
    build_receipt: "build_receipt.json",
    contract_versions: {},
    export_profile: "fixture-release",
    files,
    generator_commit: "6".repeat(40),
    manifest_version: 7,
    pointers: {},
    record_counts: {},
    release_id: "fixture-release",
    resource_descriptors: [],
  };
  const releaseManifestBytes = jsonBytes(releaseManifest);
  await writeResource(releaseRoot, "manifest.json", releaseManifestBytes);

  const publicPaths = [
    "resolved-pack/public/manifest.json",
    "resolved-pack/public/public_intervention_episodes.jsonl",
    "resolved-pack/public/public_intervention_components.jsonl",
    "resolved-pack/public/public_intervention_placements.jsonl",
    "resolved-pack/public/public_routes.jsonl",
    "resolved-pack/public/public_treatment_families.jsonl",
    "resolved-pack/public/public_route_intervention_index.jsonl",
    "resolved-pack/public/public_intervention_history.jsonl",
    "resolved-pack/public/public_current_footprint.jsonl",
    "resolved-pack/public/public_network_summary.json",
    "resolved-pack/public/public_sources.jsonl",
  ] as const;
  const conformancePaths = [
    "resolved-pack/operator/tracker-conformance/accepted-diff-ledger.jsonl",
    "resolved-pack/operator/tracker-conformance/accepted-ledger-receipt.json",
    "resolved-pack/operator/tracker-conformance/summary.json",
    "resolved-pack/operator/tracker-conformance/tracker-baseline.jsonl",
    "resolved-pack/operator/tracker-conformance/tracker-route-surface.jsonl",
  ] as const;
  const pin: ResolvedTransitImportPin = {
    release: {
      releaseId: "fixture-release",
      asOfDate: "2026-07-27",
      generatorCommit: "6".repeat(40),
      buildId: "5".repeat(64),
      manifestVersion: 7,
      exportProfile: "fixture-release",
      releaseManifestSha256: sha256(releaseManifestBytes),
      publicFingerprint,
    },
    publicResources: publicPaths.map((path) => {
      const bytes = requiredResource(resources, path);
      return {
        path,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        count: path.endsWith(".jsonl") ? lineCount(bytes) : 1,
      };
    }),
    conformanceResources: conformancePaths.map((path) => {
      const bytes = requiredResource(resources, path);
      return {
        path,
        sha256: sha256(bytes),
        count: path.endsWith(".jsonl") ? lineCount(bytes) : 1,
      };
    }),
    conformanceReceiptId: "fixture-accepted-receipt",
    counts: {
      producerEpisodes: 1,
      components: 1,
      placements: 0,
      producerRouteKeys: 1,
      treatmentFamilies: 1,
      routeIndexRows: 1,
      historyRows: 1,
      currentFootprintRows: 0,
      sources: 1,
      trackerBaselineEpisodes: 1,
      useProducerIdentity: 0,
      trackerEnrichmentOnly: 1,
      dropLegacyEpisode: 0,
      addProducerEpisode: options.omitProducerAddition ? 0 : 1,
      candidateEpisodes: 2,
      candidateRouteArtifacts: 2,
      candidateEpisodeRouteMemberships: 2,
      componentActions: {
        add: 0,
        modify: 1,
        remove: 0,
        suspend: 0,
        resume: 0,
        retain: 0,
        unknown: 0,
      },
      componentExtents: {
        route_wide: 0,
        bounded_segment: 0,
        stop_set: 0,
        service_pattern: 0,
        unknown: 1,
      },
      placementStates: {
        confirmed_active: 0,
        last_confirmed_active: 0,
        confirmed_inactive: 0,
        planned: 0,
        suspended: 0,
        conflicted: 0,
        unknown: 0,
      },
    },
  };
  return { inputRoot, releaseRoot, pin };
}

function requiredResource(resources: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = resources.get(path);
  if (bytes === undefined) throw new Error(`${path}: fixture resource is missing`);
  return bytes;
}

describe("resolved transit release importer", () => {
  test("strictly verifies the complete fixture and recomputes composition", async () => {
    const fixture = await createFixture();
    const imported = await importResolvedTransitPublicPackForFixture(
      fixture.releaseRoot,
      fixture.pin,
      { inputRoot: fixture.inputRoot, verifyEveryOuterResource: true },
    );
    expect(imported.pack.episodes).toHaveLength(1);
    expect(imported.conformance.targetComposition).toEqual({
      episodeCount: 2,
      routeArtifactCount: 2,
      episodeRouteMembershipCount: 2,
    });
    expect(imported.verified.verifiedOuterResourceCount).toBe(18);
  });

  test("rejects a raw-byte hash mutation before decoding", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.releaseRoot, "resolved-pack/public/public_routes.jsonl"), "{}\n");
    await expect(
      importResolvedTransitPublicPackForFixture(fixture.releaseRoot, fixture.pin, {
        inputRoot: fixture.inputRoot,
      }),
    ).rejects.toThrow(/(?:byte count|SHA-256) mismatch/u);
  });

  test("rejects excess public fields even when their mutated hash is pinned", async () => {
    const fixture = await createFixture({ excessEpisodeField: true });
    await expect(
      importResolvedTransitPublicPackForFixture(fixture.releaseRoot, fixture.pin, {
        inputRoot: fixture.inputRoot,
      }),
    ).rejects.toThrow();
  });

  test("rejects a ledger that does not cover producer identity", async () => {
    const fixture = await createFixture({ omitProducerAddition: true });
    await expect(
      importResolvedTransitPublicPackForFixture(fixture.releaseRoot, fixture.pin, {
        inputRoot: fixture.inputRoot,
      }),
    ).rejects.toThrow(/producer identity coverage/u);
  });

  test("rejects release-root path escape", async () => {
    const fixture = await createFixture();
    const outside = await mkdtemp(join(tmpdir(), "bp-resolved-pack-outside-"));
    temporaryRoots.push(outside);
    await expect(
      importResolvedTransitPublicPackForFixture(outside, fixture.pin, {
        inputRoot: fixture.inputRoot,
      }),
    ).rejects.toThrow(/escapes the configured input root/u);
  });
});

function addJson(resources: Map<string, Uint8Array>, path: string, value: unknown): void {
  resources.set(path, jsonBytes(value));
}

function addJsonl(
  resources: Map<string, Uint8Array>,
  path: string,
  rows: readonly unknown[],
): void {
  const value = rows.length === 0 ? "" : `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
  resources.set(path, new TextEncoder().encode(value));
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

async function writeResource(root: string, path: string, bytes: Uint8Array): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function lineCount(bytes: Uint8Array): number {
  const text = new TextDecoder().decode(bytes);
  return text.length === 0 ? 0 : text.trimEnd().split("\n").length;
}
