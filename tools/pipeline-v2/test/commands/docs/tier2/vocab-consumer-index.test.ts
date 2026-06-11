import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2VocabConsumerIndex } from "../../../../src/commands/docs/tier2/_vocab-consumer-index.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-vocab-consumer-index");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 vocab consumer index", () => {
  test("builds compact surface, field, unresolved, and source rows from the surface application", async () => {
    const surfaceApplicationPath = join(workingRoot, "surface-application.json");
    await writeJson(surfaceApplicationPath, {
      artifactKind: "bp.tier2_vocab_surface_application.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T18:00:00.000Z",
      sourceProjectionPath: "/repo/projection.json",
      summary: {
        acceptedSurfaceCount: 2,
        mappedFieldCount: 2,
        preserveRawFieldCount: 1,
      },
      normalizedAcceptedSurfaces: [
        {
          artifactPath: "/repo/artifacts/page1/artifact.json",
          auditPath: "/repo/artifacts/page1/audit.json",
          windowId: "source-a:7",
          runId: "run-a",
          shardId: "shard-1",
          sourceId: "source-a",
          pageNumbers: [7],
          draftIndex: 0,
          surface: {
            surfaceId: "surface-1",
            surfaceKind: "metric_observation",
            sourceId: "source-a",
            sourceTitle: "Source A",
            sourceGroup: "bus_priority_document",
            pageNumbers: [7],
            sourceInvestigationId: "investigation-a",
            payloadSchemaId: "metric/v1",
            displayLabel: "B41 speed",
            rawText: "B41 speed was slow.",
            rawPayload: {
              metricNameRaw: "B41 speed",
            },
            canonicalPayload: {
              metricFamily: "bus_speed_mph",
            },
            lifecycle: { extractionState: "verified_candidate" },
            intendedUses: ["detector_evidence"],
            confidence: { verifierConfidence: "high" },
            normalization: {
              fieldMappings: [
                {
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
                  projectionEvidence: {
                    inputCount: 12,
                    examples: [{ large: "omitted in compact output" }],
                  },
                },
              ],
              unresolvedFields: [
                {
                  keyId: "metricSubjectFamily",
                  sourceFieldPath: "rawPayload.subjectRaw",
                  targetPayloadPath: "canonicalPayload.metricSubjectFamily",
                  rawValue: "B41 south of GAP riders",
                  decision: "preserve_raw",
                  reason: "Specific route segment subject remains raw.",
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
            },
          },
        },
        {
          artifactPath: "/repo/artifacts/page2/artifact.json",
          auditPath: null,
          windowId: "source-a:8",
          runId: "run-a",
          shardId: "shard-2",
          sourceId: "source-a",
          pageNumbers: [8],
          draftIndex: 1,
          surface: {
            surfaceId: "surface-2",
            surfaceKind: "claim",
            sourceId: "source-a",
            sourceTitle: "Source A",
            sourceGroup: "bus_priority_document",
            pageNumbers: [8],
            displayLabel: "Existing condition claim",
            rawText: "The corridor is congested.",
            rawPayload: {
              claimKindRaw: "existing_condition",
            },
            canonicalPayload: {
              claimKind: "existing_condition",
              routeIds: ["Q1"],
            },
            normalization: {
              fieldMappings: [
                {
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
                  projectionEvidence: { inputCount: 44, examples: [] },
                },
              ],
              unresolvedFields: [],
            },
          },
        },
      ],
    });

    const artifact = await buildTier2VocabConsumerIndex({
      surfaceApplicationPath,
      generatedAt: "2026-06-06T19:00:00.000Z",
    });

    expect(artifact.summary.surfaceRowCount).toBe(2);
    expect(artifact.summary.fieldRowCount).toBe(2);
    expect(artifact.summary.unresolvedRowCount).toBe(1);
    expect(artifact.summary.sourceRowCount).toBe(1);
    expect(artifact.summary.surfacesWithRouteIds).toBe(2);
    expect(artifact.summary.mappedByKey).toEqual({ claimKind: 1, metricFamily: 1 });
    expect(artifact.summary.unresolvedByKey).toEqual({ metricSubjectFamily: 1 });

    const surface = artifact.surfaceRows.find((row) => row.surfaceId === "surface-1");
    expect(surface).toMatchObject({
      sourceId: "source-a",
      sourceTitle: "Source A",
      sourceGroup: "bus_priority_document",
      pageNumbers: [7],
      canonicalPayload: { metricFamily: "bus_speed_mph" },
      routeIds: ["B41"],
      coarseFamilies: ["ridership", "travel_time_speed"],
      evidencePointerIds: ["pointer-1"],
    });
    expect(Object.hasOwn(surface ?? {}, "rawPayload")).toBe(false);
    expect(Object.hasOwn(surface ?? {}, "fieldSupport")).toBe(false);

    expect(artifact.fieldRows[0]).toMatchObject({
      surfaceId: "surface-2",
      keyId: "claimKind",
      canonicalLeafId: "existing_condition",
      projectionInputCount: 44,
    });
    const metricRow = artifact.fieldRows.find((row) => row.keyId === "metricFamily");
    expect(metricRow).toMatchObject({
      surfaceId: "surface-1",
      rawValue: "B41 speed",
      modifiers: { routeIds: ["B41"], periods: ["AM"] },
      evidence: { supportIds: ["support-1"], evidencePointerIds: ["pointer-1"] },
      projectionInputCount: 12,
    });
    expect(Object.hasOwn(metricRow ?? {}, "projectionEvidence")).toBe(false);
    expect(artifact.surfaceRows.find((row) => row.surfaceId === "surface-2")?.routeIds).toEqual([
      "Q1",
    ]);

    expect(artifact.unresolvedRows).toEqual([
      expect.objectContaining({
        surfaceId: "surface-1",
        keyId: "metricSubjectFamily",
        rawValue: "B41 south of GAP riders",
        decision: "preserve_raw",
        coarseFamily: "ridership",
      }),
    ]);
    expect(artifact.sourceRows[0]).toMatchObject({
      sourceId: "source-a",
      surfaceCount: 2,
      mappedFieldCount: 2,
      unresolvedFieldCount: 1,
      pageNumbers: [7, 8],
      surfaceKindCounts: { claim: 1, metric_observation: 1 },
    });
  });
});
