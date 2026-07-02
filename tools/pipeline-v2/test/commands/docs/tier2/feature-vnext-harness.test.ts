import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runTier2FeatureCanary } from "../../../../src/commands/docs/tier2/feature-harness/canary-runner.ts";
import {
  defaultTier2FeatureSmokeRequest,
  TIER2_FEATURE_EXTRACTION_TOOL_NAME,
  type Tier2FeatureExtractionRequest,
} from "../../../../src/commands/docs/tier2/feature-harness/contract.ts";
import { evaluateTier2FeaturePromotionGate } from "../../../../src/commands/docs/tier2/feature-harness/promotion-gate.ts";
import {
  evaluateTier2FeatureQueueManifestGate,
  type Tier2FeatureQueueManifest,
} from "../../../../src/commands/docs/tier2/feature-harness/queue-manifest.ts";
import { runTier2FeatureExtractionVNext } from "../../../../src/commands/docs/tier2/feature-harness/runner.ts";
import type {
  FeatureProofCandidate,
  Tier2FeatureProofLedgerArtifact,
} from "../../../../src/commands/docs/tier2/feature-harness/types.ts";
import { validateTier2FeatureExtractionSubmission } from "../../../../src/commands/docs/tier2/feature-harness/validator.ts";
import {
  runTier2FeatureProofLedgerFromVNext,
  vNextArtifactToProofCandidates,
} from "../../../../src/commands/docs/tier2/feature-harness/vnext-proof-adapter.ts";
import { runTier2FeatureProofLedgerVocabResolver } from "../../../../src/commands/docs/tier2/feature-harness/vocab-resolver.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-feature-vnext-harness");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 feature harness vNext", () => {
  test("rejects invented taxonomy keys before acceptance", () => {
    const validation = validateTier2FeatureExtractionSubmission({
      request: smokeRequest(),
      submission: {
        schemaVersion: 1,
        metricClaimCandidates: [
          {
            rawText: "M15 speed improved.",
            displayLabel: "bad freeform metric",
            metricLabelRaw: "speed",
            eventKind: "bus_speed",
            fieldSupport: [],
          },
        ],
      },
    });

    expect(validation.toolShapeValid).toBe(false);
    expect(validation.validationErrors.map((error) => error.code)).toContain(
      "unknown_category_key",
    );
  });

  test("returns retryable metric validation errors for missing value and proof", () => {
    const validation = validateTier2FeatureExtractionSubmission({
      request: smokeRequest(),
      submission: {
        schemaVersion: 1,
        metricClaimCandidates: [
          {
            rawText: "M15 has weekday riders.",
            displayLabel: "weak metric",
            metricLabelRaw: "weekday riders",
            subjectRaw: "M15 corridor",
            unitRaw: "riders",
            sourceClaimAuthority: "source_stated",
            publicationWordingGate: "publishable_source_stated",
            evidenceByField: {
              rawText: ["ev-smoke-metric"],
              metricLabelRaw: ["ev-smoke-metric"],
            },
          },
        ],
      },
    });

    expect(validation.acceptedCandidateCount).toBe(0);
    expect(validation.rejectedCandidateCount).toBe(1);
    expect(validation.validationErrors.map((error) => error.code)).toEqual([
      "field_support_missing",
      "field_support_missing",
      "metric_value_missing",
      "field_support_missing",
      "field_support_missing",
    ]);
    expect(validation.validationErrors[0]?.llmRetryInstruction).toContain("evidenceByField");
  });

  test("accepts strict metric and treatment candidates with source-local proof", () => {
    const submission = acceptedSubmission();
    (submission.metricClaimCandidates[0] as Record<string, unknown>)["comparatorRaw"] = "";
    const validation = validateTier2FeatureExtractionSubmission({
      request: smokeRequest(),
      submission,
    });

    expect(validation.toolShapeValid).toBe(true);
    expect(validation.acceptedCandidateCount).toBe(2);
    expect(validation.rejectedCandidateCount).toBe(0);
    expect(validation.validationErrorCount).toBe(0);
    expect(validation.validatedCandidates.map((candidate) => candidate.featureFamily)).toEqual([
      "metric_claim",
      "treatment",
    ]);
  });

  test("runs a mocked validator-feedback retry loop", async () => {
    const requestPath = join(workingRoot, "request.json");
    await writeJson(requestPath, smokeRequest());
    const requestBodies: unknown[] = [];
    let limiterCallCount = 0;
    const providerCaller = async (input: unknown) => {
      requestBodies.push(input);
      return forcedProviderResult(
        requestBodies.length === 1
          ? {
              schemaVersion: 1,
              metricClaimCandidates: [
                {
                  rawText: "M15 has weekday riders.",
                  displayLabel: "weak first pass",
                  metricLabelRaw: "weekday riders",
                  subjectRaw: "M15 corridor",
                  unitRaw: "riders",
                  sourceClaimAuthority: "source_stated",
                  publicationWordingGate: "publishable_source_stated",
                  evidenceByField: {
                    rawText: ["ev-smoke-metric"],
                  },
                },
              ],
            }
          : acceptedSubmission(),
      );
    };

    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      maxRepairRounds: 1,
      providerCaller,
      generatedAt: "2026-06-07T00:00:00.000Z",
      waitForProviderSlot: async () => {
        limiterCallCount += 1;
      },
    });

    expect(requestBodies).toHaveLength(2);
    expect(limiterCallCount).toBe(2);
    expect(JSON.stringify(requestBodies[1])).toContain("field_support_missing");
    expect(artifact.summary.finalStatus).toBe("accepted");
    expect(artifact.summary.acceptedCandidateCount).toBe(2);
    expect(artifact.summary.usage).toMatchObject({
      promptTokens: 20,
      completionTokens: 20,
      totalTokens: 40,
      estimatedCostUsd: 0.000006,
      costSource: "local_price_table",
    });
    expect(artifact.attempts[0]?.usage).toMatchObject({
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
      estimatedCostUsd: 0.000003,
    });
    expect(artifact.attempts.map((attempt) => attempt.status)).toEqual(["rejected", "accepted"]);
  });

  test("rejects semantically invalid cost, service-delivery, and relation candidates", () => {
    const request = requestWithEvidence([
      {
        evidenceHandle: "ev-ticket-count",
        quoteText: "The program issued 15,799 tickets during the warning period.",
      },
      {
        evidenceHandle: "ev-cost-multi",
        quoteText: "The grant lists $18.4M for construction and $4.5M for design.",
      },
      {
        evidenceHandle: "ev-service-launch",
        quoteText: "The route launched Select Bus Service with rider assistance.",
      },
      {
        evidenceHandle: "ev-route-relation",
        quoteText: "The M15 corridor received bus lanes.",
      },
    ]);
    const weakCostValidation = validateTier2FeatureExtractionSubmission({
      request,
      submission: {
        schemaVersion: 1,
        costValueCandidates: [
          {
            rawText: "The program issued 15,799 tickets during the warning period.",
            amountRaw: "15,799",
            evidenceByField: {
              rawText: ["ev-ticket-count"],
              amountRaw: ["ev-ticket-count"],
            },
          },
        ],
      },
    });
    const validation = validateTier2FeatureExtractionSubmission({
      request,
      submission: {
        schemaVersion: 1,
        routeScopeCandidates: [
          {
            candidateLocalId: "route-a",
            rawText: "The M15 corridor received bus lanes.",
            routeTextRaw: "M15 corridor",
            evidenceByField: {
              rawText: ["ev-route-relation"],
              routeTextRaw: ["ev-route-relation"],
            },
          },
        ],
        costValueCandidates: [
          {
            rawText: "The grant lists $18.4M for construction and $4.5M for design.",
            amountRaw: "$18.4M and $4.5M",
            evidenceByField: {
              rawText: ["ev-cost-multi"],
              amountRaw: ["ev-cost-multi"],
            },
          },
        ],
        serviceDeliveryClaims: [
          {
            rawText: "The route launched Select Bus Service with rider assistance.",
            serviceDeliveryClaimTextRaw: "launched Select Bus Service with rider assistance",
            evidenceByField: {
              rawText: ["ev-service-launch"],
              serviceDeliveryClaimTextRaw: ["ev-service-launch"],
            },
          },
        ],
        relationCandidates: [
          {
            rawText: "The M15 corridor received bus lanes.",
            fromLocalObservationId: "route-a",
            toLocalObservationId: "missing-observation",
            relationKindRaw: "supports",
            relationTextRaw: "M15 corridor received bus lanes",
            evidenceByField: {
              rawText: ["ev-route-relation"],
              relationTextRaw: ["ev-route-relation"],
            },
          },
        ],
      },
    });

    expect(weakCostValidation.acceptedCandidateCount).toBe(0);
    expect(weakCostValidation.validationErrors.map((error) => error.code)).toEqual([
      "cost_not_monetary",
    ]);
    expect(validation.acceptedCandidateCount).toBe(1);
    expect(validation.validationErrors.map((error) => error.code)).toEqual([
      "cost_multiple_amounts",
      "service_delivery_scope_unsupported",
      "relation_target_unknown",
    ]);
  });

  test("adapts accepted vNext candidates into proof-ledger candidates", async () => {
    const requestPath = join(workingRoot, "request.json");
    await writeJson(requestPath, smokeRequest());
    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmission()),
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    const adapterResult = vNextArtifactToProofCandidates({
      artifact,
      artifactPath: "feature-smoke.json",
    });

    expect(adapterResult.acceptedCandidateCount).toBe(2);
    expect(adapterResult.proofCandidates).toHaveLength(8);
    expect(
      adapterResult.proofCandidates.every(
        (candidate) => candidate.proofState === "resolver_missing",
      ),
    ).toBe(true);
    expect(
      adapterResult.proofCandidates.every(
        (candidate) => !candidate.promotionEligibility.publicFeature,
      ),
    ).toBe(true);

    const metricValue = adapterResult.proofCandidates.find(
      (candidate) => candidate.keyId === "metricValue",
    );
    expect(metricValue?.featureFamily).toBe("metric_claim");
    expect(metricValue?.evidence.fieldSupportFound).toBe(true);
    expect(metricValue?.evidence.verifierStates).toEqual(["verified"]);
    expect(metricValue?.evidence.evidencePointerIds[0]?.startsWith("vnext-pointer:")).toBe(true);
    expect(metricValue?.metricCompleteness?.value.proofState).toBe("verified");
    expect(metricValue?.validationErrors.map((error) => error.code)).toEqual([
      "canonical_resolver_missing",
    ]);
  });

  test("proof ledger defaults to strict final-accepted artifacts and requires explicit salvage mode", async () => {
    const requestPath = join(workingRoot, "request.json");
    const vnextArtifactPath = join(workingRoot, "feature-vnext-failed.json");
    const outputPath = join(workingRoot, "feature-vnext-proof-ledger.json");
    await writeJson(requestPath, smokeRequest());
    const acceptedArtifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      outputPath: vnextArtifactPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmission()),
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    const failedArtifact = {
      ...acceptedArtifact,
      summary: {
        ...acceptedArtifact.summary,
        finalStatus: "provider_failed" as const,
      },
    };
    await writeJson(vnextArtifactPath, failedArtifact);

    const strictAdapter = vNextArtifactToProofCandidates({
      artifact: failedArtifact,
      artifactPath: vnextArtifactPath,
    });
    const salvageAdapter = vNextArtifactToProofCandidates({
      artifact: failedArtifact,
      artifactPath: vnextArtifactPath,
      inputMode: "salvage_accepted_candidates",
    });
    const strictLedger = await runTier2FeatureProofLedgerFromVNext({
      vnextArtifactPaths: [vnextArtifactPath],
      outputPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    const salvageLedger = await runTier2FeatureProofLedgerFromVNext({
      vnextArtifactPaths: [vnextArtifactPath],
      outputPath: join(workingRoot, "feature-vnext-proof-ledger-salvage.json"),
      generatedAt: "2026-06-07T00:00:00.000Z",
      inputMode: "salvage_accepted_candidates",
    });

    expect(strictAdapter).toMatchObject({
      inputMode: "strict_final_accepted",
      finalStatus: "provider_failed",
      skippedBecauseFinalStatus: true,
      acceptedCandidateCount: 0,
      proofCandidates: [],
    });
    expect(salvageAdapter.acceptedCandidateCount).toBe(2);
    expect(salvageAdapter.proofCandidates).toHaveLength(8);
    expect(strictLedger.artifact.sourceFeatureExtractionInputMode).toBe("strict_final_accepted");
    expect(strictLedger.artifact.summary.normalizedSurfaceCount).toBe(0);
    expect(strictLedger.artifact.summary.fieldCandidateCount).toBe(0);
    expect(salvageLedger.artifact.sourceFeatureExtractionInputMode).toBe(
      "salvage_accepted_candidates",
    );
    expect(salvageLedger.artifact.summary.normalizedSurfaceCount).toBe(2);
    expect(salvageLedger.artifact.summary.fieldCandidateCount).toBe(8);
  });

  test("writes a shared proof ledger from vNext artifacts", async () => {
    const requestPath = join(workingRoot, "request.json");
    const vnextArtifactPath = join(workingRoot, "feature-vnext.json");
    const outputPath = join(workingRoot, "feature-vnext-proof-ledger.json");
    await writeJson(requestPath, smokeRequest());
    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      outputPath: vnextArtifactPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmission()),
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vnextArtifactPath, artifact);

    const result = await runTier2FeatureProofLedgerFromVNext({
      vnextArtifactPaths: [vnextArtifactPath],
      outputPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.outputPath).toBe(outputPath);
    expect(await Bun.file(outputPath).exists()).toBe(true);
    expect(await Bun.file(result.markdownPath).exists()).toBe(true);
    expect(await Bun.file(result.summaryPath).exists()).toBe(true);
    expect(result.artifact.sourceFeatureExtractionPaths).toEqual([vnextArtifactPath]);
    expect(result.artifact.summary.normalizedSurfaceCount).toBe(2);
    expect(result.artifact.summary.fieldCandidateCount).toBe(8);
    expect(result.artifact.summary.publishableFieldWithoutProofCount).toBe(0);
    expect(result.artifact.summary.validationErrorsByCode).toEqual({
      canonical_resolver_missing: 8,
    });
    expect(result.artifact.validationRetryBatches[0]).toMatchObject({
      code: "canonical_resolver_missing",
      retryOwner: "vocab_runner",
      count: 6,
    });
  });

  test("resolves vNext proof candidates against vocab application mappings", async () => {
    const requestPath = join(workingRoot, "request.json");
    const vnextArtifactPath = join(workingRoot, "feature-vnext.json");
    const proofLedgerPath = join(workingRoot, "feature-vnext-proof-ledger.json");
    const vocabApplicationPath = join(workingRoot, "vocab-surface-application.json");
    const resolvedLedgerPath = join(workingRoot, "feature-vnext-proof-ledger-resolved.json");
    await writeJson(requestPath, smokeRequest());
    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      outputPath: vnextArtifactPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmissionForResolver()),
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vnextArtifactPath, artifact);
    await runTier2FeatureProofLedgerFromVNext({
      vnextArtifactPaths: [vnextArtifactPath],
      outputPath: proofLedgerPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vocabApplicationPath, fixtureVocabApplication());

    const result = await runTier2FeatureProofLedgerVocabResolver({
      proofLedgerPath,
      vocabApplicationPath,
      outputPath: resolvedLedgerPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(result.outputPath).toBe(resolvedLedgerPath);
    expect(result.artifact.sourceProofLedgerPath).toBe(proofLedgerPath);
    expect(result.artifact.sourceVocabApplicationPath).toBe(vocabApplicationPath);
    expect(result.stats).toMatchObject({
      inputCandidateCount: 9,
      resolvedCandidateCount: 9,
      identityResolvedCandidateCount: 5,
      ambiguousCandidateCount: 0,
    });
    expect(result.artifact.summary.publishableFieldWithoutProofCount).toBe(0);

    const metricFamily = result.artifact.candidates.find(
      (candidate) => candidate.keyId === "metricFamily",
    );
    expect(metricFamily).toMatchObject({
      role: "canonical_field",
      proofState: "verified",
      decision: "mapped",
      canonicalLeafId: "average_weekday_ridership",
      canonicalLeafLabel: "Average Weekday Ridership",
      targetPayloadPath: "canonicalPayload.metricFamily",
    });
    expect(metricFamily?.promotionEligibility.publicFeature).toBe(true);
    expect(metricFamily?.validationErrors).toEqual([]);

    const treatmentFamily = result.artifact.candidates.find(
      (candidate) => candidate.keyId === "eventTreatmentFamily",
    );
    expect(treatmentFamily).toMatchObject({
      proofState: "verified",
      canonicalLeafId: "offset_bus_lane",
      canonicalLeafLabel: "Offset Bus Lane",
    });

    const metricValue = result.artifact.candidates.find(
      (candidate) => candidate.keyId === "metricValue" && candidate.rawValue === "42,000",
    );
    expect(metricValue?.proofState).toBe("verified");
    expect(metricValue?.canonicalLeafId?.startsWith("source_local:metricValue:")).toBe(true);
    expect(metricValue?.targetPayloadPath).toBe(
      "sourcePayload.vnext.metricClaimCandidates.valueRaw",
    );
    expect(metricValue?.promotionEligibility.publicFeature).toBe(true);

    const gate = evaluateTier2FeaturePromotionGate({
      ledger: result.artifact,
      sourceLedgerPath: resolvedLedgerPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    expect(gate.passed).toBe(true);
  });

  test("leaves ambiguous vocab aliases blocked", async () => {
    const requestPath = join(workingRoot, "request.json");
    const vnextArtifactPath = join(workingRoot, "feature-vnext.json");
    const proofLedgerPath = join(workingRoot, "feature-vnext-proof-ledger.json");
    const vocabApplicationPath = join(workingRoot, "vocab-surface-application-ambiguous.json");
    await writeJson(requestPath, smokeRequest());
    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      outputPath: vnextArtifactPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmissionForResolver()),
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vnextArtifactPath, artifact);
    await runTier2FeatureProofLedgerFromVNext({
      vnextArtifactPaths: [vnextArtifactPath],
      outputPath: proofLedgerPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vocabApplicationPath, fixtureVocabApplication({ ambiguousMetricFamily: true }));

    const result = await runTier2FeatureProofLedgerVocabResolver({
      proofLedgerPath,
      vocabApplicationPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    const metricFamily = result.artifact.candidates.find(
      (candidate) => candidate.keyId === "metricFamily",
    );
    expect(result.stats.ambiguousCandidateCount).toBe(1);
    expect(metricFamily?.proofState).toBe("resolver_missing");
    expect(metricFamily?.canonicalLeafId).toBeNull();
    expect(metricFamily?.validationErrors[0]?.message).toContain("multiple canonical leaves");
    expect(metricFamily?.promotionEligibility.publicFeature).toBe(false);
  });

  test("blocks vocab mappings that inject unsupported canonical scope", async () => {
    const requestPath = join(workingRoot, "request.json");
    const vnextArtifactPath = join(workingRoot, "feature-vnext.json");
    const proofLedgerPath = join(workingRoot, "feature-vnext-proof-ledger.json");
    const vocabApplicationPath = join(workingRoot, "vocab-surface-application-unsafe.json");
    await writeJson(requestPath, smokeRequest());
    const artifact = await runTier2FeatureExtractionVNext({
      inputPath: requestPath,
      outputPath: vnextArtifactPath,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmissionForResolver()),
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vnextArtifactPath, artifact);
    await runTier2FeatureProofLedgerFromVNext({
      vnextArtifactPaths: [vnextArtifactPath],
      outputPath: proofLedgerPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    await writeJson(vocabApplicationPath, fixtureVocabApplication({ unsafeMetricFamily: true }));

    const result = await runTier2FeatureProofLedgerVocabResolver({
      proofLedgerPath,
      vocabApplicationPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    const metricFamily = result.artifact.candidates.find(
      (candidate) => candidate.keyId === "metricFamily",
    );
    expect(metricFamily).toMatchObject({
      proofState: "resolver_missing",
      canonicalLeafId: "average_daily_ridership_non_nyc",
      canonicalLeafLabel: "Average Daily Ridership (Non-NYC)",
    });
    expect(metricFamily?.validationErrors.map((error) => error.code)).toEqual([
      "canonical_resolver_unsafe_mapping",
    ]);
    expect(metricFamily?.promotionEligibility.publicFeature).toBe(false);
  });

  test("runs a concurrency-ready sampled canary with proof and vocab gates", async () => {
    const requestPathA = join(workingRoot, "agentic-request-a.json");
    const requestPathB = join(workingRoot, "agentic-request-b.json");
    const outputRoot = join(workingRoot, "feature-canary");
    await writeJson(requestPathA, agenticRequestFixture({ runId: "old-a" }));
    await writeJson(requestPathB, agenticRequestFixture({ runId: "old-b" }));
    const vocabApplicationPath = join(workingRoot, "vocab-surface-application.json");
    await writeJson(vocabApplicationPath, fixtureVocabApplication());

    const result = await runTier2FeatureCanary({
      requestPaths: [requestPathA, requestPathB],
      outputRoot,
      sampleSize: 2,
      seed: "fixture-seed",
      concurrency: 2,
      execute: true,
      provider: "pioneer",
      model: "deepseek-ai/DeepSeek-V4-Flash",
      pioneerApiKey: "test-key",
      providerCaller: async () => forcedProviderResult(acceptedSubmissionForResolver()),
      vocabApplicationPath,
      generatedAt: "2026-06-07T00:00:00.000Z",
      runId: "feature-canary-fixture",
    });

    expect(await Bun.file(result.outputPath).exists()).toBe(true);
    expect(result.artifact.summary).toMatchObject({
      sampledWindowCount: 2,
      completedWindowCount: 2,
      acceptedRunCount: 2,
      acceptedRunRate: 1,
      publishableFieldWithoutProofCount: 0,
      promotionGatePassed: true,
      verdict: "passed",
    });
    expect(result.artifact.summary.usage.totalTokens).toBe(40);
    expect(result.artifact.checks.every((check) => check.passed)).toBe(true);
    expect(await Bun.file(result.artifact.summary.proofLedgerPath).exists()).toBe(true);
    expect(await Bun.file(result.artifact.summary.resolvedProofLedgerPath ?? "").exists()).toBe(
      true,
    );
    expect(await Bun.file(result.artifact.summary.promotionGatePath).exists()).toBe(true);
  });

  test("blocks repair-subset manifests for full-corpus execution by default", () => {
    const manifest: Tier2FeatureQueueManifest = {
      artifactKind: "bp.tier2_feature_queue_manifest.v1",
      schemaVersion: 1,
      generatedAt: "2026-06-07T00:00:00.000Z",
      queueId: "agentic-full-authority-retry-qv10-validator-feedback-pioneer-temp1-on4",
      queueKind: "repair_subset",
      sourceRunIds: [],
      inputPaths: [],
    };

    const gate = evaluateTier2FeatureQueueManifestGate({
      manifest,
      manifestPath: "queue-manifest.json",
      requestedQueueKind: "full_corpus",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });

    expect(gate.passed).toBe(false);
    expect(gate.errors.map((error) => error.code)).toEqual(["qv_tail_input_used_for_full_corpus"]);
  });

  test("promotion gate allows only verified promoted candidates", () => {
    const verifiedCandidate = proofCandidate({ proofState: "verified", publicFeature: true });
    const goodGate = evaluateTier2FeaturePromotionGate({
      ledger: ledgerFixture({
        candidates: [verifiedCandidate],
        publishableFieldWithoutProofCount: 0,
      }),
      sourceLedgerPath: "feature-proof-ledger.json",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    expect(goodGate.passed).toBe(true);

    const badGate = evaluateTier2FeaturePromotionGate({
      ledger: ledgerFixture({
        candidates: [proofCandidate({ proofState: "support_missing", publicFeature: true })],
        publishableFieldWithoutProofCount: 1,
      }),
      sourceLedgerPath: "feature-proof-ledger.json",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    expect(badGate.passed).toBe(false);
    expect(badGate.errors.map((error) => error.code)).toContain("publishable_field_without_proof");

    const unresolvedPromoted = {
      ...proofCandidate({ proofState: "verified", publicFeature: true }),
      role: "unresolved_field" as const,
      canonicalLeafId: null,
      canonicalLeafLabel: null,
    };
    const unresolvedGate = evaluateTier2FeaturePromotionGate({
      ledger: ledgerFixture({
        candidates: [unresolvedPromoted],
        publishableFieldWithoutProofCount: 0,
      }),
      sourceLedgerPath: "feature-proof-ledger.json",
      generatedAt: "2026-06-07T00:00:00.000Z",
    });
    expect(unresolvedGate.passed).toBe(false);
    expect(unresolvedGate.errors.map((error) => error.code)).toContain(
      "promoted_candidate_without_canonical_resolution",
    );
  });
});

function smokeRequest(): Tier2FeatureExtractionRequest {
  return defaultTier2FeatureSmokeRequest({ generatedAt: "2026-06-07T00:00:00.000Z" });
}

function requestWithEvidence(
  evidence: Array<{
    evidenceHandle: string;
    quoteText: string;
  }>,
): Tier2FeatureExtractionRequest {
  const request = smokeRequest();
  return {
    ...request,
    evidenceHandles: [
      ...request.evidenceHandles,
      ...evidence.map((handle, index) => ({
        evidenceHandle: handle.evidenceHandle,
        sourceId: request.source.sourceId,
        pageNumber: 1,
        blockId: `B-extra-${index + 1}`,
        quoteText: handle.quoteText,
      })),
    ],
  };
}

function acceptedSubmission() {
  return {
    schemaVersion: 1,
    metricClaimCandidates: [
      {
        rawText:
          "The M15 Select Bus Service corridor carried 42,000 weekday riders and NYC DOT described the figure as source-stated for publication.",
        displayLabel: "M15 weekday ridership",
        metricLabelRaw: "weekday riders",
        valueRaw: "42,000",
        unitRaw: "riders",
        subjectRaw: "M15 Select Bus Service corridor",
        sourceClaimAuthority: "source_stated",
        publicationWordingGate: "publishable_source_stated",
        evidenceByField: {
          rawText: ["ev-smoke-metric"],
          metricLabelRaw: ["ev-smoke-metric"],
          valueRaw: ["ev-smoke-metric"],
          unitRaw: ["ev-smoke-metric"],
          subjectRaw: ["ev-smoke-metric"],
          sourceClaimAuthority: ["ev-smoke-metric"],
          publicationWordingGate: ["ev-smoke-metric"],
        },
      },
    ],
    treatmentCandidates: [
      {
        rawText:
          "The project added offset bus lanes and transit signal priority on the M15 corridor.",
        displayLabel: "M15 bus treatments",
        treatmentTextRaw: "offset bus lanes and transit signal priority",
        routeTextRaw: "M15 corridor",
        evidenceByField: {
          rawText: ["ev-smoke-treatment"],
          treatmentTextRaw: ["ev-smoke-treatment"],
          routeTextRaw: ["ev-smoke-treatment"],
        },
      },
    ],
  };
}

function acceptedSubmissionForResolver() {
  const submission = acceptedSubmission() as ReturnType<typeof acceptedSubmission> & {
    treatmentCandidates: Array<
      Record<string, unknown> & { evidenceByField: Record<string, string[]> }
    >;
  };
  const treatment = submission.treatmentCandidates[0];
  if (treatment === undefined)
    throw new Error("Resolver fixture expected one treatment candidate.");
  submission.treatmentCandidates[0] = {
    ...treatment,
    treatmentFamilyRaw: "offset_bus_lane",
    evidenceByField: {
      ...treatment.evidenceByField,
      treatmentFamilyRaw: ["ev-smoke-treatment"],
    },
  };
  return submission;
}

function agenticRequestFixture(input: { runId: string }) {
  const request = smokeRequest();
  return {
    schemaVersion: 1,
    generatedAt: "2026-06-07T00:00:00.000Z",
    runId: input.runId,
    source: {
      ...request.source,
      sourceInvestigationId: input.runId,
      sourceContentHash: "sha256:fixture-source",
      pageArtifactKey: "fixture/page.md",
      markdownHash: "sha256:fixture-markdown",
      blockIndexHash: "sha256:fixture-blocks",
    },
    evidenceHandles: request.evidenceHandles.map((handle, index) => ({
      ...handle,
      pageArtifactKey: "fixture/page.md",
      sourceContentHash: "sha256:fixture-source",
      markdownHash: "sha256:fixture-markdown",
      blockIndexHash: "sha256:fixture-blocks",
      blockHash: `sha256:block-${index}`,
      lineStart: index + 1,
      lineEnd: index + 1,
      extractionMethod: "ocr_markdown",
    })),
    lookupResults: [],
    routeLookupRequests: request.routeLookupRequests,
    routeUniverse: request.routeUniverse,
    priorContext: [
      {
        kind: "prior_fixture_context",
        validationState: "prior_hint_not_truth",
      },
    ],
    drafts: [],
  };
}

function fixtureVocabApplication(
  input: { ambiguousMetricFamily?: boolean; unsafeMetricFamily?: boolean } = {},
) {
  return {
    artifactKind: "bp.tier2_vocab_surface_application.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-07T00:00:00.000Z",
    sourceCanonicalMergePath: join(workingRoot, "canonical-merge.json"),
    normalizedAcceptedSurfaces: [
      vocabSurface([
        vocabMapping({
          keyId: "metricFamily",
          rawValue: "Weekday Riders",
          targetPayloadPath: "canonicalPayload.metricFamily",
          canonicalLeafId:
            input.unsafeMetricFamily === true
              ? "average_daily_ridership_non_nyc"
              : "average_weekday_ridership",
          canonicalLeafLabel:
            input.unsafeMetricFamily === true
              ? "Average Daily Ridership (Non-NYC)"
              : "Average Weekday Ridership",
          coarseFamily: "ridership",
        }),
        ...(input.ambiguousMetricFamily === true
          ? [
              vocabMapping({
                keyId: "metricFamily",
                rawValue: "weekday riders",
                targetPayloadPath: "canonicalPayload.metricFamily",
                canonicalLeafId: "weekday_rider_count_conflict",
                canonicalLeafLabel: "Weekday Rider Count Conflict",
                coarseFamily: "ridership",
              }),
            ]
          : []),
        vocabMapping({
          keyId: "metricSubjectFamily",
          rawValue: "M15 Select Bus Service corridor",
          targetPayloadPath: "canonicalPayload.metricSubjectFamily",
          canonicalLeafId: "route_specific_ridership",
          canonicalLeafLabel: "Route-specific ridership",
          coarseFamily: "ridership",
        }),
        vocabMapping({
          keyId: "metricUnit",
          rawValue: "riders",
          targetPayloadPath: "canonicalPayload.metricUnit",
          canonicalLeafId: "riders",
          canonicalLeafLabel: "Riders",
          coarseFamily: "ridership",
        }),
        vocabMapping({
          keyId: "eventTreatmentFamily",
          rawValue: "offset_bus_lane",
          targetPayloadPath: "canonicalPayload.treatmentFamily",
          canonicalLeafId: "offset_bus_lane",
          canonicalLeafLabel: "Offset Bus Lane",
          coarseFamily: "bus_priority",
        }),
      ]),
    ],
  };
}

function vocabSurface(fieldMappings: unknown[]) {
  return {
    artifactPath: join(workingRoot, "vocab-source.json"),
    surface: {
      normalization: {
        fieldMappings,
      },
    },
  };
}

function vocabMapping(input: {
  keyId: string;
  rawValue: string;
  targetPayloadPath: string;
  canonicalLeafId: string;
  canonicalLeafLabel: string;
  coarseFamily: string;
}) {
  return {
    keyId: input.keyId,
    sourceFieldPath: "rawPayload.fixture",
    targetPayloadPath: input.targetPayloadPath,
    rawValue: input.rawValue,
    decision: "mapped",
    originalDecision: "mapped",
    canonicalLeafId: input.canonicalLeafId,
    canonicalLeafLabel: input.canonicalLeafLabel,
    coarseFamily: input.coarseFamily,
    modifiers: {},
  };
}

function forcedProviderResult(args: unknown) {
  const body = {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_feature_vnext",
              type: "function",
              function: {
                name: TIER2_FEATURE_EXTRACTION_TOOL_NAME,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
  return {
    response: new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
    body,
    attempts: [],
  };
}

function proofCandidate(input: {
  proofState: FeatureProofCandidate["proofState"];
  publicFeature: boolean;
}): FeatureProofCandidate {
  return {
    candidateId: "candidate-1",
    role: "canonical_field",
    featureFamily: "metric_claim",
    proofState: input.proofState,
    keyId: "metricFamily",
    sourceFieldPath: "rawPayload.metricLabel",
    targetPayloadPath: "canonicalPayload.metricFamily",
    rawValue: "bus speed",
    canonicalLeafId: "bus_speed_mph",
    canonicalLeafLabel: "Bus speed",
    coarseFamily: "travel_time_speed",
    modifiers: {},
    decision: "mapped",
    source: {
      artifactPath: "artifact.json",
      auditPath: null,
      windowId: "source:1",
      runId: "run",
      shardId: "shard",
      sourceId: "source",
      pageNumbers: [1],
      surfaceId: "surface",
      surfaceKind: "metric_observation",
      displayLabel: "Bus speed",
      rawTextPreview: "Bus speed",
    },
    evidence: {
      fieldSupportFound: input.proofState === "verified",
      supportIds: input.proofState === "verified" ? ["support-1"] : [],
      evidencePointerIds: input.proofState === "verified" ? ["pointer-1"] : [],
      verifierStates: input.proofState === "verified" ? ["verified"] : [],
      supportCompleteness: input.proofState === "verified" ? ["exact"] : [],
    },
    metricCompleteness: null,
    validationErrors:
      input.proofState === "verified"
        ? []
        : [
            {
              code: "field_support_missing",
              severity: "blocking",
              retryOwner: "llm",
              message: "missing support",
              llmRetryInstruction: "retry",
              deterministicRunnerFields: [],
            },
          ],
    promotionEligibility: {
      publicFeature: input.publicFeature,
      detectorFeature: false,
      causalFeature: false,
      briefFeature: false,
      blockedReasons: input.proofState === "verified" ? [] : ["field_support_missing"],
    },
  };
}

function ledgerFixture(input: {
  candidates: FeatureProofCandidate[];
  publishableFieldWithoutProofCount: number;
}): Tier2FeatureProofLedgerArtifact {
  return {
    artifactKind: "bp.tier2_feature_proof_ledger.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-07T00:00:00.000Z",
    sourceCanonicalMergePath: null,
    sourceVocabApplicationPath: "vocab.json",
    safetyPolicy: {
      llmRuntimeUse: "none",
      runnerOwnsVocabulary: true,
      runnerOwnsPromotionState: true,
      publishableRequiresSourceLocalProof: true,
      rawPayloadMutationAllowed: false,
    },
    validationPolicy: {
      publishableFieldWithoutProofAllowed: false,
      unresolvedCanonicalFieldAllowedInPublicFeatures: false,
      metricPublicationRequiresValueLevelProof: true,
      validationErrorsReturnedToLlmForRetry: true,
    },
    fieldOwnership: {
      llmMustSubmit: [],
      deterministicRunnerFields: [],
      vocabRunnerFields: [],
    },
    summary: {
      normalizedSurfaceCount: 1,
      fieldCandidateCount: input.candidates.length,
      canonicalFieldCandidateCount: input.candidates.length,
      unresolvedFieldCandidateCount: 0,
      verifiedFieldCount: input.candidates.filter(
        (candidate) => candidate.proofState === "verified",
      ).length,
      blockedFieldCount: input.candidates.filter(
        (candidate) => candidate.validationErrors.length > 0,
      ).length,
      publishableFieldCount: input.candidates.filter(
        (candidate) => candidate.promotionEligibility.publicFeature,
      ).length,
      publishableFieldWithoutProofCount: input.publishableFieldWithoutProofCount,
      validationErrorCount: input.candidates.reduce(
        (sum, candidate) => sum + candidate.validationErrors.length,
        0,
      ),
      byFeatureFamily: {},
      byProofState: {},
      byKeyId: {},
      bySurfaceKind: {},
      validationErrorsByCode: {},
      blockedByFeatureFamily: {},
      publishableByFeatureFamily: {},
      sourcesWithBlockingErrors: 0,
    },
    validationRetryBatches: [],
    candidates: input.candidates,
  };
}
