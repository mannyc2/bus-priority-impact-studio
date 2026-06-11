import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  runRouteTimelineCuration,
  validateRouteTimelineCuration,
} from "../../../../src/commands/docs/tier2/_route-timeline-curation.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-route-timeline-curation");

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function seedPack() {
  const packPath = join(workingRoot, "pack.json");
  const markdownPath = join(workingRoot, "pack.md");
  const pack = {
    artifactKind: "bp.tier2_route_timeline_curation_pack.v1",
    schemaVersion: 1,
    generatedAt: "2026-06-06T23:00:00.000Z",
    routeId: "B46",
    routeAliases: ["B46", "B46+"],
    sourceConsumerIndexPath: "/repo/consumer.json",
    sourceMaterializedViewsPath: "/repo/materialized.json",
    summary: {
      candidateCount: 2,
      timelinePrimaryCount: 1,
      timelineContextCount: 0,
      treatmentCandidateCount: 1,
      metricCandidateCount: 0,
      claimCandidateCount: 0,
      eventCandidateCount: 1,
      serviceChangeCandidateCount: 0,
      sourceCount: 1,
      evidencePointerCount: 1,
      candidatesWithEvidencePointerCount: 1,
      candidatesWithArtifactPathCount: 2,
      routeBundleSurfaceCount: 2,
      routeBundleTimelineCandidateSurfaceCount: 1,
    },
    llmTask: {
      objective: "curate_route_timeline",
      policy: [],
      filesystemGuidance: [],
      outputSchema: {},
    },
    sourceRefs: [
      {
        sourceRef: "s001",
        sourceId: "source-a",
        sourceTitle: "Source A",
        sourceGroup: "bus_priority_document",
        pageNumbers: [3],
        candidateCount: 2,
        evidencePointerCount: 1,
        artifactPaths: ["/repo/source-a/artifact.json"],
      },
    ],
    candidates: [
      {
        candidateRef: "c001",
        candidateId: "timeline_candidate_launch",
        surfaceId: "surface-launch",
        candidateRole: "timeline_primary",
        score: 150,
        surfaceKind: "event_candidate",
        payloadSchemaId: "bp.event_candidate.v1",
        displayLabel: "B46 SBS launch July 2016",
        rawText: "B46 SBS launched in July 2016.",
        sourceId: "source-a",
        sourceRef: "s001",
        sourceTitle: "Source A",
        sourceGroup: "bus_priority_document",
        pageNumbers: [3],
        routeIds: ["B46"],
        routeMatch: "direct_route",
        intendedUses: ["public_timeline_candidate"],
        coarseFamilies: ["project_delivery"],
        mappedFieldCount: 1,
        unresolvedFieldCount: 0,
        evidencePointerIds: ["ev-1"],
        supportIds: ["support-1"],
        artifactPath: "/repo/source-a/artifact.json",
        auditPath: null,
        canonicalPayload: { routeIds: ["B46"], dateText: "July 2016" },
        payloadHints: [{ path: "dateText", value: "July 2016" }],
        dateAssertions: [
          {
            dateAssertionRef: "c001.d1",
            dateAssertionId: "date_launch_month",
            candidateId: "timeline_candidate_launch",
            sourcePath: "canonicalPayload.dateText",
            rawText: "July 2016",
            date: null,
            month: "2016-07",
            datePrecision: "month",
            dateRole: "event_date_candidate",
            confidence: "medium",
          },
        ],
        fieldRows: [],
        unresolvedRows: [],
      },
      {
        candidateRef: "c002",
        candidateId: "timeline_candidate_duplicate",
        surfaceId: "surface-duplicate",
        candidateRole: "supporting_treatment",
        score: 90,
        surfaceKind: "treatment_component",
        payloadSchemaId: "bp.treatment_component.v1",
        displayLabel: "Treatment: SBS",
        rawText: "Select Bus Service.",
        sourceId: "source-a",
        sourceRef: "s001",
        sourceTitle: "Source A",
        sourceGroup: "bus_priority_document",
        pageNumbers: [3],
        routeIds: ["B46"],
        routeMatch: "direct_route",
        intendedUses: ["causal_treatment_inventory"],
        coarseFamilies: ["bus_priority_treatment"],
        mappedFieldCount: 0,
        unresolvedFieldCount: 0,
        evidencePointerIds: [],
        supportIds: [],
        artifactPath: "/repo/source-a/artifact.json",
        auditPath: null,
        canonicalPayload: { routeIds: ["B46"], treatmentFamily: "select_bus_service" },
        payloadHints: [],
        dateAssertions: [],
        fieldRows: [],
        unresolvedRows: [],
      },
    ],
  };
  await writeJson(packPath, pack);
  await Bun.write(markdownPath, "# Route Timeline Curation Pack: B46\n");
  return { pack, packPath, markdownPath };
}

describe("route timeline curation LLM runner", () => {
  test("accepts a forced tool-call response and writes audit artifacts", async () => {
    const { packPath, markdownPath } = await seedPack();
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tool_choice?: unknown };
      expect(body.tool_choice).toBeDefined();
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    type: "function",
                    function: {
                      name: "submit_route_timeline_curation",
                      arguments: JSON.stringify({
                        schemaVersion: 1,
                        routeId: "B46",
                        events: [
                          {
                            eventId: "b46_sbs_launch_2016_07",
                            title: "B46 SBS launches",
                            eventStatus: "implemented",
                            timelineLayer: "service_change",
                            routeScope: "direct_route",
                            summary: "The source states that B46 SBS launched in July 2016.",
                            whyItMatters: "This is the route's core service-change milestone.",
                            candidateRefs: ["c001"],
                            dateAssertionRefs: ["c001.d1"],
                            confidence: "high",
                            reviewNotes: [],
                          },
                        ],
                        excludedCandidates: [
                          {
                            candidateRef: "c002",
                            reason: "duplicate",
                            notes: "Covered by the launch event.",
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
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await runRouteTimelineCuration({
      packPath,
      packMarkdownPath: markdownPath,
      outputPath: join(workingRoot, "curation.json"),
      generatedAt: "2026-06-07T00:00:00.000Z",
      execute: true,
      provider: "deepseek",
      model: "deepseek-v4-pro",
      deepseekApiKey: "test-key",
      fetcher,
    });

    expect(result.artifact.status).toBe("accepted");
    expect(result.artifact.summary).toMatchObject({
      outputEventCount: 1,
      excludedCandidateCount: 1,
      validationIssueCount: 0,
      providerAttemptCount: 1,
    });
    expect(await Bun.file(result.artifact.responsePath ?? "").exists()).toBe(true);
    expect(await Bun.file(result.artifact.toolCallPath ?? "").exists()).toBe(true);
    expect(await Bun.file(result.artifact.validationPath ?? "").exists()).toBe(true);
  });

  test("rejects unknown candidate ids", async () => {
    const { pack } = await seedPack();
    const validation = validateRouteTimelineCuration({
      pack: pack as never,
      generatedAt: "2026-06-07T00:00:00.000Z",
      toolCall: {
        schemaVersion: 1,
        routeId: "B46",
        events: [
          {
            eventId: "bad",
            title: "Bad event",
            eventStatus: "needs_review",
            timelineLayer: "context",
            routeScope: "uncertain",
            summary: "Bad",
            whyItMatters: "Bad",
            candidateRefs: ["missing_candidate"],
            dateAssertionRefs: [],
            confidence: "low",
            reviewNotes: [],
          },
        ],
        excludedCandidates: [],
      },
    });

    expect(validation.status).toBe("rejected");
    expect(validation.issues.some((issue) => issue.code === "unknown_candidate_ref")).toBe(true);
  });

  test("tracks unaccounted tail candidates without warning", async () => {
    const { pack } = await seedPack();
    const validation = validateRouteTimelineCuration({
      pack: pack as never,
      generatedAt: "2026-06-07T00:00:00.000Z",
      toolCall: {
        schemaVersion: 1,
        routeId: "B46",
        events: [
          {
            eventId: "b46_sbs_launch_2016_07",
            title: "B46 SBS launches",
            eventStatus: "implemented",
            timelineLayer: "service_change",
            routeScope: "direct_route",
            summary: "The source states that B46 SBS launched in July 2016.",
            whyItMatters: "This is the route's core service-change milestone.",
            candidateRefs: ["c001"],
            dateAssertionRefs: ["c001.d1"],
            confidence: "high",
            reviewNotes: [],
          },
        ],
        excludedCandidates: [],
      },
    });

    expect(validation.status).toBe("accepted");
    expect(validation.issues).toEqual([]);
    expect(validation.unaccountedCandidateCount).toBe(1);
    expect(validation.unaccountedCandidateRefs).toEqual(["c002"]);
  });
});
