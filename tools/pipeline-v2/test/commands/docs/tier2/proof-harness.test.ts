import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { OperationalDateAssertion } from "@bp/domain";
import {
  buildTier2ProofCandidates,
  runTier2ProofHarness,
  type Tier2ProofResult,
  validateTier2ProofResult,
} from "../../../../src/commands/docs/tier2/_proof-harness.ts";

const workingRoot = join(process.cwd(), "test", ".tmp-tier2-proof-harness");

function anchorAssertion(
  overrides: Partial<OperationalDateAssertion> = {},
): OperationalDateAssertion {
  return {
    surfaceId: "docsurf_q52q53",
    sourceId: "nyc_dot_better_buses_action_plan_2019_pdf",
    sourceTitle: "NYC DOT Better Buses Action Plan",
    sourceGroup: "better_buses",
    displayLabel: "Q52/Q53 SBS service launched",
    eventName: "Q52/Q53 SBS service launched",
    treatmentText: "Select Bus Service (SBS)",
    locationText: "Broadway and Woodhaven Blvd, Queens",
    operationalDate: "November 2017",
    datePrecision: "month",
    statusRaw: "completed",
    familyRaw: "service_launch",
    subtypeRaw: "bus_rapid_transit_launch",
    eventKind: "service_change",
    interventionFamily: "select_bus_service",
    sourceStatedStatus: "done",
    dateBasis: "source_stated_complete",
    validationState: "source_stated_operational_date",
    trustedOperationalDate: true,
    classificationReasons: [
      "bus-priority treatment term present",
      "source states the intervention is operational/complete on the stated date",
    ],
    evidenceRefs: [
      {
        sourceId: "nyc_dot_better_buses_action_plan_2019_pdf",
        blockId: "B0004",
        pageNumber: 37,
        lineStart: 9,
        lineEnd: 10,
        blockHash: "sha256:fixture",
        roleRaw: "launch_date",
      },
    ],
    effectiveDateStart: "2017-11-01",
    effectiveDateEnd: "2017-11-30",
    implementationMonth: "2017-11",
    normalizedPrecision: "month",
    isRealizedOnset: true,
    routeIds: ["Q52+", "Q53+"],
    routeIdentityValidationState: "confirmed_in_current_gtfs",
    routeResolutionTier: "direct_event_text",
    interventionId: "intv_q52q53",
    evidenceSourceIds: ["nyc_dot_better_buses_action_plan_2019_pdf"],
    sourceCount: 1,
    confidence: 0.95,
    causalAnchorEligible: true,
    ...overrides,
  };
}

const fixtureContext = [
  "The Q52/Q53 Select Bus Service launched in November 2017 along Woodhaven Boulevard.",
  "The project added off-board fare collection and bus priority treatments for Q52 and Q53 customers.",
].join("\n");

function provenResult(overrides: Partial<Tier2ProofResult> = {}): Tier2ProofResult {
  return {
    candidateId: "docsurf_q52q53",
    proofStatus: "proven",
    claimType: "realized_operational_launch",
    dateText: "November 2017",
    operationalStatusText: "launched",
    treatmentText: "Select Bus Service",
    routeScope: {
      kind: "direct_route",
      routeIds: ["Q52+", "Q53+"],
      routeText: "Q52/Q53 Select Bus Service",
    },
    evidenceSpans: [
      {
        spanId: "span-launch",
        pageNumber: 37,
        quote:
          "The Q52/Q53 Select Bus Service launched in November 2017 along Woodhaven Boulevard.",
        supports: ["date", "operational_status", "route_scope", "treatment_type"],
      },
    ],
    counterEvidenceSpans: [],
    confidence: "high",
    reasoning: "The source directly states that Q52/Q53 SBS launched in November 2017.",
    unvalidatedQuestions: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
  await mkdir(workingRoot, { recursive: true });
});

afterEach(async () => {
  await rm(workingRoot, { force: true, recursive: true });
});

describe("Tier 2 proof harness", () => {
  test("accepts a proven anchor only when exact quoted evidence resolves", () => {
    const candidate = buildTier2ProofCandidates({ assertions: [anchorAssertion()] })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult(),
      contextText: fixtureContext,
      contextStatus: "provided_context",
    });

    expect(issues.filter((item) => item.severity === "error")).toEqual([]);
  });

  test("rejects fabricated proof quotes even when the model marks the result proven", () => {
    const candidate = buildTier2ProofCandidates({ assertions: [anchorAssertion()] })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        evidenceSpans: [
          {
            spanId: "span-fake",
            pageNumber: 37,
            quote: "The Q52/Q53 SBS began service on October 2017.",
            supports: ["date", "operational_status", "route_scope"],
          },
        ],
      }),
      contextText: fixtureContext,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).toContain("evidence_quote_not_found");
  });

  test("allows unresolved extra context spans when exact core proof resolves", () => {
    const candidate = buildTier2ProofCandidates({ assertions: [anchorAssertion()] })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        evidenceSpans: [
          ...provenResult().evidenceSpans,
          {
            spanId: "span-extra-context",
            pageNumber: 37,
            quote:
              "Q52/Q53 SBS begins at Woodhaven Boulevard and serves many of the same stops as the limited route",
            supports: ["route_scope", "context"],
          },
        ],
      }),
      contextText: fixtureContext,
      contextStatus: "provided_context",
    });

    expect(issues.filter((item) => item.severity === "error")).toEqual([]);
    expect(issues.map((item) => item.code)).toContain("evidence_quote_not_found");
  });

  test("rejects planned or future status language as proven operational proof", () => {
    const candidate = buildTier2ProofCandidates({ assertions: [anchorAssertion()] })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");
    const plannedQuote =
      "The Q52/Q53 Select Bus Service is scheduled to launch in November 2017 along Woodhaven Boulevard.";

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        evidenceSpans: [
          {
            spanId: "span-planned",
            pageNumber: 37,
            quote: plannedQuote,
            supports: ["date", "operational_status", "route_scope", "treatment_type"],
          },
        ],
      }),
      contextText: plannedQuote,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).toContain("planned_or_future_language_in_status_quote");
  });

  test("rejects route scope that does not confirm the candidate route", () => {
    const candidate = buildTier2ProofCandidates({ assertions: [anchorAssertion()] })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        routeScope: {
          kind: "direct_route",
          routeIds: ["Q5+"],
          routeText: "Q5",
        },
      }),
      contextText: fixtureContext,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).toContain("expected_route_not_confirmed");
    expect(issues.map((item) => item.code)).toContain("route_scope_not_grounded_in_quote");
  });

  test("accepts human route labels that normalize to deterministic route ids", () => {
    const candidate = buildTier2ProofCandidates({ assertions: [anchorAssertion()] })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        routeScope: {
          kind: "direct_route",
          routeIds: ["Q52", "Q53"],
          routeText: "Q52/Q53 SBS",
        },
      }),
      contextText: fixtureContext,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).not.toContain("expected_route_not_confirmed");
  });

  test("rejects lowercase able as camera-enforcement support", () => {
    const cameraCandidate = buildTier2ProofCandidates({
      assertions: [
        anchorAssertion({
          interventionFamily: "camera_enforcement",
          treatmentText: "Automated bus lane enforcement",
        }),
      ],
    })[0];
    if (cameraCandidate === undefined) throw new Error("fixture candidate missing");
    const nonCameraQuote =
      "The Q52/Q53 project was able to improve bus lane operations and launched in November 2017 along Woodhaven Boulevard.";

    const issues = validateTier2ProofResult({
      candidate: cameraCandidate,
      result: provenResult({
        claimType: "camera_ticketing_start",
        treatmentText: "able",
        evidenceSpans: [
          {
            spanId: "span-able-substring",
            pageNumber: 37,
            quote: nonCameraQuote,
            supports: ["date", "operational_status", "route_scope", "treatment_type"],
          },
        ],
      }),
      contextText: nonCameraQuote,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).toContain("treatment_family_not_supported");
  });

  test("rejects ACE or ABLE candidates that are mislabeled as generic SBS", () => {
    const candidate = buildTier2ProofCandidates({
      assertions: [
        anchorAssertion({
          displayLabel: "ABLE implementation on Bx12-SBS",
          interventionFamily: "select_bus_service",
          treatmentText: "ABLE cameras installed on Bx12-SBS buses",
          operationalDate: "November 18, 2022",
          implementationMonth: "2022-11",
          routeIds: ["BX12+"],
        }),
      ],
    })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");
    const quote = "ABLE implemented Bx12 SBS on November 18, 2022 with a 60-day warning period";

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        dateText: "November 18, 2022",
        treatmentText: "ABLE",
        routeScope: {
          kind: "direct_route",
          routeIds: ["Bx12 SBS"],
          routeText: "Bx12 SBS",
        },
        evidenceSpans: [
          {
            spanId: "span-able",
            pageNumber: 4,
            quote,
            supports: ["date", "operational_status", "route_scope", "treatment_type"],
          },
        ],
      }),
      contextText: quote,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).toContain(
      "candidate_camera_enforcement_family_mismatch",
    );
  });

  test("rejects signal-timing candidates that are mislabeled as generic SBS", () => {
    const candidate = buildTier2ProofCandidates({
      assertions: [
        anchorAssertion({
          displayLabel: "Signal timing improvements activated",
          interventionFamily: "select_bus_service",
          operationalDate: "May 2017",
          implementationMonth: "2017-05",
          routeIds: ["M79+"],
        }),
      ],
    })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");
    const quote = "Signal timing improvements activated for M79 SBS in May 2017";

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        dateText: "May 2017",
        treatmentText: "Signal timing improvements",
        routeScope: {
          kind: "direct_route",
          routeIds: ["M79"],
          routeText: "M79 SBS",
        },
        evidenceSpans: [
          {
            spanId: "span-signal",
            pageNumber: 4,
            quote,
            supports: ["date", "operational_status", "route_scope", "treatment_type"],
          },
        ],
      }),
      contextText: quote,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).toContain("candidate_signal_priority_family_mismatch");
  });

  test("rejects treatment-family substring and generic-bus traps beyond ACE/ABLE", () => {
    const cases: Array<{ family: string; quote: string }> = [
      {
        family: "transit_signal_priority",
        quote: "The Q52/Q53 bus stops launched in November 2017 along Woodhaven Boulevard.",
      },
      {
        family: "stop_consolidation",
        quote: "The Q52/Q53 bus stops launched in November 2017 along Woodhaven Boulevard.",
      },
      {
        family: "bus_lane",
        quote: "The Q52/Q53 bus fare policy launched in November 2017 along Woodhaven Boulevard.",
      },
      {
        family: "other_bus_priority",
        quote: "The Q52/Q53 project launched in November 2017 along Woodhaven Boulevard.",
      },
    ];

    for (const testCase of cases) {
      const candidate = buildTier2ProofCandidates({
        assertions: [anchorAssertion({ interventionFamily: testCase.family })],
      })[0];
      if (candidate === undefined) throw new Error("fixture candidate missing");

      const issues = validateTier2ProofResult({
        candidate,
        result: provenResult({
          evidenceSpans: [
            {
              spanId: `span-${testCase.family}`,
              pageNumber: 37,
              quote: testCase.quote,
              supports: ["date", "operational_status", "route_scope", "treatment_type"],
            },
          ],
        }),
        contextText: testCase.quote,
        contextStatus: "provided_context",
      });

      expect(issues.map((item) => item.code)).toContain("treatment_family_not_supported");
    }
  });

  test("accepts realized installation text that also mentions future evaluation", () => {
    const candidate = buildTier2ProofCandidates({
      assertions: [
        anchorAssertion({
          interventionFamily: "queue_jump",
          routeIds: ["M79+"],
          operationalDate: "11/05/2018",
          implementationMonth: "2018-11",
        }),
      ],
    })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");
    const quote =
      "For M79 SBS, 11/05/2018: NYCDOT installed an updated Bus Only Signal at 79th St and 5th Ave westbound and will be evaluating its performance";

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        dateText: "11/05/2018",
        treatmentText: "Bus Only Signal",
        routeScope: {
          kind: "source_single_route_context",
          routeIds: ["M79"],
          routeText: "M79 SBS",
        },
        evidenceSpans: [
          {
            spanId: "span-installed-eval",
            pageNumber: 11,
            quote,
            supports: ["date", "operational_status", "route_scope", "treatment_type"],
          },
        ],
      }),
      contextText: `${quote}\nM79 SBS`,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).not.toContain(
      "planned_or_future_language_in_status_quote",
    );
  });

  test("does not treat bus station-spacing language as rail-only proof", () => {
    const candidate = buildTier2ProofCandidates({
      assertions: [anchorAssertion({ interventionFamily: "bus_lane", routeIds: ["M15+"] })],
    })[0];
    if (candidate === undefined) throw new Error("fixture candidate missing");
    const quote =
      "M15 Select Bus Service launched October 10, 2010 with over 10 miles of dedicated bus lanes and revised station spacing.";

    const issues = validateTier2ProofResult({
      candidate,
      result: provenResult({
        dateText: "October 10, 2010",
        treatmentText: "dedicated bus lanes",
        routeScope: {
          kind: "direct_route",
          routeIds: ["M15"],
          routeText: "M15 Select Bus Service",
        },
        evidenceSpans: [
          {
            spanId: "span-bus-station-spacing",
            pageNumber: 3,
            quote,
            supports: ["date", "operational_status", "route_scope", "treatment_type"],
          },
        ],
      }),
      contextText: quote,
      contextStatus: "provided_context",
    });

    expect(issues.map((item) => item.code)).not.toContain("rail_or_subway_only_proof");
  });

  test("writes dry-run proof requests and validates supplied proof results", async () => {
    const assertionsPath = join(workingRoot, "operational-date-assertions.json");
    const contextPath = join(workingRoot, "source.md");
    const proofResultsPath = join(workingRoot, "proof-results.json");
    const outputPath = join(workingRoot, "proof-harness.json");
    await Bun.write(
      assertionsPath,
      JSON.stringify(
        {
          rows: [
            anchorAssertion(),
            anchorAssertion({
              surfaceId: "non_causal",
              causalAnchorEligible: false,
              routeIds: [],
            }),
          ],
        },
        null,
        2,
      ),
    );
    await Bun.write(contextPath, fixtureContext);
    await Bun.write(proofResultsPath, JSON.stringify({ results: [provenResult()] }, null, 2));

    const artifact = await runTier2ProofHarness({
      operationalDateAssertionsPath: assertionsPath,
      documentContextPath: contextPath,
      proofResultsPath,
      outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(artifact.summary.candidateCount).toBe(1);
    expect(artifact.summary.contextAvailableCount).toBe(1);
    expect(artifact.summary.validatedResultCount).toBe(1);
    expect(artifact.summary.validProvenCount).toBe(1);
    expect(await Bun.file(artifact.requests[0]?.requestArtifactKey ?? "").exists()).toBe(true);
    expect(await Bun.file(outputPath).exists()).toBe(true);
  });

  test("reuses cached tool-call artifacts during execute runs", async () => {
    const assertionsPath = join(workingRoot, "operational-date-assertions.json");
    const contextPath = join(workingRoot, "source.md");
    const requestRootPath = join(workingRoot, "proof-requests");
    const outputPath = join(workingRoot, "proof-harness-cached-execute.json");
    const m15Quote =
      "M15 Select Bus Service launched October 10, 2010 with over 10 miles of dedicated bus lanes and revised station spacing.";
    await Bun.write(
      assertionsPath,
      JSON.stringify(
        {
          rows: [
            anchorAssertion(),
            anchorAssertion({
              surfaceId: "docsurf_m15",
              routeIds: ["M15+"],
              interventionId: "intv_m15",
              operationalDate: "October 10, 2010",
              implementationMonth: "2010-10",
              displayLabel: "M15 SBS launch",
            }),
          ],
        },
        null,
        2,
      ),
    );
    await Bun.write(contextPath, `${fixtureContext}\n${m15Quote}`);
    await mkdir(join(requestRootPath, "docsurf_q52q53"), { recursive: true });
    await mkdir(join(requestRootPath, "docsurf_m15"), { recursive: true });
    await Bun.write(
      join(requestRootPath, "docsurf_q52q53", "tool-call.json"),
      JSON.stringify(provenResult(), null, 2),
    );
    await Bun.write(
      join(requestRootPath, "docsurf_m15", "tool-call.json"),
      JSON.stringify(
        provenResult({
          candidateId: "docsurf_m15",
          dateText: "October 10, 2010",
          routeScope: {
            kind: "direct_route",
            routeIds: ["M15"],
            routeText: "M15 Select Bus Service",
          },
          evidenceSpans: [
            {
              spanId: "span-m15",
              pageNumber: 3,
              quote: m15Quote,
              supports: ["date", "operational_status", "route_scope", "treatment_type"],
            },
          ],
          reasoning: "The source directly states that M15 SBS launched on October 10, 2010.",
        }),
        null,
        2,
      ),
    );

    const artifact = await runTier2ProofHarness({
      operationalDateAssertionsPath: assertionsPath,
      documentContextPath: contextPath,
      requestRootPath,
      outputPath,
      execute: true,
      executeConcurrency: 2,
      reuseExistingResponses: true,
      pioneerApiKey: "fixture-key",
      fetcher: async () => {
        throw new Error("fetcher should not be called for cached tool-call artifacts");
      },
    });

    expect(artifact.summary.validatedResultCount).toBe(2);
    expect(artifact.summary.validProvenCount).toBe(2);
    expect(artifact.requests.every((request) => request.toolCallArtifactKey !== null)).toBe(true);
  });

  test("uses source page markdown from a root even without a manifest", async () => {
    const assertionsPath = join(workingRoot, "operational-date-assertions.json");
    const pageMarkdownRoot = join(workingRoot, "page-markdown-root");
    const sourcePagePath = join(
      pageMarkdownRoot,
      "sources",
      "0001_nyc_dot_better_buses_action_plan_2019_pdf",
      "pages",
      "0001",
      "page.md",
    );
    const outputPath = join(workingRoot, "proof-harness-root-scan.json");
    await mkdir(dirname(sourcePagePath), { recursive: true });
    await Bun.write(assertionsPath, JSON.stringify({ rows: [anchorAssertion()] }, null, 2));
    await Bun.write(sourcePagePath, fixtureContext);

    const artifact = await runTier2ProofHarness({
      operationalDateAssertionsPath: assertionsPath,
      pageMarkdownRoot,
      outputPath,
      generatedAt: "2026-06-04T00:00:00.000Z",
    });

    expect(artifact.summary.candidateCount).toBe(1);
    expect(artifact.summary.contextAvailableCount).toBe(1);
    expect(artifact.requests[0]?.contextPageNumbers).toEqual([1]);
  });
});
