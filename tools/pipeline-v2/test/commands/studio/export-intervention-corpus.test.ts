import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { interventionCorpusKey, StudioInterventionCorpusSchema } from "@bp/domain/studio";
import {
  reconcileInterventionCorpus,
  runExportInterventionCorpus,
} from "../../../src/commands/studio/export-intervention-corpus.ts";

const tmp = mkdtempSync(join(tmpdir(), "intervention-corpus-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function record(input: {
  recordId: string;
  route: string;
  treatment: "bus_lane" | "busway" | "reroute" | "transit_signal_priority";
  recordKind: "implemented" | "proposed";
  effectiveDate?: string;
  datePrecision?: "day" | "month";
}) {
  return {
    routes: [input.route],
    primaryTreatments: [input.treatment],
    customTreatments: [],
    corridor: { streets: [`${input.route} corridor`] },
    ...(input.effectiveDate === undefined ? {} : { effectiveDate: input.effectiveDate }),
    ...(input.datePrecision === undefined ? {} : { datePrecision: input.datePrecision }),
    statusHistory: [
      {
        status: input.recordKind === "implemented" ? "complete" : "proposed",
        evidenceRefs: ["candidate-1"],
      },
    ],
    treatmentComponents: [],
    metrics: [],
    caveats: [],
    recordId: input.recordId,
    sourceId: "source-1",
    recordKind: input.recordKind,
    evidenceCandidateIds: ["candidate-1"],
    extraction: {
      candidateExtractionRootName: "candidate-extraction",
      candidateRootName: "candidates",
      synthesisRootName: "synthesis",
    },
  };
}

describe("studio export-intervention-corpus command", () => {
  test("projects valid reviewed records, retains undated proposals, and skips invalid rows", async () => {
    const corpusPath = join(tmp, "reviewed-corpus.json");
    const artifactRoot = join(tmp, "artifacts");
    const sourceMetadataPath = join(tmp, "sources/source-1/metadata.json");
    await mkdir(dirname(sourceMetadataPath), { recursive: true });
    await Bun.write(
      sourceMetadataPath,
      JSON.stringify({ title: "Fixture source", sourceUrl: "https://example.test/source" }),
    );
    await Bun.write(
      corpusPath,
      JSON.stringify({
        version: 3,
        generatedAt: "2026-05-27T17:20:55.275Z",
        summary: { recordCount: 5 },
        documentInterventionRecords: [
          record({
            recordId: "in-window",
            route: "B41",
            treatment: "bus_lane",
            recordKind: "implemented",
            effectiveDate: "2025-06",
            datePrecision: "month",
          }),
          record({
            recordId: "pre-window",
            route: "M14A",
            treatment: "busway",
            recordKind: "implemented",
            effectiveDate: "2019-10-03",
            datePrecision: "day",
          }),
          record({
            recordId: "evaluable-only",
            route: "Q2",
            treatment: "transit_signal_priority",
            recordKind: "implemented",
            effectiveDate: "2025-01",
            datePrecision: "month",
          }),
          record({
            recordId: "undated-proposal",
            route: "Q1",
            treatment: "reroute",
            recordKind: "proposed",
          }),
          {},
        ],
      }),
    );

    const result = await runExportInterventionCorpus({
      corpusPath,
      artifactRoot,
      generatedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(result.sourceRecordCount).toBe(5);
    expect(result.recordCount).toBe(4);
    expect(result.invalidRecordCount).toBe(1);
    expect(result.studyRelevantRecordCount).toBe(3);
    expect(result.studyDateReadyRecordCount).toBe(3);

    const written = JSON.parse(await Bun.file(join(artifactRoot, interventionCorpusKey())).text());
    const corpus = decodeStrict(StudioInterventionCorpusSchema)(written);
    expect(corpus.records.map((item) => item.recordId)).toEqual([
      "in-window",
      "pre-window",
      "evaluable-only",
      "undated-proposal",
    ]);
    expect(corpus.records[0]).toMatchObject({
      title: "B41 corridor — Bus Lane",
      sourceLabel: "Fixture source",
      sourceUrl: "https://example.test/source",
      evaluableInWindow: true,
      statusLatest: "complete",
    });
    expect(corpus.records[1]?.evaluableInWindow).toBe(false);
    expect(corpus.records[3]).toMatchObject({
      effectiveDate: null,
      datePrecision: null,
      evaluableInWindow: false,
      recordKind: "proposed",
    });

    const report = reconcileInterventionCorpus({
      corpus,
      generatedAt: "2026-07-11T00:00:00.000Z",
      registryEvents: [
        {
          event_id: "registry-b41",
          route_id: "B41",
          intervention_type: "bus_lane_infrastructure",
          source_id: "fixture-registry",
          program: "Fixture lanes",
          implementation_date: "2025-06-01",
          implementation_month: "2025-06",
          event_status: "implemented",
          description: "Fixture event",
        },
      ],
    });
    expect(report.summary).toMatchObject({
      corpusRecordCount: 4,
      datedCorpusRecordCount: 3,
      undatedCorpusRecordCount: 1,
      monthReadyCorpusRecordCount: 3,
      matchedCorpusRecordCount: 1,
      corpusOnlyEvaluableCount: 1,
      corpusOnlyPreWindowCount: 1,
      dateConflictCount: 0,
      registryOnlyCount: 0,
    });
    expect(report.corpusOnlyEvaluable[0]?.recordId).toBe("evaluable-only");
    expect(report.corpusOnlyPreWindow[0]?.recordId).toBe("pre-window");
  });
});
