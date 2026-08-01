import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import {
  ResolvedTransitPublicComponentSchema,
  ResolvedTransitPublicCurrentFootprintSchema,
  ResolvedTransitPublicEpisodeSchema,
  ResolvedTransitPublicHistorySchema,
  ResolvedTransitPublicNetworkSummarySchema,
  type ResolvedTransitPublicPack,
  ResolvedTransitPublicPackManifestSchema,
  ResolvedTransitPublicPackSchema,
  ResolvedTransitPublicPlacementSchema,
  ResolvedTransitPublicRouteIndexRowSchema,
  ResolvedTransitPublicRouteSchema,
  ResolvedTransitPublicSourceSchema,
  ResolvedTransitPublicTreatmentFamilySchema,
  type TrackerConformanceAcceptedDiffRow,
  TrackerConformanceAcceptedDiffRowSchema,
  type TrackerConformanceBaselineRow,
  TrackerConformanceBaselineRowSchema,
  type TrackerConformanceRouteSurfaceRow,
  TrackerConformanceRouteSurfaceRowSchema,
  validateResolvedTransitPublicPack,
} from "@bp/domain/studio/resolved-transit-public-pack";
import { fromRepoRoot } from "./paths.ts";
import {
  RESOLVED_TRANSIT_CONFORMANCE_RECEIPT_ID,
  RESOLVED_TRANSIT_CONFORMANCE_RESOURCE_PINS,
  RESOLVED_TRANSIT_PUBLIC_RESOURCE_PINS,
  RESOLVED_TRANSIT_RELEASE_PIN,
  RESOLVED_TRANSIT_TARGET_COUNTS,
} from "./resolved-transit-release-pin.ts";
import { decodeSchemaStrict } from "./schema-decode.ts";

type ResourcePin = {
  path: string;
  sha256: string;
  bytes?: number;
  count: number;
};

export type ResolvedTransitImportPin = {
  release: {
    releaseId: string;
    asOfDate: string;
    generatorCommit: string;
    buildId: string;
    manifestVersion: number;
    exportProfile: string;
    releaseManifestSha256: string;
    publicFingerprint: string;
  };
  publicResources: readonly ResourcePin[];
  conformanceResources: readonly ResourcePin[];
  conformanceReceiptId: string;
  counts: {
    producerEpisodes: number;
    components: number;
    placements: number;
    producerRouteKeys: number;
    treatmentFamilies: number;
    routeIndexRows: number;
    historyRows: number;
    currentFootprintRows: number;
    sources: number;
    trackerBaselineEpisodes: number;
    useProducerIdentity: number;
    trackerEnrichmentOnly: number;
    dropLegacyEpisode: number;
    addProducerEpisode: number;
    candidateEpisodes: number;
    candidateRouteArtifacts: number;
    candidateEpisodeRouteMemberships: number;
    componentActions: {
      add: number;
      modify: number;
      remove: number;
      suspend: number;
      resume: number;
      retain: number;
      unknown: number;
    };
    componentExtents: {
      route_wide: number;
      bounded_segment: number;
      stop_set: number;
      service_pattern: number;
      unknown: number;
    };
    placementStates: {
      confirmed_active: number;
      last_confirmed_active: number;
      confirmed_inactive: number;
      planned: number;
      suspended: number;
      conflicted: number;
      unknown: number;
    };
  };
};

export type ResolvedTransitConformance = {
  acceptedDiff: readonly TrackerConformanceAcceptedDiffRow[];
  trackerBaseline: readonly TrackerConformanceBaselineRow[];
  trackerRouteSurface: readonly TrackerConformanceRouteSurfaceRow[];
  acceptanceReceiptId: string;
  dispositionCounts: {
    useProducerIdentity: number;
    trackerEnrichmentOnly: number;
    dropLegacyEpisode: number;
    addProducerEpisode: number;
  };
  targetComposition: {
    episodeCount: number;
    routeArtifactCount: number;
    episodeRouteMembershipCount: number;
  };
};

export type ResolvedTransitPublicPackImport = {
  releaseRoot: string;
  pack: ResolvedTransitPublicPack;
  conformance: ResolvedTransitConformance;
  verified: {
    releaseManifestSha256: string;
    publicManifestSha256: string;
    acceptedDiffLedgerSha256: string;
    acceptedLedgerReceiptSha256: string;
    verifiedOuterResourceCount: number;
  };
};

const PINNED_IMPORT: ResolvedTransitImportPin = {
  release: RESOLVED_TRANSIT_RELEASE_PIN,
  publicResources: RESOLVED_TRANSIT_PUBLIC_RESOURCE_PINS,
  conformanceResources: RESOLVED_TRANSIT_CONFORMANCE_RESOURCE_PINS,
  conformanceReceiptId: RESOLVED_TRANSIT_CONFORMANCE_RECEIPT_ID,
  counts: RESOLVED_TRANSIT_TARGET_COUNTS,
};

export async function importPinnedResolvedTransitPublicPack(
  releaseRoot: string,
): Promise<ResolvedTransitPublicPackImport> {
  return importResolvedTransitPublicPackForFixture(releaseRoot, PINNED_IMPORT, {
    inputRoot: fromRepoRoot("data/raw/mta-wiki/releases"),
    verifyEveryOuterResource: true,
  });
}

/**
 * Fixture seam only. Product commands call the pinned wrapper above; no CLI
 * option can replace production hashes or counts.
 */
export async function importResolvedTransitPublicPackForFixture(
  releaseRoot: string,
  pin: ResolvedTransitImportPin,
  options: { inputRoot: string; verifyEveryOuterResource?: boolean },
): Promise<ResolvedTransitPublicPackImport> {
  const resolvedRoot = await resolveSafeReleaseRoot(releaseRoot, options.inputRoot);
  const releaseManifestBytes = await readPinnedFile(
    resolvedRoot,
    "manifest.json",
    pin.release.releaseManifestSha256,
  );
  const releaseManifest = parseObject(releaseManifestBytes, "release manifest");
  assertExactKeys(
    releaseManifest,
    [
      "as_of_date",
      "build_receipt",
      "contract_versions",
      "export_profile",
      "files",
      "generator_commit",
      "manifest_version",
      "pointers",
      "record_counts",
      "release_id",
      "resource_descriptors",
    ],
    "release manifest",
  );
  assertEqual(releaseManifest["release_id"], pin.release.releaseId, "release id");
  assertEqual(releaseManifest["as_of_date"], pin.release.asOfDate, "release as-of date");
  assertEqual(releaseManifest["generator_commit"], pin.release.generatorCommit, "generator commit");
  assertEqual(releaseManifest["manifest_version"], pin.release.manifestVersion, "manifest version");
  assertEqual(releaseManifest["export_profile"], pin.release.exportProfile, "export profile");

  const outerFiles = objectValue(releaseManifest["files"], "release manifest.files");
  let verifiedOuterResourceCount = 0;
  if (options.verifyEveryOuterResource ?? false) {
    for (const [resourcePath, value] of Object.entries(outerFiles)) {
      const row = objectValue(value, `release manifest.files.${resourcePath}`);
      assertExactKeys(row, ["bytes", "sha256"], `release manifest.files.${resourcePath}`);
      const bytes = nonNegativeInteger(
        row["bytes"],
        `release manifest.files.${resourcePath}.bytes`,
      );
      const sha256 = sha256Value(row["sha256"], `release manifest.files.${resourcePath}.sha256`);
      await readPinnedFile(resolvedRoot, resourcePath, sha256, bytes);
      verifiedOuterResourceCount += 1;
    }
  }

  const buildReceiptPath = textValue(
    releaseManifest["build_receipt"],
    "release manifest.build_receipt",
  );
  const buildReceipt = parseObject(
    await readPinnedFile(
      resolvedRoot,
      buildReceiptPath,
      outerFileHash(outerFiles, buildReceiptPath),
    ),
    "build receipt",
  );
  assertEqual(buildReceipt["build_id"], pin.release.buildId, "build id");
  assertEqual(
    buildReceipt["generator_commit"],
    pin.release.generatorCommit,
    "build generator commit",
  );
  // The immutable build receipt predates the two final byte-identical recuts;
  // the final publication receipt (pinned separately) supersedes those two
  // provisional flags. The content and verification gates must still be true.
  assertEqual(buildReceipt["production_content_eligible"], true, "production content eligibility");
  assertEqual(
    buildReceipt["verification_candidate_eligible"],
    true,
    "verification candidate eligibility",
  );

  const resolvedPackManifest = parseObject(
    await readPinnedFile(
      resolvedRoot,
      "resolved-pack/manifest.json",
      outerFileHash(outerFiles, "resolved-pack/manifest.json"),
    ),
    "resolved pack manifest",
  );
  assertExactKeys(
    resolvedPackManifest,
    [
      "as_of_date",
      "contract_id",
      "operator_role",
      "public_fingerprint",
      "public_resource_count",
      "public_role",
      "schema_version",
    ],
    "resolved pack manifest",
  );
  assertEqual(resolvedPackManifest["schema_version"], 1, "resolved pack schema version");
  assertEqual(
    resolvedPackManifest["contract_id"],
    "resolved-transit-knowledge-pack-v1",
    "resolved pack contract",
  );
  assertEqual(resolvedPackManifest["as_of_date"], pin.release.asOfDate, "resolved pack as-of date");
  assertEqual(
    resolvedPackManifest["public_fingerprint"],
    pin.release.publicFingerprint,
    "public fingerprint",
  );
  assertEqual(resolvedPackManifest["public_resource_count"], 11, "public resource count");

  const resourceBytes = new Map<string, Uint8Array>();
  for (const resource of [...pin.publicResources, ...pin.conformanceResources]) {
    const bytes = await readPinnedFile(
      resolvedRoot,
      resource.path,
      resource.sha256,
      resource.bytes,
    );
    resourceBytes.set(resource.path, bytes);
    const manifestHash = outerFileHash(outerFiles, resource.path);
    assertEqual(manifestHash, resource.sha256, `${resource.path} outer-manifest hash`);
  }

  const pack = decodeSchemaStrict(ResolvedTransitPublicPackSchema, {
    manifest: parseJsonResource(
      resourceBytes,
      "resolved-pack/public/manifest.json",
      ResolvedTransitPublicPackManifestSchema,
    ),
    episodes: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_intervention_episodes.jsonl",
      ResolvedTransitPublicEpisodeSchema,
    ),
    components: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_intervention_components.jsonl",
      ResolvedTransitPublicComponentSchema,
    ),
    placements: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_intervention_placements.jsonl",
      ResolvedTransitPublicPlacementSchema,
    ),
    routes: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_routes.jsonl",
      ResolvedTransitPublicRouteSchema,
    ),
    treatment_families: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_treatment_families.jsonl",
      ResolvedTransitPublicTreatmentFamilySchema,
    ),
    route_index: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_route_intervention_index.jsonl",
      ResolvedTransitPublicRouteIndexRowSchema,
    ),
    history: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_intervention_history.jsonl",
      ResolvedTransitPublicHistorySchema,
    ),
    current_footprint: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_current_footprint.jsonl",
      ResolvedTransitPublicCurrentFootprintSchema,
    ),
    summary: parseJsonResource(
      resourceBytes,
      "resolved-pack/public/public_network_summary.json",
      ResolvedTransitPublicNetworkSummarySchema,
    ),
    sources: parseJsonLinesResource(
      resourceBytes,
      "resolved-pack/public/public_sources.jsonl",
      ResolvedTransitPublicSourceSchema,
    ),
  });
  validateResolvedTransitPublicPack(pack);

  const acceptedDiff = parseJsonLinesResource(
    resourceBytes,
    "resolved-pack/operator/tracker-conformance/accepted-diff-ledger.jsonl",
    TrackerConformanceAcceptedDiffRowSchema,
  );
  const trackerBaseline = parseJsonLinesResource(
    resourceBytes,
    "resolved-pack/operator/tracker-conformance/tracker-baseline.jsonl",
    TrackerConformanceBaselineRowSchema,
  );
  const trackerRouteSurface = parseJsonLinesResource(
    resourceBytes,
    "resolved-pack/operator/tracker-conformance/tracker-route-surface.jsonl",
    TrackerConformanceRouteSurfaceRowSchema,
  );
  const receipt = parseObject(
    requiredBytes(
      resourceBytes,
      "resolved-pack/operator/tracker-conformance/accepted-ledger-receipt.json",
    ),
    "accepted ledger receipt",
  );
  const conformanceSummary = parseObject(
    requiredBytes(resourceBytes, "resolved-pack/operator/tracker-conformance/summary.json"),
    "tracker conformance summary",
  );

  const conformance = validateConformance({
    pack,
    acceptedDiff,
    trackerBaseline,
    trackerRouteSurface,
    receipt,
    summary: conformanceSummary,
    pin,
  });
  assertPinnedCounts(pack, conformance, pin);

  return {
    releaseRoot: resolvedRoot,
    pack,
    conformance,
    verified: {
      releaseManifestSha256: pin.release.releaseManifestSha256,
      publicManifestSha256: requiredResourcePin(
        pin.publicResources,
        "resolved-pack/public/manifest.json",
      ).sha256,
      acceptedDiffLedgerSha256: requiredResourcePin(
        pin.conformanceResources,
        "resolved-pack/operator/tracker-conformance/accepted-diff-ledger.jsonl",
      ).sha256,
      acceptedLedgerReceiptSha256: requiredResourcePin(
        pin.conformanceResources,
        "resolved-pack/operator/tracker-conformance/accepted-ledger-receipt.json",
      ).sha256,
      verifiedOuterResourceCount,
    },
  };
}

function validateConformance(input: {
  pack: ResolvedTransitPublicPack;
  acceptedDiff: readonly TrackerConformanceAcceptedDiffRow[];
  trackerBaseline: readonly TrackerConformanceBaselineRow[];
  trackerRouteSurface: readonly TrackerConformanceRouteSurfaceRow[];
  receipt: Record<string, unknown>;
  summary: Record<string, unknown>;
  pin: ResolvedTransitImportPin;
}): ResolvedTransitConformance {
  const { pack, acceptedDiff, trackerBaseline, trackerRouteSurface, receipt, summary, pin } = input;
  assertExactKeys(
    receipt,
    [
      "acceptance",
      "artifacts",
      "as_of_date",
      "contract_id",
      "counts",
      "partitions",
      "provider_usage",
      "receipt_id",
      "schema_version",
    ],
    "accepted ledger receipt",
  );
  assertExactKeys(
    summary,
    [
      "acceptance_receipt_id",
      "accepted_at",
      "accepted_by",
      "accepted_result",
      "black_box_surface_parity",
      "contract_id",
      "downstream_ownership",
      "provider_usage",
      "route_differences",
      "schema_version",
      "source_artifacts",
      "tracker_counts",
      "tracker_repository_head",
      "tracker_worktree_state",
    ],
    "tracker conformance summary",
  );
  assertUnique(trackerBaseline, (row) => row.tracker_episode_id, "tracker baseline");
  assertUnique(trackerRouteSurface, (row) => row.tracker_route_key, "tracker route surface");

  const baselineById = new Map(trackerBaseline.map((row) => [row.tracker_episode_id, row]));
  const trackerRows = acceptedDiff.filter((row) => row.row_kind === "tracker_episode");
  const additionRows = acceptedDiff.filter((row) => row.row_kind === "producer_addition");
  assertUnique(
    trackerRows,
    (row) => row.tracker_episode_id ?? "missing",
    "accepted tracker decisions",
  );
  assertSetEqual(
    trackerRows.map((row) => row.tracker_episode_id ?? "missing"),
    baselineById.keys(),
    "accepted tracker decision coverage",
  );

  for (const row of trackerRows) {
    if (
      row.tracker_episode_id === null ||
      row.tracker_origin === null ||
      row.tracker_date === null
    ) {
      throw new Error("tracker decision is missing tracker identity fields");
    }
    const baseline = baselineById.get(row.tracker_episode_id);
    if (
      baseline === undefined ||
      baseline.tracker_origin !== row.tracker_origin ||
      JSON.stringify(baseline.tracker_date) !== JSON.stringify(row.tracker_date) ||
      JSON.stringify(baseline.tracker_route_ids) !== JSON.stringify(row.tracker_route_ids) ||
      JSON.stringify(baseline.tracker_route_keys) !== JSON.stringify(row.tracker_route_keys) ||
      JSON.stringify(baseline.origin_ids) !== JSON.stringify(row.origin_ids)
    ) {
      throw new Error(`${row.tracker_episode_id}: accepted ledger does not match baseline`);
    }
  }

  for (const row of additionRows) {
    if (
      row.tracker_episode_id !== null ||
      row.tracker_origin !== null ||
      row.tracker_date !== null ||
      row.producer_intervention_ids.length !== 1
    ) {
      throw new Error("producer addition carries invalid Tracker fields");
    }
  }

  const dispositionCounts = {
    useProducerIdentity: acceptedDiff.filter(
      (row) => row.consumer_disposition === "use_producer_identity",
    ).length,
    trackerEnrichmentOnly: acceptedDiff.filter(
      (row) => row.consumer_disposition === "enrichment_only",
    ).length,
    dropLegacyEpisode: acceptedDiff.filter(
      (row) => row.consumer_disposition === "drop_legacy_episode",
    ).length,
    addProducerEpisode: acceptedDiff.filter(
      (row) => row.consumer_disposition === "add_producer_episode",
    ).length,
  };

  const producerIds = acceptedDiff.flatMap((row) => row.producer_intervention_ids);
  assertSetEqual(
    producerIds,
    pack.episodes.map((row) => row.intervention_id),
    "accepted producer identity coverage",
  );

  const routeMemberships = trackerRouteSurface.flatMap((row) =>
    row.episode_memberships.map(
      (membership) => `${membership.tracker_episode_id}|${row.tracker_route_key}`,
    ),
  );
  const baselineMemberships = trackerBaseline.flatMap((row) =>
    row.tracker_route_keys.map((routeKey) => `${row.tracker_episode_id}|${routeKey}`),
  );
  assertSetEqual(routeMemberships, baselineMemberships, "tracker route-surface membership");

  const acceptedResult = objectValue(
    summary["accepted_result"],
    "conformance summary.accepted_result",
  );
  assertExactKeys(
    acceptedResult,
    [
      "date_representation_differences",
      "exact_components",
      "justified_exclusions",
      "mapped_producer_truth",
      "onset_differences",
      "producer_additions",
      "producer_episodes",
      "producer_route_keys",
      "producer_unique_gtfs_routes",
      "tracker_enrichment_only",
    ],
    "conformance summary.accepted_result",
  );
  assertEqual(
    acceptedResult["tracker_enrichment_only"],
    dispositionCounts.trackerEnrichmentOnly,
    "conformance summary enrichment count",
  );
  assertEqual(
    acceptedResult["mapped_producer_truth"],
    dispositionCounts.useProducerIdentity,
    "conformance summary mapped count",
  );
  assertEqual(
    acceptedResult["justified_exclusions"],
    dispositionCounts.dropLegacyEpisode,
    "conformance summary exclusion count",
  );
  assertEqual(
    acceptedResult["producer_additions"],
    dispositionCounts.addProducerEpisode,
    "conformance summary addition count",
  );

  const receiptId = textValue(receipt["receipt_id"], "accepted receipt.receipt_id");
  assertEqual(receiptId, pin.conformanceReceiptId, "accepted conformance receipt id");
  assertEqual(receipt["as_of_date"], pin.release.asOfDate, "accepted receipt as-of date");
  const receiptCounts = objectValue(receipt["counts"], "accepted receipt.counts");
  assertExactKeys(
    receiptCounts,
    [
      "accepted_diff_rows",
      "justified_exclusions",
      "mapped_producer_truth",
      "producer_additions",
      "producer_episodes",
      "producer_route_keys",
      "producer_unique_gtfs_routes",
      "tracker_baseline_episodes",
      "tracker_baseline_route_memberships",
      "tracker_baseline_routes",
      "tracker_enrichment_only",
    ],
    "accepted receipt.counts",
  );
  assertEqual(
    receiptCounts["accepted_diff_rows"],
    acceptedDiff.length,
    "accepted receipt ledger count",
  );

  const enrichments = acceptedDiff.filter((row) => row.consumer_disposition === "enrichment_only");
  const routeKeys = new Set([
    ...pack.episodes.flatMap((row) => row.route_keys),
    ...enrichments.flatMap((row) => row.tracker_route_keys),
  ]);
  const episodeRouteMembershipCount =
    pack.episodes.reduce((count, row) => count + row.route_keys.length, 0) +
    enrichments.reduce((count, row) => count + row.tracker_route_keys.length, 0);

  return {
    acceptedDiff,
    trackerBaseline,
    trackerRouteSurface,
    acceptanceReceiptId: receiptId,
    dispositionCounts,
    targetComposition: {
      episodeCount: pack.episodes.length + enrichments.length,
      routeArtifactCount: routeKeys.size,
      episodeRouteMembershipCount,
    },
  };
}

function assertPinnedCounts(
  pack: ResolvedTransitPublicPack,
  conformance: ResolvedTransitConformance,
  pin: ResolvedTransitImportPin,
): void {
  const componentActions = countBy(
    pack.components.map((row) => row.action),
    ["add", "modify", "remove", "suspend", "resume", "retain", "unknown"],
  );
  const componentExtents = countBy(
    pack.components.map((row) => row.extent.kind),
    ["route_wide", "bounded_segment", "stop_set", "service_pattern", "unknown"],
  );
  const placementStates = countBy(
    pack.placements.map((row) => row.state_as_of),
    [
      "confirmed_active",
      "last_confirmed_active",
      "confirmed_inactive",
      "planned",
      "suspended",
      "conflicted",
      "unknown",
    ],
  );
  const actual = {
    producerEpisodes: pack.episodes.length,
    components: pack.components.length,
    placements: pack.placements.length,
    producerRouteKeys: pack.routes.length,
    treatmentFamilies: pack.treatment_families.length,
    routeIndexRows: pack.route_index.length,
    historyRows: pack.history.length,
    currentFootprintRows: pack.current_footprint.length,
    sources: pack.sources.length,
    trackerBaselineEpisodes: conformance.trackerBaseline.length,
    useProducerIdentity: conformance.dispositionCounts.useProducerIdentity,
    trackerEnrichmentOnly: conformance.dispositionCounts.trackerEnrichmentOnly,
    dropLegacyEpisode: conformance.dispositionCounts.dropLegacyEpisode,
    addProducerEpisode: conformance.dispositionCounts.addProducerEpisode,
    candidateEpisodes: conformance.targetComposition.episodeCount,
    candidateRouteArtifacts: conformance.targetComposition.routeArtifactCount,
    candidateEpisodeRouteMemberships: conformance.targetComposition.episodeRouteMembershipCount,
  };
  const {
    componentActions: expectedActions,
    componentExtents: expectedExtents,
    placementStates: expectedStates,
    ...expected
  } = pin.counts;
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(actual[key as keyof typeof actual], value, `pinned count ${key}`);
  }
  assertCountMap(componentActions, expectedActions, "pinned component action counts");
  assertCountMap(componentExtents, expectedExtents, "pinned component extent counts");
  assertCountMap(placementStates, expectedStates, "pinned placement state counts");
}

function countBy<const K extends string>(
  values: readonly K[],
  keys: readonly K[],
): Record<K, number> {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;
  for (const value of values) counts[value] += 1;
  return counts;
}

function assertCountMap(
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
  label: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: exact count mismatch`);
  }
}

async function resolveSafeReleaseRoot(releaseRoot: string, inputRoot: string): Promise<string> {
  const resolvedInput = resolve(inputRoot);
  const resolvedRelease = isAbsolute(releaseRoot)
    ? resolve(releaseRoot)
    : resolve(fromRepoRoot("."), releaseRoot);
  assertDescendant(resolvedInput, resolvedRelease, "release root");
  const [realInput, realRelease] = await Promise.all([
    realpath(resolvedInput),
    realpath(resolvedRelease),
  ]);
  assertDescendant(realInput, realRelease, "real release root");
  const metadata = await stat(realRelease);
  if (!metadata.isDirectory()) throw new Error("release root is not a directory");
  return realRelease;
}

function assertDescendant(parent: string, child: string, label: string): void {
  const path = relative(parent, child);
  if (path === "" || (!path.startsWith("..") && !isAbsolute(path))) return;
  throw new Error(`${label} escapes the configured input root`);
}

async function readPinnedFile(
  releaseRoot: string,
  resourcePath: string,
  expectedSha256: string,
  expectedBytes?: number,
): Promise<Uint8Array> {
  if (isAbsolute(resourcePath))
    throw new Error(`${resourcePath}: absolute resource path is forbidden`);
  const target = resolve(releaseRoot, resourcePath);
  assertDescendant(releaseRoot, target, resourcePath);
  const realTarget = await realpath(target);
  assertDescendant(releaseRoot, realTarget, resourcePath);
  const metadata = await stat(realTarget);
  if (!metadata.isFile()) throw new Error(`${resourcePath}: expected a regular file`);
  const bytes = await readFile(realTarget);
  if (expectedBytes !== undefined && bytes.byteLength !== expectedBytes) {
    throw new Error(`${resourcePath}: byte count mismatch`);
  }
  const actual = sha256Bytes(bytes);
  if (actual !== expectedSha256) throw new Error(`${resourcePath}: SHA-256 mismatch`);
  return bytes;
}

function parseJsonLinesResource<S extends { Type: unknown }>(
  resources: ReadonlyMap<string, Uint8Array>,
  path: string,
  schema: S,
): S["Type"][] {
  const text = new TextDecoder().decode(requiredBytes(resources, path));
  if (text.length === 0) return [];
  if (!text.endsWith("\n")) throw new Error(`${path}: JSONL must end with a newline`);
  return text
    .slice(0, -1)
    .split("\n")
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`${path}:${index + 1}: invalid JSON`, { cause: error });
      }
      return decodeSchemaStrict(schema as never, value) as S["Type"];
    });
}

function parseJsonResource<S extends { Type: unknown }>(
  resources: ReadonlyMap<string, Uint8Array>,
  path: string,
  schema: S,
): S["Type"] {
  return decodeSchemaStrict(
    schema as never,
    JSON.parse(new TextDecoder().decode(requiredBytes(resources, path))),
  ) as S["Type"];
}

function requiredBytes(resources: ReadonlyMap<string, Uint8Array>, path: string): Uint8Array {
  const bytes = resources.get(path);
  if (bytes === undefined) throw new Error(`${path}: required resource was not loaded`);
  return bytes;
}

function requiredResourcePin(resources: readonly ResourcePin[], path: string): ResourcePin {
  const resource = resources.find((row) => row.path === path);
  if (resource === undefined) throw new Error(`${path}: resource pin is missing`);
  return resource;
}

function parseObject(bytes: Uint8Array, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new Error(`${label}: invalid JSON`, { cause: error });
  }
  return objectValue(value, label);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: expected object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label}: requires exact fields`);
  }
}

function textValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label}: expected text`);
  return value;
}

function sha256Value(value: unknown, label: string): string {
  const text = textValue(value, label);
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error(`${label}: expected SHA-256`);
  return text;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}: expected nonnegative safe integer`);
  }
  return value;
}

function outerFileHash(files: Record<string, unknown>, path: string): string {
  const row = objectValue(files[path], `release manifest.files.${path}`);
  return sha256Value(row["sha256"], `release manifest.files.${path}.sha256`);
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}`);
}

function assertUnique<T>(rows: readonly T[], key: (row: T) => string, label: string): void {
  const values = rows.map(key);
  if (new Set(values).size !== values.length) throw new Error(`${label}: duplicate identity`);
}

function assertSetEqual(actual: Iterable<string>, expected: Iterable<string>, label: string): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${label}: exact set/multiset mismatch`);
  }
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
