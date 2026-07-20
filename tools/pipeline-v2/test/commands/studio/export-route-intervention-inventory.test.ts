import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1,
  type RouteTreatmentInterventionEventRow,
} from "@bp/analytics/interventions";
import type { StudioInterventionCorpus } from "@bp/domain/studio";
import { optionNames } from "../../../src/cli/registry.ts";
import command, {
  reconcileRouteTreatmentScopePartition,
  routeInterventionInventoryVocabularyReport,
} from "../../../src/commands/studio/export-route-intervention-inventory.ts";

const commandPath = new URL(
  "../../../src/commands/studio/export-route-intervention-inventory.ts",
  import.meta.url,
);

function completeReviewedCorpus(): StudioInterventionCorpus {
  return {
    records: [
      {
        customTreatments: REVIEWED_OPEN_TREATMENT_DISPOSITIONS_V1.map((row) => row.rawValue),
      },
    ],
  } as unknown as StudioInterventionCorpus;
}

function localRow(interventionType: string): RouteTreatmentInterventionEventRow {
  return {
    event_id: `event-${interventionType}`,
    route_id: "B44",
    intervention_type: interventionType,
    source_id: "fixture",
    program: "fixture",
    implementation_date: "2025-01-01",
    implementation_month: "2025-01",
    event_status: "implemented",
    description: "fixture",
  };
}

describe("studio export-route-intervention-inventory command", () => {
  test("exposes only source and output-path options, without identity overrides", () => {
    const names = optionNames(command as unknown as Parameters<typeof optionNames>[0]);
    expect(names).toEqual([
      "artifactRoot",
      "checkVocabulary",
      "db",
      "interventionCorpus",
      "mtaWikiRoot",
      "releaseArtifact",
      "routeEvidenceIndex",
      "wikiOccurrences",
    ]);
    expect(names).not.toContain("month");
    expect(names).not.toContain("releaseId");
    expect(names).not.toContain("publishedAt");
  });

  test("reports rc25 unresolved semantics as partial without treating them as unknown", () => {
    const report = routeInterventionInventoryVocabularyReport({
      corpus: completeReviewedCorpus(),
      localRows: [],
      treatmentSemantics: {
        schema_version: 1,
        dispositions: [
          {
            disposition: "unresolved",
            raw_treatment_kind: "source_specific_treatment",
            record_ids: ["treatment-1"],
            review_reason: "Producer retained an explicit unresolved semantic decision.",
          },
        ],
      },
      treatmentVocabularyScopes: [
        { rawValue: "source_specific_treatment", recordId: "treatment-1" },
      ],
      routeTreatmentScopes: [
        {
          scopeId: "scope-1",
          treatmentRecordId: "treatment-1",
          rawValue: "source_specific_treatment",
        },
      ],
      routeTreatmentScopeReconciliation: [],
    });

    expect(report.exact).toBe(true);
    expect(report.coverageState).toBe("partial");
    expect(report.blockingUnresolvedScopeCount).toBe(1);
    expect(report.wikiSemantics.unknownScopes).toEqual([]);
    expect(report.routeScopePartition.exact).toBe(true);
  });

  test("counts every trusted local raw intervention type in the exact receipt", () => {
    const report = routeInterventionInventoryVocabularyReport({
      corpus: completeReviewedCorpus(),
      localRows: [localRow("busway"), localRow("frequency_increase")],
      treatmentSemantics: { schema_version: 1, dispositions: [] },
      treatmentVocabularyScopes: [],
      routeTreatmentScopes: [],
      routeTreatmentScopeReconciliation: [],
    });
    const busway = report.nonWiki.collected.find((row) => row.rawValue === "busway");
    const frequency = report.nonWiki.collected.find((row) => row.rawValue === "frequency_increase");

    expect(busway?.sourceCounts.local_registry).toBe(1);
    expect(frequency?.sourceCounts.local_registry).toBe(1);
  });

  test("accepts partial routing while still failing literal mismatches and missing records", () => {
    const report = reconcileRouteTreatmentScopePartition({
      vocabularyScopes: [
        { rawValue: "bus_lane", recordId: "treatment-1" },
        { rawValue: "queue_jump", recordId: "treatment-2" },
      ],
      routeScopes: [{ scopeId: "scope-1", treatmentRecordId: "treatment-1", rawValue: "busway" }],
      unscopedRows: [{ treatmentRecordId: "treatment-1", rawValue: "bus_lane" }],
    });

    expect(report.exact).toBe(false);
    expect(report.missingRecordIds).toEqual(["treatment-2"]);
    expect(report.partiallyRoutedRecordIds).toEqual(["treatment-1"]);
    expect(report.literalMismatches).toEqual(["treatment-1"]);

    const partiallyRouted = reconcileRouteTreatmentScopePartition({
      vocabularyScopes: [{ rawValue: "bus_lane", recordId: "treatment-1" }],
      routeScopes: [{ scopeId: "scope-1", treatmentRecordId: "treatment-1", rawValue: "bus_lane" }],
      unscopedRows: [{ treatmentRecordId: "treatment-1", rawValue: "bus_lane" }],
    });
    expect(partiallyRouted.exact).toBe(true);
    expect(partiallyRouted.partiallyRoutedRecordIds).toEqual(["treatment-1"]);
  });

  test("returns from vocabulary mode before build promotion and opens an optional DB read-only", () => {
    const source = readFileSync(commandPath, "utf8");
    const checkBranch = source.indexOf("if (input.options.checkVocabulary)");
    const promotion = source.indexOf("await promoteRouteInterventionInventoryArtifacts");

    expect(checkBranch).toBeGreaterThan(-1);
    expect(promotion).toBeGreaterThan(checkBranch);
    expect(source.slice(checkBranch, promotion)).toContain("return {");
    expect(source).toContain("dbPath: fromCliPath(options.db)");
    expect(source).toContain("localDbOptions: { readonly: true }");
    expect(source).toContain("buildRouteInterventionInventory(loaded.buildInput)");
  });
});
