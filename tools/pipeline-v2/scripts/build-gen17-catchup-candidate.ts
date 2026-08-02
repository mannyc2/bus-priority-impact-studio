import { Database } from "bun:sqlite";
import { copyFile, link, mkdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { type Plan097FreshnessMatrix, Plan097FreshnessMatrixSchema } from "@bp/db/recovery/plan097";
import { Plan097RecoveryArtifactManifestSchema } from "@bp/db/recovery/plan097/artifacts";
import { decodeStrict } from "@bp/domain/decode";
import { StudioReleasePayloadSchema } from "@bp/domain/studio";
import {
  canonicalServingJson,
  type ServingCandidateManifestV1,
} from "@bp/domain/studio/serving-release";
import { buildPlan097RecoveryArtifactInventory } from "../src/lib/plan097-recovery-artifacts.ts";
import { plan106ArchiveRelativePath } from "../src/lib/plan106-release-input.ts";
import {
  bindCandidateMapManifestLogicalKey,
  buildServingCandidateFromDescriptors,
  renderServingD1CandidateSeedSql,
  type ServingCandidateArtifactDescriptor,
  servingD1ProjectionInventory,
  servingSha256,
} from "../src/lib/serving-candidate.ts";

type Plan106ArtifactMap = {
  artifactKind: "bp.studio.public_intervention_candidate_map.v1";
  schemaVersion: 1;
  candidateId: string;
  entries: Array<{
    role: "operator_conformance" | "public_global_episodes" | "public_route_history";
    logicalKey: string | null;
    physicalKey: string;
    schemaId: string;
    mediaType: string;
    sha256: string;
  }>;
};

type Args = {
  month: string;
  artifactRoot: string;
  schema: string;
  seed: string;
  exactRegistration: string;
  mapRegistration: string;
  finalMapManifestKey: string;
  baselineManifest: string;
  baselineArtifactRoot: string;
  plan106ArtifactMap: string;
  plan106ArtifactRoot: string;
  freshnessMatrix: string;
  sourceCommit: string;
  output: string;
};

function parseArgs(argv: readonly string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error("Generation-17 candidate builder requires --name value arguments.");
    }
    values.set(key, value);
  }
  const required = (key: string): string => {
    const value = values.get(key);
    if (value === undefined || value.length === 0) throw new Error(`Missing ${key}.`);
    return value;
  };
  const month = required("--month");
  if (!/^\d{4}-\d{2}$/u.test(month)) throw new Error("Invalid --month.");
  const sourceCommit = required("--source-commit");
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new Error("Invalid --source-commit.");
  return {
    month,
    artifactRoot: required("--artifact-root"),
    schema: required("--schema"),
    seed: required("--seed"),
    exactRegistration: required("--exact-registration"),
    mapRegistration: required("--map-registration"),
    finalMapManifestKey: required("--final-map-manifest-key"),
    baselineManifest: required("--baseline-manifest"),
    baselineArtifactRoot: required("--baseline-artifact-root"),
    plan106ArtifactMap: required("--plan106-artifact-map"),
    plan106ArtifactRoot: required("--plan106-artifact-root"),
    freshnessMatrix: required("--freshness-matrix"),
    sourceCommit,
    output: required("--output"),
  };
}

function extensionFor(key: string): string {
  const extension = extname(key).slice(1).toLowerCase();
  return /^[a-z0-9]+$/u.test(extension) ? extension : "bin";
}

function descriptorFromBody(input: {
  logicalId: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  schemaId: string;
}): ServingCandidateArtifactDescriptor {
  return {
    ...input,
    key: `serving/blobs/sha256/${input.sha256.slice(0, 2)}/${input.sha256}.${extensionFor(
      input.logicalId,
    )}`,
  };
}

function sameArtifact(
  left: ServingCandidateArtifactDescriptor,
  right: Omit<ServingCandidateArtifactDescriptor, "key">,
): boolean {
  return (
    left.logicalId === right.logicalId &&
    left.sha256 === right.sha256 &&
    left.bytes === right.bytes &&
    left.mediaType === right.mediaType &&
    left.schemaId === right.schemaId
  );
}

function interventionKey(key: string): boolean {
  return (
    key === "studio/v2/interventions/public-episodes-v2.json" ||
    /^studio\/v2\/routes\/[a-z0-9-]+\/intervention-history-v2\.json$/u.test(key)
  );
}

async function activeDescriptors(input: {
  baselineManifestPath: string;
  baselineArtifactRoot: string;
  plan106ArtifactMapPath: string;
  plan106ArtifactRoot: string;
}): Promise<{
  descriptors: Map<string, ServingCandidateArtifactDescriptor>;
  sourcePaths: Map<string, string>;
  plan106CandidateId: string;
}> {
  const baseline = decodeStrict(Plan097RecoveryArtifactManifestSchema)(
    await Bun.file(input.baselineManifestPath).json(),
  );
  const map = (await Bun.file(input.plan106ArtifactMapPath).json()) as Plan106ArtifactMap;
  if (
    map.artifactKind !== "bp.studio.public_intervention_candidate_map.v1" ||
    map.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/u.test(map.candidateId)
  ) {
    throw new Error("Plan 106 artifact map identity is invalid.");
  }
  const descriptors = new Map(
    baseline.entries
      .filter((entry) => !interventionKey(entry.logicalKey))
      .map(
        (entry) =>
          [
            entry.logicalKey,
            {
              logicalId: entry.logicalKey,
              key: entry.key,
              sha256: entry.sha256,
              bytes: entry.bytes,
              mediaType: entry.mediaType,
              schemaId: entry.schemaId,
            },
          ] as const,
      ),
  );
  const sourcePaths = new Map(
    [...descriptors.keys()].map((logicalId) => [
      logicalId,
      join(input.baselineArtifactRoot, logicalId),
    ]),
  );
  let overlayCount = 0;
  for (const entry of map.entries) {
    if (entry.role === "operator_conformance") continue;
    if (entry.logicalKey === null)
      throw new Error("Plan 106 public entry omitted its logical key.");
    const sourcePath = join(
      input.plan106ArtifactRoot,
      plan106ArchiveRelativePath(map.candidateId, entry.physicalKey),
    );
    const body = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
    if (servingSha256(body) !== entry.sha256) {
      throw new Error(`Plan 106 artifact bytes drifted for ${entry.logicalKey}.`);
    }
    descriptors.set(
      entry.logicalKey,
      descriptorFromBody({
        logicalId: entry.logicalKey,
        sha256: entry.sha256,
        bytes: body.byteLength,
        mediaType: entry.mediaType,
        schemaId: entry.schemaId,
      }),
    );
    sourcePaths.set(entry.logicalKey, sourcePath);
    overlayCount += 1;
  }
  if (overlayCount !== 189 || descriptors.size !== 3_191) {
    throw new Error(
      `Active Candidate B reconstruction expected 3,191 artifacts and 189 overlay rows; found ${descriptors.size} and ${overlayCount}.`,
    );
  }
  return { descriptors, sourcePaths, plan106CandidateId: map.candidateId };
}

async function materializeCandidateObjects(input: {
  objectRoot: string;
  descriptors: readonly ServingCandidateArtifactDescriptor[];
  sourcePaths: ReadonlyMap<string, string>;
}): Promise<void> {
  const physicalHashes = new Map<string, string>();
  for (const descriptor of input.descriptors) {
    const priorHash = physicalHashes.get(descriptor.key);
    if (priorHash !== undefined && priorHash !== descriptor.sha256) {
      throw new Error(`Physical key collision for ${descriptor.key}.`);
    }
    physicalHashes.set(descriptor.key, descriptor.sha256);
    const sourcePath = input.sourcePaths.get(descriptor.logicalId);
    if (sourcePath === undefined) {
      throw new Error(`Candidate artifact has no local source: ${descriptor.logicalId}.`);
    }
    const body = new Uint8Array(await Bun.file(sourcePath).arrayBuffer());
    if (body.byteLength !== descriptor.bytes || servingSha256(body) !== descriptor.sha256) {
      throw new Error(`Candidate artifact source drifted: ${descriptor.logicalId}.`);
    }
    const targetPath = join(input.objectRoot, descriptor.key);
    await mkdir(dirname(targetPath), { recursive: true });
    try {
      await link(sourcePath, targetPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EXDEV") await copyFile(sourcePath, targetPath);
      else if (code !== "EEXIST") throw error;
    }
    const target = new Uint8Array(await Bun.file(targetPath).arrayBuffer());
    if (target.byteLength !== descriptor.bytes || servingSha256(target) !== descriptor.sha256) {
      throw new Error(`Materialized candidate artifact drifted: ${descriptor.logicalId}.`);
    }
  }
}

function datasetCoverage(
  freshness: Plan097FreshnessMatrix,
  reviewedServing: { releaseId: string; coverage: { start: string | null; end: string } },
): ServingCandidateManifestV1["datasets"] {
  return [
    {
      datasetId: "reviewed-serving",
      grain: "month" as const,
      coverage: { ...reviewedServing.coverage, missingIntervals: [] },
      sourceIds: [],
      sourceSnapshotIds: [reviewedServing.releaseId],
    },
    ...freshness.datasets.map((dataset) => {
      const coverageEnd = dataset.selectedCompletePartition;
      if (dataset.status !== "ready" || coverageEnd === null || dataset.evidence === null) {
        throw new Error(`Freshness matrix dataset ${dataset.sourceId} is not ready.`);
      }
      return {
        datasetId: dataset.sourceId,
        grain: dataset.grain,
        coverage: {
          start: dataset.sourceId === "bus_segment_speeds_2025" ? "2023-04" : null,
          end: coverageEnd,
          missingIntervals: [],
        },
        sourceIds: [dataset.sourceId],
        sourceSnapshotIds: [
          dataset.evidence.rowsSha256,
          ...(dataset.evidence.sourceSnapshotSha256 === null
            ? []
            : [dataset.evidence.sourceSnapshotSha256]),
        ],
      };
    }),
  ];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const release = decodeStrict(StudioReleasePayloadSchema)(
    await Bun.file(`${args.artifactRoot}/studio/v1/release.json`).json(),
  );
  if (release.coverage.end !== args.month) {
    throw new Error(
      `Studio release coverage ${release.coverage.end} does not match ${args.month}.`,
    );
  }
  const freshness = decodeStrict(Plan097FreshnessMatrixSchema)(
    await Bun.file(args.freshnessMatrix).json(),
  );
  if (freshness.status !== "ready" || freshness.candidateCompatibilityCoverageEnd !== args.month) {
    throw new Error(
      "Catch-up freshness matrix is not ready for the requested compatibility month.",
    );
  }

  const recovery = await buildPlan097RecoveryArtifactInventory({
    artifactRoot: args.artifactRoot,
    month: args.month,
    schemaPath: args.schema,
    seedPath: args.seed,
    finalMapManifestKey: args.finalMapManifestKey,
    releaseIdentity: {
      releaseId: release.releaseId,
      publishedAt: release.publishedAt,
      coverage: release.coverage,
    },
  });
  const active = await activeDescriptors({
    baselineManifestPath: args.baselineManifest,
    baselineArtifactRoot: args.baselineArtifactRoot,
    plan106ArtifactMapPath: args.plan106ArtifactMap,
    plan106ArtifactRoot: args.plan106ArtifactRoot,
  });
  const artifacts = new Map(active.descriptors);
  const sourcePaths = new Map(active.sourcePaths);
  const uploads: Array<ServingCandidateArtifactDescriptor & { sourcePath: string }> = [];
  let reusedArtifactCount = 0;
  for (const entry of recovery.manifest.entries) {
    const semantic = {
      logicalId: entry.logicalKey,
      sha256: entry.sha256,
      bytes: entry.bytes,
      mediaType: entry.mediaType,
      schemaId: entry.schemaId,
    };
    const prior = active.descriptors.get(entry.logicalKey);
    if (prior !== undefined && sameArtifact(prior, semantic)) {
      artifacts.set(entry.logicalKey, prior);
      reusedArtifactCount += 1;
      continue;
    }
    const descriptor = descriptorFromBody(semantic);
    artifacts.set(entry.logicalKey, descriptor);
    const sourcePath = join(args.artifactRoot, entry.logicalKey);
    sourcePaths.set(entry.logicalKey, sourcePath);
    uploads.push({ ...descriptor, sourcePath });
  }

  const recoveryIds = new Set(recovery.manifest.entries.map((entry) => entry.logicalKey));
  for (const prior of active.descriptors.values()) {
    if (recoveryIds.has(prior.logicalId)) continue;
    const sourcePath = sourcePaths.get(prior.logicalId);
    if (sourcePath === undefined) {
      throw new Error(`Preserved active artifact has no local source: ${prior.logicalId}.`);
    }
    const file = Bun.file(sourcePath);
    if (!(await file.exists())) {
      throw new Error(`Preserved active artifact is absent locally: ${prior.logicalId}.`);
    }
    const body = new Uint8Array(await file.arrayBuffer());
    const actualSha256 = servingSha256(body);
    if (actualSha256 !== prior.sha256 || body.byteLength !== prior.bytes) {
      throw new Error(
        `Active artifact outside the rebuilt inventory drifted locally: ${prior.logicalId}.`,
      );
    }
  }

  const d1Sql = `${await Bun.file(args.schema).text()}\n${await Bun.file(args.seed).text()}\n${await Bun.file(args.exactRegistration).text()}\n${await Bun.file(args.mapRegistration).text()}`;
  const projectionDb = new Database(":memory:");
  projectionDb.exec(d1Sql);
  bindCandidateMapManifestLogicalKey(projectionDb, args.finalMapManifestKey);
  const d1 = servingD1ProjectionInventory(projectionDb, args.month);
  const artifactDescriptors = [...artifacts.values()].toSorted((left, right) =>
    left.logicalId.localeCompare(right.logicalId),
  );
  const datasets = datasetCoverage(freshness, release);
  const semanticInputFingerprint = servingSha256(
    canonicalServingJson({
      datasets,
      d1ProjectionSha256: d1.projectionSha256,
      artifacts: artifactDescriptors.map((artifact) => ({
        logicalId: artifact.logicalId,
        sha256: artifact.sha256,
      })),
    }),
  );
  const candidate = buildServingCandidateFromDescriptors({
    schemaVersion: 1,
    semanticInputFingerprint,
    sourceCommit: args.sourceCommit,
    builderVersions: [
      { name: "gen17-reviewed-catchup", version: "1" },
      { name: "plan106-resolved-transit-consumer", version: "1" },
    ],
    datasets,
    d1: {
      projectionSchema: "bp.d1.serving.v2",
      projectionSha256: d1.projectionSha256,
      rowCounts: d1.rowCounts,
    },
    exactIdentity: {
      projectionSha256: d1.exactIdentityProjectionSha256,
      routeCount: d1.exactIdentityRouteCount,
    },
    artifacts: artifactDescriptors,
  });

  const candidateSeed = renderServingD1CandidateSeedSql(
    projectionDb,
    candidate.manifest.candidateId,
    args.month,
  );
  projectionDb.close();

  await mkdir(args.output, { recursive: true });
  await materializeCandidateObjects({
    objectRoot: join(args.output, "objects"),
    descriptors: artifactDescriptors,
    sourcePaths,
  });
  const uploadInventory = `${canonicalServingJson({ schemaVersion: 1, entries: uploads })}\n`;
  const candidateSeedBytes = new TextEncoder().encode(candidateSeed);
  const stagePlan = `${canonicalServingJson({
    schemaVersion: 1,
    sourceCommit: args.sourceCommit,
    activeCandidateId: "a8a3747fc2889d8d32daab2b5705efc2991349732c5cf991f1a6b271d2d226d5",
    plan106CandidateId: active.plan106CandidateId,
    candidateId: candidate.manifest.candidateId,
    candidateManifestKey: candidate.manifestKey,
    candidateManifestSha256: candidate.manifestSha256,
    semanticInputFingerprint,
    releaseId: release.releaseId,
    publishedAt: release.publishedAt,
    compatibilityCoverageEnd: args.month,
    artifactCount: candidate.manifest.artifacts.length,
    rebuiltInventoryArtifactCount: recovery.manifest.entries.length,
    reusedArtifactCount,
    uploadArtifactCount: uploads.length,
    uploadBytes: uploads.reduce((sum, entry) => sum + entry.bytes, 0),
    candidateSeedSha256: servingSha256(candidateSeedBytes),
    candidateSeedBytes: candidateSeedBytes.byteLength,
    d1,
  })}\n`;
  await Promise.all([
    Bun.write(join(args.output, "candidate.manifest.json"), candidate.manifestBytes),
    Bun.write(join(args.output, "candidate-seed.sql"), candidateSeedBytes),
    Bun.write(join(args.output, "upload-inventory.json"), uploadInventory),
    Bun.write(join(args.output, "stage-plan.json"), stagePlan),
    Bun.write(join(args.output, "recovery-artifact-manifest.json"), recovery.manifestText),
  ]);
  console.log(
    JSON.stringify({
      candidateId: candidate.manifest.candidateId,
      manifestSha256: candidate.manifestSha256,
      artifactCount: candidate.manifest.artifacts.length,
      uploadArtifactCount: uploads.length,
      uploadBytes: uploads.reduce((sum, entry) => sum + entry.bytes, 0),
      candidateSeedSha256: servingSha256(candidateSeedBytes),
    }),
  );
}

await main();
