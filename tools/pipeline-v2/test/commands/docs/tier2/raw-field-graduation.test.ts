import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2RawFieldGraduationPlan } from "../../../../src/commands/docs/tier2/_raw-field-graduation.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-raw-field-graduation");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function writeArtifact(input: { name?: string; labelRaw?: string } = {}) {
  const artifactDir = join(workingRoot, "shards", "shard-0001", input.name ?? "window");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = join(artifactDir, "artifact.json");
  await writeJson(artifactPath, {
    source: {
      sourceId: "fixture-source",
      sourceGroup: "fixture",
      pageNumbers: [1],
    },
    submitResult: {
      accepted: [
        {
          surface: {
            surfaceId: "surface-metric",
            surfaceKind: "metric_observation",
            displayLabel: "Bus speeds improved 31%",
            payloadSchemaId: "bp.metric_observation.v1",
            rawPayload: {
              labelRaw: input.labelRaw ?? "Bus speed improvement",
              subjectRaw: "bus speeds",
              unitRaw: "%",
              valueRaw: "31%",
              routeTextRaw: "M60 SBS",
              periodRaw: "AM peak",
            },
          },
        },
        {
          surface: {
            surfaceId: "surface-claim",
            surfaceKind: "claim",
            displayLabel: "Existing condition claim",
            payloadSchemaId: "bp.claim.v1",
            rawPayload: {
              claimKindRaw: "existing_condition",
              researchUseTagsRaw: ["detector_evidence", "bus_priority"],
              claimTextRaw: "Buses are delayed at the intersection.",
            },
          },
        },
        {
          surface: {
            surfaceId: "surface-event",
            surfaceKind: "event_candidate",
            displayLabel: "Community board presentation",
            payloadSchemaId: "bp.event_candidate.v1",
            rawPayload: {
              familyRaw: "public_outreach",
              subtypeRaw: "community_board_presentation",
              treatmentRaw: "Select Bus Service",
              statusRaw: "planned",
              dateRaw: "June 2015",
            },
          },
        },
        {
          surface: {
            surfaceId: "surface-entity",
            surfaceKind: "entity_mention",
            displayLabel: "NYC DOT",
            payloadSchemaId: "bp.entity_mention.v1",
            rawPayload: {
              rawKind: "agency",
              roleRaw: "lead_agency",
              entityTextRaw: "NYC DOT",
            },
          },
        },
      ],
    },
  });
  return artifactPath;
}

describe("Tier 2 raw field graduation planner", () => {
  test("classifies raw fields and builds LLM-ready vocabulary batches", async () => {
    await writeArtifact();

    const plan = await buildTier2RawFieldGraduationPlan({
      roots: [workingRoot],
      generatedAt: "2026-06-05T00:00:00.000Z",
      maxValuesPerKey: 50,
      examplesPerValue: 2,
    });

    expect(plan.summary.artifactCount).toBe(1);
    expect(plan.summary.acceptedSurfaceCount).toBe(4);
    expect(plan.summary.graduationKeyCount).toBe(13);
    expect(plan.safetyPolicy.rawPayloadMutationAllowed).toBe(false);

    const metricUnit = plan.graduationKeys.find((key) => key.id === "metricUnit");
    expect(metricUnit?.targetPayloadPath).toBe("canonicalPayload.metricUnit");
    expect(metricUnit?.topValues.map((value) => value.value)).toContain("%");

    const claimKindRaw = plan.rawFieldInventory.find(
      (field) => field.fieldPath === "rawPayload.claimKindRaw",
    );
    expect(claimKindRaw?.disposition).toBe("llm_vocab_candidate");
    expect(claimKindRaw?.graduationKeyId).toBe("claimKind");

    const routeTextRaw = plan.rawFieldInventory.find(
      (field) => field.fieldPath === "rawPayload.routeTextRaw",
    );
    expect(routeTextRaw?.disposition).toBe("deterministic_catalog_or_parser");

    const claimTextRaw = plan.rawFieldInventory.find(
      (field) => field.fieldPath === "rawPayload.claimTextRaw",
    );
    expect(claimTextRaw?.disposition).toBe("preserve_source_wording");
  });

  test("can read only selected artifacts from a canonical merge artifact", async () => {
    const selectedPath = await writeArtifact({
      name: "selected-window",
      labelRaw: "Selected metric family",
    });
    await writeArtifact({ name: "superseded-window", labelRaw: "Superseded metric family" });
    const canonicalMergePath = join(workingRoot, "canonical-merge.json");
    await writeJson(canonicalMergePath, {
      artifactKind: "bp.tier2_agentic_canonical_merge.v1",
      schemaVersion: 1,
      canonicalArtifacts: [
        {
          windowId: "fixture-source:1",
          artifactPath: selectedPath,
        },
      ],
    });

    const plan = await buildTier2RawFieldGraduationPlan({
      canonicalMergePath,
      generatedAt: "2026-06-05T00:00:00.000Z",
      maxValuesPerKey: 50,
      examplesPerValue: 2,
    });

    expect(plan.sourceRoots).toEqual([]);
    expect(plan.sourceCanonicalMergePaths).toEqual([canonicalMergePath]);
    expect(plan.summary.artifactCount).toBe(1);
    expect(plan.summary.acceptedSurfaceCount).toBe(4);

    const metricFamily = plan.graduationKeys.find((key) => key.id === "metricFamily");
    expect(metricFamily?.topValues.map((value) => value.value)).toContain("Selected metric family");
    expect(metricFamily?.topValues.map((value) => value.value)).not.toContain(
      "Superseded metric family",
    );
  });
});
