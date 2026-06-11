import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { buildTier2DiscoveryCurationAudit } from "../../../../src/commands/docs/tier2/_discovery-curation.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-discovery-curation");

const evidenceRef = {
  blockId: "B0001",
  pageNumber: 1,
  lineStart: 1,
  lineEnd: 1,
  blockHash: "sha256:block",
};

function extraction(input: { extractionId: string; page: number; candidates?: "first" | "second" }) {
  return {
    source: {
      sourceId: "fixture_source",
      sourceTitle: "Fixture Source",
      publisher: "Fixture Agency",
      sourceGroup: "select_bus_service",
      finalUrl: "https://example.org/source.pdf",
      documentDateState: "unknown",
      pageNumbers: [input.page],
      pageArtifactKeys: [`pages/${String(input.page).padStart(4, "0")}/page.md`],
      markdownHash: `sha256:markdown-${input.page}`,
      blockIndexHash: `sha256:block-index-${input.page}`,
      sourceContentHash: "sha256:source",
    },
    pageProfile: {
      documentModeRaw: input.candidates === "second" ? "launch_flyer" : "presentation_slide",
      pageRolesRaw: ["data_page"],
      contentTypesRaw: ["table", "route mention"],
      discoveryShouldProceed: true,
    },
    entities:
      input.candidates === "second"
        ? [
            {
              entityId: "entity-3",
              rawText: "M15 SBS",
              rawKind: "SBS route",
              kindHint: "bus_route",
              evidenceRefs: [evidenceRef],
            },
          ]
        : [
            {
              entityId: "entity-1",
              rawText: "M15 SBS",
              rawKind: "bus route mention",
              kindHint: "bus_route",
              evidenceRefs: [evidenceRef],
            },
            {
              entityId: "entity-2",
              rawText: "LIRR",
              rawKind: "commuter rail service",
              evidenceRefs: [evidenceRef],
            },
            {
              entityId: "entity-4",
              rawText: "14th Street Transit & Truck Priority Pilot Project",
              rawKind: "project_name",
              kindHint: "program",
              evidenceRefs: [evidenceRef],
            },
            {
              entityId: "entity-5",
              rawText: "pedestrians",
              rawKind: "road_user_group",
              kindHint: "road_user_group",
              evidenceRefs: [evidenceRef],
            },
          ],
    metrics:
      input.candidates === "second"
        ? []
        : [
            {
              metricId: "metric-1",
              labelRaw: "Average bus speeds",
              valueRaw: "5%",
              valueKind: "percent",
              evidenceRefs: [evidenceRef],
            },
            {
              metricId: "metric-2",
              labelRaw: "Total Ons",
              valueRaw: "120",
              valueKind: "absolute",
              evidenceRefs: [evidenceRef],
            },
            {
              metricId: "metric-3",
              labelRaw: "Stops away",
              valueRaw: "3",
              valueKind: "absolute",
              evidenceRefs: [evidenceRef],
            },
          ],
    events: [],
    tables: [
      {
        tableId: `table-${input.page}`,
        tableKindRaw: "before_after_comparison",
        headerTextsRaw: ["Before", "After"],
        evidenceRefs: [evidenceRef],
      },
    ],
    claims: [
      {
        claimId: `claim-${input.page}-speed`,
        claimText: "Average bus speeds improved after launch.",
        claimKindRaw: "performance_observation",
        evidenceRefs: [evidenceRef],
      },
      ...(input.candidates === "second"
        ? []
        : [
            {
              claimId: `claim-${input.page}-ridership`,
              claimText: "High ridership across 10 bus routes that use much of the study area.",
              claimKindRaw: "assertion",
              metricCandidateIds: ["metric-2"],
              evidenceRefs: [evidenceRef],
            },
          ]),
    ],
    contextSignals: [],
    reviewQuestions: [],
    extractionAudit: {
      promptVersion: "tier2-document-discovery-v1",
      toolSchemaVersion: "1",
      modelId: "fixture-model",
      extractedAt: "2026-06-02T00:00:00.000Z",
      pageWindowId: `fixture_source:${input.page}`,
      candidateCounts: {},
    },
    extractionId: input.extractionId,
    validationState: "extracted",
    validationIssues:
      input.candidates === "second"
        ? [
            {
              severity: "error",
              code: "evidence_block_hash_mismatch",
              path: "entities.0.evidenceRefs.0.blockHash",
              message: "Expected canonical hash.",
            },
          ]
        : [],
  };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(join(workingRoot, "root", "source", "windows", "0001-0001"), { recursive: true });
  await mkdir(join(workingRoot, "root", "source", "windows", "0002-0002"), { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 discovery curation audit", () => {
  test("groups validation issues, normalizes vocabulary, and seeds dedupe clusters", async () => {
    const root = join(workingRoot, "root");
    await Bun.write(
      join(root, "source", "windows", "0001-0001", "document-discovery.json"),
      JSON.stringify(extraction({ extractionId: "extraction-1", page: 1, candidates: "first" })),
    );
    await Bun.write(
      join(root, "source", "windows", "0002-0002", "document-discovery.json"),
      JSON.stringify(extraction({ extractionId: "extraction-2", page: 2, candidates: "second" })),
    );

    const audit = await buildTier2DiscoveryCurationAudit({
      discoveryRoots: [root],
      output: join(workingRoot, "audit.json"),
      markdown: join(workingRoot, "audit.md"),
      normalized: join(workingRoot, "normalized.json"),
      generatedAt: "2026-06-02T00:00:00.000Z",
      topClusters: 10,
    });

    expect(audit.summary.extractionCount).toBe(2);
    expect(audit.summary.validationIssueCount).toBe(1);
    expect(audit.normalizationSeed.evidencePolicy.modelShouldSubmitBlockHash).toBe(false);
    expect(audit.normalizationSeed.entityKindMappings.map((row) => row.canonicalFamily)).toContain(
      "bus_route",
    );
    expect(audit.normalizationSeed.entityKindMappings.map((row) => row.canonicalFamily)).toContain(
      "rail_service",
    );
    expect(audit.normalizationSeed.entityKindMappings.map((row) => row.canonicalFamily)).toContain(
      "program",
    );
    expect(audit.normalizationSeed.entityKindMappings.map((row) => row.canonicalFamily)).toContain(
      "vehicle_or_user_class",
    );
    expect(audit.normalizationSeed.metricFamilyMappings[0]?.canonicalFamily).toBe("bus_speed");
    expect(audit.normalizationSeed.metricFamilyMappings.map((row) => row.canonicalFamily)).toContain(
      "ridership",
    );
    expect(audit.normalizationSeed.metricFamilyMappings.map((row) => row.canonicalFamily)).toContain(
      "realtime_arrival_info",
    );
    expect(audit.dedupeSeed.entities[0]?.displayLabel).toBe("M15 SBS");
    expect(audit.dedupeSeed.entities[0]?.count).toBe(2);
    expect(await Bun.file(join(workingRoot, "audit.md")).exists()).toBe(true);
    const normalized = await Bun.file(join(workingRoot, "normalized.json")).json();
    expect(normalized.rowCount).toBe(13);
    expect(normalized.summary.byCandidateType.entity).toBe(5);
    expect(normalized.summary.byCanonicalFamily.claim).not.toContainEqual({
      canonicalFamily: "other_claim",
      count: 1,
      sourceCount: 1,
    });
    expect(normalized.summary.byCanonicalFamily.entity[0]?.canonicalFamily).toBe("bus_route");
    expect(normalized.rows[0]?.clusterKey).toBe("bus_route|m15 sbs");
    expect(normalized.rows[0]?.evidenceRefs[0]?.blockId).toBe("B0001");
  });

  test("can select one canonical extraction per source window by root priority", async () => {
    const fallbackRoot = join(workingRoot, "fallback-root");
    const preferredRoot = join(workingRoot, "preferred-root");
    await mkdir(join(fallbackRoot, "source", "windows", "0001-0001"), { recursive: true });
    await mkdir(join(preferredRoot, "source", "windows", "0001-0001"), { recursive: true });
    await Bun.write(
      join(fallbackRoot, "source", "windows", "0001-0001", "document-discovery.json"),
      JSON.stringify(extraction({ extractionId: "fallback-extraction", page: 1, candidates: "first" })),
    );
    await Bun.write(
      join(preferredRoot, "source", "windows", "0001-0001", "document-discovery.json"),
      JSON.stringify(extraction({ extractionId: "preferred-extraction", page: 1, candidates: "second" })),
    );

    const audit = await buildTier2DiscoveryCurationAudit({
      discoveryRoots: [fallbackRoot, preferredRoot],
      output: join(workingRoot, "canonical-audit.json"),
      normalized: join(workingRoot, "canonical-normalized.json"),
      generatedAt: "2026-06-02T00:00:00.000Z",
      canonicalPerWindow: true,
      canonicalRootPriority: ["preferred-root", "fallback-root"],
    });

    expect(audit.summary.extractionCount).toBe(1);
    expect(audit.summary.validationIssueCount).toBe(1);
    expect(audit.summary.candidateCounts.entity).toBe(1);
    const normalized = await Bun.file(join(workingRoot, "canonical-normalized.json")).json();
    expect(normalized.rowCount).toBe(3);
    expect(new Set(normalized.rows.map((row: { inputLabel: string }) => row.inputLabel))).toEqual(
      new Set(["preferred-root"]),
    );
  });
});
