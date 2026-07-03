import { join } from "node:path";
import {
  type OperationalDateAssertion,
  OperationalDateAssertionSchema,
} from "@bp/domain/documents/operational-date";
import {
  type RouteEquityContextResult,
  type RouteInterventionEvaluationResult,
  type RouteObservedReliabilityResult,
  type RouteReadinessResult,
  type RouteReliabilityBaselineResult,
  runRouteEquityContext,
  runRouteInterventionEvaluation as runRouteInterventionEvaluationFromAppliedResearch,
  runRouteObservedReliability,
  runRouteReadiness,
  runRouteReliabilityBaseline,
} from "@bp/pipeline-v2/local-db-aggregates";
import { Context, Effect, Layer } from "effect";
import { readJsonIfExists } from "../lib/json.ts";
import { fromRepoRoot } from "../lib/paths.ts";
import { type LocalDbOpenError, RouteLocalDbCommandError } from "./errors.ts";
import { LocalDbConnection, makeLocalDbLayer } from "./local-db.ts";

export const defaultDocumentOperationalDateAssertionsPath = fromRepoRoot(
  join("data/artifacts/studio/v2/wiki", "document-operational-date-assertions-v1.json"),
);

function isCausalAnchorEligibleRow(row: unknown): row is { causalAnchorEligible?: unknown } {
  return typeof row === "object" && row !== null && "causalAnchorEligible" in row;
}

function documentOperationalDateRows(raw: unknown): unknown[] {
  if (typeof raw !== "object" || raw === null || !("rows" in raw)) {
    return [];
  }
  const rows = raw.rows;
  return Array.isArray(rows) ? rows : [];
}

export type RouteReliabilityBaselineCommandInput = {
  readonly year: number;
  readonly month: number;
};

export type RouteObservedReliabilityCommandInput = {
  readonly year: number;
  readonly month: number;
  readonly runId: string;
  readonly minSamples: number;
};

export type RouteReadinessCommandInput = {
  readonly year: number;
  readonly month: number;
};

export type RouteEquityContextCommandInput = {
  readonly year: number;
  readonly month: number;
  readonly acsYear: number;
};

export type RouteInterventionEvaluationCommandInput = {
  readonly year: number;
  readonly month: number;
  readonly routeUniverseYear?: number | undefined;
  readonly routeUniverseMonth?: number | undefined;
  readonly windowMonths: number;
  readonly minSampleMonths: number;
  readonly comparisonRouteCount: number;
  readonly documentOperationalDateAssertionsPath?: string | undefined;
};

export async function loadDocumentOperationalDateAssertions(
  path: string,
): Promise<OperationalDateAssertion[]> {
  const artifact = await readJsonIfExists(path);
  if (artifact === null) return [];
  const rows = documentOperationalDateRows(artifact);
  const assertions: OperationalDateAssertion[] = [];
  for (const row of rows) {
    if (!isCausalAnchorEligibleRow(row) || row.causalAnchorEligible !== true) {
      continue;
    }
    const parsed = OperationalDateAssertionSchema.safeParse(row);
    if (parsed.success) assertions.push(parsed.data);
  }
  return assertions;
}

export async function runRouteInterventionEvaluation(
  inputs: Parameters<typeof runRouteInterventionEvaluationFromAppliedResearch>[0] & {
    documentOperationalDateAssertionsPath?: string | undefined;
  },
): ReturnType<typeof runRouteInterventionEvaluationFromAppliedResearch> {
  const documentOperationalDateAssertions = await loadDocumentOperationalDateAssertions(
    inputs.documentOperationalDateAssertionsPath ?? defaultDocumentOperationalDateAssertionsPath,
  );
  return runRouteInterventionEvaluationFromAppliedResearch({
    ...inputs,
    documentOperationalDateAssertions,
  });
}

export class RouteLocalDbService extends Context.Service<
  RouteLocalDbService,
  {
    readonly buildReliabilityBaseline: (
      input: RouteReliabilityBaselineCommandInput,
    ) => Effect.Effect<RouteReliabilityBaselineResult, RouteLocalDbCommandError>;
    readonly buildObservedReliability: (
      input: RouteObservedReliabilityCommandInput,
    ) => Effect.Effect<RouteObservedReliabilityResult, RouteLocalDbCommandError>;
    readonly buildReadiness: (
      input: RouteReadinessCommandInput,
    ) => Effect.Effect<RouteReadinessResult, RouteLocalDbCommandError>;
    readonly buildEquityContext: (
      input: RouteEquityContextCommandInput,
    ) => Effect.Effect<RouteEquityContextResult, RouteLocalDbCommandError>;
    readonly evaluateInterventions: (
      input: RouteInterventionEvaluationCommandInput,
    ) => Effect.Effect<RouteInterventionEvaluationResult, RouteLocalDbCommandError>;
  }
>()("@bp/pipeline-v2/RouteLocalDbService") {}

export const RouteLocalDbServiceLayer: Layer.Layer<RouteLocalDbService, never, LocalDbConnection> =
  Layer.effect(
    RouteLocalDbService,
    Effect.gen(function* () {
      const local = yield* LocalDbConnection;

      return {
        buildReliabilityBaseline: Effect.fn("RouteLocalDbService.buildReliabilityBaseline")(
          function* (input: RouteReliabilityBaselineCommandInput) {
            yield* Effect.annotateCurrentSpan({
              command: "route.reliability-baseline",
              year: input.year,
              month: input.month,
              dbPath: local.path,
            });

            return yield* Effect.tryPromise({
              try: () =>
                runRouteReliabilityBaseline({
                  local,
                  year: input.year,
                  month: input.month,
                }),
              catch: (cause) =>
                RouteLocalDbCommandError.make({
                  command: "route.reliability-baseline",
                  year: input.year,
                  month: input.month,
                  operation: "runRouteReliabilityBaseline",
                  cause,
                }),
            });
          },
        ),
        buildObservedReliability: Effect.fn("RouteLocalDbService.buildObservedReliability")(
          function* (input: RouteObservedReliabilityCommandInput) {
            yield* Effect.annotateCurrentSpan({
              command: "route.observed-reliability",
              year: input.year,
              month: input.month,
              runId: input.runId,
              minSamples: input.minSamples,
              dbPath: local.path,
            });

            return yield* Effect.tryPromise({
              try: () =>
                runRouteObservedReliability({
                  local,
                  year: input.year,
                  month: input.month,
                  runId: input.runId,
                  minSamples: input.minSamples,
                }),
              catch: (cause) =>
                RouteLocalDbCommandError.make({
                  command: "route.observed-reliability",
                  year: input.year,
                  month: input.month,
                  operation: "runRouteObservedReliability",
                  cause,
                }),
            });
          },
        ),
        buildReadiness: Effect.fn("RouteLocalDbService.buildReadiness")(function* (
          input: RouteReadinessCommandInput,
        ) {
          yield* Effect.annotateCurrentSpan({
            command: "route.readiness",
            year: input.year,
            month: input.month,
            dbPath: local.path,
          });

          return yield* Effect.tryPromise({
            try: () =>
              runRouteReadiness({
                local,
                year: input.year,
                month: input.month,
              }),
            catch: (cause) =>
              RouteLocalDbCommandError.make({
                command: "route.readiness",
                year: input.year,
                month: input.month,
                operation: "runRouteReadiness",
                cause,
              }),
          });
        }),
        buildEquityContext: Effect.fn("RouteLocalDbService.buildEquityContext")(function* (
          input: RouteEquityContextCommandInput,
        ) {
          yield* Effect.annotateCurrentSpan({
            command: "route.equity-context",
            year: input.year,
            month: input.month,
            acsYear: input.acsYear,
            dbPath: local.path,
          });

          return yield* Effect.tryPromise({
            try: () =>
              runRouteEquityContext({
                local,
                year: input.year,
                month: input.month,
                acsYear: input.acsYear,
              }),
            catch: (cause) =>
              RouteLocalDbCommandError.make({
                command: "route.equity-context",
                year: input.year,
                month: input.month,
                operation: "runRouteEquityContext",
                cause,
              }),
          });
        }),
        evaluateInterventions: Effect.fn("RouteLocalDbService.evaluateInterventions")(function* (
          input: RouteInterventionEvaluationCommandInput,
        ) {
          yield* Effect.annotateCurrentSpan({
            command: "route.intervention-evaluation",
            year: input.year,
            month: input.month,
            windowMonths: input.windowMonths,
            minSampleMonths: input.minSampleMonths,
            comparisonRouteCount: input.comparisonRouteCount,
            dbPath: local.path,
          });

          return yield* Effect.tryPromise({
            try: () =>
              runRouteInterventionEvaluation({
                local,
                year: input.year,
                month: input.month,
                routeUniverseYear: input.routeUniverseYear,
                routeUniverseMonth: input.routeUniverseMonth,
                windowMonths: input.windowMonths,
                minSampleMonths: input.minSampleMonths,
                comparisonRouteCount: input.comparisonRouteCount,
                documentOperationalDateAssertionsPath: input.documentOperationalDateAssertionsPath,
              }),
            catch: (cause) =>
              RouteLocalDbCommandError.make({
                command: "route.intervention-evaluation",
                year: input.year,
                month: input.month,
                operation: "runRouteInterventionEvaluation",
                cause,
              }),
          });
        }),
      };
    }),
  );

export const runRouteReliabilityBaselineCommand = Effect.fn("runRouteReliabilityBaselineCommand")(
  function* (input: RouteReliabilityBaselineCommandInput) {
    const service = yield* RouteLocalDbService;
    const result = yield* service.buildReliabilityBaseline(input);

    yield* Effect.logInfo(
      `route reliability baseline complete: ${result.routeCount} routes, ${result.headwaySampleCount} headway samples`,
    );

    return result;
  },
);

export const runRouteObservedReliabilityCommand = Effect.fn("runRouteObservedReliabilityCommand")(
  function* (input: RouteObservedReliabilityCommandInput) {
    const service = yield* RouteLocalDbService;
    const result = yield* service.buildObservedReliability(input);

    yield* Effect.logInfo(
      `route observed reliability complete: ${result.observedRouteCount}/${result.routeCount} routes observed`,
    );

    return result;
  },
);

export const runRouteReadinessCommand = Effect.fn("runRouteReadinessCommand")(function* (
  input: RouteReadinessCommandInput,
) {
  const service = yield* RouteLocalDbService;
  const result = yield* service.buildReadiness(input);

  yield* Effect.logInfo(
    `route readiness complete: ${result.buildEligibleRouteCount}/${result.routeCount} routes eligible`,
  );

  return result;
});

export const runRouteEquityContextCommand = Effect.fn("runRouteEquityContextCommand")(function* (
  input: RouteEquityContextCommandInput,
) {
  const service = yield* RouteLocalDbService;
  const result = yield* service.buildEquityContext(input);

  yield* Effect.logInfo(
    `route equity context complete: ${result.assignedRouteCount}/${result.routeCount} routes assigned`,
  );

  return result;
});

export const runRouteInterventionEvaluationCommand = Effect.fn(
  "runRouteInterventionEvaluationCommand",
)(function* (input: RouteInterventionEvaluationCommandInput) {
  const service = yield* RouteLocalDbService;
  const result = yield* service.evaluateInterventions(input);

  yield* Effect.logInfo(
    `route intervention evaluation complete: ${result.comparisonCount} comparisons across ${result.eventCount} events`,
  );

  return result;
});

export function makeRouteLocalDbCommandLayer(input: {
  readonly dbPath?: string | undefined;
}): Layer.Layer<RouteLocalDbService, LocalDbOpenError> {
  return RouteLocalDbServiceLayer.pipe(
    Layer.provide(
      makeLocalDbLayer({
        path: input.dbPath,
      }),
    ),
  );
}
