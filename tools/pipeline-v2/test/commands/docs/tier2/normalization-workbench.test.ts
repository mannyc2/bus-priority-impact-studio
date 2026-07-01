import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runTier2NormalizationWorkbench } from "../../../../src/commands/docs/tier2/_normalization-workbench.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-normalization-workbench");

function row(input: {
  rowId: string;
  candidateType: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  rawCandidate?: Record<string, unknown>;
}) {
  return {
    rowId: input.rowId,
    inputLabel: "fixture",
    extractionId: "extraction-1",
    sourceId: "source_a",
    sourceTitle: "Source A",
    sourceGroup: "bus_priority_document",
    pageNumbers: [1],
    candidateType: input.candidateType,
    candidateId: input.rowId,
    canonicalFamily: input.canonicalFamily,
    rawFamily: input.rawFamily,
    displayLabel: input.displayLabel,
    clusterKey: `${input.canonicalFamily}|${input.displayLabel.toLowerCase()}`,
    evidenceRefs: [
      {
        blockId: "B0001",
        pageNumber: 1,
        lineStart: 1,
        lineEnd: 2,
        blockHash: "sha256:block",
      },
    ],
    rawCandidate: input.rawCandidate ?? { labelRaw: input.displayLabel },
  };
}

async function seedNormalizedCandidates() {
  await mkdir(workingRoot, { recursive: true });
  const normalizedPath = join(workingRoot, "normalized.json");
  await writeJson(normalizedPath, {
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    rowCount: 5,
    summary: {},
    rows: [
      row({
        rowId: "metric-speed",
        candidateType: "metric",
        canonicalFamily: "bus_speed",
        rawFamily: "Average bus speeds increased by ~27%",
        displayLabel: "Average bus speeds increased by ~27%",
        rawCandidate: {
          labelRaw: "Average bus speeds increased by ~27%",
          valueRaw: "~27%",
          unitRaw: "percent",
          geographyRaw: "citywide",
          periodRaw: "2008-2018",
        },
      }),
      row({
        rowId: "entity-q",
        candidateType: "entity",
        canonicalFamily: "transit_line",
        rawFamily: "subway line",
        displayLabel: "Q train",
        rawCandidate: { rawText: "Q train", rawKind: "subway line" },
      }),
      row({
        rowId: "event-proposed",
        candidateType: "event",
        canonicalFamily: "planned_intervention",
        rawFamily: "planned intervention",
        displayLabel: "Proposed busway planning",
        rawCandidate: { statusRaw: "proposed", dateRaw: "2026" },
      }),
      row({
        rowId: "claim-causal",
        candidateType: "claim",
        canonicalFamily: "causal_or_effect_claim",
        rawFamily: "effect claim",
        displayLabel: "The busway led to faster trips",
        rawCandidate: { claimText: "The busway led to faster trips" },
      }),
      row({
        rowId: "table-ridership",
        candidateType: "table",
        canonicalFamily: "service_or_ridership",
        rawFamily: "stop ridership table",
        displayLabel: "Stop-level boardings table",
        rawCandidate: {
          tableKindRaw: "stop ridership table",
          headerTextsRaw: ["Stop", "Boardings"],
        },
      }),
    ],
  });
  return normalizedPath;
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 normalization workbench", () => {
  test("groups candidates and applies approved seed rules in dry-run mode", async () => {
    const normalizedPath = await seedNormalizedCandidates();
    const result = await runTier2NormalizationWorkbench({
      normalizedCandidatesPath: normalizedPath,
      outputPath: join(workingRoot, "workbench.json"),
      appliedOutputPath: join(workingRoot, "applied.json"),
      markdownPath: join(workingRoot, "workbench.md"),
      generatedAt: "2026-06-03T00:00:00.000Z",
      groupCount: 5,
      examplesPerGroup: 2,
    });

    expect(result.workbench.execute).toBe(false);
    expect(result.workbench.summary.selectedGroupCount).toBe(5);
    expect(result.applied.surfaces.documentMetricClaims[0]?.metricSource).toBe("document_claimed");
    expect(result.applied.surfaces.documentMetricClaims[0]?.valuePrecision).toBe("approximate");
    expect(result.applied.surfaces.documentEntities[0]?.entityMode).toBe("subway_or_station");
    expect(result.applied.surfaces.documentInterventionEvents[0]?.implementationStatus).toBe(
      "proposed",
    );
    expect(result.applied.surfaces.documentClaims[0]?.causalClaimFlag).toBe(true);
    expect(result.applied.surfaces.documentTables[0]?.refinedTableFamily).toBe(
      "stop_or_ridership_table",
    );
    expect(await Bun.file(join(workingRoot, "workbench.md")).exists()).toBe(true);
  });

  test("persists model-proposed rules when executed", async () => {
    const normalizedPath = await seedNormalizedCandidates();
    const result = await runTier2NormalizationWorkbench({
      normalizedCandidatesPath: normalizedPath,
      outputPath: join(workingRoot, "workbench.json"),
      appliedOutputPath: join(workingRoot, "applied.json"),
      generatedAt: "2026-06-03T00:00:00.000Z",
      groupCount: 3,
      execute: true,
      pioneerApiKey: "test-key",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "submit_tier2_normalization_rules",
                        arguments: JSON.stringify({
                          rules: [
                            {
                              ruleId: "model_split_subway_lines",
                              source: "model",
                              status: "proposed",
                              action: "annotate",
                              candidateType: "entity",
                              match: { hazardTags: ["rail_or_subway_context"] },
                              output: {
                                targetSurface: "documentEntities",
                                fields: { entityMode: "subway_line" },
                              },
                              confidence: 0.9,
                              rationale: "Subway lines should not be bus routes.",
                              sampleGroupIds: ["group_a"],
                            },
                          ],
                          reviewQuestions: [
                            {
                              question: "Should subway station mentions become linked context?",
                              reason: "They may confound bus corridor outcomes.",
                              sampleGroupIds: ["group_a"],
                            },
                          ],
                          denormalizedSurfaces: [
                            {
                              surfaceName: "documentEntities",
                              purpose: "Entity mode review.",
                              requiredFields: ["rowId", "entityMode"],
                            },
                          ],
                        }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, statusText: "OK", headers: { "Content-Type": "application/json" } },
        ),
    });

    expect(result.workbench.execute).toBe(true);
    expect(result.workbench.summary.modelRuleCount).toBe(1);
    expect(result.workbench.modelRules[0]?.status).toBe("proposed");
    expect(result.workbench.reviewQuestions).toHaveLength(1);
    expect(await Bun.file(join(workingRoot, "workbench-tool-call.json")).exists()).toBe(true);
  });
});
