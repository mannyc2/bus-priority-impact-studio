import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  runTier2VocabSynthesis,
  validateVocabToolCall,
} from "../../../../src/commands/docs/tier2/_vocab-synthesis.ts";
import type { ModelToolLoop } from "../../../../src/lib/codemode/index.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-vocab-synthesis");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function writeGraduationPlan() {
  const path = join(workingRoot, "raw-field-graduation.json");
  await writeJson(join(workingRoot, "artifact.json"), {
    artifactKind: "bp.test_agentic_surface_artifact.v1",
    schemaVersion: 1,
    source: {
      sourceId: "fixture-source",
      pageNumbers: [1],
    },
    submitResult: {
      accepted: [
        {
          surface: {
            surfaceId: "surface-percent",
            surfaceKind: "metric_observation",
            rawText: "Bus speeds improved 12 percent",
            displayLabel: "Bus speeds improved 12%",
            rawPayload: {
              metricLabelRaw: "Bus speeds improved",
              unitRaw: "percent",
            },
          },
          fieldSupport: [
            {
              fieldPath: "rawPayload.unitRaw",
              verifierState: "verified",
            },
          ],
          evidencePointers: [
            {
              lineStart: 1,
              lineEnd: 1,
              quoteText: "Bus speeds improved 12 percent",
            },
          ],
        },
      ],
    },
  });
  await writeJson(path, {
    artifactKind: "bp.tier2_raw_field_graduation_plan.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-05T00:00:00.000Z",
    summary: {
      acceptedSurfaceCount: 3,
      totalGraduationDistinctValues: 3,
    },
    graduationKeys: [
      {
        id: "metricUnit",
        tier: "core",
        targetPayloadPath: "canonicalPayload.metricUnit",
        sourceFieldPaths: ["rawPayload.unitRaw"],
        mode: "llm_vocab_map",
        description: "Metric units and unit-like count labels.",
        instanceCount: 12,
        distinctValueCount: 3,
        repeatedDistinctValueCount: 2,
        topValues: [
          {
            value: "percent",
            count: 7,
            sourceFieldCounts: { "rawPayload.unitRaw": 7 },
            surfaceKindCounts: { metric_observation: 7 },
            examples: [
              {
                artifactPath: join(workingRoot, "artifact.json"),
                surfaceKind: "metric_observation",
                sourceId: "fixture-source",
                pageNumbers: [1],
                surfaceId: "surface-percent",
                displayLabel: "Bus speeds improved 12%",
                sourceFieldPath: "rawPayload.unitRaw",
              },
            ],
          },
          {
            value: "%",
            count: 3,
            sourceFieldCounts: { "rawPayload.unitRaw": 3 },
            surfaceKindCounts: { metric_observation: 3 },
            examples: [],
          },
          {
            value: "minutes",
            count: 2,
            sourceFieldCounts: { "rawPayload.unitRaw": 2 },
            surfaceKindCounts: { metric_observation: 2 },
            examples: [],
          },
        ],
      },
    ],
  });
  return path;
}

function canonicalValue(input: {
  canonicalId: string;
  label: string;
  description: string;
  measurementDimension?: string;
  metricFamily?: string;
  mergePolicy?: "same_leaf_only" | "family_rollup_allowed" | "preserve_raw_preferred";
  countedEntityFamily?: string;
  semanticTags?: string[];
  positiveExamples?: string[];
  negativeExamples?: string[];
}) {
  return {
    canonicalId: input.canonicalId,
    label: input.label,
    description: input.description,
    measurementDimension: input.measurementDimension ?? "ratio_or_share",
    metricFamily: input.metricFamily ?? "generic_unit",
    mergePolicy: input.mergePolicy ?? "family_rollup_allowed",
    ...(input.countedEntityFamily === undefined
      ? {}
      : { countedEntityFamily: input.countedEntityFamily }),
    semanticTags: input.semanticTags ?? [input.canonicalId],
    downstreamUses: ["metric grouping"],
    positiveExamples: input.positiveExamples ?? [input.label.toLowerCase()],
    negativeExamples: input.negativeExamples ?? [],
  };
}

describe("Tier 2 vocab synthesis", () => {
  test("prepares deterministic chunk inputs without executing the LLM", async () => {
    const graduationPlanPath = await writeGraduationPlan();
    const outputRoot = join(workingRoot, "vocab-run");

    const run = await runTier2VocabSynthesis({
      graduationPlanPath,
      outputRoot,
      keyIds: ["metricUnit"],
      chunkSize: 2,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(run.summary.keyCount).toBe(1);
    expect(run.summary.chunkCount).toBe(2);
    expect(run.summary.inputValueCount).toBe(3);
    expect(run.summary.executedChunkCount).toBe(0);
    expect(run.keys[0]?.chunks.map((chunk) => chunk.valueCount)).toEqual([2, 1]);
    expect(
      await Bun.file(
        join(outputRoot, "chunks", "metricUnit", "metricUnit-chunk-0001", "input.json"),
      ).exists(),
    ).toBe(true);
    expect(await Bun.file(join(outputRoot, "vocab-synthesis-run.json")).exists()).toBe(true);
  });

  test("accepts exact alias coverage and rejects missing or invented aliases", async () => {
    const graduationPlanPath = await writeGraduationPlan();
    const run = await runTier2VocabSynthesis({
      graduationPlanPath,
      outputRoot: join(workingRoot, "vocab-run"),
      keyIds: ["metricUnit"],
      chunkSize: 10,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const chunk = run.keys[0]?.chunks[0];
    if (chunk === undefined) throw new Error("missing test chunk");

    const accepted = validateVocabToolCall({
      keyId: "metricUnit",
      chunk,
      generatedAt: "2026-06-05T00:00:00.000Z",
      response: {
        keyId: "metricUnit",
        canonicalValues: [
          canonicalValue({
            canonicalId: "percent",
            label: "Percent",
            description: "Percentage units.",
            positiveExamples: ["percent", "%"],
            negativeExamples: ["minutes"],
          }),
          canonicalValue({
            canonicalId: "minutes",
            label: "Minutes",
            description: "Minute duration units.",
            measurementDimension: "duration",
            positiveExamples: ["minutes"],
            negativeExamples: ["percent"],
          }),
        ],
        aliases: [
          {
            rawValue: "percent",
            normalizedRawValue: "percent",
            decision: "mapped",
            canonicalId: "percent",
            confidence: 0.98,
            rationale: "Literal percent unit.",
            reviewFlags: [],
          },
          {
            rawValue: "%",
            normalizedRawValue: "%",
            decision: "mapped",
            canonicalId: "percent",
            confidence: 0.98,
            rationale: "Percent symbol.",
            reviewFlags: [],
          },
          {
            rawValue: "minutes",
            normalizedRawValue: "minutes",
            decision: "mapped",
            canonicalId: "minutes",
            confidence: 0.98,
            rationale: "Literal minute unit.",
            reviewFlags: [],
          },
        ],
        reviewNotes: [],
      },
    });
    expect(accepted.status).toBe("accepted");

    const rejected = validateVocabToolCall({
      keyId: "metricUnit",
      chunk,
      response: {
        keyId: "metricUnit",
        canonicalValues: [
          canonicalValue({
            canonicalId: "percent",
            label: "Percent",
            description: "Percentage units.",
            positiveExamples: ["percent"],
            negativeExamples: [],
          }),
        ],
        aliases: [
          {
            rawValue: "percent",
            normalizedRawValue: "percent",
            decision: "mapped",
            canonicalId: "does_not_exist",
            confidence: 0.9,
            rationale: "Bad canonical id.",
            reviewFlags: [],
          },
          {
            rawValue: "invented",
            normalizedRawValue: "invented",
            decision: "mapped",
            canonicalId: "percent",
            confidence: 0.9,
            rationale: "Invented value.",
            reviewFlags: [],
          },
        ],
        reviewNotes: [],
      },
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.blockers.map((blocker) => blocker.code)).toContain("missing_alias");
    expect(rejected.blockers.map((blocker) => blocker.code)).toContain("extra_alias");
    expect(rejected.blockers.map((blocker) => blocker.code)).toContain("unknown_canonical_id");
  });

  test("agentic loop writes a markdown prompt and accepts through the submit tool", async () => {
    const graduationPlanPath = await writeGraduationPlan();
    const outputRoot = join(workingRoot, "vocab-run-agentic");
    const captured: {
      userMessage?: string;
      toolNames?: string[];
      readContext?: string;
    } = {};
    const modelToolLoop: ModelToolLoop = async ({ userMessage, extraTools }) => {
      captured.userMessage = userMessage;
      if (extraTools !== undefined) captured.toolNames = extraTools.map((tool) => tool.name);
      const readTool = extraTools?.find((tool) => tool.name === "read_vocab_context");
      if (readTool === undefined) throw new Error("read context tool missing");
      const readResult = await readTool.execute("call-read", {
        rawValue: "percent",
      } as never);
      captured.readContext = readResult.content
        .map((item) => (item.type === "text" ? item.text : ""))
        .join("\n");
      const submitTool = extraTools?.find((tool) => tool.name === "submit_tier2_vocab_map");
      if (submitTool === undefined) throw new Error("submit tool missing");
      await submitTool.execute("call-submit", {
        keyId: "metricUnit",
        canonicalValues: [
          canonicalValue({
            canonicalId: "percent",
            label: "Percent",
            description: "Percentage units.",
            positiveExamples: ["percent", "%"],
            negativeExamples: ["minutes"],
          }),
        ],
        aliases: [
          {
            rawValue: "percent",
            normalizedRawValue: "percent",
            decision: "mapped",
            canonicalId: "percent",
            confidence: 0.98,
            rationale: "Literal percent unit.",
            reviewFlags: [],
          },
          {
            rawValue: "%",
            normalizedRawValue: "%",
            decision: "mapped",
            canonicalId: "percent",
            confidence: 0.98,
            rationale: "Percent symbol.",
            reviewFlags: [],
          },
        ],
        reviewNotes: [],
      } as never);
      return {
        finalText: "",
        toolUseTrace: [],
        capsHit: null,
        iterations: 1,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        },
        retries: 0,
      };
    };

    const run = await runTier2VocabSynthesis({
      graduationPlanPath,
      outputRoot,
      keyIds: ["metricUnit"],
      maxValuesPerKey: 2,
      chunkSize: 2,
      execute: true,
      pioneerApiKey: "test-key",
      modelToolLoop,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(run.summary.acceptedChunkCount).toBe(1);
    expect(captured.toolNames).toEqual([
      "read_vocab_context",
      "search_source_text",
      "submit_tier2_vocab_map",
    ]);
    expect(captured.userMessage).toContain("# Tier 2 Vocabulary Synthesis");
    expect(captured.userMessage).toContain("values[count=2]:");
    expect(captured.userMessage).toContain('raw: "percent"');
    expect(captured.userMessage).not.toContain("surfaceId:");
    expect(captured.userMessage).not.toContain("artifactRef:");
    expect(captured.readContext).toContain("surfaceId:");
    expect(captured.readContext).toContain("artifactRef:");
    const promptPath = run.chunkResults[0]?.promptPath;
    if (promptPath === undefined || promptPath === null) throw new Error("missing prompt path");
    expect(await Bun.file(promptPath).text()).toContain("context_format: markdown/toon-style");
    expect(run.vocabMapPath === null ? null : await Bun.file(run.vocabMapPath).exists()).toBe(true);
  });

  test("v2 harness accepts compact decisions that reference prior canonical ids", async () => {
    const graduationPlanPath = await writeGraduationPlan();
    const outputRoot = join(workingRoot, "vocab-run-agentic-v2");
    const captured: {
      userMessages: string[];
      toolNames: string[][];
    } = {
      userMessages: [],
      toolNames: [],
    };
    const modelToolLoop: ModelToolLoop = async ({ userMessage, extraTools }) => {
      captured.userMessages.push(userMessage);
      captured.toolNames.push(extraTools?.map((tool) => tool.name) ?? []);
      const submitTool = extraTools?.find((tool) => tool.name === "submit_tier2_vocab_decisions");
      if (submitTool === undefined) throw new Error("v2 submit tool missing");
      if (userMessage.includes('raw: "percent"')) {
        await submitTool.execute("call-submit-1", {
          keyId: "metricUnit",
          newCanonicalValues: [
            canonicalValue({
              canonicalId: "percent",
              label: "Percent",
              description: "Percentage units.",
              positiveExamples: ["percent", "%"],
              negativeExamples: ["minutes"],
            }),
          ],
          aliases: [
            {
              rawValue: "percent",
              decision: "mapped",
              canonicalId: "percent",
              confidence: 0.98,
              rationale: "Literal percent unit.",
              reviewFlags: [],
            },
          ],
          reviewNotes: [],
        } as never);
      } else {
        await submitTool.execute("call-submit-2", {
          keyId: "metricUnit",
          newCanonicalValues: [],
          aliases: [
            {
              rawValue: "%",
              decision: "mapped",
              canonicalId: "percent",
              confidence: 0.98,
              rationale: "Percent symbol.",
              reviewFlags: [],
            },
          ],
          reviewNotes: [],
        } as never);
      }
      return {
        finalText: "",
        toolUseTrace: [],
        capsHit: null,
        iterations: 1,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
          costUsd: 0,
        },
        retries: 0,
      };
    };

    const run = await runTier2VocabSynthesis({
      graduationPlanPath,
      outputRoot,
      keyIds: ["metricUnit"],
      maxValuesPerKey: 2,
      chunkSize: 1,
      execute: true,
      pioneerApiKey: "test-key",
      harness: "v2",
      maxContextToolCalls: 4,
      modelToolLoop,
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(run.harness).toBe("v2");
    expect(run.summary.acceptedChunkCount).toBe(2);
    expect(captured.toolNames[0]).toEqual([
      "get_value_profiles",
      "compare_values",
      "search_value_inventory",
      "search_source_snippets",
      "read_source_excerpt",
      "submit_tier2_vocab_decisions",
    ]);
    expect(captured.toolNames[0]).not.toContain("read_vocab_context");
    expect(captured.userMessages[0]).toContain("# Tier 2 Vocabulary Synthesis V2");
    expect(captured.userMessages[0]).toContain("Deterministic Hints");
    expect(captured.userMessages[1]).toContain("priorCanonicalIds[count=1]");
    expect(captured.userMessages[1]).toContain('"%" -> percent');
    expect(captured.userMessages[1]).not.toContain("positiveExamples:");
    if (run.vocabMapPath === null) throw new Error("missing vocab map path");
    const vocabMap = await Bun.file(run.vocabMapPath).json();
    expect(vocabMap.summary.canonicalValueCount).toBe(1);
    expect(vocabMap.summary.aliasCount).toBe(2);
    expect(vocabMap.aliases.map((alias: { rawValue: string }) => alias.rawValue).sort()).toEqual([
      "%",
      "percent",
    ]);
  });
});
