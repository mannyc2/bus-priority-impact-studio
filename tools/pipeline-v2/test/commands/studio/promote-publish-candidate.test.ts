import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  type PromoteStudioPublishCandidateOptions,
  promoteStudioPublishCandidate,
} from "../../../src/commands/studio/promote-publish-candidate.ts";
import { fromRepoRoot } from "../../../src/lib/paths.ts";

const workRootRelative = join("data/working/test-promote-studio-publish-candidate");
const workRoot = fromRepoRoot(workRootRelative);
const releaseRelative = join(workRootRelative, "studio/v1/release.json");
const candidateRelative = join(workRootRelative, "candidate.json");

const generatedAt = "2026-05-25T00:00:00.000Z";

async function reset(): Promise<void> {
  await rm(workRoot, { recursive: true, force: true });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const fullPath = fromRepoRoot(path);
  await mkdir(dirname(fullPath), { recursive: true });
  await Bun.write(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

function quality() {
  return {
    releaseLayer: "baseline_release",
    completenessStatus: "partial_public_monthly_only",
    confidence: "medium",
    caveats: ["Fixture release caveat."],
  } as const;
}

function route() {
  return {
    slug: "m1",
    routeId: "M1",
    label: "M1",
    corridor: "M1 Corridor",
    corridorFull: "M1 Corridor",
    borough: "Manhattan",
    sbs: false,
    speedMph: 6.2,
    scheduledMph: 7.4,
    weightedAvgSpeed: 6.2,
    speedPercentile: 50,
    dailyRiders: 10000,
    ridersYoyPct: 0,
    riderHoursLost: 120,
    laneCoverage: 0.2,
    aceStatus: "none",
    aceSince: null,
    tspCoverage: "none",
    reliability: "Studio watch band",
    observedReliability: null,
    diagnosis: "Fixture diagnosis.",
    spark: [6.4, 6.3, 6.2],
    termini: { north: "A", south: "B" },
    miles: 5,
    stops: 20,
    flags: [],
    peerSlug: null,
    interventions: [],
  } as const;
}

function brief(id: string, status: "Published" | "In review", summary: string) {
  return {
    id,
    routeSlug: "m1",
    title: "M1 reliability brief",
    status,
    version: status === "Published" ? "v1" : "v2-candidate",
    generated: generatedAt,
    authors: ["fixture"],
    citationCount: 1,
    summary,
    dek: "Fixture dek.",
    kpis: [
      {
        label: "Observed speed",
        value: "6.2",
        unit: "mph",
        sub: "Fixture",
        tone: "neutral",
      },
    ],
    sections: [{ title: "Summary", body: [summary] }],
    claims: [
      {
        n: 1,
        title: "Slow corridor",
        body: summary,
        strength: 3,
        evidenceIds: ["e1"],
        caveatIds: ["c1"],
        state: "active",
      },
    ],
    evidence: [
      {
        id: "e1",
        kind: "number",
        title: "Observed speed",
        detail: "6.2 mph",
      },
    ],
    caveats: [{ title: "Fixture caveat", body: "Fixture caveat body." }],
    ...(status === "In review"
      ? {
          bodyMd: `${summary}\n\n:::finding{ref="finding_m1"}`,
          blocks: [
            {
              id: "finding_m1",
              type: "finding",
              title: "M1 slow speed finding",
              confidence: "moderate",
              claim: summary,
              supports: ["e1"],
            },
          ],
          refs: [
            {
              id: "block:finding_m1",
              kind: "block",
              blockId: "finding_m1",
              blockType: "finding",
            },
            {
              id: "evidence:e1",
              kind: "evidence",
              evidenceId: "e1",
              role: "primary",
              label: "Observed speed",
            },
          ],
        }
      : {}),
  } as const;
}

function finding() {
  return {
    id: "finding-m1",
    category: "Anomaly",
    routeSlug: "m1",
    title: "M1 slow speed finding",
    body: "Fixture finding body.",
    metric: "6.2 mph",
    confidence: "moderate",
    borough: "Manhattan",
    reasoning: [
      {
        index: 1,
        title: "Observed speed",
        detail: "M1 is slow in the fixture release.",
        source: "Fixture",
        tone: "warn",
      },
    ],
    caveat: {
      title: "Fixture caveat",
      body: "Fixture caveat body.",
    },
    comparableRoutes: [],
  } as const;
}

function release() {
  const publishedBrief = brief("brief-m1", "Published", "Old public summary.");
  return {
    schemaVersion: 1,
    generatedAt,
    quality: quality(),
    routes: [route()],
    segments: [],
    routeArtifacts: [],
    findings: [finding()],
    briefs: [publishedBrief],
    versions: [
      {
        briefId: publishedBrief.id,
        v: publishedBrief.version,
        date: publishedBrief.generated,
        author: "fixture",
        summary: "Old public version.",
        claimsCount: 1,
        citesCount: 1,
        caveatsCount: 1,
      },
    ],
    comments: [],
    methods: [],
    docsSections: [],
    docsEndpoints: [],
  };
}

function candidate() {
  const candidateBrief = brief("draft-m1", "In review", "Reviewed replacement summary.");
  return {
    schemaVersion: 1,
    generatedAt,
    candidateId: "draft-m1:2026-05-25T00:01:00.000Z",
    artifactKey: "studio/v1/publish-candidates/draft-m1.json",
    briefId: candidateBrief.id,
    sourceBriefId: "brief-m1",
    fromFindingId: null,
    status: "publish_candidate",
    version: "v2-candidate",
    publishedAt: "2026-05-25T00:01:00.000Z",
    brief: candidateBrief,
    route: route(),
    history: {
      schemaVersion: 1,
      generatedAt,
      heading: {
        id: candidateBrief.id,
        title: candidateBrief.title,
        version: candidateBrief.version,
        routeSlug: candidateBrief.routeSlug,
        routeLabel: "M1",
        routeSbs: false,
      },
      versions: [],
      diffs: [],
      comments: [
        {
          id: "comment-1",
          briefId: candidateBrief.id,
          claimN: 1,
          kind: "comment",
          author: "reviewer@example.test",
          initials: "RE",
          ago: "now",
          on: "Claim 1",
          body: "Looks good for publication.",
        },
      ],
      quality: quality(),
    },
    audit: {
      validation: {
        score: 100,
        weakClaims: [],
        missingEvidence: [],
        blockingIssues: [],
        validatedAt: "2026-05-25T00:00:30.000Z",
      },
      contentHashes: {
        bodyMd: "0".repeat(64),
        claims: [{ claimN: 1, sha256: "1".repeat(64) }],
        blocks: [],
      },
      reviewThreads: [
        {
          commentId: "review-thread-1",
          kind: "suggested-edit",
          status: "resolved",
          anchor: {
            target: "body",
            targetId: null,
            quote: { exact: "Old wording." },
          },
          suggestion: {
            suggestFrom: "Old wording.",
            suggestTo: "New wording.",
          },
          replyCount: 1,
          createdAt: "2026-05-25T00:00:10.000Z",
          updatedAt: "2026-05-25T00:00:20.000Z",
          resolvedAt: "2026-05-25T00:00:20.000Z",
          resolvedBy: "author@example.test",
        },
      ],
    },
    quality: quality(),
  };
}

function options(overrides: Partial<PromoteStudioPublishCandidateOptions> = {}) {
  return {
    candidatePath: candidateRelative,
    releasePath: releaseRelative,
    outputPath: releaseRelative,
    execute: false,
    ...overrides,
  };
}

afterEach(async () => {
  await reset();
});

describe("studio publish-candidate promotion", () => {
  test("dry-runs the hard cutover target without rewriting release artifacts", async () => {
    await reset();
    await writeJson(releaseRelative, release());
    await writeJson(candidateRelative, candidate());

    const result = await promoteStudioPublishCandidate(options());
    const releaseAfter = await Bun.file(fromRepoRoot(releaseRelative)).json();

    expect(result).toMatchObject({
      dryRun: true,
      targetBriefId: "brief-m1",
      candidateBriefId: "draft-m1",
      replacedExistingBrief: true,
      wroteProjectionCount: 0,
    });
    expect(releaseAfter.briefs[0].summary).toBe("Old public summary.");
  });

  test("promotes the candidate into release projections with no legacy parallel brief", async () => {
    await reset();
    await writeJson(releaseRelative, release());
    await writeJson(candidateRelative, candidate());

    const result = await promoteStudioPublishCandidate(options({ execute: true }));
    const releaseAfter = await Bun.file(fromRepoRoot(releaseRelative)).json();
    const briefsIndex = await Bun.file(
      fromRepoRoot(join(workRootRelative, "studio/v1/briefs.json")),
    ).json();
    const detail = await Bun.file(
      fromRepoRoot(join(workRootRelative, "studio/v1/briefs/brief-m1/index.json")),
    ).json();
    const candidateArchiveExists = await Bun.file(
      fromRepoRoot(join(workRootRelative, "studio/v1/publish-candidates/draft-m1.json")),
    ).exists();
    const candidateArchive = await Bun.file(
      fromRepoRoot(join(workRootRelative, "studio/v1/publish-candidates/draft-m1.json")),
    ).json();

    expect(result.dryRun).toBe(false);
    expect(result.wroteProjectionCount).toBeGreaterThan(0);
    expect(releaseAfter.briefs.map((item: { id: string }) => item.id)).toEqual(["brief-m1"]);
    expect(releaseAfter.briefs[0]).toMatchObject({
      id: "brief-m1",
      status: "Published",
      version: "v2-candidate",
      summary: "Reviewed replacement summary.",
      bodyMd: expect.stringContaining(":::finding"),
    });
    expect(releaseAfter.briefs[0].blocks).toHaveLength(1);
    expect(releaseAfter.briefs[0].refs).toHaveLength(2);
    expect(releaseAfter.comments[0]).toMatchObject({ briefId: "brief-m1" });
    expect(releaseAfter.comments).toHaveLength(1);
    expect(candidateArchive.audit.reviewThreads[0]).toMatchObject({ commentId: "review-thread-1" });
    expect(briefsIndex.briefs.map((item: { brief: { id: string } }) => item.brief.id)).toEqual([
      "brief-m1",
    ]);
    expect(detail.brief.summary).toBe("Reviewed replacement summary.");
    expect(detail.brief.bodyMd).toContain(":::finding");
    expect(detail.brief.blocks[0]).toMatchObject({ id: "finding_m1", type: "finding" });
    expect(detail.brief.refs[0]).toMatchObject({ id: "block:finding_m1" });
    expect(candidateArchiveExists).toBe(true);
  });
});
