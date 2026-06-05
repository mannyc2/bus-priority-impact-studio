import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runTier2ResearchAudit } from "../../../../src/commands/docs/tier2/_research-audit.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-research-audit");

function row(input: {
  sourceId: string;
  page: number;
  candidateType: string;
  family: string;
  label: string;
  group?: string;
}) {
  return {
    rowId: `${input.sourceId}-${input.page}-${input.candidateType}-${input.family}`,
    inputLabel: "fixture-root",
    extractionId: `extraction-${input.sourceId}-${input.page}`,
    sourceId: input.sourceId,
    sourceTitle: `${input.sourceId} report`,
    sourceGroup: input.group ?? "bus_priority_document",
    pageNumbers: [input.page],
    candidateType: input.candidateType,
    candidateId: `candidate-${input.sourceId}-${input.page}-${input.family}`,
    canonicalFamily: input.family,
    rawFamily: input.family,
    displayLabel: input.label,
    clusterKey: `${input.family}:${input.label}`,
    evidenceRefs: [
      {
        blockId: "B0001",
        pageNumber: input.page,
        lineStart: 1,
        lineEnd: 3,
        blockHash: "sha256:block",
      },
    ],
    rawCandidate: { label: input.label },
  };
}

async function seedArtifacts() {
  await mkdir(workingRoot, { recursive: true });
  const markdownRoot = join(workingRoot, "docs-run");
  const markdownKey = "ocr-page-markdown/sources/0001_source_a/pages/0001/page.md";
  await mkdir(
    join(markdownRoot, "ocr-page-markdown", "sources", "0001_source_a", "pages", "0001"),
    {
      recursive: true,
    },
  );
  await Bun.write(
    join(markdownRoot, markdownKey),
    [
      "---",
      "sourceId: source_a",
      "pageNumber: 1",
      "---",
      "",
      "## Before and after table",
      "Average bus speeds increased by 5% after the bus lane launch.",
    ].join("\n"),
  );
  const markdownKeyB = "ocr-page-markdown/sources/0002_source_b/pages/0002/page.md";
  await mkdir(
    join(markdownRoot, "ocr-page-markdown", "sources", "0002_source_b", "pages", "0002"),
    {
      recursive: true,
    },
  );
  await Bun.write(
    join(markdownRoot, markdownKeyB),
    [
      "---",
      "sourceId: source_b",
      "pageNumber: 2",
      "---",
      "",
      "## Proposed treatment",
      "The project proposes a busway with access restrictions. LIRR is also mentioned.",
    ].join("\n"),
  );

  const normalizedPath = join(workingRoot, "normalized.json");
  await writeJson(normalizedPath, {
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    sourceAuditPath: "audit.json",
    rowCount: 6,
    summary: {
      byCandidateType: { table: 1, metric: 1, claim: 2, event: 1, entity: 1 },
      byCanonicalFamily: {},
    },
    rows: [
      row({
        sourceId: "source_a",
        page: 1,
        candidateType: "table",
        family: "performance_comparison",
        label: "Before and after speed table",
      }),
      row({
        sourceId: "source_a",
        page: 1,
        candidateType: "metric",
        family: "bus_speed",
        label: "Average bus speeds increased by 5%",
      }),
      row({
        sourceId: "source_a",
        page: 1,
        candidateType: "claim",
        family: "causal_or_effect_claim",
        label: "Bus lane caused faster bus speeds",
      }),
      row({
        sourceId: "source_b",
        page: 2,
        candidateType: "claim",
        family: "proposed_treatment",
        label: "Proposed busway",
      }),
      row({
        sourceId: "source_b",
        page: 2,
        candidateType: "event",
        family: "planned_intervention",
        label: "Busway planning milestone",
      }),
      row({
        sourceId: "source_b",
        page: 2,
        candidateType: "entity",
        family: "rail_service",
        label: "LIRR",
      }),
    ],
  });
  const auditPath = join(workingRoot, "ocr-page-markdown-audit.json");
  await writeJson(auditPath, {
    version: 1,
    runId: "docs-run",
    generatedAt: "2026-06-03T00:00:00.000Z",
    ocrPlanPath: "ocr-plan.json",
    outputPath: null,
    pageMarkdownRootName: "ocr-page-markdown",
    summary: {},
    sources: [
      {
        sourceId: "source_a",
        pages: [
          {
            sourceId: "source_a",
            sourceTitle: "source_a report",
            sourceGroup: "bus_priority_document",
            pageNumber: 1,
            status: "ocr_complete",
            markdownArtifactKey: markdownKey,
          },
        ],
      },
      {
        sourceId: "source_b",
        pages: [
          {
            sourceId: "source_b",
            sourceTitle: "source_b report",
            sourceGroup: "bus_priority_document",
            pageNumber: 2,
            status: "ocr_complete",
            markdownArtifactKey: markdownKeyB,
          },
        ],
      },
    ],
  });
  return { normalizedPath, auditPath, markdownRoot };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 research audit", () => {
  test("builds a diverse fixture pack in dry-run mode", async () => {
    const { normalizedPath, auditPath, markdownRoot } = await seedArtifacts();
    const artifact = await runTier2ResearchAudit({
      normalizedCandidatesPath: normalizedPath,
      pageMarkdownAuditPath: auditPath,
      markdownRunRoot: markdownRoot,
      outputPath: join(workingRoot, "research-audit.json"),
      fixtureCount: 2,
      generatedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(artifact.execute).toBe(false);
    expect(artifact.fixturePack.fixtures).toHaveLength(2);
    expect(artifact.fixturePack.summary.usability.usableFixtureCount).toBe(2);
    expect(artifact.fixturePack.summary.usability.guardrails).toContain(
      "Do not treat recall-heavy discovery candidates as truth or public/published rows.",
    );
    expect(artifact.fixturePack.fixtures.every((fixture) => fixture.usability.usable)).toBe(true);
    expect(artifact.fixturePack.fixtures[0]?.selectionReasons).toContain(
      "performance_comparison_table",
    );
    expect(artifact.fixturePack.fixtures.map((fixture) => fixture.sourceId)).toContain("source_b");
    expect(await Bun.file(join(workingRoot, "research-audit-request.json")).exists()).toBe(true);
  });

  test("requires focused shards for live execution", async () => {
    const { normalizedPath, auditPath, markdownRoot } = await seedArtifacts();
    await expect(
      runTier2ResearchAudit({
        normalizedCandidatesPath: normalizedPath,
        pageMarkdownAuditPath: auditPath,
        markdownRunRoot: markdownRoot,
        outputPath: join(workingRoot, "research-audit.json"),
        fixtureCount: 2,
        execute: true,
        generatedAt: "2026-06-03T00:00:00.000Z",
        pioneerApiKey: "test-key",
      }),
    ).rejects.toThrow(/requires a focused --focus value/);
  });

  test("persists forced-tool Opus audit output", async () => {
    const { normalizedPath, auditPath, markdownRoot } = await seedArtifacts();
    const artifact = await runTier2ResearchAudit({
      normalizedCandidatesPath: normalizedPath,
      pageMarkdownAuditPath: auditPath,
      markdownRunRoot: markdownRoot,
      outputPath: join(workingRoot, "research-audit.json"),
      fixtureCount: 2,
      focus: "schema",
      execute: true,
      generatedAt: "2026-06-03T00:00:00.000Z",
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
                        name: "submit_tier2_research_audit",
                        arguments: JSON.stringify({
                          schemaAudit: {
                            summary: "Schema needs stricter status/date discipline.",
                            schemaChanges: [
                              {
                                priority: "high",
                                target: "interventionEvents.status",
                                change: "Separate proposed from implemented.",
                                rationale: "Proposal pages otherwise become false launches.",
                              },
                            ],
                            validatorGates: [
                              {
                                gateId: "no_proposal_to_implemented",
                                severity: "blocker",
                                description: "Do not promote proposal-only text.",
                                failureExampleFixtureIds: ["fixture_002"],
                              },
                            ],
                            openQuestions: [],
                          },
                          crossCuttingRecommendations: [
                            {
                              priority: "high",
                              recommendation: "Build fixture scorecard before full extraction.",
                              rationale: "Prevents expensive low-quality reruns.",
                            },
                          ],
                        }),
                      },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    });

    expect(artifact.execute).toBe(true);
    expect(artifact.rawUsage).toEqual({
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    });
    expect(await Bun.file(join(workingRoot, "research-audit-tool-call.json")).exists()).toBe(true);
    expect(artifact.focus).toBe("schema");
    expect(artifact.result).toMatchObject({
      schemaAudit: { summary: "Schema needs stricter status/date discipline." },
    });
  });
});
