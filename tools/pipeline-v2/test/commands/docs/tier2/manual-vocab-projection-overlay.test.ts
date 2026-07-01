import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2ManualVocabProjectionOverlay } from "../../../../src/commands/docs/tier2/_manual-vocab-projection-overlay.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-manual-vocab-projection-overlay");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 manual vocab projection overlay", () => {
  test("adds deterministic projection rows and review-only missing family suggestions", async () => {
    const artifactPath = join(workingRoot, "artifact.json");
    const canonicalMergePath = join(workingRoot, "canonical-merge.json");
    const graduationPlanPath = join(workingRoot, "graduation-plan.json");
    const projectionPath = join(workingRoot, "projection.json");
    const outputRoot = join(workingRoot, "overlay");

    await writeJson(artifactPath, {
      submitResult: {
        accepted: [
          {
            surface: {
              surfaceId: "surface-1",
              surfaceKind: "event_candidate",
              displayLabel: "CAC meeting for bus lane proposal",
              rawText: "CAC meeting for bus lane proposal",
              rawPayload: {
                eventFamilyRaw: "CAC meeting",
                eventSubtypeRaw: "CAC Meeting",
                treatmentRaw: "offset bus lane",
              },
            },
          },
          {
            surface: {
              surfaceId: "surface-2",
              surfaceKind: "event_candidate",
              displayLabel: "Public workshop without family field",
              rawText: "Public workshop about Select Bus Service planning",
              rawPayload: {
                eventSubtypeRaw: "public workshop",
              },
            },
          },
        ],
      },
    });

    await writeJson(canonicalMergePath, {
      canonicalArtifacts: [
        {
          artifactPath,
          sourceId: "fixture-source",
          pageNumbers: [1],
        },
      ],
    });

    await writeJson(graduationPlanPath, {
      graduationKeys: [
        {
          id: "eventFamily",
          targetPayloadPath: "canonicalPayload.eventFamily",
          sourceFieldPaths: ["rawPayload.eventFamilyRaw", "rawPayload.familyRaw"],
        },
        {
          id: "eventSubtype",
          targetPayloadPath: "canonicalPayload.eventSubtype",
          sourceFieldPaths: ["rawPayload.eventSubtypeRaw"],
        },
        {
          id: "eventTreatmentFamily",
          targetPayloadPath: "canonicalPayload.treatmentFamily",
          sourceFieldPaths: ["rawPayload.treatmentRaw"],
        },
      ],
    });

    await writeJson(projectionPath, {
      artifactKind: "bp.tier2_vocab_normalization_projection.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T00:00:00.000Z",
      sourceManifestPath: join(workingRoot, "manifest.json"),
      rowCount: 3,
      rows: [
        projectionRow({
          keyId: "eventFamily",
          targetPayloadPath: "canonicalPayload.eventFamily",
          rawValue: "community_outreach",
          canonicalLeafId: "community_outreach",
          canonicalLeafLabel: "Community Outreach",
          coarseFamily: "public_engagement",
        }),
        projectionRow({
          keyId: "eventSubtype",
          targetPayloadPath: "canonicalPayload.eventSubtype",
          rawValue: "cac_meeting",
          canonicalLeafId: "advisory_committee_meeting",
          canonicalLeafLabel: "Advisory Committee Meeting",
          coarseFamily: "public_engagement",
        }),
        projectionRow({
          keyId: "eventTreatmentFamily",
          targetPayloadPath: "canonicalPayload.treatmentFamily",
          rawValue: "offset_bus_lane",
          canonicalLeafId: "offset_bus_lane",
          canonicalLeafLabel: "Offset Bus Lane",
          coarseFamily: "bus_lane",
        }),
      ],
    });

    const result = await buildTier2ManualVocabProjectionOverlay({
      canonicalMergePath,
      graduationPlanPath,
      sourceProjectionPath: projectionPath,
      outputRoot,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.expandedProjection.rowCount).toBe(7);

    const rows = result.overlay["rows"] as Array<{
      keyId: string;
      rawValue: string;
      decision: string;
      canonicalLeafId: string | null;
      manualRuleId: string;
    }>;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: "eventFamily",
          rawValue: "CAC meeting",
          decision: "mapped",
          canonicalLeafId: "community_outreach",
        }),
        expect.objectContaining({
          keyId: "eventSubtype",
          rawValue: "CAC Meeting",
          decision: "mapped",
          canonicalLeafId: "advisory_committee_meeting",
          manualRuleId: "manual_normalized_existing_alias",
        }),
        expect.objectContaining({
          keyId: "eventTreatmentFamily",
          rawValue: "offset bus lane",
          decision: "mapped",
          canonicalLeafId: "offset_bus_lane",
          manualRuleId: "manual_normalized_existing_alias",
        }),
      ]),
    );

    const review = await Bun.file(result.missingSourceReviewPath).json();
    expect(review.summary.eventCandidateWithoutFamilyLikeFieldCount).toBe(1);
    expect(review.surfaces[0].reviewSuggestion).toMatchObject({
      decision: "mapped",
      canonicalLeafId: "community_outreach",
    });
  });

  test("maps deterministic metric, entity, and narrative residual vocab rows", async () => {
    const artifactPath = join(workingRoot, "artifact-residual.json");
    const canonicalMergePath = join(workingRoot, "canonical-merge-residual.json");
    const graduationPlanPath = join(workingRoot, "graduation-plan-residual.json");
    const projectionPath = join(workingRoot, "projection-residual.json");
    const outputRoot = join(workingRoot, "overlay-residual");

    await writeJson(artifactPath, {
      submitResult: {
        accepted: [
          {
            surface: {
              surfaceId: "metric-1",
              surfaceKind: "metric_observation",
              displayLabel: "Average speed and traffic volume",
              rawPayload: {
                metricLabel: "Bus Speed (MPH)",
                subjectRaw: "traffic_volume",
                unitRaw: "Vehicles / hour",
              },
            },
          },
          {
            surface: {
              surfaceId: "entity-1",
              surfaceKind: "entity_mention",
              displayLabel: "Map label street destination",
              rawPayload: {
                entityKindRaw: "destination",
                roleRaw: "map_label_street",
              },
            },
          },
          {
            surface: {
              surfaceId: "claim-1",
              surfaceKind: "claim",
              displayLabel: "Public opinion result",
              rawPayload: {
                claimKindRaw: "public_opinion_result",
                researchUseTagsRaw: ["community_concern"],
              },
            },
          },
          {
            surface: {
              surfaceId: "context-1",
              surfaceKind: "context_signal",
              displayLabel: "Photo caption context",
              rawPayload: {
                contextKindRaw: "photograph_caption",
              },
            },
          },
          {
            surface: {
              surfaceId: "question-1",
              surfaceKind: "review_question",
              displayLabel: "Diagram clarification question",
              rawPayload: {
                questionKindRaw: "diagram_clarification",
              },
            },
          },
          {
            surface: {
              surfaceId: "table-1",
              surfaceKind: "table_observation",
              displayLabel: "Project schedule table",
              rawPayload: {
                tableKindRaw: "project_schedule",
              },
            },
          },
        ],
      },
    });

    await writeJson(canonicalMergePath, {
      canonicalArtifacts: [{ artifactPath, sourceId: "fixture-source", pageNumbers: [2] }],
    });

    await writeJson(graduationPlanPath, {
      graduationKeys: [
        key("metricFamily", "canonicalPayload.metricFamily", ["rawPayload.metricLabel"]),
        key("metricSubjectFamily", "canonicalPayload.metricSubjectFamily", [
          "rawPayload.subjectRaw",
        ]),
        key("metricUnit", "canonicalPayload.metricUnit", ["rawPayload.unitRaw"]),
        key("entityKind", "canonicalPayload.entityKind", ["rawPayload.entityKindRaw"]),
        key("entityRole", "canonicalPayload.entityRole", ["rawPayload.roleRaw"]),
        key("claimKind", "canonicalPayload.claimKind", ["rawPayload.claimKindRaw"]),
        key("claimResearchUseTag", "canonicalPayload.researchUseTags", [
          "rawPayload.researchUseTagsRaw",
        ]),
        key("contextKind", "canonicalPayload.contextKind", ["rawPayload.contextKindRaw"]),
        key("questionKind", "canonicalPayload.questionKind", ["rawPayload.questionKindRaw"]),
        key("tableKind", "canonicalPayload.tableKind", ["rawPayload.tableKindRaw"]),
      ],
    });

    await writeJson(projectionPath, {
      artifactKind: "bp.tier2_vocab_normalization_projection.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T00:00:00.000Z",
      sourceManifestPath: join(workingRoot, "manifest-residual.json"),
      rowCount: 10,
      rows: [
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "bus_speed_mph",
          canonicalLeafId: "bus_speed_mph",
          canonicalLeafLabel: "Bus Speed (MPH)",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricSubjectFamily",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          rawValue: "general_traffic_volume",
          canonicalLeafId: "general_traffic_volume",
          canonicalLeafLabel: "General Traffic Volume",
          coarseFamily: "traffic_operations",
        }),
        projectionRow({
          keyId: "metricUnit",
          targetPayloadPath: "canonicalPayload.metricUnit",
          rawValue: "vehicles_per_hour",
          canonicalLeafId: "vehicles_per_hour",
          canonicalLeafLabel: "Vehicles per Hour",
          coarseFamily: "vehicles",
        }),
        projectionRow({
          keyId: "entityKind",
          targetPayloadPath: "canonicalPayload.entityKind",
          rawValue: "location",
          canonicalLeafId: "location",
          canonicalLeafLabel: "Location",
          coarseFamily: "geography",
        }),
        projectionRow({
          keyId: "entityRole",
          targetPayloadPath: "canonicalPayload.entityRole",
          rawValue: "map_label",
          canonicalLeafId: "map_label",
          canonicalLeafLabel: "Map Label",
          coarseFamily: "visual_role",
        }),
        projectionRow({
          keyId: "claimKind",
          targetPayloadPath: "canonicalPayload.claimKind",
          rawValue: "survey_finding",
          canonicalLeafId: "survey_finding",
          canonicalLeafLabel: "Survey Finding",
          coarseFamily: "engagement_claim",
        }),
        projectionRow({
          keyId: "claimResearchUseTag",
          targetPayloadPath: "canonicalPayload.researchUseTags",
          rawValue: "community_engagement",
          canonicalLeafId: "community_engagement",
          canonicalLeafLabel: "Community Engagement",
          coarseFamily: "engagement",
        }),
        projectionRow({
          keyId: "contextKind",
          targetPayloadPath: "canonicalPayload.contextKind",
          rawValue: "image_caption",
          canonicalLeafId: "image_caption",
          canonicalLeafLabel: "Image Caption",
          coarseFamily: "visual_context",
        }),
        projectionRow({
          keyId: "questionKind",
          targetPayloadPath: "canonicalPayload.questionKind",
          rawValue: "map_content_clarification",
          canonicalLeafId: "map_content_clarification",
          canonicalLeafLabel: "Map Content Clarification",
          coarseFamily: "visual_question",
        }),
        projectionRow({
          keyId: "tableKind",
          targetPayloadPath: "canonicalPayload.tableKind",
          rawValue: "project_timeline",
          canonicalLeafId: "project_timeline",
          canonicalLeafLabel: "Project Timeline",
          coarseFamily: "project_table",
        }),
      ],
    });

    const result = await buildTier2ManualVocabProjectionOverlay({
      canonicalMergePath,
      graduationPlanPath,
      sourceProjectionPath: projectionPath,
      outputRoot,
      keyIds: [
        "metricFamily",
        "metricSubjectFamily",
        "metricUnit",
        "entityKind",
        "entityRole",
        "claimKind",
        "claimResearchUseTag",
        "contextKind",
        "questionKind",
        "tableKind",
      ],
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    const rows = result.overlay["rows"] as Array<{
      keyId: string;
      rawValue: string;
      decision: string;
      canonicalLeafId: string | null;
    }>;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Bus Speed (MPH)",
          decision: "mapped",
          canonicalLeafId: "bus_speed_mph",
        }),
        expect.objectContaining({
          keyId: "metricSubjectFamily",
          rawValue: "traffic_volume",
          decision: "mapped",
          canonicalLeafId: "general_traffic_volume",
        }),
        expect.objectContaining({
          keyId: "metricUnit",
          rawValue: "Vehicles / hour",
          decision: "mapped",
          canonicalLeafId: "vehicles_per_hour",
        }),
        expect.objectContaining({
          keyId: "entityKind",
          rawValue: "destination",
          decision: "mapped",
          canonicalLeafId: "location",
        }),
        expect.objectContaining({
          keyId: "entityRole",
          rawValue: "map_label_street",
          decision: "mapped",
          canonicalLeafId: "map_label",
        }),
        expect.objectContaining({
          keyId: "claimKind",
          rawValue: "public_opinion_result",
          decision: "mapped",
          canonicalLeafId: "survey_finding",
        }),
        expect.objectContaining({
          keyId: "claimResearchUseTag",
          rawValue: "community_concern",
          decision: "mapped",
          canonicalLeafId: "community_engagement",
        }),
        expect.objectContaining({
          keyId: "contextKind",
          rawValue: "photograph_caption",
          decision: "mapped",
          canonicalLeafId: "image_caption",
        }),
        expect.objectContaining({
          keyId: "questionKind",
          rawValue: "diagram_clarification",
          decision: "mapped",
          canonicalLeafId: "map_content_clarification",
        }),
        expect.objectContaining({
          keyId: "tableKind",
          rawValue: "project_schedule",
          decision: "mapped",
          canonicalLeafId: "project_timeline",
        }),
      ]),
    );
  });

  test("quarantines unsafe source metric aliases before expanding projection", async () => {
    const artifactPath = join(workingRoot, "artifact-unsafe-metric.json");
    const canonicalMergePath = join(workingRoot, "canonical-merge-unsafe-metric.json");
    const graduationPlanPath = join(workingRoot, "graduation-plan-unsafe-metric.json");
    const projectionPath = join(workingRoot, "projection-unsafe-metric.json");
    const outputRoot = join(workingRoot, "overlay-unsafe-metric");

    await writeJson(artifactPath, {
      submitResult: {
        accepted: [
          {
            surface: {
              surfaceId: "metric-unsafe-1",
              surfaceKind: "metric_observation",
              displayLabel: "Generic running time and headway metrics",
              rawPayload: {
                metricLabel: "Running Time",
                subjectRaw: "Passenger service headway",
              },
            },
          },
        ],
      },
    });

    await writeJson(canonicalMergePath, {
      canonicalArtifacts: [{ artifactPath, sourceId: "fixture-source", pageNumbers: [3] }],
    });

    await writeJson(graduationPlanPath, {
      graduationKeys: [
        key("metricFamily", "canonicalPayload.metricFamily", ["rawPayload.metricLabel"]),
        key("metricSubjectFamily", "canonicalPayload.metricSubjectFamily", [
          "rawPayload.subjectRaw",
        ]),
      ],
    });

    await writeJson(projectionPath, {
      artifactKind: "bp.tier2_vocab_normalization_projection.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T00:00:00.000Z",
      sourceManifestPath: join(workingRoot, "manifest-unsafe-metric.json"),
      rowCount: 2,
      rows: [
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Running Time",
          canonicalLeafId: "lic_to_jamaica_rail_running_time",
          canonicalLeafLabel: "LIC to Jamaica Rail Running Time",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricSubjectFamily",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          rawValue: "Passenger service headway",
          canonicalLeafId: "proposed_lmb_service_frequency",
          canonicalLeafLabel: "Proposed LMB service frequency",
          coarseFamily: "bus_performance",
        }),
      ],
    });

    const result = await buildTier2ManualVocabProjectionOverlay({
      canonicalMergePath,
      graduationPlanPath,
      sourceProjectionPath: projectionPath,
      outputRoot,
      keyIds: ["metricFamily", "metricSubjectFamily"],
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.overlay["summary"]).toMatchObject({
      sourceProjectionSanitizedRowCount: 2,
      manualProjectionRowCount: 0,
    });
    expect(result.expandedProjection.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Running Time",
          decision: "preserve_raw",
          originalDecision: "mapped",
          canonicalLeafId: null,
        }),
        expect.objectContaining({
          keyId: "metricSubjectFamily",
          rawValue: "Passenger service headway",
          decision: "preserve_raw",
          originalDecision: "mapped",
          canonicalLeafId: null,
        }),
      ]),
    );
  });

  test("quarantines broad metric aliases while keeping public-claim-safe metric aliases", async () => {
    const artifactPath = join(workingRoot, "artifact-broad-metric.json");
    const canonicalMergePath = join(workingRoot, "canonical-merge-broad-metric.json");
    const graduationPlanPath = join(workingRoot, "graduation-plan-broad-metric.json");
    const projectionPath = join(workingRoot, "projection-broad-metric.json");
    const outputRoot = join(workingRoot, "overlay-broad-metric");

    await writeJson(artifactPath, {
      submitResult: {
        accepted: [
          {
            surface: {
              surfaceId: "metric-broad-1",
              surfaceKind: "metric_observation",
              displayLabel: "Mixed metric labels",
              rawPayload: {
                metricLabels: [
                  "lane_width",
                  "Bus Lane Width",
                  "Second Avenue Taxi Speed",
                  "Bx12 SBS bus speed",
                  "Bus Speed Change",
                  "Travel Time Change",
                  "Q52 SBS travel time",
                ],
                subjectRaw: ["vehicular travel time", "B82 travel time"],
              },
            },
          },
        ],
      },
    });

    await writeJson(canonicalMergePath, {
      canonicalArtifacts: [{ artifactPath, sourceId: "fixture-source", pageNumbers: [4] }],
    });

    await writeJson(graduationPlanPath, {
      graduationKeys: [
        key("metricFamily", "canonicalPayload.metricFamily", ["rawPayload.metricLabels"]),
        key("metricSubjectFamily", "canonicalPayload.metricSubjectFamily", [
          "rawPayload.subjectRaw",
        ]),
      ],
    });

    await writeJson(projectionPath, {
      artifactKind: "bp.tier2_vocab_normalization_projection.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-06T00:00:00.000Z",
      sourceManifestPath: join(workingRoot, "manifest-broad-metric.json"),
      rowCount: 9,
      rows: [
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "lane_width",
          canonicalLeafId: "bus_lane_width_feet",
          canonicalLeafLabel: "Bus Lane Width (feet)",
          coarseFamily: "street_geometry",
        }),
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Bus Lane Width",
          canonicalLeafId: "bus_lane_width_feet",
          canonicalLeafLabel: "Bus Lane Width (feet)",
          coarseFamily: "street_geometry",
        }),
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Second Avenue Taxi Speed",
          canonicalLeafId: "bus_speed_mph",
          canonicalLeafLabel: "Bus Speed (MPH)",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Bx12 SBS bus speed",
          canonicalLeafId: "bus_speed_mph",
          canonicalLeafLabel: "Bus Speed (MPH)",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Bus Speed Change",
          canonicalLeafId: "bus_speed_mph",
          canonicalLeafLabel: "Bus Speed (MPH)",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Travel Time Change",
          canonicalLeafId: "bus_running_time_minutes",
          canonicalLeafLabel: "Bus Running Time (minutes)",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricFamily",
          targetPayloadPath: "canonicalPayload.metricFamily",
          rawValue: "Q52 SBS travel time",
          canonicalLeafId: "bus_running_time_minutes",
          canonicalLeafLabel: "Bus Running Time (minutes)",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricSubjectFamily",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          rawValue: "vehicular travel time",
          canonicalLeafId: "bus_travel_time",
          canonicalLeafLabel: "Bus travel time",
          coarseFamily: "bus_performance",
        }),
        projectionRow({
          keyId: "metricSubjectFamily",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          rawValue: "B82 travel time",
          canonicalLeafId: "bus_travel_time",
          canonicalLeafLabel: "Bus travel time",
          coarseFamily: "bus_performance",
        }),
      ],
    });

    const result = await buildTier2ManualVocabProjectionOverlay({
      canonicalMergePath,
      graduationPlanPath,
      sourceProjectionPath: projectionPath,
      outputRoot,
      keyIds: ["metricFamily", "metricSubjectFamily"],
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.overlay["summary"]).toMatchObject({
      sourceProjectionSanitizedRowCount: 5,
      manualProjectionRowCount: 0,
    });
    expect(result.expandedProjection.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "lane_width",
          decision: "preserve_raw",
          canonicalLeafId: null,
        }),
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Bus Lane Width",
          decision: "mapped",
          canonicalLeafId: "bus_lane_width_feet",
        }),
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Second Avenue Taxi Speed",
          decision: "preserve_raw",
          canonicalLeafId: null,
        }),
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Bx12 SBS bus speed",
          decision: "mapped",
          canonicalLeafId: "bus_speed_mph",
        }),
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Bus Speed Change",
          decision: "preserve_raw",
          canonicalLeafId: null,
        }),
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Travel Time Change",
          decision: "preserve_raw",
          canonicalLeafId: null,
        }),
        expect.objectContaining({
          keyId: "metricFamily",
          rawValue: "Q52 SBS travel time",
          decision: "mapped",
          canonicalLeafId: "bus_running_time_minutes",
        }),
        expect.objectContaining({
          keyId: "metricSubjectFamily",
          rawValue: "vehicular travel time",
          decision: "preserve_raw",
          canonicalLeafId: null,
        }),
        expect.objectContaining({
          keyId: "metricSubjectFamily",
          rawValue: "B82 travel time",
          decision: "mapped",
          canonicalLeafId: "bus_travel_time",
        }),
      ]),
    );
  });
});

function key(id: string, targetPayloadPath: string, sourceFieldPaths: string[]) {
  return { id, targetPayloadPath, sourceFieldPaths };
}

function projectionRow(input: {
  keyId: string;
  targetPayloadPath: string;
  rawValue: string;
  canonicalLeafId: string;
  canonicalLeafLabel: string;
  coarseFamily: string;
}) {
  return {
    keyId: input.keyId,
    targetPayloadPath: input.targetPayloadPath,
    rawValue: input.rawValue,
    decision: "mapped",
    originalDecision: "mapped",
    canonicalLeafId: input.canonicalLeafId,
    canonicalLeafLabel: input.canonicalLeafLabel,
    coarseFamily: input.coarseFamily,
    modifiers: {
      routeIds: [],
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
