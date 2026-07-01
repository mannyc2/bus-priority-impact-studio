import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2VocabMapPack } from "../../../../src/commands/docs/tier2/_vocab-map-pack.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-vocab-map-pack");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

function canonical(input: {
  canonicalId: string;
  label: string;
  metricFamily?: string;
  measurementDimension?: string;
  countedEntityFamily?: string;
  positiveExamples?: string[];
}) {
  return {
    canonicalId: input.canonicalId,
    label: input.label,
    description: `${input.label} description`,
    measurementDimension: input.measurementDimension ?? "count",
    metricFamily: input.metricFamily ?? "street_geometry",
    mergePolicy: "family_rollup_allowed",
    ...(input.countedEntityFamily === undefined
      ? {}
      : { countedEntityFamily: input.countedEntityFamily }),
    semanticTags: [input.canonicalId],
    downstreamUses: ["normalization"],
    positiveExamples: input.positiveExamples ?? [input.label],
    negativeExamples: [],
  };
}

function alias(input: {
  rawValue: string;
  decision: "mapped" | "preserve_raw" | "unresolved";
  canonicalId?: string;
  inputCount?: number;
  rationale?: string;
  reviewFlags?: string[];
}) {
  return {
    rawValue: input.rawValue,
    normalizedRawValue: input.rawValue.toLowerCase(),
    decision: input.decision,
    ...(input.canonicalId === undefined ? {} : { canonicalId: input.canonicalId }),
    confidence: 0.95,
    rationale: input.rationale ?? "fixture",
    reviewFlags: input.reviewFlags ?? [],
    inputCount: input.inputCount ?? 1,
    sourceFieldCounts: { "rawPayload.metricLabelRaw": input.inputCount ?? 1 },
    surfaceKindCounts: { metric_observation: input.inputCount ?? 1 },
    examples: [
      {
        artifactPath: join(workingRoot, "artifact.json"),
        sourceId: "fixture-source",
        surfaceKind: "metric_observation",
        sourceFieldPath: "rawPayload.metricLabelRaw",
      },
    ],
  };
}

async function writeCompletedRun(input: {
  label: string;
  keyId: string;
  model?: string;
  targetPayloadPath?: string;
  canonicalValues: ReturnType<typeof canonical>[];
  aliases: ReturnType<typeof alias>[];
}) {
  const dir = join(workingRoot, "queue", input.label);
  await mkdir(dir, { recursive: true });
  const mapPath = join(dir, `vocab-map-${input.keyId}.json`);
  const sourceAuditPath = join(dir, `source-audit-${input.keyId}.json`);
  const runPath = join(dir, "vocab-synthesis-run.json");
  const decisions = input.aliases.map((item) => item.decision);
  await writeJson(mapPath, {
    artifactKind: "bp.tier2_vocab_map.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    promptVersion: "fixture",
    sourceGraduationPlanPath: join(workingRoot, "graduation.json"),
    keyId: input.keyId,
    targetPayloadPath: input.targetPayloadPath ?? `canonicalPayload.${input.keyId}`,
    model: input.model ?? "deepseek-v4-flash",
    temperature: 0.2,
    summary: {
      inputValueCount: input.aliases.length,
      canonicalValueCount: input.canonicalValues.length,
      aliasCount: input.aliases.length,
      mappedCount: decisions.filter((decision) => decision === "mapped").length,
      unresolvedCount: decisions.filter((decision) => decision === "unresolved").length,
      preserveRawCount: decisions.filter((decision) => decision === "preserve_raw").length,
      instanceCoverageCount: input.aliases.reduce((sum, item) => sum + item.inputCount, 0),
    },
    canonicalValues: input.canonicalValues,
    aliases: input.aliases,
    reviewNotes: [],
  });
  await writeJson(sourceAuditPath, {
    artifactKind: "bp.tier2_vocab_source_audit.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    keyId: input.keyId,
    linkedEvidence: {
      checkedExampleCount: input.aliases.length,
      artifactFoundCount: input.aliases.length,
      fieldSupportVerifiedCount: input.aliases.length,
      evidencePointerQuoteCount: input.aliases.length,
      pageMarkdownFoundCount: input.aliases.length,
      pageTextMatchCount: input.aliases.length,
      sampleFailures: [],
    },
    externalMtaSourceScan: {
      scannedDocumentCount: 1,
      documentWithMatchCount: 1,
      matchedAliasCount: input.aliases.length,
      matchedCanonicalIds: {},
      samples: [],
    },
  });
  await writeJson(runPath, {
    artifactKind: "bp.tier2_vocab_synthesis_run.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    sourceGraduationPlanPath: join(workingRoot, "graduation.json"),
    outputRoot: dir,
    keyIds: [input.keyId],
    chunkSize: 40,
    examplesPerValue: 4,
    execute: true,
    harness: "v1",
    provider: "deepseek",
    model: input.model ?? "deepseek-v4-flash",
    temperature: 0.2,
    summary: {
      keyCount: 1,
      chunkCount: 1,
      inputValueCount: input.aliases.length,
      executedChunkCount: 1,
      acceptedChunkCount: 1,
      rejectedChunkCount: 0,
    },
    keys: [],
    chunkResults: [],
    vocabMapPath: mapPath,
    sourceAuditPath,
  });
}

describe("Tier 2 vocab map pack cleanup", () => {
  test("writes cleaned maps, merges duplicate canonicals, remaps exact preserved aliases, and adds additive normalization", async () => {
    await writeCompletedRun({
      label: "01-metricUnit-slice40",
      keyId: "metricUnit",
      canonicalValues: [
        canonical({
          canonicalId: "percent",
          label: "Percent",
          metricFamily: "generic_unit",
          measurementDimension: "ratio_or_share",
        }),
      ],
      aliases: [alias({ rawValue: "percent", decision: "mapped", canonicalId: "percent" })],
    });
    await writeCompletedRun({
      label: "11-eventTreatmentFamily-full",
      keyId: "eventTreatmentFamily",
      canonicalValues: [
        canonical({
          canonicalId: "bus_queue_jump",
          label: "Bus Queue Jump",
          metricFamily: "other",
          measurementDimension: "qualitative",
          positiveExamples: ["bus_queue_jump", "queue_jump_signal"],
        }),
        canonical({
          canonicalId: "final_design_and_engineering",
          label: "Final Design and Engineering",
          metricFamily: "project_delivery",
          measurementDimension: "qualitative",
          positiveExamples: ["final_design_and_engineering"],
        }),
      ],
      aliases: [
        alias({
          rawValue: "Queue Jump Signal",
          decision: "preserve_raw",
          rationale: "specific treatment type",
          inputCount: 3,
        }),
        alias({
          rawValue: "final_design_and_engineering",
          decision: "preserve_raw",
          rationale: "project delivery milestone",
          inputCount: 2,
        }),
      ],
    });
    await writeCompletedRun({
      label: "14-metricFamily-full",
      keyId: "metricFamily",
      canonicalValues: [
        canonical({
          canonicalId: "street_total_width",
          label: "Street Total Width",
          positiveExamples: ["Total Width"],
        }),
        canonical({
          canonicalId: "location_specific_comments_via_online_portal",
          label: "Location-Specific Comments via Online Feedback Portal",
          metricFamily: "community_feedback",
          countedEntityFamily: "community_comments",
          positiveExamples: ["130+ location-specific comments via online feedback portal"],
        }),
        canonical({
          canonicalId: "online_feedback_portal_location_specific_comments",
          label: "Location-Specific Comments via Online Feedback Portal",
          metricFamily: "community_feedback",
          countedEntityFamily: "community_comments",
          positiveExamples: ["51 location-specific comments via online feedback portal"],
        }),
        canonical({
          canonicalId: "route_specific_survey_respondents",
          label: "Route-Specific Survey Respondents",
          metricFamily: "community_feedback",
          countedEntityFamily: "survey_respondents",
          positiveExamples: ["B44 route respondents"],
        }),
      ],
      aliases: [
        alias({ rawValue: "Total Width", decision: "preserve_raw", inputCount: 6 }),
        alias({
          rawValue: "Location-specific comments received via online portal",
          decision: "mapped",
          canonicalId: "online_feedback_portal_location_specific_comments",
          inputCount: 4,
        }),
        alias({
          rawValue: "B46 route respondents",
          decision: "mapped",
          canonicalId: "route_specific_survey_respondents",
          inputCount: 3,
        }),
      ],
    });

    const outputRoot = join(workingRoot, "cleaned");
    const manifest = await buildTier2VocabMapPack({
      runRoot: join(workingRoot, "queue"),
      outputRoot,
      generatedAt: "2026-06-06T12:00:00.000Z",
    });

    expect(manifest.mapCount).toBe(2);
    expect(manifest.cleanedMaps.map((item) => item.keyId).sort()).toEqual([
      "eventTreatmentFamily",
      "metricFamily",
    ]);
    expect(manifest.totals.duplicateCanonicalMerges).toBe(1);
    expect(manifest.totals.exactAliasRemaps).toBe(3);

    const metricEntry = manifest.cleanedMaps.find((item) => item.keyId === "metricFamily");
    if (metricEntry === undefined) throw new Error("missing metricFamily cleaned map");
    const metricMap = await Bun.file(metricEntry.cleanedVocabMapPath).json();
    const feedbackCanonicals = metricMap.canonicalValues.filter(
      (item: { label: string }) =>
        item.label === "Location-Specific Comments via Online Feedback Portal",
    );
    expect(feedbackCanonicals).toHaveLength(1);
    const feedbackAlias = metricMap.aliases.find(
      (item: { rawValue: string }) =>
        item.rawValue === "Location-specific comments received via online portal",
    );
    expect(feedbackAlias.canonicalId).toBe(feedbackCanonicals[0].canonicalId);
    const totalWidth = metricMap.aliases.find(
      (item: { rawValue: string }) => item.rawValue === "Total Width",
    );
    expect(totalWidth.decision).toBe("mapped");
    expect(totalWidth.originalDecision).toBe("preserve_raw");
    expect(totalWidth.canonicalId).toBe("street_total_width");
    expect(totalWidth.normalization.coarseFamily).toBe("street_geometry");

    const b46 = metricMap.aliases.find(
      (item: { rawValue: string }) => item.rawValue === "B46 route respondents",
    );
    expect(b46.normalization.modifiers.routeIds).toEqual(["B46"]);
    expect(b46.normalization.canonicalLeafId).toBe("route_specific_survey_respondents");
    expect(b46.normalization.evidenceProvenance.inputCount).toBe(3);

    const treatmentEntry = manifest.cleanedMaps.find(
      (item) => item.keyId === "eventTreatmentFamily",
    );
    if (treatmentEntry === undefined) throw new Error("missing eventTreatmentFamily cleaned map");
    const treatmentMap = await Bun.file(treatmentEntry.cleanedVocabMapPath).json();
    const queueJump = treatmentMap.aliases.find(
      (item: { rawValue: string }) => item.rawValue === "Queue Jump Signal",
    );
    expect(queueJump.decision).toBe("mapped");
    expect(queueJump.canonicalId).toBe("bus_queue_jump");
    expect(queueJump.normalization.coarseFamily).toBe("signal_priority");
    const finalDesign = treatmentMap.aliases.find(
      (item: { rawValue: string }) => item.rawValue === "final_design_and_engineering",
    );
    expect(finalDesign.decision).toBe("mapped");
    expect(finalDesign.canonicalId).toBe("final_design_and_engineering");
    expect(finalDesign.normalization.coarseFamily).toBe("capital_delivery");
    const finalDesignCanonical = treatmentMap.canonicalValues.find(
      (item: { canonicalId: string }) => item.canonicalId === "final_design_and_engineering",
    );
    expect(finalDesignCanonical.coarseGroup).toBe("capital_delivery");

    const projection = await Bun.file(manifest.projectionPath).json();
    expect(projection.rowCount).toBe(5);
    expect(
      projection.rows.every(
        (row: { evidenceProvenance?: unknown }) => row.evidenceProvenance !== undefined,
      ),
    ).toBe(true);
    expect(await Bun.file(manifest.summaryPath).exists()).toBe(true);
  });
});
