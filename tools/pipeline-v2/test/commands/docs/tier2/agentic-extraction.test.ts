import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  AGENTIC_EXTRACTION_TOOL_NAME,
  auditTier2AgenticExtractionArtifact,
  buildTier2AgenticExtractionRequestFromDiscovery,
  routeLookup,
  runTier2AgenticExtractionBatch,
  runTier2AgenticExtractionHarness,
} from "../../../../src/commands/docs/tier2/_agentic-extraction.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-agentic-extraction");

const source = {
  sourceId: "m15-fixture",
  sourceTitle: "M15 Fixture",
  sourceGroup: "fixture",
  sourceInvestigationId: "investigation-1",
  pageNumbers: [1],
  sourceContentHash: "sha256:source",
  pageArtifactKey: "sources/m15-fixture/pages/0001.md",
  markdownHash: "sha256:markdown",
  blockIndexHash: "sha256:block-index",
};

const evidenceHandles = [
  {
    evidenceHandle: "ev-route",
    sourceId: source.sourceId,
    pageNumber: 1,
    pageArtifactKey: source.pageArtifactKey,
    sourceContentHash: source.sourceContentHash,
    markdownHash: source.markdownHash,
    blockIndexHash: source.blockIndexHash,
    blockId: "B0001",
    blockHash: "sha256:block",
    lineStart: 3,
    lineEnd: 4,
    quoteText: "The M15 Select Bus Service route received new bus lane treatments.",
  },
];

function draft(selectedIds: string[], label = "M15 bus lane treatment") {
  return {
    surfaceKind: "event_candidate",
    corpusRole: "atomic_observation",
    rawText: "The M15 SBS route received bus lane treatments.",
    displayLabel: label,
    payloadSchemaId: "bp.document_research_surface_payload.event_candidate.v1",
    rawPayload: {
      routeTextRaw: "M15 SBS",
      treatmentTextRaw: "bus lane treatments",
    },
    evidenceByField: {
      "rawPayload.routeTextRaw": [
        {
          evidenceHandle: "ev-route",
          supportRole: "route_scope",
          supportCompleteness: "exact",
        },
      ],
    },
    canonicalSelections: [
      {
        fieldPath: "routeIds",
        lookupKind: "route",
        lookupHandle: "lookup-m15",
        selectedIds,
        rawTextFieldPath: "rawPayload.routeTextRaw",
        evidenceHandles: ["ev-route"],
      },
    ],
    requestedUses: ["detector_evidence"],
    agentConfidence: "high",
  };
}

function officialMetricDraft() {
  return {
    surfaceKind: "metric_observation",
    corpusRole: "atomic_observation",
    rawText: "NYC DOT reports Bx6 travel time fell 35%.",
    displayLabel: "Bx6 travel time fell 35%",
    payloadSchemaId: "bp.metric_observation.v1",
    rawPayload: {
      authorityRaw: "NYC DOT",
      valueRaw: "35%",
      metricName: "travel_time_change",
    },
    evidenceByField: {
      rawText: [
        {
          evidenceHandle: "ev-metric",
          supportRole: "primary",
          supportCompleteness: "exact",
        },
      ],
      "rawPayload.valueRaw": [
        {
          evidenceHandle: "ev-metric",
          supportRole: "metric_value",
          supportCompleteness: "exact",
        },
      ],
      "rawPayload.authorityRaw": [
        {
          evidenceHandle: "ev-metric",
          supportRole: "primary",
          supportCompleteness: "exact",
        },
      ],
    },
    canonicalSelections: [],
    requestedUses: ["detector_evidence"],
    agentConfidence: "high",
  };
}

function forcedToolResponse(args: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_agentic_extraction",
                type: "function",
                function: {
                  name: AGENTIC_EXTRACTION_TOOL_NAME,
                  arguments: JSON.stringify(args),
                },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 agentic extraction harness", () => {
  test("route_lookup returns stable bus route candidates from raw source text", () => {
    const result = routeLookup({
      text: "M15 SBS",
      lookupHandle: "lookup-m15",
      routeUniverse: ["M15"],
    });

    expect(result.lookupHandle).toBe("lookup-m15");
    expect(result.candidates.map((candidate) => candidate.routeId)).toEqual(["M15"]);
    expect(result.candidates[0]?.serviceVariants).toEqual(["sbs"]);
  });

  test("validates and transactionally submits draft surfaces with repairable rejects", async () => {
    const inputPath = join(workingRoot, "request.json");
    const outputPath = join(workingRoot, "artifact.json");
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "agentic-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source,
      evidenceHandles,
      routeLookupRequests: [
        {
          lookupHandle: "lookup-m15",
          text: "The M15 Select Bus Service route received new bus lane treatments.",
        },
      ],
      routeUniverse: ["M15", "M14A"],
      drafts: [draft(["M15"]), draft(["M14A"], "Wrong selected route")],
    });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "agentic-test",
    });

    expect(artifact.summary).toMatchObject({
      draftCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
      routeLookupCount: 1,
    });
    expect(artifact.submitResult.state).toBe("partial_accepted");
    expect(artifact.submitResult.accepted[0]?.surface.canonicalPayload).toEqual({
      routeIds: ["M15"],
    });
    expect(
      artifact.submitResult.rejected[0]?.validation.issues.map((issue) => issue.code),
    ).toContain("selected_route_not_in_lookup_result");

    const persisted = await Bun.file(outputPath).json();
    expect(persisted.summary.acceptedCount).toBe(1);
  });

  test("executes a forced-tool LLM repair loop against validator feedback", async () => {
    const inputPath = join(workingRoot, "llm-request.json");
    const outputPath = join(workingRoot, "llm-artifact.json");
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "agentic-llm-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source,
      evidenceHandles,
      routeLookupRequests: [
        {
          lookupHandle: "lookup-m15",
          text: "The M15 Select Bus Service route received new bus lane treatments.",
        },
      ],
      routeUniverse: ["M15", "M14A"],
      drafts: [],
    });

    const requestBodies: unknown[] = [];
    const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body ?? "{}")));
      return requestBodies.length === 1
        ? forcedToolResponse({ drafts: [draft(["M14A"], "Wrong route from first pass")] })
        : forcedToolResponse({ drafts: [draft(["M15"], "Repaired M15 route")] });
    };

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      outputPath,
      execute: true,
      provider: "pioneer",
      model: "fixture-model",
      temperature: 1,
      maxRepairRounds: 1,
      pioneerApiKey: "test-key",
      fetcher,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "agentic-llm-test",
    });

    expect(requestBodies).toHaveLength(2);
    expect((requestBodies[0] as { temperature?: unknown }).temperature).toBe(1);
    expect((requestBodies[1] as { temperature?: unknown }).temperature).toBe(1);
    expect(JSON.stringify(requestBodies[1])).toContain("selected_route_not_in_lookup_result");
    expect(artifact.temperature).toBe(1);
    expect(artifact.summary).toMatchObject({
      draftCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      llmAttemptCount: 2,
    });
    expect(artifact.llmAttempts[0]).toMatchObject({
      status: "rejected",
      temperature: 1,
      acceptedCount: 0,
      rejectedCount: 1,
    });
    expect(artifact.llmAttempts[1]).toMatchObject({
      status: "accepted",
      temperature: 1,
      acceptedCount: 1,
      rejectedCount: 0,
    });
    expect(artifact.submitResult.accepted[0]?.surface.canonicalPayload).toEqual({
      routeIds: ["M15"],
    });
  });

  test("normalizes empty optional agent notes before parsing tool drafts", async () => {
    const inputPath = join(workingRoot, "llm-empty-agent-notes-request.json");
    const outputPath = join(workingRoot, "llm-empty-agent-notes-artifact.json");
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "agentic-empty-agent-notes-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source,
      evidenceHandles,
      routeLookupRequests: [{ lookupHandle: "lookup-m15", text: "M15 SBS" }],
      routeUniverse: ["M15"],
      drafts: [],
    });

    const fetcher = async () =>
      forcedToolResponse({
        drafts: [{ ...draft(["M15"], "M15 with empty agent notes"), agentNotes: "" }],
      });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      outputPath,
      execute: true,
      provider: "pioneer",
      model: "fixture-model",
      pioneerApiKey: "test-key",
      fetcher,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "agentic-empty-agent-notes-test",
    });

    expect(artifact.summary).toMatchObject({
      draftCount: 1,
      acceptedCount: 1,
      rejectedCount: 0,
      llmAttemptCount: 1,
    });
    expect(artifact.drafts[0]?.agentNotes).toBeUndefined();
    expect(artifact.llmAttempts[0]?.status).toBe("accepted");
  });

  test("preserves provider failures as audit-blocked artifacts", async () => {
    const inputPath = join(workingRoot, "llm-provider-failure-request.json");
    const outputPath = join(workingRoot, "llm-provider-failure-artifact.json");
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "agentic-provider-failure-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source,
      evidenceHandles,
      routeLookupRequests: [
        {
          lookupHandle: "lookup-m15",
          text: "The M15 Select Bus Service route received new bus lane treatments.",
        },
      ],
      routeUniverse: ["M15"],
      drafts: [],
    });

    const fetcher = async () =>
      new Response(JSON.stringify({ error: { message: "fixture provider timeout" } }), {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      outputPath,
      execute: true,
      provider: "pioneer",
      model: "fixture-model",
      maxAttempts: 1,
      pioneerApiKey: "test-key",
      fetcher,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "agentic-provider-failure-test",
    });
    const audit = auditTier2AgenticExtractionArtifact({
      artifact,
      artifactPath: outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(artifact.summary).toMatchObject({
      draftCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      llmAttemptCount: 1,
    });
    expect(artifact.llmAttempts[0]).toMatchObject({
      status: "provider_failed",
      errorMessage: "fixture provider timeout",
    });
    expect(audit.blockerCount).toBe(1);
    expect(audit.issues.map((issue) => issue.code)).toContain("llm_provider_failed");
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });

  test("builds agentic requests from discovery window block indexes and prior hints", async () => {
    const discoveryPath = join(workingRoot, "discovery.json");
    const sourceId = "fixture-source";
    const windowKey = "discovery-run/sources/0001_fixture-source/windows/0001-0001";
    const blockIndexPath = join(workingRoot, windowKey, "block-index.json");
    const extractionPath = join(workingRoot, windowKey, "document-discovery.json");
    const metadataPath = join(workingRoot, "sources", sourceId, "metadata.json");

    await mkdir(dirname(blockIndexPath), { recursive: true });
    await mkdir(dirname(metadataPath), { recursive: true });
    await writeJson(discoveryPath, {
      windows: [
        {
          windowId: `${sourceId}:1`,
          sourceId,
          pageNumbers: [1],
          status: "extracted",
          blockIndexArtifactKey: `${windowKey}/block-index.json`,
          extractionArtifactKey: `${windowKey}/document-discovery.json`,
        },
      ],
    });
    await writeJson(metadataPath, {
      sourceId,
      title: "Fixture Source",
      sourceGroup: "fixture",
      sha256: "sha256:source-fixture",
    });
    await writeJson(blockIndexPath, {
      sourceId,
      pageNumbers: [1],
      markdownHash: "sha256:markdown-fixture",
      blockIndexHash: "sha256:block-index-fixture",
      pageArtifactKeys: ["ocr/pages/0001/page.md"],
      blocks: [
        {
          blockId: "B0001",
          pageNumber: 1,
          lineStart: 1,
          lineEnd: 1,
          blockHash: "sha256:block-1",
          text: "M15 Select Bus Service corridor update",
        },
        {
          blockId: "B0002",
          pageNumber: 1,
          lineStart: 3,
          lineEnd: 3,
          blockHash: "sha256:block-2",
          text: "New bus lanes were installed.",
        },
      ],
    });
    await writeJson(extractionPath, {
      source: {
        sourceId,
        sourceTitle: "Fixture Source From Discovery",
        sourceGroup: "fixture_discovery",
        sourceContentHash: "sha256:source-from-discovery",
        pageArtifactKeys: ["ocr/pages/0001/page.md"],
      },
      pageProfile: { summary: "Prior discovery hint" },
      entities: [{ entityId: "ent-001", rawText: "M15" }],
    });

    const request = await buildTier2AgenticExtractionRequestFromDiscovery({
      discoveryPath,
      windowId: `${sourceId}:1`,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "agentic-builder-test",
      priorContext: [
        {
          kind: "self_heal_feedback",
          lane: "validator_feedback_retry",
          issueCodes: ["evidence_field_path_not_found"],
        },
      ],
    });

    expect(request.source).toMatchObject({
      sourceId,
      sourceTitle: "Fixture Source From Discovery",
      sourceGroup: "fixture_discovery",
      sourceContentHash: "sha256:source-from-discovery",
    });
    expect(request.evidenceHandles.map((handle) => handle.evidenceHandle)).toEqual([
      "ev-b0001",
      "ev-b0002",
    ]);
    expect(request.routeLookupRequests).toEqual([
      {
        lookupHandle: "route-block-b0001",
        text: "M15 Select Bus Service corridor update",
      },
    ]);
    expect(request.routeUniverse).toEqual(["M15"]);
    expect(JSON.stringify(request.priorContext)).toContain("prior_hint_not_truth");
    expect(JSON.stringify(request.priorContext)).toContain("validator_feedback_retry");
  });

  test("audits unsupported route lookup text before scaling runs", async () => {
    const inputPath = join(workingRoot, "unsupported-lookup-request.json");
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "unsupported-lookup-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source,
      evidenceHandles: [
        {
          ...evidenceHandles[0],
          quoteText: "This source block does not name a bus route.",
          text: "This source block does not name a bus route.",
        },
      ],
      routeLookupRequests: [{ lookupHandle: "lookup-m15", text: "M15 SBS" }],
      routeUniverse: ["M15"],
      drafts: [],
    });
    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "unsupported-lookup-test",
    });

    const audit = auditTier2AgenticExtractionArtifact({
      artifact,
      artifactPath: "artifact.json",
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(audit.blockerCount).toBe(1);
    expect(audit.issues.map((issue) => issue.code)).toContain("route_lookup_text_without_evidence");
  });

  test("deterministically fills missing raw route text from evidence-backed lookup text", async () => {
    const inputPath = join(workingRoot, "deterministic-route-text-request.json");
    const outputPath = join(workingRoot, "deterministic-route-text-artifact.json");
    const routeText = "M15 Select Bus Service corridor update";
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "deterministic-route-text-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source,
      evidenceHandles: [
        {
          ...evidenceHandles[0],
          quoteText: routeText,
          text: routeText,
        },
      ],
      routeLookupRequests: [{ lookupHandle: "lookup-m15", text: routeText }],
      routeUniverse: ["M15"],
      drafts: [
        {
          ...draft(["M15"]),
          rawPayload: {
            treatmentTextRaw: "bus lane treatments",
          },
        },
      ],
    });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "deterministic-route-text-test",
    });

    expect(artifact.summary).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0,
      validationIssueCount: 0,
    });
    expect(artifact.drafts[0]?.rawPayload["routeTextRaw"]).toBe(routeText);
    expect(artifact.drafts[0]?.evidenceByField["rawPayload.routeTextRaw"]).toEqual([
      {
        evidenceHandle: "ev-route",
        supportRole: "route_scope",
        supportCompleteness: "exact",
      },
    ]);
  });

  test("adds canonical source authority labels to official metric observations", async () => {
    const inputPath = join(workingRoot, "authority-label-request.json");
    const outputPath = join(workingRoot, "authority-label-artifact.json");
    const metricEvidenceHandles = [
      {
        ...evidenceHandles[0],
        evidenceHandle: "ev-metric",
        quoteText: "NYC DOT reports Bx6 travel time fell 35%.",
        text: "NYC DOT reports Bx6 travel time fell 35%.",
      },
    ];
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "authority-label-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source: {
        ...source,
        sourceId: "nyc_dot_fixture",
        sourceTitle: "NYC DOT Fixture",
        sourceGroup: "bus_priority_document",
      },
      evidenceHandles: metricEvidenceHandles,
      routeUniverse: [],
      drafts: [officialMetricDraft()],
    });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "authority-label-test",
    });
    const audit = auditTier2AgenticExtractionArtifact({
      artifact,
      artifactPath: outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(artifact.summary).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0,
      validationIssueCount: 0,
    });
    expect(artifact.drafts[0]?.rawPayload).toMatchObject({
      sourceClaimAuthority: "official_nyc_dot",
      truthStatus: "official_agency_metric_claim",
      publicationWordingGate: "quote_as_source_statement",
    });
    expect(artifact.submitResult.accepted[0]?.surface.rawPayload).toMatchObject({
      sourceClaimAuthority: "official_nyc_dot",
      truthStatus: "official_agency_metric_claim",
      publicationWordingGate: "quote_as_source_statement",
    });
    expect(audit.blockerCount).toBe(0);
  });

  test("infers official source authority from source id when payload authority is absent", async () => {
    const inputPath = join(workingRoot, "authority-source-id-request.json");
    const metricEvidenceHandles = [
      {
        ...evidenceHandles[0],
        evidenceHandle: "ev-metric",
        quoteText: "Bus travel time fell 35%.",
        text: "Bus travel time fell 35%.",
      },
    ];
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "authority-source-id-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source: {
        ...source,
        sourceId: "nyc_dot_bus_priority_document_pdf_fixture",
        sourceTitle: "Bus Priority Fixture",
        sourceGroup: "bus_priority_document",
      },
      evidenceHandles: metricEvidenceHandles,
      routeUniverse: [],
      drafts: [
        {
          ...officialMetricDraft(),
          rawText: "Bus travel time fell 35%.",
          rawPayload: {
            valueRaw: "35%",
            metricName: "travel_time_change",
          },
          evidenceByField: {
            rawText: [
              {
                evidenceHandle: "ev-metric",
                supportRole: "primary",
                supportCompleteness: "exact",
              },
            ],
            "rawPayload.valueRaw": [
              {
                evidenceHandle: "ev-metric",
                supportRole: "metric_value",
                supportCompleteness: "exact",
              },
            ],
          },
        },
      ],
    });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "authority-source-id-test",
    });

    expect(artifact.summary).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0,
      validationIssueCount: 0,
    });
    expect(artifact.drafts[0]?.rawPayload).toMatchObject({
      sourceClaimAuthority: "official_nyc_dot",
      truthStatus: "official_agency_metric_claim",
      publicationWordingGate: "quote_as_source_statement",
    });
  });

  test("repairs unknown source authority from official source metadata", async () => {
    const inputPath = join(workingRoot, "authority-unknown-source-id-request.json");
    const metricEvidenceHandles = [
      {
        ...evidenceHandles[0],
        evidenceHandle: "ev-metric",
        quoteText: "Bus travel time fell 35%.",
        text: "Bus travel time fell 35%.",
      },
    ];
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "authority-unknown-source-id-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source: {
        ...source,
        sourceId: "nyc_dot_select_bus_service_pdf_fixture",
        sourceTitle: "Bus Priority Fixture",
        sourceGroup: "select_bus_service",
      },
      evidenceHandles: metricEvidenceHandles,
      routeUniverse: [],
      drafts: [
        {
          ...officialMetricDraft(),
          rawText: "Bus travel time fell 35%.",
          rawPayload: {
            sourceClaimAuthority: "unknown",
            valueRaw: "35%",
            metricName: "travel_time_change",
          },
          evidenceByField: {
            rawText: [
              {
                evidenceHandle: "ev-metric",
                supportRole: "primary",
                supportCompleteness: "exact",
              },
            ],
            "rawPayload.valueRaw": [
              {
                evidenceHandle: "ev-metric",
                supportRole: "metric_value",
                supportCompleteness: "exact",
              },
            ],
          },
        },
      ],
    });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "authority-unknown-source-id-test",
    });

    expect(artifact.summary).toMatchObject({
      acceptedCount: 1,
      rejectedCount: 0,
      validationIssueCount: 0,
    });
    expect(artifact.drafts[0]?.rawPayload).toMatchObject({
      sourceClaimAuthority: "official_nyc_dot",
      truthStatus: "official_agency_metric_claim",
      publicationWordingGate: "quote_as_source_statement",
    });
  });

  test("audits legacy metric and claim rows missing canonical authority labels", async () => {
    const inputPath = join(workingRoot, "authority-gap-request.json");
    const metricEvidenceHandles = [
      {
        ...evidenceHandles[0],
        evidenceHandle: "ev-metric",
        quoteText: "NYC DOT reports Bx6 travel time fell 35%.",
        text: "NYC DOT reports Bx6 travel time fell 35%.",
      },
    ];
    await writeJson(inputPath, {
      schemaVersion: 1,
      runId: "authority-gap-test",
      generatedAt: "2026-06-04T00:00:00.000Z",
      source: {
        ...source,
        sourceId: "nyc_dot_fixture",
        sourceTitle: "NYC DOT Fixture",
        sourceGroup: "bus_priority_document",
      },
      evidenceHandles: metricEvidenceHandles,
      routeUniverse: [],
      drafts: [officialMetricDraft()],
    });

    const artifact = await runTier2AgenticExtractionHarness({
      inputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "authority-gap-test",
    });
    const firstDraft = artifact.drafts[0];
    if (firstDraft === undefined) {
      throw new Error("Expected authority gap test to produce one draft.");
    }
    const legacyDraft = {
      ...firstDraft,
      rawPayload: {
        authorityRaw: "NYC DOT",
        valueRaw: "35%",
        metricName: "travel_time_change",
      },
    };
    const audit = auditTier2AgenticExtractionArtifact({
      artifact: {
        ...artifact,
        drafts: [legacyDraft],
      },
      artifactPath: "artifact.json",
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(audit.blockerCount).toBe(1);
    expect(audit.issues.map((issue) => issue.code)).toContain(
      "source_statement_authority_fields_missing",
    );
  });

  test("batch runner writes request, artifact, audit, and manifest files", async () => {
    const discoveryPath = join(workingRoot, "batch-discovery.json");
    const outputDir = join(workingRoot, "batch-output");
    const sourceId = "batch-source";
    const windowKey = "discovery-run/sources/0001_batch-source/windows/0001-0001";
    const secondWindowKey = "discovery-run/sources/0001_batch-source/windows/0002-0002";
    const blockIndexPath = join(workingRoot, windowKey, "block-index.json");
    const secondBlockIndexPath = join(workingRoot, secondWindowKey, "block-index.json");
    const metadataPath = join(workingRoot, "sources", sourceId, "metadata.json");
    await mkdir(dirname(blockIndexPath), { recursive: true });
    await mkdir(dirname(secondBlockIndexPath), { recursive: true });
    await mkdir(dirname(metadataPath), { recursive: true });
    await writeJson(discoveryPath, {
      windows: [
        {
          windowId: `${sourceId}:1`,
          sourceId,
          pageNumbers: [1],
          status: "extracted",
          blockIndexArtifactKey: `${windowKey}/block-index.json`,
          extractionArtifactKey: null,
        },
        {
          windowId: `${sourceId}:2`,
          sourceId,
          pageNumbers: [2],
          status: "extracted",
          blockIndexArtifactKey: `${secondWindowKey}/block-index.json`,
          extractionArtifactKey: null,
        },
      ],
    });
    await writeJson(metadataPath, {
      sourceId,
      title: "Batch Source",
      sourceGroup: "fixture",
      sha256: "sha256:batch-source",
    });
    await writeJson(blockIndexPath, {
      sourceId,
      pageNumbers: [1],
      markdownHash: "sha256:batch-markdown",
      blockIndexHash: "sha256:batch-block-index",
      pageArtifactKeys: ["ocr/pages/0001/page.md"],
      blocks: [
        {
          blockId: "B0001",
          pageNumber: 1,
          lineStart: 1,
          lineEnd: 1,
          blockHash: "sha256:batch-block",
          text: "M15 bus lane note",
        },
      ],
    });
    await writeJson(secondBlockIndexPath, {
      sourceId,
      pageNumbers: [2],
      markdownHash: "sha256:batch-markdown-2",
      blockIndexHash: "sha256:batch-block-index-2",
      pageArtifactKeys: ["ocr/pages/0002/page.md"],
      blocks: [
        {
          blockId: "B0001",
          pageNumber: 2,
          lineStart: 1,
          lineEnd: 1,
          blockHash: "sha256:batch-block-2",
          text: "M15 follow-up note",
        },
      ],
    });

    const manifest = await runTier2AgenticExtractionBatch({
      discoveryPath,
      outputDir,
      generatedAt: "2026-06-04T00:00:00.000Z",
      runId: "agentic-batch-test",
      windowIds: [`${sourceId}:1`, `${sourceId}:2`],
      priorContextByWindowId: new Map([
        [
          `${sourceId}:2`,
          [
            {
              kind: "self_heal_feedback",
              lane: "validator_feedback_retry",
              issueCodes: ["route_selection_field_path_not_canonical"],
            },
          ],
        ],
      ]),
    });

    expect(manifest.windowCount).toBe(2);
    expect(manifest.summary.auditBlockerCount).toBe(0);
    expect(await Bun.file(manifest.windows[0]?.requestPath ?? "").exists()).toBe(true);
    expect(await Bun.file(manifest.windows[0]?.artifactPath ?? "").exists()).toBe(true);
    expect(await Bun.file(manifest.windows[0]?.auditPath ?? "").exists()).toBe(true);
    expect(await Bun.file(manifest.windows[1]?.requestPath ?? "").exists()).toBe(true);
    const firstRequest = await Bun.file(manifest.windows[0]?.requestPath ?? "").json();
    const secondRequest = await Bun.file(manifest.windows[1]?.requestPath ?? "").json();
    expect(JSON.stringify(firstRequest.priorContext)).not.toContain("validator_feedback_retry");
    expect(JSON.stringify(secondRequest.priorContext)).toContain("validator_feedback_retry");
    expect(await Bun.file(join(outputDir, "manifest.json")).exists()).toBe(true);
  });
});
