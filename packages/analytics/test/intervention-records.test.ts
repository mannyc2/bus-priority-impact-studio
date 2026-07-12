// Tier 2 intervention-records synthesis policy — deterministic unit tests.
// Lifted from the pipeline's phase3.test.ts when the policy moved to
// @bp/analytics/interventions. Bucketing/orchestration cases stay
// in the pipeline test (they exercise tool-owned IO/LLM glue).
import { describe, expect, test } from "bun:test";
import {
  backfillStatusHistory,
  candidateHasBusPrioritySignal,
  dedupeInterventionRecordsByEvidenceOverlap,
  inferRecordKind,
  mergeRecordCluster,
  normalizeCorridorText,
  processInterventionRecordsToolArgs,
  recordHasInterventionEvidence,
  recordsAreClusterCompatible,
  repairInterventionRecordsAliases,
  sanitizeStatusHistoryForProposedOnly,
  validateCorridorExtentEndpoints,
  validateMetricValueNumericSupport,
} from "@bp/analytics/interventions";
import type {
  Tier2CandidateSourceRef,
  Tier2DocumentEvidenceCandidate,
} from "@bp/domain/documents/candidates";
import type {
  DocumentInterventionRecord,
  DocumentInterventionRecordDraft,
} from "@bp/domain/documents/intervention-records";
import { DocumentInterventionRecordsToolResponseSchema } from "@bp/domain/documents/intervention-records";
import { Result } from "effect";
import { decodeSchemaEitherStrict } from "../src/schema-decode.js";

function parseToolResponseForRepair(value: unknown) {
  const result = decodeSchemaEitherStrict(DocumentInterventionRecordsToolResponseSchema, value);
  return Result.isSuccess(result)
    ? { success: true as const }
    : { success: false as const, error: { issues: [] } };
}

type Tier2DocumentInterventionRecord = DocumentInterventionRecord;

const SOURCE_REF: Tier2CandidateSourceRef = {
  sourceId: "test_source",
  sourceUrl: "https://example.com/test.pdf",
  title: "Test source",
  publisher: "Test publisher",
  documentDate: null,
  sourceGroup: "test_group",
  artifactKeys: {
    raw: null,
    text: null,
    ocrText: null,
    ocrJson: null,
    ocrAnnotations: null,
  },
  pages: [1],
};

function buildCandidate(
  overrides: Partial<Tier2DocumentEvidenceCandidate>,
): Tier2DocumentEvidenceCandidate {
  return {
    candidateType: "document_treatment_component_candidate",
    candidateId: overrides.candidateId ?? "test_candidate_1",
    sourceRef: SOURCE_REF,
    factClassification: "official_claim",
    negativeEvidenceFlag: "none",
    routeMentions: [],
    corridorMentions: [],
    evidencePageRefs: [1],
    evidenceQuote: "",
    summary: "",
    fields: {},
    extraction: {
      pageMarkdownRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      windowPages: [1],
    },
    validationState: "validated",
    reviewReason: "",
    ...overrides,
  };
}

function buildRecord(
  overrides: Partial<Tier2DocumentInterventionRecord>,
): Tier2DocumentInterventionRecord {
  return {
    recordId: overrides.recordId ?? "document_intervention:test_source:0",
    sourceId: "test_source",
    recordKind: "proposed",
    routes: [],
    primaryTreatments: [],
    statusHistory: [],
    treatmentComponents: [],
    metrics: [],
    caveats: [],
    evidenceCandidateIds: [],
    extraction: {
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
    },
    ...overrides,
  } as Tier2DocumentInterventionRecord;
}

function must<T>(value: T | null | undefined): T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  return value as T;
}

describe("repairInterventionRecordsAliases (Fix 6)", () => {
  test("rewrites comparisonPeriodStart/End into nested comparisonPeriod", () => {
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          metrics: [
            {
              metricName: "travel_time",
              valueNumeric: 15,
              comparisonPeriodStart: "2023-01-01",
              comparisonPeriodEnd: "2023-06-30",
              evidenceRefs: ["c1"],
            },
          ],
        },
      ],
    };
    const { patched, repairedRecordIndices } = repairInterventionRecordsAliases(toolArgs);
    expect(repairedRecordIndices).toEqual([0]);
    const root = patched as {
      interventionRecords: Array<{ metrics: Array<Record<string, unknown>> }>;
    };
    const metric = must(must(root.interventionRecords[0]).metrics[0]);
    expect(metric["comparisonPeriod"]).toEqual({
      start: "2023-01-01",
      end: "2023-06-30",
    });
    expect("comparisonPeriodStart" in metric).toBe(false);
    expect("comparisonPeriodEnd" in metric).toBe(false);
  });

  test("leaves unrelated tool args untouched", () => {
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [{ metrics: [{ metricName: "n", evidenceRefs: ["c1"] }] }],
    };
    const { repairedRecordIndices } = repairInterventionRecordsAliases(toolArgs);
    expect(repairedRecordIndices).toEqual([]);
  });

  test("demotes invented enum values to custom labels (Fix P1.5, audit follow-up)", async () => {
    const { DocumentInterventionRecordsToolResponseSchema } = await import(
      "@bp/domain/documents/intervention-records"
    );
    const { repairInvalidEnumValues } = await import("@bp/analytics/interventions");
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          primaryTreatments: ["bus_lane", "frequency_increase"],
          statusHistory: [],
          treatmentComponents: [
            {
              treatmentType: "bus_lane",
              description: "Add bus lane",
              evidenceRefs: ["c1"],
            },
            {
              treatmentType: "frequency_increase",
              description: "Increase frequency",
              evidenceRefs: ["c2"],
            },
          ],
          metrics: [
            {
              metricName: "fictional_metric",
              valueQualifier: "improved",
              evidenceRefs: ["c3"],
            },
          ],
          serviceMode: "rapid_bus_transit",
          caveats: [],
        },
      ],
      unattachedCandidateIds: [],
    };
    const { patched, recordIndicesWithStrippedEnums } = repairInvalidEnumValues(
      toolArgs,
      parseToolResponseForRepair,
    );
    expect(recordIndicesWithStrippedEnums.has(0)).toBe(true);
    const reparse = decodeSchemaEitherStrict(
      DocumentInterventionRecordsToolResponseSchema,
      patched,
    );
    expect(Result.isSuccess(reparse)).toBe(true);
    if (Result.isSuccess(reparse)) {
      const record = must(reparse.success.interventionRecords[0]);
      // Invalid primaryTreatments[] element moved into customTreatments[].
      expect(record.primaryTreatments).toEqual(["bus_lane"]);
      expect(record.customTreatments).toContain("frequency_increase");
      // Invalid treatmentType demoted to customTreatmentType — component survives, labeled.
      expect(record.treatmentComponents).toHaveLength(2);
      expect(record.treatmentComponents[1]?.treatmentType).toBeUndefined();
      expect(record.treatmentComponents[1]?.customTreatmentType).toBe("frequency_increase");
      // Invalid metricName demoted to customMetricName.
      expect(record.metrics[0]?.metricName).toBeUndefined();
      expect(record.metrics[0]?.customMetricName).toBe("fictional_metric");
      // serviceMode has no custom counterpart — deleted.
      expect(record.serviceMode).toBeUndefined();
    }
  });

  test("drops treatmentComponents and metrics with neither canonical nor custom label", async () => {
    const { DocumentInterventionRecordsToolResponseSchema } = await import(
      "@bp/domain/documents/intervention-records"
    );
    const { repairInvalidEnumValues } = await import("@bp/analytics/interventions");
    // The invalid treatmentType has no value to demote (it's a non-string).
    // Confirm the component is dropped entirely.
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          primaryTreatments: ["bus_lane"],
          statusHistory: [],
          treatmentComponents: [
            {
              treatmentType: "bus_lane",
              description: "Keep me",
              evidenceRefs: ["c1"],
            },
            {
              treatmentType: 42,
              description: "Drop me — invalid non-string type and no custom",
              evidenceRefs: ["c2"],
            },
          ],
          metrics: [],
          caveats: [],
        },
      ],
      unattachedCandidateIds: [],
    };
    const { patched } = repairInvalidEnumValues(toolArgs, parseToolResponseForRepair);
    const reparse = decodeSchemaEitherStrict(
      DocumentInterventionRecordsToolResponseSchema,
      patched,
    );
    expect(Result.isSuccess(reparse)).toBe(true);
    if (Result.isSuccess(reparse)) {
      const record = must(reparse.success.interventionRecords[0]);
      expect(record.treatmentComponents).toHaveLength(1);
      expect(record.treatmentComponents[0]?.description).toBe("Keep me");
    }
  });

  test("drops empty corridor and empty extentEndpoints (Fix P1.6)", () => {
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          primaryTreatments: ["bus_lane"],
          corridor: {},
          metrics: [],
        },
        {
          routes: ["M14"],
          primaryTreatments: ["bus_lane"],
          corridor: {
            streets: ["14th Street"],
            extentEndpoints: { start: "", end: "Avenue D" },
          },
          metrics: [],
        },
        {
          routes: ["M101"],
          primaryTreatments: ["bus_lane"],
          corridor: { streets: [] },
          metrics: [],
        },
      ],
    };
    const { patched } = repairInterventionRecordsAliases(toolArgs);
    const root = patched as {
      interventionRecords: Array<Record<string, unknown>>;
    };
    // Empty corridor → deleted
    expect("corridor" in must(root.interventionRecords[0])).toBe(false);
    // extentEndpoints with empty start → dropped, streets preserved
    const r1 = must(root.interventionRecords[1])["corridor"] as Record<string, unknown>;
    expect("extentEndpoints" in r1).toBe(false);
    expect(r1["streets"]).toEqual(["14th Street"]);
    // Corridor with empty streets → corridor deleted
    expect("corridor" in must(root.interventionRecords[2])).toBe(false);
  });

  test("coerces statusHistory status synonyms (Fix P1.6)", () => {
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          primaryTreatments: ["bus_lane"],
          statusHistory: [
            { status: "implemented", evidenceRefs: ["c1"] },
            { status: "In Progress", evidenceRefs: ["c2"] },
            { status: "under construction", evidenceRefs: ["c3"] },
            { status: "on hold", evidenceRefs: ["c4"] },
          ],
        },
      ],
    };
    const { patched } = repairInterventionRecordsAliases(toolArgs);
    const root = patched as {
      interventionRecords: Array<{
        statusHistory: Array<{ status: string }>;
      }>;
    };
    expect(must(root.interventionRecords[0]).statusHistory.map((e) => e.status)).toEqual([
      "complete",
      "implementing",
      "implementing",
      "planning",
    ]);
  });

  test("strips unrecognized keys from metric entries (Fix P1.7)", async () => {
    const { DocumentInterventionRecordsToolResponseSchema } = await import(
      "@bp/domain/documents/intervention-records"
    );
    const { repairInvalidEnumValues } = await import("@bp/analytics/interventions");
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["B83"],
          primaryTreatments: ["bus_lane"],
          statusHistory: [],
          treatmentComponents: [],
          metrics: [
            {
              metricName: "bus_travel_time",
              unit: "percent",
              evidenceRefs: ["c1"],
              notes: "Model invented this key — schema is .strict()",
            },
          ],
          caveats: [],
        },
      ],
      unattachedCandidateIds: [],
    };
    const { patched, recordIndicesWithStrippedEnums } = repairInvalidEnumValues(
      toolArgs,
      parseToolResponseForRepair,
    );
    expect(recordIndicesWithStrippedEnums.has(0)).toBe(true);
    const reparse = decodeSchemaEitherStrict(
      DocumentInterventionRecordsToolResponseSchema,
      patched,
    );
    expect(Result.isSuccess(reparse)).toBe(true);
    if (Result.isSuccess(reparse)) {
      const metric = must(must(reparse.success.interventionRecords[0]).metrics[0]);
      expect("notes" in metric).toBe(false);
      expect(metric.metricName).toBe("bus_travel_time");
    }
  });

  test("drops statusHistory entries with unrecognizable status (P1.6)", async () => {
    const { DocumentInterventionRecordsToolResponseSchema } = await import(
      "@bp/domain/documents/intervention-records"
    );
    const { repairInvalidEnumValues } = await import("@bp/analytics/interventions");
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          primaryTreatments: ["bus_lane"],
          statusHistory: [
            { status: "proposed", evidenceRefs: ["c1"] },
            { status: "totally_made_up_status", evidenceRefs: ["c2"] },
            { status: "complete", evidenceRefs: ["c3"] },
          ],
          metrics: [],
          treatmentComponents: [],
          caveats: [],
        },
      ],
      unattachedCandidateIds: [],
    };
    const { patched } = repairInvalidEnumValues(toolArgs, parseToolResponseForRepair);
    const reparse = decodeSchemaEitherStrict(
      DocumentInterventionRecordsToolResponseSchema,
      patched,
    );
    expect(Result.isSuccess(reparse)).toBe(true);
    if (Result.isSuccess(reparse)) {
      const statuses = must(reparse.success.interventionRecords[0]).statusHistory.map(
        (entry) => entry.status,
      );
      expect(statuses).toEqual(["proposed", "complete"]);
    }
  });

  test("filters null array elements (Fix P1.4 audit follow-up)", () => {
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          primaryTreatments: ["bus_lane"],
          customTreatments: ["frequency_increase", null, "other"],
          metrics: [],
        },
      ],
    };
    const { patched } = repairInterventionRecordsAliases(toolArgs);
    const root = patched as {
      interventionRecords: Array<{ customTreatments: unknown[] }>;
    };
    expect(must(root.interventionRecords[0]).customTreatments).toEqual([
      "frequency_increase",
      "other",
    ]);
  });

  test("strips null optional fields (Fix P1.4)", () => {
    const toolArgs = {
      sourceId: "x",
      interventionRecords: [
        {
          routes: ["M15"],
          corridor: {
            streets: ["Jamaica Avenue"],
            extentEndpoints: null,
            intersections: [],
          },
          serviceMode: null,
          metrics: [],
        },
      ],
    };
    const { patched } = repairInterventionRecordsAliases(toolArgs);
    const root = patched as {
      interventionRecords: Array<Record<string, unknown> & { corridor: Record<string, unknown> }>;
    };
    const firstRecord = must(root.interventionRecords[0]);
    const corridor = firstRecord.corridor;
    expect("extentEndpoints" in corridor).toBe(false);
    expect("serviceMode" in firstRecord).toBe(false);
    expect(corridor["streets"]).toEqual(["Jamaica Avenue"]);
  });

  test("repairs conflicting canonical/custom metric and component labels", () => {
    const candidate = buildCandidate({
      candidateId: "c1",
      candidateType: "document_treatment_component_candidate",
      evidenceQuote:
        "The B1 bus route would add overnight service; the route is 8.5 miles and average speed is 8.5 mph.",
      fields: { treatmentTypes: ["reroute"] },
    });
    const result = processInterventionRecordsToolArgs({
      sourceId: "test_source",
      bucket: {
        bucketId: "test_source:single_call",
        bucketKind: "single_call",
        candidates: [candidate],
      },
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
      toolArgs: {
        sourceId: "test_source",
        interventionRecords: [
          {
            routes: ["B1"],
            primaryTreatments: ["reroute"],
            statusHistory: [{ status: "proposed", evidenceRefs: ["c1"] }],
            treatmentComponents: [
              {
                treatmentType: "reroute",
                customTreatmentType: "overnight_service",
                description: "Add overnight service.",
                evidenceRefs: ["c1"],
              },
            ],
            metrics: [
              {
                metricName: "bus_running_time",
                customMetricName: "route_length",
                valueNumeric: 8.5,
                unit: "miles",
                evidenceRefs: ["c1"],
              },
              {
                metricName: "bus_running_time",
                customMetricName: "Bus Average Speed",
                valueNumeric: 8.5,
                unit: "mph",
                evidenceRefs: ["c1"],
              },
              {
                metricName: "bus_running_time",
                customMetricName: "turns_per_mile",
                unit: "per mile",
                evidenceRefs: ["c1"],
              },
            ],
            caveats: [],
          },
        ],
        unattachedCandidateIds: [],
      },
    });
    expect(result.status).toBe("extracted");
    if (result.status === "extracted") {
      const record = must(result.records[0]);
      expect(record.extraction.qualityRepairs).toContain("phase3_record_label_conflict_repaired");
      expect(record.treatmentComponents[0]?.treatmentType).toBeUndefined();
      expect(record.treatmentComponents[0]?.customTreatmentType).toBe("overnight_service");
      expect(record.metrics[0]?.metricName).toBeUndefined();
      expect(record.metrics[0]?.customMetricName).toBe("route_length");
      expect(record.metrics[1]?.metricName).toBe("bus_average_speed");
      expect(record.metrics[1]?.customMetricName).toBeUndefined();
      expect(record.metrics).toHaveLength(2);
    }
  });

  test("reports the native schema path for an invalid nested value", () => {
    const result = processInterventionRecordsToolArgs({
      sourceId: "test_source",
      bucket: {
        bucketId: "test_source:single_call",
        bucketKind: "single_call",
        candidates: [],
      },
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
      toolArgs: {
        sourceId: "test_source",
        interventionRecords: [{ routes: [42] }],
        unattachedCandidateIds: [],
      },
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("Expected schema validation failure");
    expect(
      result.issues.some((issue) => issue.path === "interventionRecords.0.routes.0"),
    ).toBeTrue();
  });
});

describe("sanitizeStatusHistoryForProposedOnly (Fix 2)", () => {
  test("coerces planning/implementing/monitoring/complete when all refs are proposed_only", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      negativeEvidenceFlag: "proposed_only",
    });
    const candidateById = new Map([["c1", c1]]);
    const result = sanitizeStatusHistoryForProposedOnly({
      statusHistory: [
        { status: "planning", evidenceRefs: ["c1"] },
        { status: "complete", evidenceRefs: ["c1"] },
        { status: "implementing", evidenceRefs: ["c1"] },
        { status: "monitoring", evidenceRefs: ["c1"] },
      ],
      candidateById,
    });
    expect(result.coerced).toBe(true);
    expect(result.statusHistory.map((entry) => entry.status)).toEqual([
      "proposed",
      "proposed",
      "proposed",
      "proposed",
    ]);
  });

  test("leaves status alone when at least one ref is non-proposed", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      negativeEvidenceFlag: "proposed_only",
    });
    const c2 = buildCandidate({
      candidateId: "c2",
      negativeEvidenceFlag: "none",
    });
    const candidateById = new Map([
      ["c1", c1],
      ["c2", c2],
    ]);
    const result = sanitizeStatusHistoryForProposedOnly({
      statusHistory: [{ status: "complete", evidenceRefs: ["c1", "c2"] }],
      candidateById,
    });
    expect(result.coerced).toBe(false);
    expect(result.statusHistory[0]?.status).toBe("complete");
  });
});

describe("backfillStatusHistory (Fix P1.1)", () => {
  test("coerces candidate-derived non-proposed statuses to 'proposed' when candidate is proposed-only", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      negativeEvidenceFlag: "proposed_only",
      fields: { status: "planning" },
    });
    const result = backfillStatusHistory({
      draft: {
        statusHistory: [],
      } as unknown as DocumentInterventionRecordDraft,
      recordCandidates: [c1],
    });
    expect(result.coercedFromProposedOnly).toBe(true);
    expect(result.statusHistory[0]?.status).toBe("proposed");
  });

  test("leaves status untouched when candidate is not proposed-only", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      negativeEvidenceFlag: "none",
      fields: { implementationStatus: "implemented" },
    });
    const result = backfillStatusHistory({
      draft: {
        statusHistory: [],
      } as unknown as DocumentInterventionRecordDraft,
      recordCandidates: [c1],
    });
    expect(result.coercedFromProposedOnly).toBe(false);
    expect(result.statusHistory[0]?.status).toBe("complete");
  });
});

describe("inferRecordKind", () => {
  test("returns 'proposed' when every candidate is proposed_only despite leaked 'complete' in history", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      negativeEvidenceFlag: "proposed_only",
    });
    const kind = inferRecordKind({
      statusHistory: [{ status: "complete", evidenceRefs: ["c1"] }],
      recordCandidates: [c1],
    });
    expect(kind).toBe("proposed");
  });

  test("returns 'implemented' when at least one candidate is not proposed-only and history has complete", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      negativeEvidenceFlag: "none",
    });
    const kind = inferRecordKind({
      statusHistory: [{ status: "complete", evidenceRefs: ["c1"] }],
      recordCandidates: [c1],
    });
    expect(kind).toBe("implemented");
  });
});

describe("validateMetricValueNumericSupport (Fix 3 + P2.4)", () => {
  test("keeps valueNumeric when supported by candidate quote", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      evidenceQuote: "Travel times improved by 15 percent in 2023.",
    });
    const candidateById = new Map([["c1", c1]]);
    const { unsupportedValueNumericRemoved, metric } = validateMetricValueNumericSupport({
      metric: {
        valueNumeric: 15,
        unit: "percent",
        evidenceRefs: ["c1"],
      } as DocumentInterventionRecord["metrics"][number],
      candidateById,
    });
    expect(unsupportedValueNumericRemoved).toBe(false);
    expect(metric.valueNumeric).toBe(15);
  });

  test("drops fabricated value (46 + 46 = 92) not present anywhere", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      evidenceQuote: "Customer satisfaction: 46% pre-launch and 46% post-launch.",
    });
    const candidateById = new Map([["c1", c1]]);
    const { unsupportedValueNumericRemoved, metric } = validateMetricValueNumericSupport({
      metric: {
        valueNumeric: 92,
        evidenceRefs: ["c1"],
      } as DocumentInterventionRecord["metrics"][number],
      candidateById,
    });
    expect(unsupportedValueNumericRemoved).toBe(true);
    expect(metric.valueNumeric).toBeUndefined();
  });

  test("requires unit compatibility when matching fields.valueNumeric (P2.4)", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      evidenceQuote: "Plain prose with no extractable number context here.",
      fields: { valueNumeric: 23, unit: "minutes" },
    });
    const candidateById = new Map([["c1", c1]]);
    const { unsupportedValueNumericRemoved } = validateMetricValueNumericSupport({
      metric: {
        valueNumeric: 23,
        unit: "percent",
        evidenceRefs: ["c1"],
      } as DocumentInterventionRecord["metrics"][number],
      candidateById,
    });
    expect(unsupportedValueNumericRemoved).toBe(true);
  });

  test("accepts fields.valueNumeric match when units agree", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      evidenceQuote: "Plain prose with no extractable number context here.",
      fields: { valueNumeric: 23, unit: "minutes" },
    });
    const candidateById = new Map([["c1", c1]]);
    const { unsupportedValueNumericRemoved } = validateMetricValueNumericSupport({
      metric: {
        valueNumeric: 23,
        unit: "minutes",
        evidenceRefs: ["c1"],
      } as DocumentInterventionRecord["metrics"][number],
      candidateById,
    });
    expect(unsupportedValueNumericRemoved).toBe(false);
  });
});

describe("normalizeCorridorText + validateCorridorExtentEndpoints (Fix 4)", () => {
  test("normalizes case, punctuation, and street-suffix variants", () => {
    expect(normalizeCorridorText("14th St.")).toBe("14th street");
    expect(normalizeCorridorText("Atlantic Ave")).toBe("atlantic avenue");
    expect(normalizeCorridorText("Northern Blvd.")).toBe("northern boulevard");
  });

  test("keeps endpoints when both appear in supporting quote (with suffix normalization)", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      evidenceQuote: "The busway runs from 14th Street to 42nd Street on Broadway.",
    });
    const { unsupportedEndpointsRemoved, corridor } = validateCorridorExtentEndpoints({
      corridor: {
        streets: ["Broadway"],
        extentEndpoints: { start: "14th St", end: "42nd St" },
      },
      supportingCandidates: [c1],
    });
    expect(unsupportedEndpointsRemoved).toBe(false);
    expect(corridor.extentEndpoints).toBeDefined();
  });

  test("drops inferred endpoints when not present in supporting quotes", () => {
    const c1 = buildCandidate({
      candidateId: "c1",
      evidenceQuote: "Jamaica Avenue busway pilot.",
    });
    const { unsupportedEndpointsRemoved, corridor } = validateCorridorExtentEndpoints({
      corridor: {
        streets: ["Jamaica Avenue"],
        extentEndpoints: { start: "Sutphin Boulevard", end: "168th Street" },
      },
      supportingCandidates: [c1],
    });
    expect(unsupportedEndpointsRemoved).toBe(true);
    expect(corridor.extentEndpoints).toBeUndefined();
    expect(corridor.streets).toEqual(["Jamaica Avenue"]);
  });
});

describe("recordHasInterventionEvidence (Fix 7 + P2.5)", () => {
  test("accepts a treatment_component candidate with bus-priority quote", () => {
    const c1 = buildCandidate({
      candidateType: "document_treatment_component_candidate",
      evidenceQuote: "Install dedicated bus lanes on the M15 corridor.",
      fields: { treatmentTypes: ["bus_lane"] },
    });
    expect(recordHasInterventionEvidence([c1])).toBe(true);
  });

  test("rejects a record whose only candidate is a fare-policy quote", () => {
    const c1 = buildCandidate({
      candidateType: "document_treatment_component_candidate",
      evidenceQuote: "Implement fare capping and OMNY-based fare policy across all customers.",
      fields: {},
    });
    expect(candidateHasBusPrioritySignal(c1)).toBe(false);
    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("rejects 'bus fare policy' even when bus regex matches (audit hole)", () => {
    const c1 = buildCandidate({
      candidateType: "document_treatment_component_candidate",
      evidenceQuote: "MTA will revise bus fare policy and fare enforcement strategy in 2026.",
      fields: {},
    });
    // Bus regex matches "bus", but the fare-policy pattern fires too and
    // the candidate has no typed treatmentTypes/changeTypes, so the
    // record-level check rejects.
    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("keeps fare-mention candidate when it carries typed treatmentTypes", () => {
    const c1 = buildCandidate({
      candidateType: "document_treatment_component_candidate",
      evidenceQuote: "Install off-board fare collection on M15 SBS to speed boarding.",
      fields: { treatmentTypes: ["off_board_fare_collection"] },
    });
    // Typed treatmentTypes is the strongest bus-priority signal — survives
    // even though the fare-policy regex also matches.
    expect(recordHasInterventionEvidence([c1])).toBe(true);
  });

  test("rejects records whose only candidate is a subway-elevator quote", () => {
    const c1 = buildCandidate({
      candidateType: "document_treatment_component_candidate",
      evidenceQuote:
        "Install new elevators and escalators at the subway station for accessibility.",
      fields: {},
    });
    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("rejects records whose only project_status candidate is a plan-publication milestone", () => {
    const c1 = buildCandidate({
      candidateType: "document_project_status_candidate",
      evidenceQuote: "Publish Proposed Final Plan Q4 2023.",
      fields: {},
      extraction: {
        pageMarkdownRootName: "ocr-page-markdown",
        candidateRootName: "ocr-markdown-candidates",
        windowPages: [1],
        qualityIssues: ["project_status_is_document_milestone"],
      },
    });
    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("rejects subway service changes even when Phase 2 emitted changeTypes", () => {
    const c1 = buildCandidate({
      candidateType: "document_service_change_candidate",
      evidenceQuote:
        "We implemented the first permanent change to the subway network since 2017 by swapping the routes the F and M take between Queens and Manhattan.",
      summary:
        "NYCT implemented a permanent route swap for the F and M between Queens and Manhattan.",
      fields: { changeTypes: ["route_modified"] },
    });

    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("rejects service-change records that only retain existing bus service", () => {
    const c1 = buildCandidate({
      candidateType: "document_service_change_candidate",
      routeMentions: ["Q25"],
      corridorMentions: ["127 St"],
      evidenceQuote:
        "The existing Q25 routing along 127 St provides important access for College Point riders and would not change under Queens Bus Network Redesign.",
      summary: "Q25 routing along 127 St would remain unchanged under the redesign.",
      fields: { changeTypes: ["route_modified"] },
    });

    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("rejects declined comment-response reroutes as non-interventions", () => {
    const c1 = buildCandidate({
      candidateType: "document_service_change_candidate",
      routeMentions: ["Q25", "Q65"],
      corridorMentions: ["146 St", "Jamaica Av", "Archer Av"],
      evidenceQuote:
        "Comment: Reroute the proposed Q25 and Q65 to terminate along 146 St between Jamaica Av and Archer Av. Response: Moving bus terminals in Jamaica is logistically challenging as any adjustments would have a cascading effect.",
      summary:
        "MTA declined a request to reroute the proposed Q25 and Q65 because terminal changes are logistically challenging.",
      fields: { changeTypes: ["route_modified"] },
    });

    expect(recordHasInterventionEvidence([c1])).toBe(false);
  });

  test("rejects generic SBS feature toolkit records with no project anchor", () => {
    const candidates = [
      buildCandidate({
        candidateId: "toolkit_bus_lane",
        candidateType: "document_treatment_component_candidate",
        evidenceQuote:
          "Curbside bus lanes are travel lanes for buses at the curb. Curbside bus lanes are only in effect during certain times of the day.",
        summary: "SBS features include curbside bus lanes.",
        fields: { treatmentTypes: ["bus_lane"] },
      }),
      buildCandidate({
        candidateId: "toolkit_tsp",
        candidateType: "document_treatment_component_candidate",
        evidenceQuote:
          "Transit signal priority uses GPS to track when a bus nears an intersection and turns traffic signals green sooner.",
        summary: "SBS features include transit signal priority.",
        fields: { treatmentTypes: ["transit_signal_priority"] },
      }),
    ];

    expect(recordHasInterventionEvidence(candidates)).toBe(false);
  });

  test("keeps anchored bus-priority records without route mentions", () => {
    const c1 = buildCandidate({
      candidateType: "document_treatment_component_candidate",
      corridorMentions: ["East 161st Street"],
      evidenceQuote: "NYC DOT completed bus lanes on East 161st Street in 2026.",
      fields: { treatmentTypes: ["bus_lane"], effectiveDate: "2026" },
    });

    expect(recordHasInterventionEvidence([c1])).toBe(true);
  });
});

describe("recordsAreClusterCompatible (Fix P1.3)", () => {
  test("incompatible when records share only a route", () => {
    const a = buildRecord({ routes: ["M15"] });
    const b = buildRecord({ routes: ["M15", "M14"] });
    expect(recordsAreClusterCompatible(a, b)).toBe(false);
  });

  test("incompatible when records share only a primary treatment", () => {
    const a = buildRecord({
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
    });
    const b = buildRecord({
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
    });
    expect(recordsAreClusterCompatible(a, b)).toBe(false);
  });

  test("compatible when records share route and primary treatment", () => {
    const a = buildRecord({
      routes: ["M15"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
    });
    const b = buildRecord({
      routes: ["M15", "M14"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
    });
    expect(recordsAreClusterCompatible(a, b)).toBe(true);
  });

  test("compatible when records share treatment and corridor", () => {
    const a = buildRecord({
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
      corridor: { streets: ["14th St"] },
    });
    const b = buildRecord({
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
      corridor: { streets: ["14th Street"] },
    });
    expect(recordsAreClusterCompatible(a, b)).toBe(true);
  });

  test("incompatible when records share only a corridor-distant context", () => {
    const a = buildRecord({
      routes: ["M15"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
    });
    const b = buildRecord({
      routes: ["B44"],
      primaryTreatments: [
        "transit_signal_priority",
      ] as Tier2DocumentInterventionRecord["primaryTreatments"],
    });
    expect(recordsAreClusterCompatible(a, b)).toBe(false);
  });
});

describe("dedupeInterventionRecordsByEvidenceOverlap (Fix 8)", () => {
  test("does NOT merge records that share a candidate but have no other compatibility (Fix P1.3)", () => {
    const c1 = buildCandidate({ candidateId: "c1" });
    const a = buildRecord({
      recordId: "a",
      routes: ["M15"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
      evidenceCandidateIds: ["c1"],
    });
    const b = buildRecord({
      recordId: "b",
      routes: ["Q23"],
      primaryTreatments: [
        "off_board_fare_collection",
      ] as Tier2DocumentInterventionRecord["primaryTreatments"],
      evidenceCandidateIds: ["c1"],
    });
    const out = dedupeInterventionRecordsByEvidenceOverlap({
      records: [a, b],
      sourceId: "test_source",
      candidateById: new Map([["c1", c1]]),
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
    });
    expect(out).toHaveLength(2);
  });

  test("does NOT merge records that share broad evidence and only one loose compatibility signal", () => {
    const c1 = buildCandidate({ candidateId: "shared-table" });
    const a = buildRecord({
      recordId: "a",
      routes: ["M15"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
      evidenceCandidateIds: ["shared-table"],
    });
    const b = buildRecord({
      recordId: "b",
      routes: ["M15"],
      primaryTreatments: [
        "transit_signal_priority",
      ] as Tier2DocumentInterventionRecord["primaryTreatments"],
      evidenceCandidateIds: ["shared-table"],
    });
    const out = dedupeInterventionRecordsByEvidenceOverlap({
      records: [a, b],
      sourceId: "test_source",
      candidateById: new Map([["shared-table", c1]]),
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
    });
    expect(out).toHaveLength(2);
  });

  test("merges records that share a candidate plus route and treatment", () => {
    const c1 = buildCandidate({ candidateId: "c1" });
    const a = buildRecord({
      recordId: "a",
      routes: ["M15"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
      evidenceCandidateIds: ["c1"],
      extraction: {
        candidateExtractionRootName: "ocr-page-markdown",
        candidateRootName: "ocr-markdown-candidates",
        synthesisRootName: "intervention-records",
        bucketId: "test:per_route:M15",
        bucketKind: "per_route",
      },
    });
    const b = buildRecord({
      recordId: "b",
      routes: ["M15"],
      primaryTreatments: ["bus_lane"] as Tier2DocumentInterventionRecord["primaryTreatments"],
      evidenceCandidateIds: ["c1"],
      extraction: {
        candidateExtractionRootName: "ocr-page-markdown",
        candidateRootName: "ocr-markdown-candidates",
        synthesisRootName: "intervention-records",
        bucketId: "test:per_route:Q23",
        bucketKind: "per_route",
      },
    });
    const out = dedupeInterventionRecordsByEvidenceOverlap({
      records: [a, b],
      sourceId: "test_source",
      candidateById: new Map([["c1", c1]]),
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.extraction.qualityRepairs ?? []).toContain(
      "phase3_record_merged_from_route_buckets",
    );
    // P2.6: merged bucketId carries every participating bucket sorted+joined.
    expect(out[0]?.extraction.bucketId).toBe("test:per_route:M15,test:per_route:Q23");
  });
});

describe("mergeRecordCluster (Fix P2.6 — evidence refs union per component)", () => {
  test("unions evidenceRefs across duplicate treatmentComponents", () => {
    const c1 = buildCandidate({ candidateId: "c1" });
    const c2 = buildCandidate({ candidateId: "c2" });
    const a = buildRecord({
      recordId: "a",
      routes: ["M15"],
      evidenceCandidateIds: ["c1"],
      treatmentComponents: [
        {
          treatmentType:
            "bus_lane" as DocumentInterventionRecord["treatmentComponents"][number]["treatmentType"],
          description: "Add dedicated bus lane",
          evidenceRefs: ["c1"],
        },
      ],
    });
    const b = buildRecord({
      recordId: "b",
      routes: ["M15"],
      evidenceCandidateIds: ["c2"],
      treatmentComponents: [
        {
          treatmentType:
            "bus_lane" as DocumentInterventionRecord["treatmentComponents"][number]["treatmentType"],
          description: "Add dedicated bus lane",
          evidenceRefs: ["c2"],
        },
      ],
    });
    const merged = mergeRecordCluster({
      records: [a, b],
      sourceId: "test_source",
      candidateById: new Map([
        ["c1", c1],
        ["c2", c2],
      ]),
      clusterIndex: 0,
      candidateExtractionRootName: "ocr-page-markdown",
      candidateRootName: "ocr-markdown-candidates",
      synthesisRootName: "intervention-records",
    });
    expect(merged.treatmentComponents).toHaveLength(1);
    expect(merged.treatmentComponents[0]?.evidenceRefs.toSorted()).toEqual(["c1", "c2"]);
  });
});
