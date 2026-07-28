import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { listInterventionEvents } from "@bp/db/local";
import { MtaWikiOperationalOccurrenceImportArtifactV5Schema } from "@bp/domain/documents/operational-occurrence";
import {
  RouteDossierSummarySchema,
  StudioInterventionCorpusSchema,
  StudioRouteEvidenceArtifactV2Schema,
} from "@bp/domain/studio";
import {
  publicInterventionEpisodesKey,
  publicRouteInterventionHistoryKey,
} from "@bp/domain/studio/public-intervention-episodes";
import { StudyIndexArtifactSchema } from "@bp/domain/studio/study";
import { defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import { readJsonArtifact, writeJson } from "../../lib/json.ts";
import { dbOptions } from "../../lib/local-db.ts";
import { defaultArtifactRootPath, fromRepoRoot } from "../../lib/paths.ts";
import { buildPublicInterventionEpisodes } from "../../lib/public-intervention-episodes.ts";

const OCCURRENCES_PATH = fromRepoRoot(
  "data/artifacts/studio/v2/wiki/operational-occurrences-v3-v1-rc25.json",
);
const ROUTE_EVIDENCE_PATH = fromRepoRoot(
  "data/artifacts/studio/v2/wiki/route-evidence-v1-rc25.json",
);
const CORPUS_PATH = fromRepoRoot("data/artifacts/studio/v2/interventions/corpus.json");
const STUDY_INDEX_PATH = fromRepoRoot("data/artifacts/studio/v2/studies/index.json");
const AUDIT_PATH = fromRepoRoot("data/artifacts/quality/intervention-episode-resolution.json");
const REVIEW_ROUTE_SLUGS = ["m15-sbs", "q52-sbs", "bx41", "b44", "b44-sbs", "bx38"] as const;

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export default defineCommand({
  path: ["studio", "public-intervention-episodes"],
  summary:
    "Build display-ready public intervention episodes and a separate operator resolution audit.",
  input: {
    options: Schema.Struct({
      ...dbOptions.fields,
    }),
  },
  output: Schema.Struct({
    publicOutputPath: Schema.String,
    auditOutputPath: Schema.String,
    episodeCount: Schema.Number,
    routeArtifactCount: Schema.Number,
    registryEventCount: Schema.Number,
  }),
  async run({ input }) {
    const artifactRoot = defaultArtifactRootPath();
    const publicOutputPath = join(artifactRoot, publicInterventionEpisodesKey());
    return runLocalDbCommandBoundary({
      dbPath: input.options.db,
      localDbOptions: { readonly: true },
      command: "studio.public-intervention-episodes",
      operation: "buildPublicInterventionEpisodes",
      run: async (local) => {
        const [
          occurrences,
          routeEvidence,
          corpus,
          studies,
          registryEvents,
          occurrenceHash,
          routeEvidenceHash,
          corpusHash,
          studyHash,
        ] = await Promise.all([
          readJsonArtifact(
            OCCURRENCES_PATH,
            MtaWikiOperationalOccurrenceImportArtifactV5Schema,
            "strict",
          ),
          readJsonArtifact(ROUTE_EVIDENCE_PATH, StudioRouteEvidenceArtifactV2Schema, "strict"),
          readJsonArtifact(CORPUS_PATH, StudioInterventionCorpusSchema, "strict"),
          readJsonArtifact(STUDY_INDEX_PATH, StudyIndexArtifactSchema, "strict"),
          listInterventionEvents(local.db),
          sha256File(OCCURRENCES_PATH),
          sha256File(ROUTE_EVIDENCE_PATH),
          sha256File(CORPUS_PATH),
          sha256File(STUDY_INDEX_PATH),
        ]);
        const aceRows = registryEvents
          .filter((event) => event.sourceId === "mta_ace_routes")
          .toSorted((left, right) => left.eventId.localeCompare(right.eventId));
        const aceRegistryHash = createHash("sha256").update(JSON.stringify(aceRows)).digest("hex");
        const dossiers = new Map();
        for (const slug of REVIEW_ROUTE_SLUGS) {
          const path = join(artifactRoot, `studio/v2/routes/${slug}/dossier.json`);
          const file = Bun.file(path);
          if (!(await file.exists())) continue;
          dossiers.set(slug, await readJsonArtifact(path, RouteDossierSummarySchema, "strict"));
        }

        const built = buildPublicInterventionEpisodes({
          // Keep the serving release byte-stable for identical reviewed inputs.
          // Publishing a new upstream route-evidence release advances this value.
          generatedAt: routeEvidence.generatedAt,
          occurrences,
          routeEvidence,
          corpus,
          studies,
          registryEvents: aceRows,
          dossiers,
          sourceHashes: {
            occurrenceArtifact: occurrenceHash,
            routeEvidenceArtifact: routeEvidenceHash,
            corpusArtifact: corpusHash,
            studyIndexArtifact: studyHash,
            aceRegistry: aceRegistryHash,
          },
        });
        await mkdir(dirname(publicOutputPath), { recursive: true });
        await mkdir(dirname(AUDIT_PATH), { recursive: true });
        await writeJson(publicOutputPath, built.publicArtifact);
        await writeJson(AUDIT_PATH, built.auditArtifact);
        for (const artifact of built.routeArtifacts) {
          const path = join(artifactRoot, publicRouteInterventionHistoryKey(artifact.route.slug));
          await mkdir(dirname(path), { recursive: true });
          await writeJson(path, artifact);
        }
        return {
          publicOutputPath,
          auditOutputPath: AUDIT_PATH,
          episodeCount: built.publicArtifact.episodes.length,
          routeArtifactCount: built.routeArtifacts.length,
          registryEventCount: aceRows.length,
        };
      },
    });
  },
});
