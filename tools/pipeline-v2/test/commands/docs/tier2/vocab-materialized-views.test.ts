import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2VocabMaterializedViews } from "../../../../src/commands/docs/tier2/_vocab-materialized-views.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-vocab-materialized-views");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 vocab materialized views", () => {
  test("builds route evidence bundles, detector feature rows, review queue, and source coverage rows", async () => {
    const consumerIndexPath = join(workingRoot, "vocab-consumer-index.json");
    await writeJson(consumerIndexPath, {
      artifactKind: "bp.tier2_vocab_consumer_index.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T19:00:00.000Z",
      sourceSurfaceApplicationPath: "/repo/surface-application.json",
      sourceSurfaceApplicationGeneratedAt: "2026-06-06T18:00:00.000Z",
      sourceProjectionPath: "/repo/projection.json",
      summary: {
        surfaceRowCount: 3,
        fieldRowCount: 4,
        unresolvedRowCount: 1,
        sourceRowCount: 2,
      },
      surfaceRows: [
        {
          surfaceId: "surface-b41",
          surfaceKind: "metric_observation",
          sourceId: "source-a",
          sourceTitle: "Source A",
          sourceGroup: "bus_priority_document",
          pageNumbers: [7],
          sourceInvestigationId: "investigation-a",
          runId: "run-a",
          shardId: "shard-1",
          windowId: "source-a:7",
          draftIndex: 0,
          artifactPath: "/repo/artifacts/source-a/p7.json",
          auditPath: "/repo/artifacts/source-a/p7.audit.json",
          payloadSchemaId: "metric/v1",
          displayLabel: "B41 speed",
          rawText: "B41 speed was slow.",
          canonicalPayload: {
            routeIds: ["B41"],
            metricFamily: "bus_speed_mph",
          },
          lifecycle: null,
          intendedUses: ["detector_evidence"],
          confidence: null,
          routeIds: ["B41"],
          coarseFamilies: ["ridership", "travel_time_speed"],
          mappedFieldCount: 2,
          unresolvedFieldCount: 1,
          evidencePointerIds: ["pointer-1"],
        },
        {
          surfaceId: "surface-q1",
          surfaceKind: "claim",
          sourceId: "source-a",
          sourceTitle: "Source A",
          sourceGroup: "bus_priority_document",
          pageNumbers: [8],
          sourceInvestigationId: null,
          runId: "run-a",
          shardId: "shard-2",
          windowId: "source-a:8",
          draftIndex: 1,
          artifactPath: "/repo/artifacts/source-a/p8.json",
          auditPath: null,
          payloadSchemaId: "claim/v1",
          displayLabel: "Existing condition claim",
          rawText: "The Q1 corridor is congested.",
          canonicalPayload: {
            routeIds: ["Q1"],
            claimKind: "existing_condition",
          },
          lifecycle: null,
          intendedUses: ["route_brief"],
          confidence: null,
          routeIds: ["Q1"],
          coarseFamilies: ["other"],
          mappedFieldCount: 1,
          unresolvedFieldCount: 0,
          evidencePointerIds: [],
        },
        {
          surfaceId: "surface-context",
          surfaceKind: "context_signal",
          sourceId: "source-b",
          sourceTitle: "Source B",
          sourceGroup: "planning_board_packet",
          pageNumbers: [3],
          sourceInvestigationId: null,
          runId: "run-b",
          shardId: "shard-1",
          windowId: "source-b:3",
          draftIndex: 0,
          artifactPath: "/repo/artifacts/source-b/p3.json",
          auditPath: null,
          payloadSchemaId: "context/v1",
          displayLabel: "Community outreach note",
          rawText: "Residents discussed the project.",
          canonicalPayload: {
            contextKind: "public_outreach",
          },
          lifecycle: null,
          intendedUses: ["source_context"],
          confidence: null,
          routeIds: [],
          coarseFamilies: ["null"],
          mappedFieldCount: 1,
          unresolvedFieldCount: 0,
          evidencePointerIds: [],
        },
      ],
      fieldRows: [
        {
          surfaceId: "surface-b41",
          sourceId: "source-a",
          sourceGroup: "bus_priority_document",
          pageNumbers: [7],
          surfaceKind: "metric_observation",
          keyId: "metricFamily",
          sourceFieldPath: "rawPayload.metricNameRaw",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "B41 speed",
          canonicalLeafId: "bus_speed_mph",
          canonicalLeafLabel: "Bus speed",
          coarseFamily: "travel_time_speed",
          modifiers: {
            routeIds: ["B41"],
            directions: [],
            periods: ["AM"],
            geographies: [],
            modes: ["bus"],
          },
          evidence: {
            fieldSupportFound: true,
            supportIds: ["support-1"],
            evidencePointerIds: ["pointer-1"],
          },
          projectionInputCount: 12,
        },
        {
          surfaceId: "surface-b41",
          sourceId: "source-a",
          sourceGroup: "bus_priority_document",
          pageNumbers: [7],
          surfaceKind: "metric_observation",
          keyId: "metricUnit",
          sourceFieldPath: "rawPayload.unitRaw",
          targetPayloadPath: "canonicalPayload.metricUnit",
          rawValue: "mph",
          canonicalLeafId: "mph",
          canonicalLeafLabel: "mph",
          coarseFamily: "speed",
          modifiers: {
            routeIds: [],
            directions: [],
            periods: [],
            geographies: [],
            modes: [],
          },
          evidence: {
            fieldSupportFound: true,
            supportIds: ["support-2"],
            evidencePointerIds: ["pointer-2"],
          },
          projectionInputCount: 20,
        },
        {
          surfaceId: "surface-q1",
          sourceId: "source-a",
          sourceGroup: "bus_priority_document",
          pageNumbers: [8],
          surfaceKind: "claim",
          keyId: "claimKind",
          sourceFieldPath: "rawPayload.claimKindRaw",
          targetPayloadPath: "canonicalPayload.claimKind",
          rawValue: "existing_condition",
          canonicalLeafId: "existing_condition",
          canonicalLeafLabel: "Existing condition",
          coarseFamily: "other",
          modifiers: {
            routeIds: [],
            directions: [],
            periods: [],
            geographies: [],
            modes: [],
          },
          evidence: {
            fieldSupportFound: false,
            supportIds: [],
            evidencePointerIds: [],
          },
          projectionInputCount: 44,
        },
        {
          surfaceId: "surface-context",
          sourceId: "source-b",
          sourceGroup: "planning_board_packet",
          pageNumbers: [3],
          surfaceKind: "context_signal",
          keyId: "contextKind",
          sourceFieldPath: "rawPayload.contextKindRaw",
          targetPayloadPath: "canonicalPayload.contextKind",
          rawValue: "community outreach",
          canonicalLeafId: "public_outreach",
          canonicalLeafLabel: "Public outreach",
          coarseFamily: "null",
          modifiers: {
            routeIds: [],
            directions: [],
            periods: [],
            geographies: [],
            modes: [],
          },
          evidence: {
            fieldSupportFound: false,
            supportIds: [],
            evidencePointerIds: [],
          },
          projectionInputCount: 9,
        },
      ],
      unresolvedRows: [
        {
          surfaceId: "surface-b41",
          sourceId: "source-a",
          sourceGroup: "bus_priority_document",
          pageNumbers: [7],
          surfaceKind: "metric_observation",
          keyId: "metricSubjectFamily",
          sourceFieldPath: "rawPayload.subjectRaw",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          rawValue: "B41 south of GAP riders",
          decision: "preserve_raw",
          reason: "Specific segment subject remains raw.",
          coarseFamily: "ridership",
          modifiers: {
            routeIds: ["B41"],
            directions: [],
            periods: [],
            geographies: [],
            modes: [],
          },
          evidence: {
            fieldSupportFound: false,
            supportIds: [],
            evidencePointerIds: [],
          },
        },
      ],
      sourceRows: [
        {
          sourceId: "source-a",
          sourceTitle: "Source A",
          sourceGroup: "bus_priority_document",
          surfaceCount: 2,
          mappedFieldCount: 3,
          unresolvedFieldCount: 1,
          pageNumbers: [7, 8],
          surfaceKindCounts: { claim: 1, metric_observation: 1 },
        },
        {
          sourceId: "source-b",
          sourceTitle: "Source B",
          sourceGroup: "planning_board_packet",
          surfaceCount: 1,
          mappedFieldCount: 1,
          unresolvedFieldCount: 0,
          pageNumbers: [3],
          surfaceKindCounts: { context_signal: 1 },
        },
      ],
    });

    const artifact = await buildTier2VocabMaterializedViews({
      consumerIndexPath,
      generatedAt: "2026-06-06T20:00:00.000Z",
      maxRouteSurfaceSamples: 2,
      maxUnresolvedSamples: 2,
      maxSourceSurfaceSamples: 2,
    });

    expect(artifact.summary.routeEvidenceBundleCount).toBe(2);
    expect(artifact.summary.routeLinkedSurfaceCount).toBe(2);
    expect(artifact.summary.detectorFeatureRowCount).toBe(4);
    expect(artifact.summary.routeLinkedDetectorFeatureRowCount).toBe(3);
    expect(artifact.summary.sourceContextDetectorFeatureRowCount).toBe(1);
    expect(artifact.summary.unresolvedReviewItemCount).toBe(1);
    expect(artifact.summary.sourceCoverageRowCount).toBe(2);
    expect(artifact.summary.featureUseCounts).toMatchObject({
      claim_feature: 1,
      document_context_feature: 1,
      metric_feature: 2,
    });
    expect(artifact.summary.deferredQaFlags).toMatchObject({
      fieldRowsWithNullStringCoarseFamily: 1,
      fieldRowsWithOtherCoarseFamily: 1,
      preserveRawUnresolvedRows: 1,
    });

    const b41 = artifact.routeEvidenceBundles.find((bundle) => bundle.routeId === "B41");
    expect(b41).toMatchObject({
      routeId: "B41",
      surfaceCount: 1,
      mappedFieldCount: 2,
      unresolvedFieldCount: 1,
      sourceCount: 1,
      metricObservationSurfaceCount: 1,
      keyCounts: {
        metricFamily: 1,
        metricSubjectFamily: 1,
        metricUnit: 1,
      },
      featureUseCounts: {
        claim_feature: 0,
        document_context_feature: 0,
        entity_feature: 0,
        event_or_treatment_feature: 0,
        metric_feature: 2,
        other_feature: 0,
      },
      evidencePointerCount: 2,
    });
    expect(b41?.sampleSurfaces[0]).toMatchObject({
      surfaceId: "surface-b41",
      fieldKeys: ["metricFamily", "metricSubjectFamily", "metricUnit"],
      supportIds: ["support-1", "support-2"],
      evidencePointerIds: ["pointer-1", "pointer-2"],
    });

    const contextFeature = artifact.detectorFeatureRows.find((row) => row.surfaceId === "surface-context");
    expect(contextFeature).toMatchObject({
      featureUse: "document_context_feature",
      routeScope: "source_context",
      routeIds: [],
      artifactPath: "/repo/artifacts/source-b/p3.json",
      coarseFamily: "null",
    });
    expect(contextFeature?.featureId).toStartWith("feature_");

    expect(artifact.unresolvedReviewQueue[0]).toMatchObject({
      keyId: "metricSubjectFamily",
      decision: "preserve_raw",
      rawValue: "B41 south of GAP riders",
      rowCount: 1,
      surfaceCount: 1,
      sourceCount: 1,
      routeIds: ["B41"],
    });
    expect(artifact.unresolvedReviewQueue[0]?.reviewItemId).toStartWith("review_");

    const sourceA = artifact.sourceCoverageRows.find((row) => row.sourceId === "source-a");
    expect(sourceA).toMatchObject({
      routeCount: 2,
      routeIds: ["B41", "Q1"],
      keyCounts: {
        claimKind: 1,
        metricFamily: 1,
        metricSubjectFamily: 1,
        metricUnit: 1,
      },
      unresolvedByDecision: { preserve_raw: 1 },
      evidencePointerCount: 2,
    });
  });
});
