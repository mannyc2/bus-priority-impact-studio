import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2VocabSurfaceApplication } from "../../../../src/commands/docs/tier2/_vocab-surface-apply.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-vocab-surface-apply");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 vocab surface application", () => {
  test("applies mapped vocab leaves additively while preserving raw and unresolved fields", async () => {
    const artifactPath = join(workingRoot, "artifact.json");
    const canonicalMergePath = join(workingRoot, "canonical-merge.json");
    const graduationPlanPath = join(workingRoot, "graduation-plan.json");
    const projectionPath = join(workingRoot, "projection.json");

    const metricSurface = {
      schemaVersion: 2,
      surfaceId: "surface-1",
      sourceId: "fixture-source",
      sourceGroup: "fixture",
      pageNumbers: [7],
      surfaceKind: "metric_observation",
      rawText: "B41 average bus speed was 7 mph.",
      displayLabel: "B41 speed",
      payloadSchemaId: "metric/v1",
      rawPayload: {
        metricNameRaw: "B41 Average Bus Speed",
        unitRaw: "mph",
        subjectRaw: "B41 corridor riders",
        researchUseTagsRaw: ["speed", "hotspot"],
        contextKindRaw: "brand_new_context",
      },
      canonicalPayload: {},
      fieldSupportIds: ["support-metric", "support-tag"],
    };
    const untouchedRawPayload = JSON.stringify(metricSurface.rawPayload);

    await writeJson(artifactPath, {
      artifactKind: "bp.tier2_agentic_extraction_artifact.v1",
      schemaVersion: 1,
      source: {
        sourceId: "fixture-source",
        sourceTitle: "Fixture source",
        sourceGroup: "fixture",
        pageNumbers: [7],
      },
      submitResult: {
        accepted: [
          {
            draftIndex: 0,
            surface: metricSurface,
            fieldSupport: [
              {
                supportId: "support-metric",
                surfaceId: "surface-1",
                fieldPath: "rawPayload.metricNameRaw",
                evidencePointers: ["pointer-metric"],
                verifierState: "verified",
                supportCompleteness: "exact",
              },
              {
                supportId: "support-tag",
                surfaceId: "surface-1",
                fieldPath: "rawPayload.researchUseTagsRaw",
                evidencePointers: ["pointer-tag"],
                verifierState: "verified",
                supportCompleteness: "exact",
              },
            ],
            evidencePointers: [
              { pointerId: "pointer-metric", quoteText: "B41 average bus speed" },
              { pointerId: "pointer-tag", quoteText: "speed hotspot" },
            ],
            acceptedCanonicalFields: [],
            warnings: [],
          },
          {
            draftIndex: 1,
            surface: {
              schemaVersion: 2,
              surfaceId: "surface-2",
              sourceId: "fixture-source",
              sourceGroup: "fixture",
              pageNumbers: [7],
              surfaceKind: "source_note",
              rawText: "A note without graduated raw fields.",
              displayLabel: "Note",
              payloadSchemaId: "source_note/v1",
              rawPayload: { noteText: "No category-like fields here" },
              canonicalPayload: {},
            },
            fieldSupport: [],
            evidencePointers: [],
            acceptedCanonicalFields: [],
            warnings: [],
          },
        ],
      },
    });

    await writeJson(canonicalMergePath, {
      artifactKind: "bp.tier2_agentic_canonical_merge.v1",
      schemaVersion: 1,
      canonicalArtifacts: [
        {
          windowId: "fixture-source:7",
          runId: "fixture-run",
          shardId: "shard-0001",
          sourceId: "fixture-source",
          pageNumbers: [7],
          artifactPath,
          auditPath: join(workingRoot, "audit.json"),
        },
      ],
    });

    await writeJson(graduationPlanPath, {
      artifactKind: "bp.tier2_raw_field_graduation_plan.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T00:00:00.000Z",
      graduationKeys: [
        {
          id: "metricFamily",
          tier: "core",
          targetPayloadPath: "canonicalPayload.metricFamily",
          sourceFieldPaths: ["rawPayload.metricNameRaw"],
        },
        {
          id: "metricUnit",
          tier: "core",
          targetPayloadPath: "canonicalPayload.metricUnit",
          sourceFieldPaths: ["rawPayload.unitRaw"],
        },
        {
          id: "metricSubjectFamily",
          tier: "core",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          sourceFieldPaths: ["rawPayload.subjectRaw"],
        },
        {
          id: "claimResearchUseTag",
          tier: "core",
          targetPayloadPath: "canonicalPayload.researchUseTags",
          sourceFieldPaths: ["rawPayload.researchUseTagsRaw"],
        },
        {
          id: "contextKind",
          tier: "core",
          targetPayloadPath: "canonicalPayload.contextKind",
          sourceFieldPaths: ["rawPayload.contextKindRaw"],
        },
      ],
    });

    await writeJson(projectionPath, {
      artifactKind: "bp.tier2_vocab_normalization_projection.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T01:00:00.000Z",
      sourceManifestPath: join(workingRoot, "vocab-map-pack-manifest.json"),
      rowCount: 4,
      rows: [
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "B41 Average Bus Speed",
          canonicalLeafId: "bus_speed_mph",
          canonicalLeafLabel: "Bus Speed (mph)",
          coarseFamily: "travel_time_speed",
          routeIds: ["B41"],
        }),
        projectionRow({
          keyId: "metricUnit",
          targetPayloadPath: "canonicalPayload.metricUnit",
          rawValue: "mph",
          canonicalLeafId: "miles_per_hour",
          canonicalLeafLabel: "Miles per hour",
          coarseFamily: "travel_time_speed",
        }),
        projectionRow({
          keyId: "metricSubjectFamily",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          rawValue: "B41 corridor riders",
          decision: "preserve_raw",
          canonicalLeafId: null,
          canonicalLeafLabel: null,
          coarseFamily: "ridership",
          routeIds: ["B41"],
        }),
        projectionRow({
          keyId: "claimResearchUseTag",
          targetPayloadPath: "canonicalPayload.researchUseTags",
          rawValue: "speed",
          canonicalLeafId: "speed_evidence",
          canonicalLeafLabel: "Speed evidence",
          coarseFamily: "travel_time_speed",
        }),
        projectionRow({
          keyId: "claimResearchUseTag",
          targetPayloadPath: "canonicalPayload.researchUseTags",
          rawValue: "hotspot",
          decision: "unresolved",
          canonicalLeafId: null,
          canonicalLeafLabel: null,
          coarseFamily: "other",
        }),
      ],
    });

    const artifact = await buildTier2VocabSurfaceApplication({
      canonicalMergePath,
      graduationPlanPath,
      projectionPath,
      generatedAt: "2026-06-06T02:00:00.000Z",
    });

    expect(artifact.summary.acceptedSurfaceCount).toBe(2);
    expect(artifact.summary.surfacesWithGraduatedFields).toBe(1);
    expect(artifact.summary.surfacesWithMappedFields).toBe(1);
    expect(artifact.summary.surfacesWithUnresolvedFields).toBe(1);
    expect(artifact.summary.fieldInstanceCount).toBe(6);
    expect(artifact.summary.mappedFieldCount).toBe(3);
    expect(artifact.summary.preserveRawFieldCount).toBe(1);
    expect(artifact.summary.unresolvedFieldCount).toBe(1);
    expect(artifact.summary.missingProjectionFieldCount).toBe(1);
    expect(artifact.summary.fieldSupportFoundCount).toBe(3);
    expect(artifact.summary.fieldSupportMissingCount).toBe(3);

    const normalized = artifact.normalizedAcceptedSurfaces[0]?.surface;
    expect(normalized).toBeDefined();
    expect(JSON.stringify(normalized?.["rawPayload"])).toBe(untouchedRawPayload);
    expect(normalized?.["canonicalPayload"]).toEqual({
      metricFamily: "bus_speed_mph",
      metricUnit: "miles_per_hour",
      researchUseTags: ["speed_evidence"],
    });
    expect(normalized?.["normalization"]).toMatchObject({
      vocabVersion: {
        projectionArtifactKind: "bp.tier2_vocab_normalization_projection.v1",
        projectionSchemaVersion: 1,
      },
    });

    const normalization = normalized?.["normalization"] as {
      fieldMappings: Array<{
        keyId: string;
        rawValue: string;
        canonicalLeafId: string;
        coarseFamily: string;
        modifiers: { routeIds: string[] };
        evidence: { supportIds: string[]; evidencePointerIds: string[] };
      }>;
      unresolvedFields: Array<{ keyId: string; rawValue: string; decision: string }>;
      targetWrites: Array<{ targetPayloadPath: string; writeState: string }>;
    };
    expect(normalization.fieldMappings.map((mapping) => mapping.keyId).sort()).toEqual([
      "claimResearchUseTag",
      "metricFamily",
      "metricUnit",
    ]);
    const metricFamily = normalization.fieldMappings.find((mapping) => mapping.keyId === "metricFamily");
    expect(metricFamily?.modifiers.routeIds).toEqual(["B41"]);
    expect(metricFamily?.evidence.supportIds).toEqual(["support-metric"]);
    expect(metricFamily?.evidence.evidencePointerIds).toEqual(["pointer-metric"]);
    expect(normalization.unresolvedFields).toEqual([
      expect.objectContaining({
        keyId: "metricSubjectFamily",
        rawValue: "B41 corridor riders",
        decision: "preserve_raw",
      }),
      expect.objectContaining({
        keyId: "claimResearchUseTag",
        rawValue: "hotspot",
        decision: "unresolved",
      }),
      expect.objectContaining({
        keyId: "contextKind",
        rawValue: "brand_new_context",
        decision: "missing_projection",
      }),
    ]);
    expect(normalization.targetWrites.map((write) => write.targetPayloadPath).sort()).toEqual([
      "canonicalPayload.metricFamily",
      "canonicalPayload.metricUnit",
      "canonicalPayload.researchUseTags",
    ]);
  });
});

function projectionRow(input: {
  keyId: string;
  targetPayloadPath: string;
  rawValue: string;
  decision?: "mapped" | "preserve_raw" | "unresolved";
  canonicalLeafId: string | null;
  canonicalLeafLabel: string | null;
  coarseFamily: string;
  routeIds?: string[];
}) {
  return {
    keyId: input.keyId,
    targetPayloadPath: input.targetPayloadPath,
    rawValue: input.rawValue,
    decision: input.decision ?? "mapped",
    originalDecision: input.decision ?? "mapped",
    canonicalLeafId: input.canonicalLeafId,
    canonicalLeafLabel: input.canonicalLeafLabel,
    coarseFamily: input.coarseFamily,
    modifiers: {
      routeIds: input.routeIds ?? [],
      directions: [],
      periods: [],
      geographies: [],
      modes: [],
    },
    evidenceProvenance: {
      inputCount: 1,
      sourceFieldCounts: {},
      surfaceKindCounts: {},
      examples: [],
    },
  };
}
