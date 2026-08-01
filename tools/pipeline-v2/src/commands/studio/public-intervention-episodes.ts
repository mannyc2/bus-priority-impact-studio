import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listInterventionEvents } from "@bp/db/local";
import { StudioInterventionCorpusSchema } from "@bp/domain/studio";
import {
  publicInterventionCandidateRootKey,
  publicInterventionEpisodesCandidateKey,
  publicInterventionEpisodesKey,
  publicRouteInterventionHistoryCandidateKey,
  publicRouteInterventionHistoryKey,
} from "@bp/domain/studio/public-intervention-episodes";
import { StudyIndexArtifactSchema } from "@bp/domain/studio/study";
import { arg, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { Effect } from "effect";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromRepoRoot } from "../../lib/paths.ts";
import { buildPublicInterventionEpisodes } from "../../lib/public-intervention-episodes.ts";
import { importPinnedResolvedTransitPublicPack } from "../../lib/resolved-transit-public-pack.ts";
import { RESOLVED_TRANSIT_RELEASE_PIN } from "../../lib/resolved-transit-release-pin.ts";

const CORPUS_PATH = fromRepoRoot("data/artifacts/studio/v2/interventions/corpus.json");
const STUDY_INDEX_PATH = fromRepoRoot("data/artifacts/studio/v2/studies/index.json");

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function jsonSha256(value: unknown): string {
  return createHash("sha256")
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest("hex");
}

export default defineCommand({
  path: ["studio", "public-intervention-episodes"],
  summary:
    "Verify the published resolved-pack-v1-production producer release and build an unpublished Tracker candidate.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
      releaseRoot: Schema.String.check(Schema.isMinLength(1)).annotate({
        description:
          "Extracted published resolved-pack-v1-production producer release beneath data/raw/mta-wiki/releases",
      }),
      validateOnly: arg
        .boolean()
        .pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(false)))
        .annotate({ description: "Verify all inputs and conformance without writing a candidate" }),
    }),
  },
  output: Schema.Struct({
    candidateId: Schema.String,
    candidateRootPath: Schema.NullOr(Schema.String),
    artifactMapPath: Schema.NullOr(Schema.String),
    handoffPath: Schema.NullOr(Schema.String),
    producerReleaseId: Schema.String,
    producerManifestSha256: Schema.String,
    publicManifestSha256: Schema.String,
    acceptedLedgerSha256: Schema.String,
    normalizedPackSha256: Schema.String,
    episodeCount: Schema.Number,
    producerEpisodeCount: Schema.Number,
    producerComponentCount: Schema.Number,
    producerPlacementCount: Schema.Number,
    producerRouteKeyCount: Schema.Number,
    producerTreatmentFamilyCount: Schema.Number,
    producerHistoryRowCount: Schema.Number,
    producerCurrentFootprintCount: Schema.Number,
    producerSourceCount: Schema.Number,
    trackerEnrichmentEpisodeCount: Schema.Number,
    routeArtifactCount: Schema.Number,
    episodeRouteMembershipCount: Schema.Number,
    unexplainedDispositionCount: Schema.Number,
    validateOnly: Schema.Boolean,
  }),
  async run({ input }) {
    const imported = await importPinnedResolvedTransitPublicPack(input.options.releaseRoot);
    const artifactRoot = defaultArtifactRootPath();
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: "studio.public-intervention-episodes",
      operation: "buildResolvedTransitPublicInterventionCandidate",
      run: async (local) => {
        const [corpus, studies, registryEvents, corpusHash, studyHash] = await Promise.all([
          readJsonArtifact(CORPUS_PATH, StudioInterventionCorpusSchema, "strict"),
          readJsonArtifact(STUDY_INDEX_PATH, StudyIndexArtifactSchema, "strict"),
          listInterventionEvents(local.db),
          sha256File(CORPUS_PATH),
          sha256File(STUDY_INDEX_PATH),
        ]);
        const aceRows = registryEvents
          .filter((event) => event.sourceId === "mta_ace_routes")
          .toSorted((left, right) => left.eventId.localeCompare(right.eventId));
        const aceRegistryHash = createHash("sha256").update(JSON.stringify(aceRows)).digest("hex");
        const built = buildPublicInterventionEpisodes({
          imported,
          corpus,
          studies,
          registryEvents: aceRows,
          sourceHashes: {
            corpusArtifact: corpusHash,
            studyIndexArtifact: studyHash,
            aceRegistry: aceRegistryHash,
          },
        });

        const candidateRootKey = publicInterventionCandidateRootKey(built.candidateId);
        const candidateRootPath = join(artifactRoot, candidateRootKey);
        const globalKey = publicInterventionEpisodesCandidateKey(built.candidateId);
        const globalPath = join(artifactRoot, globalKey);
        const auditKey = `${candidateRootKey}/operator/conformance.json`;
        const auditPath = join(artifactRoot, auditKey);
        const artifactMapKey = `${candidateRootKey}/artifact-map.json`;
        const artifactMapPath = join(artifactRoot, artifactMapKey);
        const handoffKey = `${candidateRootKey}/handoff.json`;
        const handoffPath = join(artifactRoot, handoffKey);
        const routeEntries = built.routeArtifacts.map((artifact) => {
          const physicalKey = publicRouteInterventionHistoryCandidateKey(
            built.candidateId,
            artifact.route.routeKey,
          );
          return {
            role: "public_route_history",
            logicalKey: publicRouteInterventionHistoryKey(artifact.route.routeKey),
            physicalKey,
            schemaId: "bp.studio.route_intervention_history.v2",
            mediaType: "application/json",
            sha256: jsonSha256(artifact),
            routeKey: artifact.route.routeKey,
          } as const;
        });
        const artifactMap = {
          artifactKind: "bp.studio.public_intervention_candidate_map.v1",
          schemaVersion: 1,
          candidateId: built.candidateId,
          entries: [
            {
              role: "public_global_episodes",
              logicalKey: publicInterventionEpisodesKey(),
              physicalKey: globalKey,
              schemaId: "bp.studio.public_intervention_episodes.v2",
              mediaType: "application/json",
              sha256: jsonSha256(built.publicArtifact),
              routeKey: null,
            },
            ...routeEntries,
            {
              role: "operator_conformance",
              logicalKey: null,
              physicalKey: auditKey,
              schemaId: "bp.quality.intervention_episode_resolution.v2",
              mediaType: "application/json",
              sha256: jsonSha256(built.auditArtifact),
              routeKey: null,
            },
          ],
        };
        const handoff = {
          artifactKind: "bp.studio.public_intervention_candidate_handoff.v1",
          schemaVersion: 1,
          candidateId: built.candidateId,
          producer: {
            releaseId: RESOLVED_TRANSIT_RELEASE_PIN.releaseId,
            tagTarget: RESOLVED_TRANSIT_RELEASE_PIN.tagTarget,
            generatorCommit: RESOLVED_TRANSIT_RELEASE_PIN.generatorCommit,
            buildId: RESOLVED_TRANSIT_RELEASE_PIN.buildId,
            asOfDate: RESOLVED_TRANSIT_RELEASE_PIN.asOfDate,
            releaseManifestSha256: imported.verified.releaseManifestSha256,
            publicManifestSha256: imported.verified.publicManifestSha256,
          },
          conformance: {
            acceptedLedgerSha256: imported.verified.acceptedDiffLedgerSha256,
            acceptedReceiptSha256: imported.verified.acceptedLedgerReceiptSha256,
            dispositionCounts: imported.conformance.dispositionCounts,
            unexplainedDispositionCount: 0,
          },
          normalizedPackSha256: built.normalizedPackSha256,
          artifactMapSha256: jsonSha256(artifactMap),
          counts: {
            episodeCount: built.publicArtifact.episodes.length,
            producerEpisodeCount: built.publicArtifact.episodes.filter(
              (episode) => episode.authority === "producer",
            ).length,
            producerComponentCount: imported.pack.components.length,
            producerPlacementCount: imported.pack.placements.length,
            producerRouteKeyCount: imported.pack.routes.length,
            producerTreatmentFamilyCount: imported.pack.treatment_families.length,
            producerHistoryRowCount: imported.pack.history.length,
            producerCurrentFootprintCount: imported.pack.current_footprint.length,
            producerSourceCount: imported.pack.sources.length,
            trackerEnrichmentEpisodeCount: built.publicArtifact.episodes.filter(
              (episode) => episode.authority === "tracker_enrichment",
            ).length,
            routeArtifactCount: built.routeArtifacts.length,
            episodeRouteMembershipCount: built.routeArtifacts.reduce(
              (count, artifact) => count + artifact.episodes.length,
              0,
            ),
            trackerEnrichmentCounts: {
              automatedCameraEnforcement: built.publicArtifact.episodes.filter(
                (episode) => episode.authority === "tracker_enrichment",
              ).length,
            },
          },
          activation: {
            state: "blocked_on_plan_098",
            stableKeysWritten: false,
            latestMutated: false,
            deployed: false,
          },
        };

        if (!input.options.validateOnly) {
          await mkdir(dirname(globalPath), { recursive: true });
          await mkdir(dirname(auditPath), { recursive: true });
          await writeJson(globalPath, built.publicArtifact);
          await writeJson(auditPath, built.auditArtifact);
          for (const [index, artifact] of built.routeArtifacts.entries()) {
            const entry = routeEntries[index];
            if (entry === undefined) throw new Error("route artifact map cardinality drift");
            const path = join(artifactRoot, entry.physicalKey);
            await mkdir(dirname(path), { recursive: true });
            await writeJson(path, artifact);
          }
          await writeJson(artifactMapPath, artifactMap);
          await writeJson(handoffPath, handoff);
        }

        return {
          candidateId: built.candidateId,
          candidateRootPath: input.options.validateOnly ? null : candidateRootPath,
          artifactMapPath: input.options.validateOnly ? null : artifactMapPath,
          handoffPath: input.options.validateOnly ? null : handoffPath,
          producerReleaseId: RESOLVED_TRANSIT_RELEASE_PIN.releaseId,
          producerManifestSha256: imported.verified.releaseManifestSha256,
          publicManifestSha256: imported.verified.publicManifestSha256,
          acceptedLedgerSha256: imported.verified.acceptedDiffLedgerSha256,
          normalizedPackSha256: built.normalizedPackSha256,
          episodeCount: handoff.counts.episodeCount,
          producerEpisodeCount: handoff.counts.producerEpisodeCount,
          producerComponentCount: handoff.counts.producerComponentCount,
          producerPlacementCount: handoff.counts.producerPlacementCount,
          producerRouteKeyCount: handoff.counts.producerRouteKeyCount,
          producerTreatmentFamilyCount: handoff.counts.producerTreatmentFamilyCount,
          producerHistoryRowCount: handoff.counts.producerHistoryRowCount,
          producerCurrentFootprintCount: handoff.counts.producerCurrentFootprintCount,
          producerSourceCount: handoff.counts.producerSourceCount,
          trackerEnrichmentEpisodeCount: handoff.counts.trackerEnrichmentEpisodeCount,
          routeArtifactCount: handoff.counts.routeArtifactCount,
          episodeRouteMembershipCount: handoff.counts.episodeRouteMembershipCount,
          unexplainedDispositionCount: 0,
          validateOnly: input.options.validateOnly,
        };
      },
    });
  },
});
