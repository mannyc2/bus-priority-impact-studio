import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudioRouteEvidenceArtifactSchema } from "@bp/domain/studio/route-evidence";
import {
  buildStudioRouteEvidenceArtifact,
  runStudioImportMtaWikiRouteEvidence,
} from "../src/commands/studio/import-mta-wiki-route-evidence.ts";
import { loadMtaWikiCanonicalCorpus, normalizeBusRouteKey } from "../src/lib/mta-wiki-canonical.ts";

const fixtureRoot = join(import.meta.dir, "fixtures", "mta-wiki-route-evidence");
const fixtureMtaWikiRoot = join(fixtureRoot, "mta-wiki");
const fixtureRoutesPath = join(fixtureRoot, "routes.json");

describe("studio import-mta-wiki-route-evidence", () => {
  test("normalizes SBS route aliases to the same Bus route key", () => {
    expect(normalizeBusRouteKey("M15")).toBe("M15");
    expect(normalizeBusRouteKey("M15 SBS")).toBe("M15");
    expect(normalizeBusRouteKey("M15-SBS")).toBe("M15");
    expect(normalizeBusRouteKey("M15+")).toBe("M15");
  });

  test("writes a strict route evidence artifact with route-scoped facts and citations", async () => {
    const root = await mkdtemp(join(tmpdir(), "route-evidence-"));
    try {
      const output = join(root, "route-evidence.json");
      const artifact = await runStudioImportMtaWikiRouteEvidence({
        mtaWikiRoot: fixtureMtaWikiRoot,
        routesPath: fixtureRoutesPath,
        output,
        generatedAt: "2026-06-30T00:00:00.000Z",
        minMatchedRoutes: 1,
      });

      expect(await Bun.file(output).exists()).toBe(true);
      const parsed = StudioRouteEvidenceArtifactSchema.parse(await Bun.file(output).json());
      expect(parsed).toEqual(artifact);
      expect(parsed.artifactKind).toBe("bp.studio.route_evidence.v1");
      expect(parsed.summary).toMatchObject({
        routeCount: 1,
        matchedBusRouteCount: 1,
        citationCount: 5,
        omittedAmbiguousRecordCount: 1,
      });

      const route = parsed.routes[0];
      expect(route?.routeId).toBe("M15+");
      expect(route?.wikiRouteIds).toContain("M15");
      expect(route?.wikiAliases).toContain("M15 SBS");
      expect(route?.timeline).toHaveLength(1);
      expect(route?.timeline[0]?.dateNormalized).toBe("2010-10-10");
      expect(route?.interventions).toHaveLength(1);
      expect(route?.interventions[0]?.projectRecordIds).toEqual(["project_m15_busway"]);
      expect(route?.metricClaims[0]?.metricName).toBe("bus_lane_length");
      expect(route?.projects[0]?.projectName).toBe("M15 bus priority");
      expect(route?.sourceGaps[0]?.gapKind).toBe("missing_before_after");
      const citations = route?.citations ?? [];
      expect(new Set(citations.map((citation) => citation.key)).size).toBe(citations.length);
      expect(route?.citations[0]).toMatchObject({
        sourceId: "m15_sbs_report",
        sourceTitle: "M15 SBS report",
        publisher: "NYC DOT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("builds an in-memory artifact from loaded canonical JSONL", async () => {
    const corpus = await loadMtaWikiCanonicalCorpus(fixtureMtaWikiRoot);
    const routes = (await Bun.file(fixtureRoutesPath).json()) as {
      routes: Parameters<typeof buildStudioRouteEvidenceArtifact>[0]["routes"];
    };
    const artifact = buildStudioRouteEvidenceArtifact({
      generatedAt: "2026-06-30T00:00:00.000Z",
      routes: routes.routes,
      corpus,
    });

    expect(artifact.routes[0]?.coverage).toMatchObject({
      timelineCount: 1,
      interventionCount: 1,
      metricClaimCount: 1,
      projectCount: 1,
      sourceGapCount: 1,
      citationCount: 5,
    });
  });

  test("fails with a line-numbered message when canonical JSONL is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "route-evidence-missing-"));
    try {
      const mtaWikiRoot = join(root, "mta-wiki");
      await mkdir(join(mtaWikiRoot, "data", "canonical"), { recursive: true });

      await expect(
        runStudioImportMtaWikiRouteEvidence({
          mtaWikiRoot,
          routesPath: fixtureRoutesPath,
          output: join(root, "route-evidence.json"),
        }),
      ).rejects.toThrow("mta-wiki canonical JSONL not found");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps raw Bun reads out of the mta-wiki canonical reader", async () => {
    const source = await readFile(
      join(import.meta.dir, "../src/lib/mta-wiki-canonical.ts"),
      "utf8",
    );

    expect(source).toContain("runPipelineFileSystemBoundary");
    expect(source).not.toContain("Bun.file");
  });
});
