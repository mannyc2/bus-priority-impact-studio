import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  projectPublishableInterventions,
  projectPublishableInterventionToStudio,
  type PromotedIntervention,
  type PromotionArtifact,
} from "../../../../src/commands/docs/tier2/_shared.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(
  process.cwd(),
  "test",
  ".tmp-project-publishable-interventions",
);

function makeRecord(overrides: Partial<PromotedIntervention>): PromotedIntervention {
  return {
    recordId: "document_intervention:test:000001",
    sourceId: "test_source",
    disposition: "publish_candidate",
    timelineLayer: "canonical_milestone",
    status: "implemented",
    recordKind: "implemented",
    routes: ["BX12"],
    serviceMode: "sbs",
    primaryTreatments: ["bus_lane"],
    customTreatments: [],
    corridor: { streets: ["Fordham Road"] },
    effectiveDate: "2008",
    datePrecision: "year",
    statusHistory: [],
    treatmentComponents: [],
    metrics: [],
    caveats: [],
    evidenceCandidateIds: ["c1"],
    evidencePreviews: [
      {
        candidateId: "c1",
        sourceLabel: "Source Title",
        sourceUrl: "https://example.org/source",
        quote: "Bus lane installed in 2008.",
      },
    ],
    review: {
      disposition: "publish_candidate",
      confidence: "high",
      rationale: null,
      issueTags: [],
    },
    ...overrides,
  };
}

async function seedPublishable(
  caseName: string,
  records: PromotedIntervention[],
): Promise<{ publishableArtifactPath: string }> {
  const dir = join(workingRoot, caseName);
  await rm(dir, { force: true, recursive: true });
  await mkdir(dir, { recursive: true });
  const publishableArtifactPath = join(dir, "publishable.json");
  const artifact: PromotionArtifact = {
    version: 1,
    generatedAt: "2026-05-27T00:00:00.000Z",
    reviewedCorpusPath: "fixture",
    manualReviewPath: "fixture",
    candidateCorpusPath: "fixture",
    outputPath: publishableArtifactPath,
    summary: {
      reviewedRecordCount: records.length,
      manualReviewCount: records.length,
      publishableTotal: records.length,
      publishableByLayer: { canonical_milestone: 0, planned_or_proposed: 0 },
      publishableByStatus: { implemented: 0, planned: 0, proposed: 0 },
      publishableSourceCount: new Set(records.map((r) => r.sourceId)).size,
      publishableRouteCount: new Set(records.flatMap((r) => r.routes)).size,
      excludedByDisposition: {},
      recordsWithoutReview: [],
      dispositionVsRecordKindConflicts: [],
    },
    publishableInterventions: records,
  };
  await writeJson(publishableArtifactPath, artifact);
  return { publishableArtifactPath };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("projectPublishableInterventionToStudio", () => {
  test("populates the StudioIntervention shape from a publish_candidate record", () => {
    const projected = projectPublishableInterventionToStudio(makeRecord({}));
    expect(projected.timelineLayer).toBe("canonical_milestone");
    expect(projected.qualityTier).toBe("canonical_milestone");
    expect(projected.status).toBe("implemented");
    expect(projected.tone).toBe("good");
    expect(projected.year).toBe("2008");
    expect(projected.title).toBe("Bus Lane on Fordham Road");
    expect(projected.interventionType).toBe("bus_lane");
    expect(projected.sourceLabel).toBe("Source Title");
    expect(projected.sourceLinks).toEqual([
      { label: "Source Title", url: "https://example.org/source" },
    ]);
  });

  test("planned_layer_candidate maps to warn tone and planned_or_proposed layer", () => {
    const projected = projectPublishableInterventionToStudio(
      makeRecord({
        disposition: "planned_layer_candidate",
        timelineLayer: "planned_or_proposed",
        status: "planned",
      }),
    );
    expect(projected.timelineLayer).toBe("planned_or_proposed");
    expect(projected.qualityTier).toBe("planned_or_proposed");
    expect(projected.status).toBe("planned");
    expect(projected.tone).toBe("warn");
  });

  test("falls back to a route-based title when no corridor streets", () => {
    const projected = projectPublishableInterventionToStudio(
      makeRecord({ corridor: null, routes: ["B44"] }),
    );
    expect(projected.title).toBe("Bus Lane — B44");
  });

  test("uses a route-specific title for multi-route projections", () => {
    const projected = projectPublishableInterventionToStudio(
      makeRecord({
        routes: ["M15", "B44", "BX41"],
        corridor: { streets: ["Hylan Boulevard"] },
        primaryTreatments: ["transit_signal_priority"],
      }),
      "M15",
    );
    expect(projected.title).toBe("Transit Signal Priority — M15");
  });
});

describe("projectPublishableInterventions", () => {
  test("fans records out per route, dropping records with no routes", async () => {
    const { publishableArtifactPath } = await seedPublishable("fanout", [
      makeRecord({ recordId: "r1", routes: ["BX12", "B44"] }),
      makeRecord({ recordId: "r2", routes: ["BX12"] }),
      makeRecord({ recordId: "r3", routes: [] }), // dropped
    ]);
    const artifact = await projectPublishableInterventions({
      publishableArtifactPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(artifact.summary.publishableRecordCount).toBe(3);
    expect(artifact.summary.projectedInterventionEntryCount).toBe(3);
    expect(artifact.summary.routeCount).toBe(2);
    expect(artifact.summary.droppedNoRoutesCount).toBe(1);
    expect(artifact.interventionsByRoute["BX12"]).toHaveLength(2);
    expect(artifact.interventionsByRoute["B44"]).toHaveLength(1);
  });

  test("normalizes route keys to uppercase and strips trailing +", async () => {
    const { publishableArtifactPath } = await seedPublishable("route-key", [
      makeRecord({ recordId: "r1", routes: ["m14+", "Bx12"] }),
    ]);
    const artifact = await projectPublishableInterventions({
      publishableArtifactPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(Object.keys(artifact.interventionsByRoute).sort()).toEqual(["BX12", "M14"]);
  });

  test("projects multi-route records with route-specific titles", async () => {
    const { publishableArtifactPath } = await seedPublishable("multi-route-title", [
      makeRecord({
        recordId: "r1",
        routes: ["M15", "B44"],
        corridor: { streets: ["Hylan Boulevard"] },
        primaryTreatments: ["transit_signal_priority"],
      }),
    ]);
    const artifact = await projectPublishableInterventions({
      publishableArtifactPath,
      generatedAt: "2026-05-27T00:00:00.000Z",
    });
    expect(artifact.interventionsByRoute["M15"]?.[0]?.title).toBe(
      "Transit Signal Priority — M15",
    );
    expect(artifact.interventionsByRoute["B44"]?.[0]?.title).toBe(
      "Transit Signal Priority — B44",
    );
  });
});
