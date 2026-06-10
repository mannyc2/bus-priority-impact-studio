import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  buildTier2FeatureProofLedger,
  runTier2FeatureProofLedger,
} from "../../../../src/commands/docs/tier2/feature-harness/proof-ledger.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-feature-proof-ledger");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 feature proof ledger", () => {
  test("classifies normalized vocab fields into proof states and retry errors", async () => {
    const vocabApplicationPath = join(workingRoot, "vocab-surface-application.json");
    await writeJson(vocabApplicationPath, fixtureVocabApplication());

    const artifact = await buildTier2FeatureProofLedger({
      vocabApplicationPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(artifact.artifactKind).toBe("bp.tier2_feature_proof_ledger.v1");
    expect(artifact.sourceCanonicalMergePath).toBe(join(workingRoot, "canonical-merge.json"));
    expect(artifact.summary.fieldCandidateCount).toBe(4);
    expect(artifact.summary.publishableFieldWithoutProofCount).toBe(0);

    const verifiedMetric = artifact.candidates.find((candidate) => candidate.rawValue === "B41 bus speed");
    expect(verifiedMetric?.featureFamily).toBe("metric_claim");
    expect(verifiedMetric?.proofState).toBe("verified");
    expect(verifiedMetric?.promotionEligibility.publicFeature).toBe(true);
    expect(verifiedMetric?.metricCompleteness?.value.path).toBe("rawPayload.valueRaw");

    const weakMetric = artifact.candidates.find((candidate) => candidate.rawValue === "generic speed");
    expect(weakMetric?.proofState).toBe("resolver_missing");
    expect(weakMetric?.promotionEligibility.publicFeature).toBe(false);
    expect(weakMetric?.validationErrors.map((error) => error.code)).toEqual([
      "field_support_missing",
      "metric_value_missing",
      "metric_authority_missing",
      "metric_publication_gate_missing",
    ]);

    const preserved = artifact.candidates.find((candidate) => candidate.rawValue === "overtaking_capability");
    expect(preserved?.proofState).toBe("quarantined");
    expect(preserved?.validationErrors.map((error) => error.code)).toContain("preserve_raw_quarantined");

    const unresolved = artifact.candidates.find((candidate) => candidate.rawValue === "route_title_as_kind");
    expect(unresolved?.proofState).toBe("resolver_missing");
    expect(unresolved?.validationErrors.map((error) => error.code)).toContain("canonical_resolver_missing");

    expect(artifact.validationRetryBatches.map((batch) => batch.code)).toContain("field_support_missing");
    expect(artifact.fieldOwnership.deterministicRunnerFields).toContain("promotionEligibility");
  });

  test("writes ledger, markdown, and summary artifacts", async () => {
    const vocabApplicationPath = join(workingRoot, "vocab-surface-application.json");
    const outputPath = join(workingRoot, "feature-proof-ledger.json");
    await writeJson(vocabApplicationPath, fixtureVocabApplication());

    const result = await runTier2FeatureProofLedger({
      vocabApplicationPath,
      outputPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.outputPath).toBe(outputPath);
    expect(await Bun.file(outputPath).exists()).toBe(true);
    expect(await Bun.file(result.markdownPath).exists()).toBe(true);
    expect(await Bun.file(result.summaryPath).exists()).toBe(true);

    const summary = await Bun.file(result.summaryPath).json();
    expect(summary.artifactKind).toBe("bp.tier2_feature_proof_ledger_summary.v1");
    expect(summary.summary.fieldCandidateCount).toBe(4);
  });
});

function fixtureVocabApplication() {
  return {
    artifactKind: "bp.tier2_vocab_surface_application.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T00:00:00.000Z",
    sourceCanonicalMergePath: join(workingRoot, "canonical-merge.json"),
    normalizedAcceptedSurfaces: [
      normalizedSurface({
        surfaceId: "metric-verified",
        surfaceKind: "metric_observation",
        rawPayload: {
          metricLabel: "B41 bus speed",
          valueRaw: "7 mph",
          sourceClaimAuthority: "source_stated",
          publicationWordingGate: "publishable_source_stated",
        },
        fieldMappings: [
          fieldMapping({
            keyId: "metricFamily",
            sourceFieldPath: "rawPayload.metricLabel",
            rawValue: "B41 bus speed",
            canonicalLeafId: "bus_speed_mph",
          }),
        ],
        fieldSupport: [
          support("metric-verified:support:label", "rawPayload.metricLabel", "metric-verified:pointer:label"),
          support("metric-verified:support:value", "rawPayload.valueRaw", "metric-verified:pointer:value"),
          support(
            "metric-verified:support:authority",
            "rawPayload.sourceClaimAuthority",
            "metric-verified:pointer:authority",
          ),
          support(
            "metric-verified:support:gate",
            "rawPayload.publicationWordingGate",
            "metric-verified:pointer:gate",
          ),
        ],
      }),
      normalizedSurface({
        surfaceId: "metric-weak",
        surfaceKind: "metric_observation",
        rawPayload: { metricLabel: "generic speed" },
        fieldMappings: [
          fieldMapping({
            keyId: "metricFamily",
            sourceFieldPath: "rawPayload.metricLabel",
            rawValue: "generic speed",
            canonicalLeafId: "bus_speed_mph",
            fieldSupportFound: false,
          }),
        ],
        fieldSupport: [],
      }),
      normalizedSurface({
        surfaceId: "claim-preserved",
        surfaceKind: "claim",
        rawPayload: { researchUseTagsRaw: ["overtaking_capability"] },
        unresolvedFields: [
          unresolvedField({
            keyId: "claimResearchUseTag",
            sourceFieldPath: "rawPayload.researchUseTagsRaw",
            rawValue: "overtaking_capability",
            decision: "preserve_raw",
          }),
        ],
        fieldSupport: [],
      }),
      normalizedSurface({
        surfaceId: "entity-unresolved",
        surfaceKind: "entity_mention",
        rawPayload: { entityKind: "route_title_as_kind" },
        unresolvedFields: [
          unresolvedField({
            keyId: "entityKind",
            sourceFieldPath: "rawPayload.entityKind",
            rawValue: "route_title_as_kind",
            decision: "unresolved",
          }),
        ],
        fieldSupport: [],
      }),
    ],
  };
}

function normalizedSurface(input: {
  surfaceId: string;
  surfaceKind: string;
  rawPayload: Record<string, unknown>;
  fieldMappings?: unknown[];
  unresolvedFields?: unknown[];
  fieldSupport: unknown[];
}) {
  return {
    artifactPath: join(workingRoot, `${input.surfaceId}.json`),
    auditPath: null,
    windowId: "fixture-source:1",
    runId: "fixture-run",
    shardId: "shard-0001",
    sourceId: "fixture-source",
    pageNumbers: [1],
    draftIndex: 0,
    surface: {
      schemaVersion: 2,
      surfaceId: input.surfaceId,
      sourceId: "fixture-source",
      sourceGroup: "fixture",
      pageNumbers: [1],
      surfaceKind: input.surfaceKind,
      rawText: "Fixture source text.",
      displayLabel: input.surfaceId,
      payloadSchemaId: "fixture/v1",
      rawPayload: input.rawPayload,
      canonicalPayload: {},
      normalization: {
        fieldMappings: input.fieldMappings ?? [],
        unresolvedFields: input.unresolvedFields ?? [],
        targetWrites: [],
      },
    },
    fieldSupport: input.fieldSupport,
    evidencePointers: [],
    acceptedCanonicalFields: [],
    warnings: [],
  };
}

function fieldMapping(input: {
  keyId: string;
  sourceFieldPath: string;
  rawValue: string;
  canonicalLeafId: string;
  fieldSupportFound?: boolean;
}) {
  const fieldSupportFound = input.fieldSupportFound ?? true;
  return {
    keyId: input.keyId,
    sourceFieldPath: input.sourceFieldPath,
    targetPayloadPath: "canonicalPayload.metricFamily",
    rawValue: input.rawValue,
    decision: "mapped",
    originalDecision: "mapped",
    canonicalLeafId: input.canonicalLeafId,
    canonicalLeafLabel: "Bus speed",
    coarseFamily: "travel_time_speed",
    modifiers: { routeIds: ["B41"], modes: ["bus"] },
    evidence: {
      fieldSupportFound,
      supportIds: fieldSupportFound ? [`${input.rawValue}:support`] : [],
      evidencePointerIds: fieldSupportFound ? [`${input.rawValue}:pointer`] : [],
      verifierStates: fieldSupportFound ? ["verified"] : [],
      supportCompleteness: fieldSupportFound ? ["exact"] : [],
    },
  };
}

function unresolvedField(input: {
  keyId: string;
  sourceFieldPath: string;
  rawValue: string;
  decision: "preserve_raw" | "unresolved";
}) {
  return {
    keyId: input.keyId,
    sourceFieldPath: input.sourceFieldPath,
    targetPayloadPath: "canonicalPayload.researchUseTags",
    rawValue: input.rawValue,
    decision: input.decision,
    originalDecision: input.decision,
    reason: "Fixture unresolved field.",
    coarseFamily: "other",
    modifiers: { routeIds: [], modes: [] },
    evidence: {
      fieldSupportFound: false,
      supportIds: [],
      evidencePointerIds: [],
      verifierStates: [],
      supportCompleteness: [],
    },
  };
}

function support(supportId: string, fieldPath: string, pointerId: string) {
  return {
    supportId,
    surfaceId: "metric-verified",
    fieldPath,
    evidencePointers: [pointerId],
    verifierState: "verified",
    supportCompleteness: "exact",
  };
}
