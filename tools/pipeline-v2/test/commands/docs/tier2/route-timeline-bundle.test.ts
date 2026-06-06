import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildRouteTimelineBundle } from "../../../../src/commands/docs/tier2/_route-timeline-bundle.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-route-timeline-bundle");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function seedInputs() {
  const packPath = join(workingRoot, "pack.json");
  const toolCallPath = join(workingRoot, "tool-call.json");
  const runPath = join(workingRoot, "run.json");
  await writeJson(packPath, {
    artifactKind: "bp.tier2_route_timeline_curation_pack.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-07T02:00:00.000Z",
    routeId: "B46",
    routeAliases: ["B46"],
    sourceConsumerIndexPath: "/repo/consumer.json",
    sourceMaterializedViewsPath: null,
    summary: {
      candidateCount: 1,
      timelinePrimaryCount: 1,
      timelineContextCount: 0,
      treatmentCandidateCount: 0,
      metricCandidateCount: 0,
      claimCandidateCount: 0,
      eventCandidateCount: 1,
      serviceChangeCandidateCount: 0,
      sourceCount: 1,
      evidencePointerCount: 1,
      dateAssertionCount: 1,
      candidatesWithDateAssertionCount: 1,
      candidatesWithEvidencePointerCount: 1,
      candidatesWithArtifactPathCount: 1,
      routeBundleSurfaceCount: null,
      routeBundleTimelineCandidateSurfaceCount: null,
    },
    llmTask: {
      objective: "curate_route_timeline",
      policy: [],
      filesystemGuidance: [],
      outputSchema: {},
    },
    sourceRefs: [
      {
        sourceRef: "s001",
        sourceId: "source-a",
        sourceTitle: "Source A",
        sourceGroup: "bus_priority_document",
        pageNumbers: [3],
        candidateCount: 1,
        evidencePointerCount: 1,
        artifactPaths: ["/repo/source-a/artifact.json"],
      },
    ],
    candidates: [
      {
        candidateRef: "c001",
        candidateId: "timeline_candidate_launch",
        surfaceId: "surface-launch",
        candidateRole: "timeline_primary",
        score: 120,
        surfaceKind: "event_candidate",
        payloadSchemaId: "bp.event_candidate.v1",
        displayLabel: "B46 SBS launched in July 2016",
        rawText: "B46 SBS launched in July 2016 with off-board fare payment.",
        sourceId: "source-a",
        sourceRef: "s001",
        sourceTitle: "Source A",
        sourceGroup: "bus_priority_document",
        pageNumbers: [3],
        routeIds: ["B46"],
        routeMatch: "direct_route",
        intendedUses: ["public_timeline_candidate"],
        coarseFamilies: ["project_delivery"],
        mappedFieldCount: 1,
        unresolvedFieldCount: 0,
        evidencePointerIds: ["ev-1"],
        supportIds: ["support-1"],
        artifactPath: "/repo/source-a/artifact.json",
        auditPath: null,
        canonicalPayload: { routeIds: ["B46"], dateText: "July 2016" },
        payloadHints: [{ path: "dateText", value: "July 2016" }],
        dateAssertions: [
          {
            dateAssertionRef: "c001.d1",
            dateAssertionId: "date_launch_month",
            candidateId: "timeline_candidate_launch",
            sourcePath: "canonicalPayload.dateText",
            rawText: "July 2016",
            date: null,
            month: "2016-07",
            datePrecision: "month",
            dateRole: "event_date_candidate",
            confidence: "medium",
          },
        ],
        fieldRows: [
          {
            keyId: "eventTreatmentFamily",
            rawValue: "Select Bus Service",
            canonicalLeafId: "select_bus_service",
            canonicalLeafLabel: "Select Bus Service",
            coarseFamily: "bus_priority_treatment",
            sourceFieldPath: "raw.treatment",
            targetPayloadPath: "canonical.treatmentFamily",
            modifiers: {},
            supportIds: ["support-1"],
            evidencePointerIds: ["ev-1"],
          },
        ],
        unresolvedRows: [],
      },
    ],
  });
  await writeJson(toolCallPath, {
    schemaVersion: 1,
    routeId: "B46",
    events: [
      {
        eventId: "b46_sbs_launch",
        title: "B46 SBS launches",
        eventStatus: "implemented",
        timelineLayer: "service_change",
        routeScope: "direct_route",
        summary: "The source states that B46 SBS launched in July 2016.",
        whyItMatters: "This is the route's core service-change milestone.",
        candidateRefs: ["c001"],
        dateAssertionRefs: ["c001.d1"],
        confidence: "high",
        reviewNotes: [],
      },
    ],
    excludedCandidates: [],
  });
  await writeJson(runPath, {
    artifactKind: "bp.tier2_route_timeline_curation_run.v1",
    summary: {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    },
  });
  return { packPath, toolCallPath, runPath };
}

describe("route timeline bundle", () => {
  test("hydrates compact refs into a frontend-ready timeline bundle", async () => {
    const { packPath, toolCallPath, runPath } = await seedInputs();
    const outputPath = join(workingRoot, "bundle.json");
    const result = await buildRouteTimelineBundle({
      packPath,
      toolCallPath,
      runPath,
      outputPath,
      generatedAt: "2026-06-07T03:00:00.000Z",
    });

    expect(result.artifact.summary).toMatchObject({
      eventCount: 1,
      defaultEventCount: 1,
      reviewOnlyEventCount: 0,
      dateAssertionBackedEventCount: 1,
      validationErrorCount: 0,
    });
    expect(result.artifact.events[0]).toMatchObject({
      eventId: "b46_sbs_launch",
      displayLayer: "default",
      displayDate: "2016-07",
      dateSource: "date_assertion_ref",
      candidateRefs: ["c001"],
      dateAssertionRefs: ["c001.d1"],
      affectedRouteIds: ["B46"],
      relatedTreatmentFamilies: ["Select Bus Service"],
    });
    expect(result.artifact.events[0]?.sourceChips[0]).toMatchObject({
      sourceRef: "s001",
      pages: [3],
    });
    expect(result.artifact.events[0]?.suggestedAnalysisWindow).toMatchObject({
      status: "available",
      beforeStart: "2016-04",
      beforeEnd: "2016-06",
      afterStart: "2016-08",
      afterEnd: "2016-10",
    });
    expect(await Bun.file(result.markdownPath).exists()).toBe(true);
    const markdown = await Bun.file(result.markdownPath).text();
    expect(markdown).toContain("Route Timeline Bundle Preview: B46");
    expect(markdown).toContain("B46 SBS launches");
  });
});
