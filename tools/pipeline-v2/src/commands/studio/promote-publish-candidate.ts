import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { defineCommand, z } from "@liche/core";
import {
  buildStudioBriefEvidenceProjection,
  buildStudioBriefHistoryProjection,
  buildStudioBriefProjection,
  buildStudioBriefsProjection,
  buildStudioDocsProjection,
  buildStudioFindingProjection,
  buildStudioFindingsProjection,
  buildStudioMethodsProjection,
  buildStudioRouteLadderProjection,
  buildStudioRouteProjection,
  buildStudioRoutesProjection,
  type StudioBrief,
  type StudioBriefPublishCandidateExportResponse,
  StudioBriefPublishCandidateExportResponseSchema,
  type StudioComment,
  type StudioReleasePayload,
  StudioReleasePayloadSchema,
} from "@bp/domain";
import { fromCliPath } from "../../lib/paths.ts";

const defaultReleasePath = "data/artifacts/studio/v1/release.json";
const studioReleaseKeyPrefix = "studio/v1/";

export type PromoteStudioPublishCandidateOptions = {
  candidatePath: string;
  releasePath: string;
  outputPath: string;
  replaceBriefId?: string;
  execute: boolean;
};

export type PromoteStudioPublishCandidateResult = {
  candidatePath: string;
  releasePath: string;
  outputPath: string;
  dryRun: boolean;
  targetBriefId: string;
  sourceBriefId: string | null;
  candidateBriefId: string;
  routeSlug: string;
  artifactPath: string;
  replacedExistingBrief: boolean;
  wroteProjectionCount: number;
};

async function readJson<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  return parse(await Bun.file(path).json());
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function targetBriefIdForCandidate(
  candidate: StudioBriefPublishCandidateExportResponse,
  explicitTarget: string | undefined,
): string {
  return explicitTarget ?? candidate.sourceBriefId ?? candidate.briefId;
}

function promotedBrief(
  candidate: StudioBriefPublishCandidateExportResponse,
  targetBriefId: string,
): StudioBrief {
  return {
    ...candidate.brief,
    id: targetBriefId,
    status: "Published",
    version: candidate.version,
    generated: candidate.publishedAt,
  };
}

function promotedComments(
  candidate: StudioBriefPublishCandidateExportResponse,
  targetBriefId: string,
): StudioComment[] {
  return candidate.history.comments.map((comment: StudioComment) => ({
    ...comment,
    briefId: targetBriefId,
  }));
}

function promoteCandidateIntoRelease(
  release: StudioReleasePayload,
  candidate: StudioBriefPublishCandidateExportResponse,
  targetBriefId: string,
): { release: StudioReleasePayload; replacedExistingBrief: boolean } {
  const routeIndex = release.routes.findIndex((route) => route.slug === candidate.route.slug);
  if (routeIndex === -1) {
    throw new Error(
      `Candidate route ${candidate.route.slug} is not present in the release; rebuild the Studio release before promotion.`,
    );
  }

  const existingTarget = release.briefs.find((brief) => brief.id === targetBriefId);
  if (existingTarget !== undefined && existingTarget.routeSlug !== candidate.brief.routeSlug) {
    throw new Error(
      `Target brief ${targetBriefId} belongs to ${existingTarget.routeSlug}, not ${candidate.brief.routeSlug}.`,
    );
  }

  const promoted = promotedBrief(candidate, targetBriefId);
  const replacedIds = new Set([targetBriefId, candidate.briefId]);
  const generatedAt = new Date().toISOString();
  const routes = [...release.routes];
  routes[routeIndex] = candidate.route;

  return {
    release: StudioReleasePayloadSchema.parse({
      ...release,
      generatedAt,
      routes,
      briefs: [...release.briefs.filter((brief) => !replacedIds.has(brief.id)), promoted].sort(
        (left, right) => left.routeSlug.localeCompare(right.routeSlug),
      ),
      versions: [
        ...release.versions.filter((version) => !replacedIds.has(version.briefId)),
        {
          briefId: targetBriefId,
          v: promoted.version,
          date: candidate.publishedAt,
          author: promoted.authors[0] ?? "Studio publish-candidate promotion",
          summary: `Promoted from Studio publish candidate ${candidate.candidateId}.`,
          claimsCount: promoted.claims.length,
          citesCount: promoted.evidence.length,
          caveatsCount: promoted.caveats.length,
        },
      ],
      comments: [
        ...release.comments.filter((comment) => !replacedIds.has(comment.briefId)),
        ...promotedComments(candidate, targetBriefId),
      ],
    }),
    replacedExistingBrief: existingTarget !== undefined,
  };
}

function candidateArtifactPath(
  outputPath: string,
  candidate: StudioBriefPublishCandidateExportResponse,
): string {
  const outputDir = dirname(resolve(outputPath));
  const relativeKey = candidate.artifactKey.startsWith(studioReleaseKeyPrefix)
    ? candidate.artifactKey.slice(studioReleaseKeyPrefix.length)
    : `publish-candidates/${candidate.briefId}.json`;
  return resolve(outputDir, relativeKey);
}

async function writeProjectionSet(
  outputPath: string,
  release: StudioReleasePayload,
  candidate: StudioBriefPublishCandidateExportResponse,
): Promise<{ artifactPath: string; wroteProjectionCount: number }> {
  const outputDir = dirname(resolve(outputPath));
  const artifactPath = candidateArtifactPath(outputPath, candidate);
  let wroteProjectionCount = 0;

  await rm(outputDir, { recursive: true, force: true });
  await writeJson(outputPath, release);
  wroteProjectionCount += 1;
  await writeJson(resolve(outputDir, "routes.json"), buildStudioRoutesProjection(release));
  wroteProjectionCount += 1;
  await writeJson(resolve(outputDir, "findings.json"), buildStudioFindingsProjection(release));
  wroteProjectionCount += 1;
  await writeJson(resolve(outputDir, "briefs.json"), buildStudioBriefsProjection(release));
  wroteProjectionCount += 1;
  await writeJson(resolve(outputDir, "methods.json"), buildStudioMethodsProjection(release));
  wroteProjectionCount += 1;
  await writeJson(resolve(outputDir, "docs.json"), buildStudioDocsProjection(release));
  wroteProjectionCount += 1;

  for (const route of release.routes) {
    await writeJson(
      resolve(outputDir, "routes", route.slug, "index.json"),
      buildStudioRouteProjection(release, route),
    );
    wroteProjectionCount += 1;
    await writeJson(
      resolve(outputDir, "routes", route.slug, "ladder.json"),
      buildStudioRouteLadderProjection(release, route),
    );
    wroteProjectionCount += 1;
  }

  for (const finding of release.findings) {
    const projection = buildStudioFindingProjection(release, finding);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "findings", finding.id, "index.json"), projection);
      wroteProjectionCount += 1;
    }
  }

  for (const brief of release.briefs) {
    const projection = buildStudioBriefProjection(release, brief);
    if (projection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "index.json"), projection);
      wroteProjectionCount += 1;
    }
    const evidenceProjection = buildStudioBriefEvidenceProjection(release, brief);
    if (evidenceProjection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "evidence.json"), evidenceProjection);
      wroteProjectionCount += 1;
    }
    const historyProjection = buildStudioBriefHistoryProjection(release, brief);
    if (historyProjection !== undefined) {
      await writeJson(resolve(outputDir, "briefs", brief.id, "history.json"), historyProjection);
      wroteProjectionCount += 1;
    }
  }

  await writeJson(artifactPath, candidate);
  wroteProjectionCount += 1;

  return { artifactPath, wroteProjectionCount };
}

function displayPath(path: string): string {
  const cwd = process.cwd();
  const resolved = resolve(path);
  const relativePath = relative(cwd, resolved);
  return relativePath.length > 0 && !relativePath.startsWith(`..${sep}`) ? relativePath : resolved;
}

export async function promoteStudioPublishCandidate(
  options: PromoteStudioPublishCandidateOptions,
): Promise<PromoteStudioPublishCandidateResult> {
  const candidatePath = fromCliPath(options.candidatePath);
  const releasePath = fromCliPath(options.releasePath);
  const outputPath = fromCliPath(options.outputPath);
  const candidate = await readJson(candidatePath, (value) =>
    StudioBriefPublishCandidateExportResponseSchema.parse(value),
  );
  const release = await readJson(releasePath, (value) => StudioReleasePayloadSchema.parse(value));
  const targetBriefId = targetBriefIdForCandidate(candidate, options.replaceBriefId);
  const promoted = promoteCandidateIntoRelease(release, candidate, targetBriefId);
  const artifactPath = candidateArtifactPath(outputPath, candidate);
  const writeResult = options.execute
    ? await writeProjectionSet(outputPath, promoted.release, candidate)
    : { artifactPath, wroteProjectionCount: 0 };

  return {
    candidatePath: displayPath(candidatePath),
    releasePath: displayPath(releasePath),
    outputPath: displayPath(outputPath),
    dryRun: !options.execute,
    targetBriefId,
    sourceBriefId: candidate.sourceBriefId ?? null,
    candidateBriefId: candidate.briefId,
    routeSlug: candidate.brief.routeSlug,
    artifactPath: displayPath(writeResult.artifactPath),
    replacedExistingBrief: promoted.replacedExistingBrief,
    wroteProjectionCount: writeResult.wroteProjectionCount,
  };
}

export default defineCommand({
  path: ["studio", "promote-publish-candidate"],
  summary: "Promote a Studio publish candidate into the release projection set.",
  input: {
    options: z.object({
      candidate: z.string().min(1).describe("Path to the publish-candidate JSON (required)"),
      release: z.string().optional().describe("Path to the existing Studio release JSON"),
      output: z.string().optional().describe("Path to write the promoted release JSON"),
      replaceBriefId: z.string().optional().describe("Explicit target brief id to replace"),
      execute: z.coerce
        .boolean()
        .default(false)
        .describe("Write projections (default is dry-run)"),
    }),
  },
  output: z.object({
    candidatePath: z.string(),
    releasePath: z.string(),
    outputPath: z.string(),
    dryRun: z.boolean(),
    targetBriefId: z.string(),
    sourceBriefId: z.string().nullable(),
    candidateBriefId: z.string(),
    routeSlug: z.string(),
    artifactPath: z.string(),
    replacedExistingBrief: z.boolean(),
    wroteProjectionCount: z.number(),
  }),
  async run({ input }) {
    const releasePath = input.options.release ?? defaultReleasePath;
    const outputPath = input.options.output ?? releasePath;
    return promoteStudioPublishCandidate({
      candidatePath: input.options.candidate,
      releasePath,
      outputPath,
      ...(input.options.replaceBriefId === undefined
        ? {}
        : { replaceBriefId: input.options.replaceBriefId }),
      execute: input.options.execute,
    });
  },
});
