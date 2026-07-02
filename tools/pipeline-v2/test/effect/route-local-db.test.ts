import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  RouteEquityContextResult,
  RouteInterventionEvaluationResult,
  RouteObservedReliabilityResult,
  RouteReadinessResult,
  RouteReliabilityBaselineResult,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Effect, Layer } from "effect";
import { RouteLocalDbCommandError } from "../../src/effect/errors.ts";
import {
  loadDocumentOperationalDateAssertions,
  RouteLocalDbService,
  runRouteEquityContextCommand,
  runRouteInterventionEvaluationCommand,
  runRouteObservedReliabilityCommand,
  runRouteReadinessCommand,
  runRouteReliabilityBaselineCommand,
} from "../../src/effect/route-local-db.ts";
import { runPipelineEffect } from "../../src/effect/runtime.ts";

const reliabilityBaselineResult: RouteReliabilityBaselineResult = {
  isoMonth: "2026-03",
  routeCount: 4,
  headwaySampleCount: 40,
};

const observedReliabilityResult: RouteObservedReliabilityResult = {
  isoMonth: "2026-03",
  runId: "fixture-run",
  routeCount: 4,
  observedRouteCount: 2,
  insufficientRouteCount: 2,
  headwaySampleCount: 20,
};

const readinessResult: RouteReadinessResult = {
  isoMonth: "2026-03",
  routeCount: 4,
  buildEligibleRouteCount: 3,
  dbPath: "fixture.sqlite",
};

const equityContextResult: RouteEquityContextResult = {
  analysisPeriod: "2026-03",
  acsYear: 2024,
  routeCount: 4,
  assignedRouteCount: 3,
};

const interventionEvaluationResult: RouteInterventionEvaluationResult = {
  isoMonth: "2026-03",
  routeUniverseMonth: "2026-03",
  routeCount: 4,
  eventCount: 2,
  comparisonCount: 3,
  documentAnchorEventCount: 1,
  documentAnchorComparisonCount: 1,
  evaluatedComparisonCount: 1,
  futureComparisonCount: 1,
  insufficientComparisonCount: 1,
  sourceGapComparisonCount: 0,
};

function eligibleOperationalDateAssertion() {
  return {
    surfaceId: "evt-1",
    sourceId: "src-1",
    sourceTitle: "NYC DOT Route Improvement",
    sourceGroup: "nyc_dot",
    displayLabel: "Route Improvement",
    eventName: "Route Improvement launch",
    treatmentText: "bus_lane",
    locationText: "Main Street",
    operationalDate: "October 3, 2019",
    datePrecision: "day",
    statusRaw: "complete",
    familyRaw: "bus_lane",
    subtypeRaw: "implementation",
    eventKind: "physical_bus_priority_change",
    interventionFamily: "bus_lane",
    sourceStatedStatus: "done",
    dateBasis: "source_stated_complete",
    validationState: "source_stated_operational_date",
    trustedOperationalDate: true,
    classificationReasons: ["source states the intervention is complete"],
    evidenceRefs: [{ blockId: "B0001", pageNumber: 1, roleRaw: "start_date" }],
    effectiveDateStart: "2019-10-03",
    effectiveDateEnd: "2019-10-03",
    implementationMonth: "2019-10",
    normalizedPrecision: "day",
    isRealizedOnset: true,
    routeIds: ["M14A+"],
    routeIdentityValidationState: "confirmed_in_current_gtfs",
    routeResolutionTier: "direct_event_text",
    interventionId: "intv_fixture",
    evidenceSourceIds: ["src-1"],
    sourceCount: 1,
    confidence: 0.9,
    causalAnchorEligible: true,
  };
}

const successLayer = Layer.succeed(RouteLocalDbService, {
  buildReliabilityBaseline: () => Effect.succeed(reliabilityBaselineResult),
  buildObservedReliability: () => Effect.succeed(observedReliabilityResult),
  buildReadiness: () => Effect.succeed(readinessResult),
  buildEquityContext: () => Effect.succeed(equityContextResult),
  evaluateInterventions: () => Effect.succeed(interventionEvaluationResult),
});

describe("route local DB Effect workflows", () => {
  test("loads document operational-date assertions through the filesystem boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "bp-route-local-db-"));
    try {
      const artifactPath = join(root, "assertions.json");
      const eligible = eligibleOperationalDateAssertion();
      await writeFile(
        artifactPath,
        `${JSON.stringify(
          {
            rows: [
              eligible,
              { ...eligible, surfaceId: "evt-2", causalAnchorEligible: false },
              { causalAnchorEligible: true },
            ],
          },
          null,
          2,
        )}\n`,
      );

      const assertions = await loadDocumentOperationalDateAssertions(artifactPath);

      expect(assertions).toHaveLength(1);
      expect(assertions[0]?.surfaceId).toBe("evt-1");
      await expect(
        loadDocumentOperationalDateAssertions(join(root, "missing.json")),
      ).resolves.toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("run related route workflows through one injectable service layer", async () => {
    await expect(
      runPipelineEffect(
        runRouteReliabilityBaselineCommand({
          year: 2026,
          month: 3,
        }),
        successLayer,
      ),
    ).resolves.toEqual(reliabilityBaselineResult);

    await expect(
      runPipelineEffect(
        runRouteObservedReliabilityCommand({
          year: 2026,
          month: 3,
          runId: "fixture-run",
          minSamples: 10,
        }),
        successLayer,
      ),
    ).resolves.toEqual(observedReliabilityResult);

    await expect(
      runPipelineEffect(
        runRouteReadinessCommand({
          year: 2026,
          month: 3,
        }),
        successLayer,
      ),
    ).resolves.toEqual(readinessResult);

    await expect(
      runPipelineEffect(
        runRouteEquityContextCommand({
          year: 2026,
          month: 3,
          acsYear: 2024,
        }),
        successLayer,
      ),
    ).resolves.toEqual(equityContextResult);

    await expect(
      runPipelineEffect(
        runRouteInterventionEvaluationCommand({
          year: 2026,
          month: 3,
          windowMonths: 3,
          minSampleMonths: 1,
          comparisonRouteCount: 10,
        }),
        successLayer,
      ),
    ).resolves.toEqual(interventionEvaluationResult);
  });

  test("preserves typed route local DB command errors at the runtime boundary", async () => {
    const errorLayer = Layer.succeed(RouteLocalDbService, {
      buildReliabilityBaseline: () => Effect.succeed(reliabilityBaselineResult),
      buildObservedReliability: () => Effect.succeed(observedReliabilityResult),
      buildReadiness: (input) =>
        Effect.fail(
          RouteLocalDbCommandError.make({
            command: "route.readiness",
            year: input.year,
            month: input.month,
            operation: "fixture",
            cause: new Error("boom"),
          }),
        ),
      buildEquityContext: () => Effect.succeed(equityContextResult),
      evaluateInterventions: () => Effect.succeed(interventionEvaluationResult),
    });

    await expect(
      runPipelineEffect(
        runRouteReadinessCommand({
          year: 2026,
          month: 3,
        }),
        errorLayer,
      ),
    ).rejects.toMatchObject({
      _tag: "RouteLocalDbCommandError",
      command: "route.readiness",
      operation: "fixture",
    });
  });
});
