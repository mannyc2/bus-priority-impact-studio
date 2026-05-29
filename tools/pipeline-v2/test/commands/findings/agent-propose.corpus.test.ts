import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { loadCorpus } from "../../../src/commands/findings/_corpus.ts";
import { writeJson } from "../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-findings-corpus");

beforeAll(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterAll(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

async function caseDir(name: string): Promise<string> {
  const dir = join(workingRoot, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

describe("loadCorpus", () => {
  test("returns an empty corpus when no paths are provided", async () => {
    const corpus = await loadCorpus({ month: "2026-03" });
    expect(corpus.month).toBe("2026-03" as never);
    expect(corpus.routes.size).toBe(0);
    expect(corpus.reviewPackets.size).toBe(0);
    expect(corpus.promotedFindings.size).toBe(0);
    expect(corpus.interventionRecords.size).toBe(0);
    expect(corpus.documentCandidates.size).toBe(0);
    expect(corpus.publishableInterventions.length).toBe(0);
    expect(corpus.paths.reviewPackets).toBeNull();
  });

  test("indexes intervention records by route and recordId", async () => {
    const dir = await caseDir("intervention-records");
    const interventionRecordsPath = join(dir, "intervention-records.json");
    await writeJson(interventionRecordsPath, {
      documentInterventionRecords: [
        {
          recordId: "rec-1",
          sourceId: "src-a",
          recordKind: "implemented",
          routes: ["B44", "B44-SBS"],
          serviceMode: "sbs",
          primaryTreatments: ["bus_lane"],
          customTreatments: [],
          corridor: { streets: ["Main Street"] },
          effectiveDate: "2024-06-01",
          datePrecision: "day",
          statusHistory: [],
          treatmentComponents: [],
          metrics: [],
          caveats: [],
          evidenceCandidateIds: ["cand-1"],
          extraction: {
            candidateExtractionRootName: "x",
            candidateRootName: "y",
            synthesisRootName: "z",
          },
        },
        {
          recordId: "rec-2",
          sourceId: "src-b",
          recordKind: "proposed",
          routes: ["Q65"],
          serviceMode: "local",
          primaryTreatments: ["tsp"],
          customTreatments: [],
          corridor: { streets: [] },
          effectiveDate: "2025-09-01",
          datePrecision: "month",
          statusHistory: [],
          treatmentComponents: [],
          metrics: [],
          caveats: [],
          evidenceCandidateIds: [],
          extraction: {
            candidateExtractionRootName: "x",
            candidateRootName: "y",
            synthesisRootName: "z",
          },
        },
      ],
    });

    const corpus = await loadCorpus({
      month: "2026-03",
      interventionRecordsPath,
    });
    expect(corpus.interventionRecords.size).toBe(2);
    expect(corpus.interventionRecordsByRoute.get("B44" as never)?.length).toBe(1);
    expect(corpus.interventionRecordsByRoute.get("Q65" as never)?.length).toBe(1);
    expect(corpus.routes.has("B44" as never)).toBe(true);
    expect(corpus.routes.has("Q65" as never)).toBe(true);
  });

  test("loads publishable interventions and projects them by route", async () => {
    const dir = await caseDir("publishable");
    const interventionPublishablePath = join(dir, "intervention-publishable-v1.json");
    await writeJson(interventionPublishablePath, {
      version: 1,
      generatedAt: "2026-05-29T00:00:00.000Z",
      summary: {},
      publishableInterventions: [
        {
          recordId: "rec-1",
          sourceId: "src-a",
          status: "implemented",
          recordKind: "implemented",
          routes: ["B44", "BX12"],
          primaryTreatments: ["bus_lane"],
        },
      ],
    });
    const corpus = await loadCorpus({
      month: "2026-03",
      interventionPublishablePath,
    });
    expect(corpus.publishableInterventions.length).toBe(1);
    expect(corpus.publishableInterventionsByRoute.get("B44" as never)?.length).toBe(1);
    expect(corpus.publishableInterventionsByRoute.get("BX12" as never)?.length).toBe(1);
    expect(corpus.paths.interventionPublishable).toBe(interventionPublishablePath);
  });

  test("indexes the context appendix by routeId", async () => {
    const dir = await caseDir("context-appendix");
    const contextAppendixPath = join(dir, "context-appendix.json");
    await writeJson(contextAppendixPath, {
      artifactKind: "finding_context_appendix",
      schemaVersion: 1,
      month: "2026-03",
      generatedAt: "2026-05-24T00:00:00.000Z",
      summary: {},
      routes: [
        { routeId: "B44", weatherReliability: { coverage: "available" } },
        { routeId: "Q65", equity: { decile: 2 } },
      ],
    });
    const corpus = await loadCorpus({
      month: "2026-03",
      contextAppendixPath,
    });
    expect(corpus.contextAppendixByRoute.size).toBe(2);
    expect(corpus.contextAppendixByRoute.get("B44" as never)).toBeDefined();
    expect(corpus.routes.has("B44" as never)).toBe(true);
  });

  test("indexes document candidates by candidateId", async () => {
    const dir = await caseDir("document-candidates");
    const documentCandidatesPath = join(dir, "v5-candidates.json");
    await writeJson(documentCandidatesPath, {
      documentEvidenceCandidates: [
        {
          candidateId: "cand-1",
          candidateType: "document_treatment_component_candidate",
          sourceId: "src-a",
          extractionRunId: "run-1",
          extractedAt: "2026-05-01T00:00:00.000Z",
          evidenceQuote: "The bus lane on Main was completed in 2020.",
          factClassification: "specific_fact",
          payload: { kind: "treatment_component", description: "x" },
          sourceRef: { title: "Plan PDF", sourceUrl: "https://example.com/plan.pdf" },
        },
      ],
    });
    const corpus = await loadCorpus({
      month: "2026-03",
      documentCandidatesPath,
    });
    expect(corpus.documentCandidates.size).toBe(1);
    expect(corpus.documentCandidates.has("cand-1")).toBe(true);
  });

  test("union route set draws from every contributing source", async () => {
    const dir = await caseDir("route-union");
    const interventionRecordsPath = join(dir, "ir.json");
    const contextAppendixPath = join(dir, "ctx.json");
    await writeJson(interventionRecordsPath, {
      documentInterventionRecords: [
        {
          recordId: "rec-1",
          sourceId: "s",
          recordKind: "implemented",
          routes: ["BX12"],
          serviceMode: "sbs",
          primaryTreatments: ["bus_lane"],
          customTreatments: [],
          corridor: { streets: [] },
          effectiveDate: "2024-01-01",
          datePrecision: "day",
          statusHistory: [],
          treatmentComponents: [],
          metrics: [],
          caveats: [],
          evidenceCandidateIds: [],
          extraction: { candidateExtractionRootName: "x", candidateRootName: "y", synthesisRootName: "z" },
        },
      ],
    });
    await writeJson(contextAppendixPath, {
      schemaVersion: 1,
      routes: [{ routeId: "M15" }],
    });
    const corpus = await loadCorpus({
      month: "2026-03",
      interventionRecordsPath,
      contextAppendixPath,
    });
    expect(corpus.routes.has("BX12" as never)).toBe(true);
    expect(corpus.routes.has("M15" as never)).toBe(true);
  });
});
