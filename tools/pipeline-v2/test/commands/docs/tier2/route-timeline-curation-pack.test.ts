import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildRouteTimelineCurationPack,
  runRouteTimelineCurationPack,
} from "../../../../src/commands/docs/tier2/_route-timeline-curation-pack.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-route-timeline-curation-pack");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

function baseSurface(input: Record<string, unknown>) {
  return {
    surfaceId: "surface",
    surfaceKind: "claim",
    sourceId: "source-a",
    sourceTitle: "Source A",
    sourceGroup: "bus_priority_document",
    pageNumbers: [1],
    sourceInvestigationId: null,
    runId: "run-a",
    shardId: "shard-a",
    windowId: "source-a:1",
    draftIndex: 0,
    artifactPath: "/repo/artifacts/source-a/p1/artifact.json",
    auditPath: "/repo/artifacts/source-a/p1/audit.json",
    payloadSchemaId: "bp.claim.v1",
    displayLabel: "Surface",
    rawText: "Surface text.",
    canonicalPayload: {},
    lifecycle: null,
    intendedUses: ["detector_evidence"],
    confidence: null,
    routeIds: [],
    coarseFamilies: [],
    mappedFieldCount: 0,
    unresolvedFieldCount: 0,
    evidencePointerIds: [],
    ...input,
  };
}

function fieldRow(input: Record<string, unknown>) {
  return {
    surfaceId: "surface",
    sourceId: "source-a",
    sourceGroup: "bus_priority_document",
    pageNumbers: [1],
    surfaceKind: "event_candidate",
    keyId: "eventFamily",
    sourceFieldPath: "raw.eventFamilyRaw",
    targetPayloadPath: "canonical.eventFamily",
    rawValue: "implementation milestone",
    canonicalLeafId: "implementation_milestone",
    canonicalLeafLabel: "Implementation milestone",
    coarseFamily: "project_delivery",
    modifiers: {
      routeIds: [],
      directions: [],
      periods: [],
      geographies: [],
      modes: ["bus"],
    },
    evidence: {
      fieldSupportFound: true,
      supportIds: ["support-1"],
      evidencePointerIds: ["ev-1"],
    },
    projectionInputCount: 1,
    ...input,
  };
}

async function seedConsumerIndex(): Promise<{
  consumerIndexPath: string;
  materializedViewsPath: string;
}> {
  const consumerIndexPath = join(workingRoot, "vocab-consumer-index.json");
  const materializedViewsPath = join(workingRoot, "vocab-materialized-views.json");
  await writeJson(consumerIndexPath, {
    artifactKind: "bp.tier2_vocab_consumer_index.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T20:00:00.000Z",
    sourceSurfaceApplicationPath: "/repo/surface-application.json",
    sourceSurfaceApplicationGeneratedAt: "2026-06-06T19:00:00.000Z",
    sourceProjectionPath: "/repo/projection.json",
    summary: {
      surfaceRowCount: 6,
      fieldRowCount: 3,
      unresolvedRowCount: 1,
      sourceRowCount: 2,
    },
    surfaceRows: [
      baseSurface({
        surfaceId: "surface-service",
        surfaceKind: "service_change_candidate",
        displayLabel: "B46 SBS began operating in July 2016",
        rawText: "B46 Select Bus Service began operating in July 2016.",
        canonicalPayload: {
          routeIds: ["B46+"],
          dateText: "July 2016",
          eventStatus: "implemented",
          treatmentFamily: "select_bus_service",
        },
        intendedUses: ["public_timeline_candidate", "event_study_window"],
        routeIds: ["B46+"],
        coarseFamilies: ["project_delivery"],
        mappedFieldCount: 2,
        evidencePointerIds: ["ev-surface"],
      }),
      baseSurface({
        surfaceId: "surface-event",
        surfaceKind: "event_candidate",
        sourceId: "source-b",
        sourceTitle: "Source B",
        pageNumbers: [9],
        artifactPath: "/repo/artifacts/source-b/p9/artifact.json",
        auditPath: "/repo/artifacts/source-b/p9/audit.json",
        displayLabel: "Utica Avenue bus lanes planned",
        rawText: "Additional bus lanes were part of the Utica Avenue SBS plan.",
        canonicalPayload: {
          routeIds: ["B46"],
          month: "2015-09",
          eventFamily: "planned_intervention",
          treatmentFamily: "bus_lane",
        },
        intendedUses: ["public_timeline_candidate"],
        routeIds: ["B46"],
        mappedFieldCount: 1,
      }),
      baseSurface({
        surfaceId: "surface-treatment",
        surfaceKind: "treatment_component",
        displayLabel: "Treatment: transit signal priority",
        rawText: "Completed Fall 2015: Transit signal priority was listed for the corridor.",
        canonicalPayload: {
          routeIds: ["B46"],
          treatmentFamily: "transit_signal_priority",
        },
        intendedUses: ["causal_treatment_inventory", "detector_evidence"],
        routeIds: ["B46"],
        unresolvedFieldCount: 1,
      }),
      baseSurface({
        surfaceId: "surface-metric",
        surfaceKind: "metric_observation",
        displayLabel: "B46 carried 50,000 riders per day",
        rawText: "The B46 carried nearly 50,000 riders per day.",
        canonicalPayload: {
          routeIds: ["B46"],
          metricFamily: "average_weekday_ridership",
          metricUnit: "passengers_per_day",
        },
        intendedUses: ["brief_claim_seed", "detector_context"],
        routeIds: ["B46"],
      }),
      baseSurface({
        surfaceId: "surface-context",
        surfaceKind: "context_signal",
        displayLabel: "Community board outreach",
        rawText: "Community board outreach discussed the B46 project.",
        canonicalPayload: {
          routeIds: ["B46"],
          contextKind: "public_outreach",
        },
        intendedUses: ["public_timeline_candidate"],
        routeIds: ["B46"],
      }),
      baseSurface({
        surfaceId: "surface-off-route",
        surfaceKind: "event_candidate",
        displayLabel: "Q1 service change",
        rawText: "Q1 service changed.",
        canonicalPayload: {
          routeIds: ["Q1"],
          month: "2016-07",
        },
        intendedUses: ["public_timeline_candidate"],
        routeIds: ["Q1"],
      }),
    ],
    fieldRows: [
      fieldRow({
        surfaceId: "surface-service",
        surfaceKind: "service_change_candidate",
        keyId: "eventFamily",
        rawValue: "SBS launch",
        canonicalLeafId: "implementation_milestone",
        canonicalLeafLabel: "Implementation milestone",
        evidence: {
          fieldSupportFound: true,
          supportIds: ["support-service"],
          evidencePointerIds: ["ev-service"],
        },
      }),
      fieldRow({
        surfaceId: "surface-service",
        surfaceKind: "service_change_candidate",
        keyId: "eventTreatmentFamily",
        rawValue: "Select Bus Service",
        canonicalLeafId: "select_bus_service",
        canonicalLeafLabel: "Select Bus Service",
        coarseFamily: "bus_priority_treatment",
      }),
      fieldRow({
        surfaceId: "surface-event",
        sourceId: "source-b",
        sourceGroup: "bus_priority_document",
        pageNumbers: [9],
        surfaceKind: "event_candidate",
        keyId: "eventTreatmentFamily",
        rawValue: "additional bus lanes",
        canonicalLeafId: "bus_lane",
        canonicalLeafLabel: "Bus lane",
        coarseFamily: "bus_priority_treatment",
      }),
    ],
    unresolvedRows: [
      {
        surfaceId: "surface-treatment",
        sourceId: "source-a",
        sourceGroup: "bus_priority_document",
        pageNumbers: [1],
        surfaceKind: "treatment_component",
        keyId: "eventTreatmentFamily",
        sourceFieldPath: "raw.treatment",
        targetPayloadPath: "canonical.treatmentFamily",
        rawValue: "TSP on Utica",
        decision: "preserve_raw",
        reason: "Specific signal priority treatment text remained raw.",
        coarseFamily: "bus_priority_treatment",
        modifiers: {
          routeIds: ["B46"],
          directions: [],
          periods: [],
          geographies: ["Utica Avenue"],
          modes: ["bus"],
        },
        evidence: {
          fieldSupportFound: false,
          supportIds: ["support-treatment"],
          evidencePointerIds: ["ev-treatment"],
        },
      },
    ],
    sourceRows: [],
  });
  await writeJson(materializedViewsPath, {
    artifactKind: "bp.tier2_vocab_materialized_views.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T21:00:00.000Z",
    routeEvidenceBundles: [
      {
        routeId: "B46",
        surfaceCount: 5,
        timelineCandidateSurfaceCount: 2,
      },
    ],
  });
  return { consumerIndexPath, materializedViewsPath };
}

describe("route timeline curation pack", () => {
  test("builds a route-scoped, evidence-addressed pack for timeline curation", async () => {
    const { consumerIndexPath, materializedViewsPath } = await seedConsumerIndex();
    const artifact = await buildRouteTimelineCurationPack({
      route: "B46",
      consumerIndexPath,
      materializedViewsPath,
      generatedAt: "2026-06-06T22:00:00.000Z",
      maxCandidates: 10,
    });

    expect(artifact.routeId).toBe("B46");
    expect(artifact.routeAliases).toContain("B46+");
    expect(artifact.summary.candidateCount).toBe(5);
    expect(artifact.summary.timelinePrimaryCount).toBe(2);
    expect(artifact.summary.treatmentCandidateCount).toBe(1);
    expect(artifact.summary.metricCandidateCount).toBe(1);
    expect(artifact.summary.timelineContextCount).toBe(1);
    expect(artifact.summary.routeBundleSurfaceCount).toBe(5);
    expect(artifact.summary.routeBundleTimelineCandidateSurfaceCount).toBe(2);
    expect(
      artifact.candidates.some((candidate) => candidate.surfaceId === "surface-off-route"),
    ).toBe(false);
    expect(artifact.candidates.every((candidate) => /^c\d{3}$/.test(candidate.candidateRef))).toBe(
      true,
    );
    expect(new Set(artifact.candidates.map((candidate) => candidate.candidateRef)).size).toBe(
      artifact.candidates.length,
    );

    const service = artifact.candidates.find(
      (candidate) => candidate.surfaceId === "surface-service",
    );
    expect(service).toMatchObject({
      candidateRole: "timeline_primary",
      routeMatch: "alias",
      sourceId: "source-a",
    });
    expect(service?.sourceRef).toMatch(/^s\d{3}$/);
    expect(service?.evidencePointerIds).toEqual(["ev-1", "ev-service", "ev-surface"]);
    expect(
      service?.payloadHints.some((hint) => hint.path === "dateText" && hint.value === "July 2016"),
    ).toBe(true);
    expect(service?.dateAssertions[0]?.dateAssertionRef).toMatch(/^c\d{3}\.d1$/);

    const treatment = artifact.candidates.find(
      (candidate) => candidate.surfaceId === "surface-treatment",
    );
    expect(treatment?.unresolvedRows[0]).toMatchObject({
      keyId: "eventTreatmentFamily",
      decision: "preserve_raw",
      supportIds: ["support-treatment"],
    });
    expect(
      treatment?.dateAssertions.some(
        (assertion) =>
          assertion.rawText === "Fall 2015" &&
          assertion.displayDate === "Fall 2015" &&
          assertion.datePrecision === "season" &&
          assertion.rangeStart === "2015-09" &&
          assertion.rangeEnd === "2015-11",
      ),
    ).toBe(true);

    expect(artifact.sourceRefs.map((source) => source.sourceId).sort()).toEqual([
      "source-a",
      "source-b",
    ]);
    expect(artifact.sourceRefs.every((source) => /^s\d{3}$/.test(source.sourceRef))).toBe(true);
    expect(artifact.llmTask.policy.join("\n")).toContain("Every event must cite");
    expect(artifact.llmTask.filesystemGuidance.join("\n")).toContain("runner-owned tools");
  });

  test("writes JSON, summary, and Markdown handoff artifacts", async () => {
    const { consumerIndexPath, materializedViewsPath } = await seedConsumerIndex();
    const outputPath = join(workingRoot, "out", "pack.json");
    const result = await runRouteTimelineCurationPack({
      route: "B46",
      consumerIndexPath,
      materializedViewsPath,
      outputPath,
      generatedAt: "2026-06-06T22:30:00.000Z",
      maxCandidates: 3,
    });

    expect(result.artifact.summary.candidateCount).toBe(3);
    expect(await Bun.file(result.outputPath).exists()).toBe(true);
    expect(await Bun.file(result.summaryPath).exists()).toBe(true);
    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("# Route Timeline Curation Pack: B46");
    expect(markdown).toContain("## Candidate Index");
    expect(markdown).toContain("```json");
    expect(markdown).toContain("candidateRefs");
    expect(markdown).toContain("The JSON pack retains full candidate ids");
    expect(markdown).not.toContain("artifactPath:");
  });
});
