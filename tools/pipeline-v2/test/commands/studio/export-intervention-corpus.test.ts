import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { decodeStrict } from "@bp/domain/decode";
import { interventionCorpusKey, StudioInterventionCorpusSchema } from "@bp/domain/studio";
import {
  interventionCorpusReconciliationMarkdown,
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
  test("loads the repository-pinned reviewed corpus without row loss", async () => {
    const artifactRoot = join(tmp, "default-corpus-artifacts");
    const result = await runExportInterventionCorpus({
      artifactRoot,
      generatedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(result.sourceRecordCount).toBe(310);
    expect(result.recordCount).toBe(310);
    expect(result.invalidRecordCount).toBe(0);
    const corpus = decodeStrict(StudioInterventionCorpusSchema)(
      JSON.parse(await Bun.file(join(artifactRoot, interventionCorpusKey())).text()),
    );
    expect(corpus.records).toHaveLength(310);
    expect(new Set(corpus.records.map((record) => record.recordId)).size).toBe(310);
    expect(corpus.sourceCorpus.sha256).toBe(
      "593cb776ffdfb4c95526772757c54ac6bfb60ba2dbe1443f013445e251132d04",
    );
  });

  test("projects every valid reviewed record and retains undated documentation rows", async () => {
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
        summary: { recordCount: 10 },
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
          ...Array.from({ length: 5 }, (_, index) =>
            record({
              recordId: `undated-implemented-${index + 1}`,
              route: "Q1",
              treatment: "reroute",
              recordKind: "implemented",
            }),
          ),
          record({
            recordId: "undated-proposal-2",
            route: "Q3",
            treatment: "reroute",
            recordKind: "proposed",
          }),
        ],
      }),
    );

    const result = await runExportInterventionCorpus({
      corpusPath,
      artifactRoot,
      generatedAt: "2026-07-11T00:00:00.000Z",
    });

    expect(result.sourceRecordCount).toBe(10);
    expect(result.recordCount).toBe(10);
    expect(result.invalidRecordCount).toBe(0);
    expect(result.studyRelevantRecordCount).toBe(8);
    expect(result.studyDateReadyRecordCount).toBe(3);

    const written = JSON.parse(await Bun.file(join(artifactRoot, interventionCorpusKey())).text());
    const corpus = decodeStrict(StudioInterventionCorpusSchema)(written);
    expect(corpus.records.map((item) => item.recordId)).toEqual([
      "in-window",
      "pre-window",
      "evaluable-only",
      "undated-proposal",
      "undated-implemented-1",
      "undated-implemented-2",
      "undated-implemented-3",
      "undated-implemented-4",
      "undated-implemented-5",
      "undated-proposal-2",
    ]);
    const corpusBytes = await Bun.file(corpusPath).arrayBuffer();
    expect(corpus.sourceCorpus.sha256).toBe(
      createHash("sha256").update(new Uint8Array(corpusBytes)).digest("hex"),
    );
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
      corpusRecordCount: 10,
      datedCorpusRecordCount: 3,
      undatedCorpusRecordCount: 7,
      monthReadyCorpusRecordCount: 3,
      matchedCorpusRecordCount: 1,
      corpusOnlyEvaluableCount: 1,
      corpusOnlyPreWindowCount: 1,
      dateConflictCount: 0,
      registryOnlyCount: 0,
    });
    expect(report.corpusOnlyEvaluable[0]?.recordId).toBe("evaluable-only");
    expect(report.corpusOnlyPreWindow[0]?.recordId).toBe("pre-window");
    const markdown = interventionCorpusReconciliationMarkdown(report);
    expect(markdown).toContain(
      "They never enter Plan 074 causal inputs; those come only from trusted registry events plus manifest-pinned, locally revalidated Wiki anchors.",
    );
    expect(markdown).toContain(
      "## Corpus-only window-aligned documentation findings (not study inputs)",
    );
    expect(markdown).not.toContain("operator review required before Plan 074 merge");
  });

  test("fails closed on corpus digest, declared count, invalid rows, or duplicate record ids", async () => {
    const valid = record({
      recordId: "strict-record",
      route: "B1",
      treatment: "bus_lane",
      recordKind: "implemented",
      effectiveDate: "2025-01",
      datePrecision: "month",
    });
    const writeEnvelope = async (
      name: string,
      recordCount: number,
      documentInterventionRecords: unknown[],
    ): Promise<string> => {
      const path = join(tmp, `${name}.json`);
      await Bun.write(
        path,
        JSON.stringify({
          version: 3,
          generatedAt: "2026-05-27T17:20:55.275Z",
          summary: { recordCount },
          documentInterventionRecords,
        }),
      );
      return path;
    };

    const digestPath = await writeEnvelope("digest-mismatch", 1, [valid]);
    await expect(
      runExportInterventionCorpus({
        corpusPath: digestPath,
        artifactRoot: join(tmp, "digest-artifacts"),
        expectedCorpusSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("Reviewed intervention corpus SHA-256 mismatch");

    const countPath = await writeEnvelope("count-mismatch", 2, [valid]);
    await expect(
      runExportInterventionCorpus({
        corpusPath: countPath,
        artifactRoot: join(tmp, "count-artifacts"),
      }),
    ).rejects.toThrow("Reviewed intervention corpus count mismatch");

    const invalidPath = await writeEnvelope("invalid-row", 1, [{}]);
    await expect(
      runExportInterventionCorpus({
        corpusPath: invalidPath,
        artifactRoot: join(tmp, "invalid-artifacts"),
      }),
    ).rejects.toThrow("zero row loss is permitted");

    const duplicatePath = await writeEnvelope("duplicate-row", 2, [valid, valid]);
    await expect(
      runExportInterventionCorpus({
        corpusPath: duplicatePath,
        artifactRoot: join(tmp, "duplicate-artifacts"),
      }),
    ).rejects.toThrow("duplicate recordId values");
  });
});
