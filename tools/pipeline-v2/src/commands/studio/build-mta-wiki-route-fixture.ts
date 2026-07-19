import { createHash } from "node:crypto";
import { routeIdToStudioSlug } from "@bp/domain/studio";
import { type StudioRoutesResponse, StudioRoutesResponseSchema } from "@bp/domain/studio/routes";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { writeJson } from "../../lib/json.ts";
import { resolveMtaWikiRoot } from "../../lib/mta-wiki-canonical.ts";
import {
  readMtaWikiReleaseQuarantineStatus,
  resolveMtaWikiRelease,
} from "../../lib/mta-wiki-release.ts";
import {
  auditCurrentBusRoutesParity,
  type CurrentBusRoutesParityAudit,
  type CurrentBusRoutesRouteDesignations,
  loadMtaWikiRouteIdentities,
  type MtaWikiRouteIdentitySnapshot,
} from "../../lib/mta-wiki-route-identities.ts";
import { fromCliPath } from "../../lib/paths.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";

const Sha256Schema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u));
const GitCommitSchema = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/u));
const IsoDateSchema = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u));
const IsoInstantSchema = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
);

const COMPATIBILITY_CAVEAT =
  "Deterministic temporary route-universe fixture derived from the pinned rc24 route identity snapshot; no performance, approval, publication, or deployment claim.";
const COMPATIBILITY_TEXT =
  "Temporary read-only compatibility replay; no analytical metric asserted.";
const COMPATIBILITY_FLAG = "Compatibility replay only";
const COMPATIBILITY_TERMINUS = "Not projected in compatibility replay";

export const MtaWikiRouteFixtureReceiptSchema = Schema.Struct({
  artifactKind: Schema.Literal("bp.studio.mta_wiki_route_fixture_receipt.v1"),
  schemaVersion: Schema.Literal(1),
  authorization: Schema.Literal("non_authorizing_read_only_replay_input"),
  generatedAt: IsoInstantSchema,
  generator: Schema.Struct({
    command: Schema.Array(Schema.String),
    commit: GitCommitSchema,
  }),
  inputs: Schema.Struct({
    mtaWikiRoot: Schema.Literal("<mta-wiki-root>"),
    wikiRelease: Schema.String,
    manifestRelativePath: Schema.String,
    manifestSha256: Sha256Schema,
    routeIdentityRelativePath: Schema.String,
    routeIdentitySha256: Sha256Schema,
    routeIdentityContractId: Schema.String,
    routeIdentitySchemaVersion: Schema.Number.check(Schema.isInt()),
    currentBusRoutesPath: Schema.Literal("<pinned-current-bus-routes-artifact>"),
    currentBusRoutesSha256: Sha256Schema,
    currentBusRoutesEffectiveAsOfDate: IsoDateSchema,
  }),
  derivation: Schema.Struct({
    predicate: Schema.Literal("catalog_in_effect=yes"),
    currentCatalogRouteCount: Schema.Number.check(Schema.isInt()),
    catalogInEffectIdentityCount: Schema.Number.check(Schema.isInt()),
    outputRouteCount: Schema.Number.check(Schema.isInt()),
    descriptorReconciled: Schema.Boolean,
    catalogInEffectSetsEqual: Schema.Boolean,
    outputEqualsCatalogInEffectIdentityUniverse: Schema.Literal(true),
    catalogOnlyRouteIds: Schema.Array(Schema.String),
    gtfsOnlyRouteIds: Schema.Array(Schema.String),
    typedDisagreementsNonfatalForIntersectionFixture: Schema.Literal(true),
    zeroAnalytics: Schema.Literal(true),
  }),
  output: Schema.Struct({
    logicalPath: Schema.Literal("<isolated-output>/routes.json"),
    bytes: Schema.Number.check(Schema.isInt()),
    sha256: Sha256Schema,
  }),
  determinism: Schema.Struct({
    serializationRunCount: Schema.Literal(2),
    byteIdentical: Schema.Literal(true),
    sha256ByRun: Schema.Tuple([Sha256Schema, Sha256Schema]),
  }),
  legacyContrast: Schema.Struct({
    path: Schema.String,
    sha256: Sha256Schema,
    usedAsInput: Schema.Literal(false),
    reason: Schema.Literal(
      "Historical analytical route projection is recorded only as contrast; it is not an input to this compatibility fixture.",
    ),
  }),
  approvalsCreated: Schema.Literal(false),
  publicationPerformed: Schema.Literal(false),
  deploymentPerformed: Schema.Literal(false),
});

export type MtaWikiRouteFixtureReceipt = typeof MtaWikiRouteFixtureReceiptSchema.Type;

export type RunBuildMtaWikiRouteFixtureInput = {
  mtaWikiRoot: string;
  wikiRelease: string;
  wikiManifestSha256: string;
  currentBusRoutesPath: string;
  currentBusRoutesSha256: string;
  currentBusRoutesEffectiveAsOfDate: string;
  generatedAt: string;
  generatorCommit: string;
  legacyRouteArtifactPath: string;
  legacyRouteArtifactSha256Contrast: string;
  output: string;
  receipt: string;
};

export type BuildMtaWikiRouteFixtureResult = {
  artifact: StudioRoutesResponse;
  artifactBytes: Uint8Array;
  receipt: MtaWikiRouteFixtureReceipt;
  receiptBytes: Uint8Array;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function fixedGeneratedAt(value: string): string {
  const decoded = decodeSchemaStrict(IsoInstantSchema, value);
  if (new Date(decoded).toISOString() !== decoded) {
    throw new Error("generatedAt must be a canonical fixed ISO-8601 UTC instant");
  }
  return decoded;
}

function routeBorough(routeId: string): string {
  if (routeId.startsWith("BX")) return "Bronx";
  if (routeId.startsWith("B")) return "Brooklyn";
  if (routeId.startsWith("Q")) return "Queens";
  if (routeId.startsWith("S")) return "Staten Island";
  if (routeId.startsWith("M")) return "Manhattan";
  return "Multiple";
}

export function buildMtaWikiRouteFixtureArtifact(input: {
  generatedAt: string;
  snapshot: MtaWikiRouteIdentitySnapshot;
  designationsByRouteId: ReadonlyMap<string, CurrentBusRoutesRouteDesignations>;
  parity: CurrentBusRoutesParityAudit;
}): StudioRoutesResponse {
  if (!input.parity.descriptorReconciled) {
    throw new Error("Current Bus Routes descriptor must reconcile before building a route fixture");
  }
  const identities = input.snapshot.service_identities
    .filter((identity) => identity.catalog_in_effect === "yes")
    .toSorted((left, right) => left.source_route_id.localeCompare(right.source_route_id));
  if (identities.length !== input.parity.catalogInEffectIdentityCount) {
    throw new Error("Producer catalog-in-effect identity universe does not reconcile");
  }

  const routes = identities.map((identity) => {
    const designations = input.designationsByRouteId.get(identity.source_route_id);
    if (
      designations === undefined ||
      designations.routeShortName !== identity.display_label ||
      identity.source_route_id !== identity.gtfs_route_id
    ) {
      throw new Error(`Route fixture identity does not reconcile for ${identity.source_route_id}`);
    }
    return {
      slug: routeIdToStudioSlug(identity.source_route_id),
      routeId: identity.source_route_id,
      label: identity.display_label,
      corridor: identity.route_long_name ?? identity.display_label,
      corridorFull: identity.route_long_name ?? identity.display_label,
      borough: routeBorough(identity.source_route_id),
      sbs: identity.normalized_service_modes.includes("sbs"),
      speedMph: 0,
      scheduledMph: null,
      weightedAvgSpeed: 0,
      speedPercentile: null,
      dailyRiders: 0,
      ridersYoyPct: null,
      riderHoursLost: null,
      laneCoverage: 0,
      aceStatus: "none" as const,
      aceSince: null,
      tspCoverage: "none" as const,
      reliability: COMPATIBILITY_TEXT,
      observedReliability: null,
      diagnosis: COMPATIBILITY_TEXT,
      spark: null,
      termini: { north: COMPATIBILITY_TERMINUS, south: COMPATIBILITY_TERMINUS },
      miles: null,
      stops: 0,
      flags: [COMPATIBILITY_FLAG],
      peerSlug: null,
      interventions: [],
      movement6mPct: null,
      context12mPct: null,
    };
  });

  return decodeSchemaStrict(StudioRoutesResponseSchema, {
    schemaVersion: 2,
    generatedAt: fixedGeneratedAt(input.generatedAt),
    baselineMonth: input.parity.effectiveAsOfDate.slice(0, 7),
    routes,
    quality: {
      releaseLayer: "pending_publication",
      completenessStatus: "unavailable",
      confidence: "low",
      caveats: [COMPATIBILITY_CAVEAT],
    },
  });
}

function replayCommand(input: RunBuildMtaWikiRouteFixtureInput): string[] {
  return [
    "bun",
    "--filter",
    "@bp/pipeline-v2",
    "cli",
    "--",
    "studio",
    "build-mta-wiki-route-fixture",
    "--mta-wiki-root",
    "<mta-wiki-root>",
    "--wiki-release",
    input.wikiRelease,
    "--wiki-manifest-sha256",
    input.wikiManifestSha256,
    "--current-bus-routes-path",
    "<pinned-current-bus-routes-artifact>",
    "--current-bus-routes-sha256",
    input.currentBusRoutesSha256,
    "--current-bus-routes-effective-as-of-date",
    input.currentBusRoutesEffectiveAsOfDate,
    "--generated-at",
    input.generatedAt,
    "--generator-commit",
    input.generatorCommit,
    "--legacy-route-artifact-path",
    input.legacyRouteArtifactPath,
    "--legacy-route-artifact-sha256-contrast",
    input.legacyRouteArtifactSha256Contrast,
    "--output",
    "<isolated-output>/routes.json",
    "--receipt",
    "<receipt-output>",
  ];
}

export async function runBuildMtaWikiRouteFixture(
  input: RunBuildMtaWikiRouteFixtureInput,
): Promise<BuildMtaWikiRouteFixtureResult> {
  decodeSchemaStrict(Sha256Schema, input.wikiManifestSha256);
  decodeSchemaStrict(Sha256Schema, input.currentBusRoutesSha256);
  decodeSchemaStrict(Sha256Schema, input.legacyRouteArtifactSha256Contrast);
  decodeSchemaStrict(GitCommitSchema, input.generatorCommit);
  decodeSchemaStrict(IsoDateSchema, input.currentBusRoutesEffectiveAsOfDate);
  fixedGeneratedAt(input.generatedAt);

  const outputPath = fromCliPath(input.output);
  const receiptPath = fromCliPath(input.receipt);
  const currentBusRoutesPath = fromCliPath(input.currentBusRoutesPath);
  const mtaWikiRoot = resolveMtaWikiRoot(input.mtaWikiRoot);
  await Effect.runPromise(
    resolveMtaWikiRelease({
      mtaWikiRoot,
      wikiRelease: input.wikiRelease,
      wikiManifestSha256: input.wikiManifestSha256,
      output: outputPath,
    }),
  );
  const quarantine = await Effect.runPromise(
    readMtaWikiReleaseQuarantineStatus({
      mtaWikiRoot,
      wikiRelease: input.wikiRelease,
      wikiManifestSha256: input.wikiManifestSha256,
    }),
  );
  if (quarantine !== null) {
    throw new Error(
      `MTA Wiki release ${input.wikiRelease} is quarantined (${quarantine.reasonCode}): ${quarantine.reason}`,
    );
  }

  const routeIdentities = await loadMtaWikiRouteIdentities({
    mtaWikiRoot,
    wikiRelease: input.wikiRelease,
    wikiManifestSha256: input.wikiManifestSha256,
  });
  const parityResult = await auditCurrentBusRoutesParity({
    currentBusRoutesPath,
    expectedSha256: input.currentBusRoutesSha256,
    effectiveAsOfDate: input.currentBusRoutesEffectiveAsOfDate,
    snapshot: routeIdentities.snapshot,
  });
  const artifact = buildMtaWikiRouteFixtureArtifact({
    generatedAt: input.generatedAt,
    snapshot: routeIdentities.snapshot,
    designationsByRouteId: parityResult.designationsByRouteId,
    parity: parityResult.parity,
  });
  const artifactBytes = jsonBytes(artifact);
  const repeatedArtifactBytes = jsonBytes(
    buildMtaWikiRouteFixtureArtifact({
      generatedAt: input.generatedAt,
      snapshot: routeIdentities.snapshot,
      designationsByRouteId: parityResult.designationsByRouteId,
      parity: parityResult.parity,
    }),
  );
  const artifactSha256 = sha256(artifactBytes);
  const repeatedSha256 = sha256(repeatedArtifactBytes);
  if (
    artifactSha256 !== repeatedSha256 ||
    !artifactBytes.every((byte, i) => byte === repeatedArtifactBytes[i])
  ) {
    throw new Error("Route fixture serialization is not deterministic");
  }

  const receipt = decodeSchemaStrict(MtaWikiRouteFixtureReceiptSchema, {
    artifactKind: "bp.studio.mta_wiki_route_fixture_receipt.v1",
    schemaVersion: 1,
    authorization: "non_authorizing_read_only_replay_input",
    generatedAt: input.generatedAt,
    generator: { command: replayCommand(input), commit: input.generatorCommit },
    inputs: {
      mtaWikiRoot: "<mta-wiki-root>",
      wikiRelease: input.wikiRelease,
      manifestRelativePath: `data/exports/releases/${input.wikiRelease}/manifest.json`,
      manifestSha256: routeIdentities.manifestSha256,
      routeIdentityRelativePath: `data/exports/releases/${input.wikiRelease}/route_identity_snapshot.json`,
      routeIdentitySha256: routeIdentities.routeIdentitySha256,
      routeIdentityContractId: routeIdentities.snapshot.contract_id,
      routeIdentitySchemaVersion: routeIdentities.snapshot.schema_version,
      currentBusRoutesPath: "<pinned-current-bus-routes-artifact>",
      currentBusRoutesSha256: parityResult.parity.currentBusRoutesSha256,
      currentBusRoutesEffectiveAsOfDate: parityResult.parity.effectiveAsOfDate,
    },
    derivation: {
      predicate: "catalog_in_effect=yes",
      currentCatalogRouteCount: parityResult.parity.currentCatalogRouteCount,
      catalogInEffectIdentityCount: parityResult.parity.catalogInEffectIdentityCount,
      outputRouteCount: artifact.routes.length,
      descriptorReconciled: parityResult.parity.descriptorReconciled,
      catalogInEffectSetsEqual: parityResult.parity.catalogInEffectSetsEqual,
      outputEqualsCatalogInEffectIdentityUniverse: true,
      catalogOnlyRouteIds: parityResult.parity.catalogOnlyRouteIds,
      gtfsOnlyRouteIds: parityResult.parity.gtfsOnlyRouteIds,
      typedDisagreementsNonfatalForIntersectionFixture: true,
      zeroAnalytics: true,
    },
    output: {
      logicalPath: "<isolated-output>/routes.json",
      bytes: artifactBytes.byteLength,
      sha256: artifactSha256,
    },
    determinism: {
      serializationRunCount: 2,
      byteIdentical: true,
      sha256ByRun: [artifactSha256, repeatedSha256],
    },
    legacyContrast: {
      path: input.legacyRouteArtifactPath,
      sha256: input.legacyRouteArtifactSha256Contrast,
      usedAsInput: false,
      reason:
        "Historical analytical route projection is recorded only as contrast; it is not an input to this compatibility fixture.",
    },
    approvalsCreated: false,
    publicationPerformed: false,
    deploymentPerformed: false,
  });
  const receiptBytes = jsonBytes(receipt);
  await writeJson(outputPath, artifact);
  await writeJson(receiptPath, receipt);
  return { artifact, artifactBytes, receipt, receiptBytes };
}

const optionsSchema = Schema.Struct({
  mtaWikiRoot: Schema.String.annotate({ description: "Path to the MTA Wiki repository root." }),
  wikiRelease: Schema.String.annotate({ description: "Exact immutable MTA Wiki release id." }),
  wikiManifestSha256: Sha256Schema.annotate({ description: "Exact release manifest SHA-256." }),
  currentBusRoutesPath: Schema.String.annotate({
    description: "Pinned official Current Bus Routes JSON path.",
  }),
  currentBusRoutesSha256: Sha256Schema.annotate({
    description: "Exact Current Bus Routes SHA-256.",
  }),
  currentBusRoutesEffectiveAsOfDate: IsoDateSchema.annotate({
    description: "Pinned Current Bus Routes effective date.",
  }),
  generatedAt: IsoInstantSchema.annotate({
    description: "Fixed deterministic generation instant.",
  }),
  generatorCommit: GitCommitSchema.annotate({
    description: "Exact Tracker commit containing this generator.",
  }),
  legacyRouteArtifactPath: Schema.String.annotate({
    description: "Legacy analytical routes artifact path recorded only as non-input contrast.",
  }),
  legacyRouteArtifactSha256Contrast: Sha256Schema.annotate({
    description: "Legacy analytical routes SHA-256 recorded only as non-input contrast.",
  }),
  output: Schema.String.annotate({ description: "Isolated generated routes.json output path." }),
  receipt: Schema.String.annotate({
    description: "Versioned reproducibility receipt output path.",
  }),
});

const outputSchema = Schema.Struct({
  outputPath: Schema.String,
  outputBytes: Schema.Number.check(Schema.isInt()),
  outputSha256: Sha256Schema,
  receiptPath: Schema.String,
  receiptBytes: Schema.Number.check(Schema.isInt()),
  receiptSha256: Sha256Schema,
  routeCount: Schema.Number.check(Schema.isInt()),
});

export default defineCommand({
  path: ["studio", "build-mta-wiki-route-fixture"],
  summary: "Build a deterministic zero-analytics route fixture from a pinned MTA Wiki release.",
  input: { options: optionsSchema },
  output: outputSchema,
  async run({ input }) {
    const result = await runBuildMtaWikiRouteFixture(input.options);
    return {
      outputPath: fromCliPath(input.options.output),
      outputBytes: result.artifactBytes.byteLength,
      outputSha256: sha256(result.artifactBytes),
      receiptPath: fromCliPath(input.options.receipt),
      receiptBytes: result.receiptBytes.byteLength,
      receiptSha256: sha256(result.receiptBytes),
      routeCount: result.artifact.routes.length,
    };
  },
});
