import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DocumentDerivedSurfaceRowSchema } from "@bp/domain";
import { runTier2DocumentDerivedSurfaces } from "../../../../src/commands/docs/tier2/_document-derived-surfaces.ts";
import { writeJson } from "../../../../src/lib/json.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-document-derived-surfaces");

function evidence() {
  return [
    {
      blockId: "B0001",
      pageNumber: 1,
      lineStart: 1,
      lineEnd: 3,
      blockHash: "sha256:block",
    },
  ];
}

function row(input: {
  rowId: string;
  candidateType: string;
  candidateId?: string;
  canonicalFamily: string;
  rawFamily: string;
  displayLabel: string;
  rawCandidate: Record<string, unknown>;
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
    candidateId: input.candidateId ?? input.rowId,
    canonicalFamily: input.canonicalFamily,
    rawFamily: input.rawFamily,
    displayLabel: input.displayLabel,
    clusterKey: `${input.canonicalFamily}|${input.displayLabel.toLowerCase()}`,
    evidenceRefs: evidence(),
    rawCandidate: input.rawCandidate,
  };
}

async function seedNormalizedCandidates() {
  await mkdir(workingRoot, { recursive: true });
  const normalizedPath = join(workingRoot, "normalized.json");
  await writeJson(normalizedPath, {
    version: 1,
    generatedAt: "2026-06-03T00:00:00.000Z",
    rowCount: 7,
    summary: {},
    rows: [
      row({
        rowId: "entity-q",
        candidateType: "entity",
        canonicalFamily: "transit_line",
        rawFamily: "subway line",
        displayLabel: "Q train",
        rawCandidate: { rawText: "Q train", rawKind: "subway line" },
      }),
      row({
        rowId: "metric-speed",
        candidateType: "metric",
        canonicalFamily: "bus_speed",
        rawFamily: "average bus speed",
        displayLabel: "Average bus speeds increased 27%",
        rawCandidate: {
          labelRaw: "Average bus speeds increased 27%",
          valueRaw: "27%",
          valueNumeric: 27,
          unitRaw: "percent",
          authorityRaw: "MTA annual report",
          geographyRaw: "citywide",
          periodRaw: "2024",
        },
      }),
      row({
        rowId: "event-main",
        candidateType: "event",
        canonicalFamily: "bus_lane",
        rawFamily: "implemented bus lane",
        displayLabel: "Implemented Main Street bus lane",
        rawCandidate: {
          nameRaw: "Main Street bus lane",
          familyRaw: "bus lane",
          statusRaw: "implemented",
          dateRaw: "March 2025",
          locationRaw: "Main Street",
          treatmentRaw: "red bus lane",
          affectedEntitiesRaw: ["Q44"],
        },
      }),
      row({
        rowId: "table-ridership",
        candidateType: "table",
        canonicalFamily: "ridership_table",
        rawFamily: "stop ridership table",
        displayLabel: "Stop-level boardings table",
        rawCandidate: {
          tableKindRaw: "stop ridership table",
          headerTextsRaw: ["Stop", "Boardings"],
          rowCount: 2,
          columnCount: 2,
        },
      }),
      row({
        rowId: "claim-causal",
        candidateType: "claim",
        canonicalFamily: "causal_or_effect_claim",
        rawFamily: "effect claim",
        displayLabel: "The bus lane led to faster trips",
        rawCandidate: { claimText: "The bus lane led to faster trips", claimKindRaw: "effect" },
      }),
      row({
        rowId: "context-curb",
        candidateType: "context_signal",
        canonicalFamily: "curb_friction",
        rawFamily: "double parking",
        displayLabel: "Double parking affected operations",
        rawCandidate: {
          signalText: "Double parking affected operations",
          contextKindRaw: "curb friction",
          geographyRaw: "Main Street",
        },
      }),
      row({
        rowId: "question-route",
        candidateType: "review_question",
        canonicalFamily: "needs_route_validation",
        rawFamily: "route validation",
        displayLabel: "Does this reference Q44 or Q train?",
        rawCandidate: {
          question: "Does this reference Q44 or Q train?",
          questionKindRaw: "needs_route_validation",
          priorityRaw: "high",
        },
      }),
    ],
  });
  return normalizedPath;
}

async function readJsonl(path: string) {
  const text = await Bun.file(path).text();
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => DocumentDerivedSurfaceRowSchema.parse(JSON.parse(line)));
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 document-derived surfaces", () => {
  test("materializes source-grounded surface files and manifest", async () => {
    const normalizedPath = await seedNormalizedCandidates();
    const outputDir = join(workingRoot, "surfaces");
    const result = await runTier2DocumentDerivedSurfaces({
      normalizedCandidatesPath: normalizedPath,
      outputDir,
      generatedAt: "2026-06-03T00:00:00.000Z",
    });

    expect(result.manifest.artifactKind).toBe("bp.document_derived_surfaces.v1");
    expect(result.manifest.summary.inputRows).toBe(7);
    expect(result.manifest.summary.surfaceCounts["entity"]).toBe(1);
    expect(result.manifest.summary.surfaceCounts["metric_claim"]).toBe(1);
    expect(result.manifest.surfaceFiles).toHaveLength(8);
    expect(await Bun.file(result.manifestPath).exists()).toBe(true);

    const entities = await readJsonl(join(outputDir, "entities.jsonl"));
    expect(entities[0]?.surfaceKind).toBe("entity");
    if (entities[0]?.surfaceKind !== "entity") throw new Error("expected entity surface");
    expect(entities[0].entityMode).toBe("subway_line");

    const metrics = await readJsonl(join(outputDir, "metric-claims.jsonl"));
    if (metrics[0]?.surfaceKind !== "metric_claim") throw new Error("expected metric surface");
    expect(metrics[0].metricAuthority).toBe("official_agency_metric");
    expect(metrics[0].truthStatus).toBe("official_source_claim");
    expect(metrics[0].needsDeterministicMetric).toBe(true);

    const claims = await readJsonl(join(outputDir, "claims.jsonl"));
    if (claims[0]?.surfaceKind !== "claim") throw new Error("expected claim surface");
    expect(claims[0].causalClaimFlag).toBe(true);
    expect(claims[0].promotionState).toBe("research_only");
  });
});
