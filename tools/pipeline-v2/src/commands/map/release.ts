import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mapArtifactManifestPath } from "@bp/analytics/artifacts";
import { mapArtifactSha256 } from "@bp/analytics/evaluation";
import { ROUTE_SPEED_SPINE_DEFAULT_START_MONTH } from "@bp/analytics/feature-history";
import { buildMapReleaseRegistrationSql } from "@bp/db/d1/seed";
import {
  canonicalPlan097Json,
  Plan097ActivationBundleReceiptSchema,
  Plan097ActivationBundleSchema,
  type Plan097BatchStatement,
} from "@bp/db/recovery/plan097";
import {
  type ReleaseIdentity,
  ReleaseIdentitySchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { isoMonth } from "../../lib/dates.ts";
import { dbOptions, type OpenLocalPipelineDb } from "../../lib/local-db.ts";
import {
  defaultArtifactRootPath,
  defaultExportRootPath,
  fromCliPath,
  fromRepoRoot,
} from "../../lib/paths.ts";
import { buildPlan097RecoveryArtifactInventory } from "../../lib/plan097-recovery-artifacts.ts";
import {
  buildPlan097CompactedBatch,
  buildPlan097ExpectedSchemaEnvelope,
} from "../../lib/plan097-recovery-batch.ts";
import { decodeSchemaStrict } from "../../lib/schema-decode.ts";
import { runRouteBriefModel } from "../route/brief-model.ts";
import { runStudioRelease } from "../studio/release.ts";
import { runRouteSpeedSpines } from "../studio/route-speed-spines.ts";
import { runVerifyD1Export } from "../verify/d1.ts";
import {
  readMapArtifactManifest,
  runMapArtifacts,
  verifyMapArtifactManifest,
} from "./artifacts.ts";
import { runMapContext } from "./context.ts";

export type RunMapReleaseInputs = {
  local: OpenLocalPipelineDb;
  year: number;
  month: number;
  contextSourcePath: string;
  artifactRoot?: string | undefined;
  exportRoot?: string | undefined;
  spineStartMonth?: string | undefined;
  routeShapeSnapshotPath?: string | undefined;
  stopSnapshotPath?: string | undefined;
  busLaneSnapshotPath?: string | undefined;
  routeSliceRawRoot?: string | undefined;
  tspSourcePath?: string | undefined;
  documentChunksPath?: string | undefined;
  manualInterventionsPath?: string | undefined;
  publishableInterventionsByRoutePath?: string | undefined;
};

export type MapReleaseDependencies = {
  routeBrief: typeof runRouteBriefModel;
  speedSpines: typeof runRouteSpeedSpines;
  verifyD1: typeof runVerifyD1Export;
  context: typeof runMapContext;
  studio: typeof runStudioRelease;
  map: typeof runMapArtifacts;
  audit: typeof verifyMapArtifactManifest;
};

const defaultDependencies: MapReleaseDependencies = {
  routeBrief: runRouteBriefModel,
  speedSpines: runRouteSpeedSpines,
  verifyD1: runVerifyD1Export,
  context: runMapContext,
  studio: runStudioRelease,
  map: runMapArtifacts,
  audit: verifyMapArtifactManifest,
};

function assertReleaseIdentityOutput(input: {
  label: string;
  identity: unknown;
  expected: ReleaseIdentity;
  month: string;
}): ReleaseIdentity {
  const identity = decodeSchemaStrict(ReleaseIdentitySchema, input.identity);
  if (
    identity.releaseId !== input.expected.releaseId ||
    identity.publishedAt !== input.expected.publishedAt ||
    identity.coverage.start !== input.expected.coverage.start ||
    identity.coverage.end !== input.expected.coverage.end
  ) {
    throw new Error(`${input.label} publication identity does not match the map release boundary.`);
  }
  if (identity.coverage.end !== input.month) {
    throw new Error(
      `${input.label} coverage ends at ${identity.coverage.end}, expected ${input.month}.`,
    );
  }
  return identity;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceContract(
  kind:
    | "canonical-schema"
    | "recovery-seed"
    | "exact-route-registration"
    | "map-release-registration",
  bytes: Uint8Array,
) {
  return { kind, sha256: sha256(bytes), byteLength: bytes.byteLength };
}

export async function runMapRelease(
  inputs: RunMapReleaseInputs,
  dependencies: MapReleaseDependencies = defaultDependencies,
) {
  const month = isoMonth(inputs.year, inputs.month);
  const publishedAt = new Date().toISOString();
  const artifactRoot = inputs.artifactRoot ?? defaultArtifactRootPath();
  const exportRoot = inputs.exportRoot ?? defaultExportRootPath();
  const routeShapeSnapshotPath =
    inputs.routeShapeSnapshotPath ?? fromRepoRoot("data/raw/network/current_bus_routes.json");
  const stopSnapshotPath =
    inputs.stopSnapshotPath ?? fromRepoRoot("data/raw/network/current_bus_stops.json");
  const busLaneSnapshotPath =
    inputs.busLaneSnapshotPath ??
    fromRepoRoot("data/raw/interventions/bus-lanes-local-streets.json");

  const routeBrief = await dependencies.routeBrief({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    routes: [],
    artifactRoot,
  });
  const speedSpines = await dependencies.speedSpines({
    local: inputs.local,
    startMonth: inputs.spineStartMonth ?? ROUTE_SPEED_SPINE_DEFAULT_START_MONTH,
    endMonth: month,
    artifactRoot,
    generatedAt: publishedAt,
  });
  const releaseIdentity = decodeSchemaStrict(ReleaseIdentitySchema, {
    releaseId: releaseIdFromPublishedAt(publishedAt),
    publishedAt,
    coverage: { start: speedSpines.coverageStart, end: month },
  });
  const d1 = await dependencies.verifyD1({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    artifactRoot,
    exportRoot,
    releaseIdentity,
  });
  assertReleaseIdentityOutput({
    label: "D1 export",
    identity: {
      releaseId: d1.releaseId,
      publishedAt: d1.publishedAt,
      coverage: d1.coverage,
    },
    expected: releaseIdentity,
    month,
  });
  if (d1.exactRouteIdentity === null) {
    throw new Error(
      "D1 export did not emit the candidate exact-route identity registration and receipt.",
    );
  }
  const context = await dependencies.context({
    sourcePath: inputs.contextSourcePath,
    artifactRoot,
  });
  const studio = await dependencies.studio({
    releaseIdentity,
    month,
    outputPath: join(artifactRoot, "studio", "v1", "release.json"),
    schemaPath: d1.schemaPath,
    seedPath: d1.seedPath,
    routeSliceArtifactsRoot: join(artifactRoot, "route-slices"),
    speedSpineRoot: artifactRoot,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    localDbPath: inputs.local.path,
    profile: "full",
    ...(inputs.routeSliceRawRoot === undefined
      ? {}
      : { routeSliceRawRoot: inputs.routeSliceRawRoot }),
    ...(inputs.tspSourcePath === undefined ? {} : { tspSourcePath: inputs.tspSourcePath }),
    ...(inputs.documentChunksPath === undefined
      ? {}
      : { documentChunksPath: inputs.documentChunksPath }),
    ...(inputs.manualInterventionsPath === undefined
      ? {}
      : { manualInterventionsPath: inputs.manualInterventionsPath }),
    ...(inputs.publishableInterventionsByRoutePath === undefined
      ? {}
      : { publishableInterventionsByRoutePath: inputs.publishableInterventionsByRoutePath }),
  });
  const studioReleaseIdentity = (studio as typeof studio & { readonly releaseIdentity?: unknown })
    .releaseIdentity;
  if (studioReleaseIdentity === undefined) {
    throw new Error("Studio release did not report its written release identity.");
  }
  assertReleaseIdentityOutput({
    label: "Studio release",
    identity: studioReleaseIdentity,
    expected: releaseIdentity,
    month,
  });
  const map = await dependencies.map({
    local: inputs.local,
    year: inputs.year,
    month: inputs.month,
    releaseIdentity,
    releaseProfile: "full",
    artifactRoot,
    speedSpineRoot: artifactRoot,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    busLaneSnapshotPath,
    contextPath: context.artifactPath,
    contextSourcePath: context.sourcePath,
    routeFactsPath: studio.mapRouteFactsPath,
  });
  const audit = await dependencies.audit({
    artifactRoot,
    month,
    expectedProfile: "full",
  });
  if (audit.status !== "pass") {
    throw new Error(
      `Full map release audit failed with ${audit.issueCount} issue(s): ${audit.issues
        .slice(0, 5)
        .map((issue) => issue.code)
        .join(", ")}.`,
    );
  }

  const manifestPath = mapArtifactManifestPath(artifactRoot, month);
  const manifest = await readMapArtifactManifest({ artifactRoot, month });
  if (manifest === null) {
    throw new Error(`Verified map manifest ${manifestPath} is missing or invalid.`);
  }
  const mapReleaseIdentity = assertReleaseIdentityOutput({
    label: "Verified map manifest",
    identity: {
      releaseId: manifest.releaseId,
      publishedAt: manifest.publishedAt,
      coverage: manifest.coverage,
    },
    expected: releaseIdentity,
    month,
  });
  if (
    manifest.releaseProfile !== "full" ||
    manifest.buildStatus !== "pass" ||
    manifest.verificationStatus !== "pass" ||
    manifest.status !== "pass" ||
    manifest.issueCount !== 0
  ) {
    throw new Error("Only a verified full map manifest can be finalized and cataloged.");
  }

  const manifestBytes = await readFile(manifestPath);
  const finalManifestSha256 = mapArtifactSha256(manifestBytes);
  const finalManifestKey = `map/${month}/manifest.${finalManifestSha256}.json`;
  const finalManifestPath = join(artifactRoot, finalManifestKey);
  await mkdir(dirname(finalManifestPath), { recursive: true });
  await writeFile(finalManifestPath, manifestBytes);

  const recoveryArtifacts = await buildPlan097RecoveryArtifactInventory({
    artifactRoot,
    month,
    schemaPath: d1.schemaPath,
    seedPath: d1.seedPath,
    finalMapManifestKey: finalManifestKey,
    releaseIdentity,
  });
  const recoveryMapManifest = recoveryArtifacts.manifest.entries.find(
    (entry) => entry.logicalKey === finalManifestKey,
  );
  if (recoveryMapManifest === undefined) {
    throw new Error("Plan 097 recovery inventory omitted the verified map manifest");
  }
  const recoveryArtifactManifestPath = join(dirname(d1.seedPath), "plan097-artifact-manifest.json");
  await writeFile(recoveryArtifactManifestPath, recoveryArtifacts.manifestText);

  const registrationPath = join(dirname(d1.seedPath), "map-release-registration.sql");
  const catalogReleaseIdentity = assertReleaseIdentityOutput({
    label: "Map catalog registration",
    identity: mapReleaseIdentity,
    expected: releaseIdentity,
    month,
  });
  const registrationSql = buildMapReleaseRegistrationSql({
    ...catalogReleaseIdentity,
    manifestKey: recoveryMapManifest.key,
    manifestSha256: finalManifestSha256,
    releaseProfile: "full",
    verificationStatus: "pass",
    routeCount: manifest.routeUniverse.expectedRouteIds.length,
  });
  await mkdir(dirname(registrationPath), { recursive: true });
  await writeFile(registrationPath, registrationSql);

  const [schemaBytes, recoverySeedBytes, exactRegistrationBytes] = await Promise.all([
    readFile(d1.schemaPath),
    readFile(d1.plan097RecoverySeedPath),
    readFile(d1.exactRouteIdentity.registrationFile.path),
  ]);
  if (sha256(exactRegistrationBytes) !== d1.exactRouteIdentity.registrationFile.sha256) {
    throw new Error("Candidate exact-route registration bytes do not match the D1 receipt");
  }
  const schemaSql = new TextDecoder().decode(schemaBytes);
  const mapRegistrationBytes = new TextEncoder().encode(registrationSql);
  const registrations: Plan097BatchStatement[] = [
    {
      sql: new TextDecoder().decode(exactRegistrationBytes).trim(),
      params: [],
      table: "exact_route_identity_release",
      kind: "registration",
      rowCount: 1,
    },
    {
      sql: registrationSql.trim(),
      params: [],
      table: "map_release_catalog",
      kind: "registration",
      rowCount: 1,
    },
  ];
  const batch = buildPlan097CompactedBatch({
    schemaSql,
    recoverySeedSql: new TextDecoder().decode(recoverySeedBytes),
    registrations,
  });
  const operationId = `plan097:${releaseIdentity.releaseId}`;
  const activationBundle = decodeSchemaStrict(Plan097ActivationBundleSchema, {
    artifactKind: "bp.ops.plan097.activation-bundle.v1",
    schemaVersion: 1,
    operationId,
    candidate: releaseIdentity,
    expectedExactRouteCount: d1.exactRouteIdentity.exactRouteCount,
    schemaEnvelope: buildPlan097ExpectedSchemaEnvelope(schemaSql),
    artifactManifest: {
      key: recoveryArtifacts.manifestKey,
      sha256: recoveryArtifacts.manifestSha256,
      byteLength: recoveryArtifacts.manifestBytes,
      entryCount: recoveryArtifacts.manifest.entries.length,
    },
    sources: [
      sourceContract("canonical-schema", schemaBytes),
      sourceContract("recovery-seed", recoverySeedBytes),
      sourceContract("exact-route-registration", exactRegistrationBytes),
      sourceContract("map-release-registration", mapRegistrationBytes),
    ],
    batch,
  });
  const activationBundleText = `${canonicalPlan097Json(activationBundle)}\n`;
  const activationBundleBytes = new TextEncoder().encode(activationBundleText);
  const activationBundleSha256 = sha256(activationBundleBytes);
  const activationBundlePath = join(dirname(d1.seedPath), "plan097-activation-bundle.json");
  const activationBundleKey = `operations/plan097/bundles/${releaseIdentity.releaseId}/activation.${activationBundleSha256}.json`;
  const activationBundleReceipt = decodeSchemaStrict(Plan097ActivationBundleReceiptSchema, {
    artifactKind: "bp.ops.plan097.activation-bundle-receipt.v1",
    schemaVersion: 1,
    operationId,
    candidate: releaseIdentity,
    bundle: {
      key: activationBundleKey,
      sha256: activationBundleSha256,
      byteLength: activationBundleBytes.byteLength,
    },
    metrics: batch.metrics,
  });
  const activationBundleReceiptPath = join(
    dirname(d1.seedPath),
    "plan097-activation-bundle-receipt.json",
  );
  await Promise.all([
    writeFile(activationBundlePath, activationBundleBytes),
    writeFile(activationBundleReceiptPath, `${canonicalPlan097Json(activationBundleReceipt)}\n`),
  ]);

  return {
    month,
    releaseIdentity,
    artifactRoot,
    exportRoot,
    routeShapeSnapshotPath,
    stopSnapshotPath,
    busLaneSnapshotPath,
    routeBrief,
    speedSpines,
    d1,
    context,
    studio,
    map,
    audit,
    finalManifestKey,
    finalManifestPath,
    finalManifestSha256,
    registrationPath,
    recoveryArtifactManifestPath,
    recoveryArtifacts,
    activationBundlePath,
    activationBundleReceiptPath,
    activationBundleKey,
    activationBundleSha256,
    activationBatchMetrics: batch.metrics,
  };
}

export default defineCommand({
  path: ["map", "release"],
  summary: "Build and verify one full same-root map and Studio release.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      ...{
        year: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(2026))),
        month: arg.positiveInt().pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(3))),
        contextSource: Schema.String.annotate({
          description: "Required raw borough-boundary CSV used to build context",
        }),
        artifactRoot: Schema.optionalKey(Schema.String),
        exportRoot: Schema.optionalKey(Schema.String),
        spineStartMonth: Schema.optionalKey(Schema.String),
        routeShapeSnapshot: Schema.optionalKey(Schema.String),
        stopSnapshot: Schema.optionalKey(Schema.String),
        busLaneSnapshot: Schema.optionalKey(Schema.String),
        routeSliceRawRoot: Schema.optionalKey(Schema.String),
        tspSource: Schema.optionalKey(Schema.String),
        documentChunks: Schema.optionalKey(Schema.String),
        manualInterventions: Schema.optionalKey(Schema.String),
        publishableInterventionsByRoute: Schema.optionalKey(Schema.String),
      },
    }),
  },
  output: Schema.Unknown,
  async run({ input }) {
    const path = (value: string | undefined) =>
      value === undefined ? undefined : fromCliPath(value);
    return runLocalDbCommandBoundary({
      dbPath: path(input.options.db),
      command: "map.release",
      operation: "runMapRelease",
      run: (local) =>
        runMapRelease({
          local,
          year: input.options.year,
          month: input.options.month,
          contextSourcePath: fromCliPath(input.options.contextSource),
          artifactRoot: path(input.options.artifactRoot),
          exportRoot: path(input.options.exportRoot),
          spineStartMonth: input.options.spineStartMonth,
          routeShapeSnapshotPath: path(input.options.routeShapeSnapshot),
          stopSnapshotPath: path(input.options.stopSnapshot),
          busLaneSnapshotPath: path(input.options.busLaneSnapshot),
          routeSliceRawRoot: path(input.options.routeSliceRawRoot),
          tspSourcePath: path(input.options.tspSource),
          documentChunksPath: path(input.options.documentChunks),
          manualInterventionsPath: path(input.options.manualInterventions),
          publishableInterventionsByRoutePath: path(input.options.publishableInterventionsByRoute),
        }),
    });
  },
});
