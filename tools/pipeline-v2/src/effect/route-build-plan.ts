import { runRouteBuildPlan, type RouteBuildPlanResult } from "@bp/pipeline-v2/local-db-aggregates";
import { Context, Effect, Layer } from "effect";
import { LocalDbOpenError, RouteBuildPlanCommandError } from "./errors.ts";
import { LocalDbConnection, makeLocalDbLayer } from "./local-db.ts";

export type RouteBuildPlanCommandInput = {
  readonly year: number;
  readonly month: number;
  readonly limit: number;
};

export class RouteBuildPlanService extends Context.Service<
  RouteBuildPlanService,
  {
    readonly buildPlan: (
      input: RouteBuildPlanCommandInput,
    ) => Effect.Effect<RouteBuildPlanResult, RouteBuildPlanCommandError>;
  }
>()("@bp/pipeline-v2/RouteBuildPlanService") {}

export const RouteBuildPlanServiceLayer: Layer.Layer<
  RouteBuildPlanService,
  never,
  LocalDbConnection
> = Layer.effect(
  RouteBuildPlanService,
  Effect.gen(function* () {
    const local = yield* LocalDbConnection;

    return {
      buildPlan: Effect.fn("RouteBuildPlanService.buildPlan")(function* (
        input: RouteBuildPlanCommandInput,
      ) {
        yield* Effect.annotateCurrentSpan({
          year: input.year,
          month: input.month,
          limit: input.limit,
          dbPath: local.path,
        });

        return yield* Effect.tryPromise({
          try: () =>
            runRouteBuildPlan({
              local,
              year: input.year,
              month: input.month,
              limit: input.limit,
            }),
          catch: (cause) =>
            RouteBuildPlanCommandError.make({
              year: input.year,
              month: input.month,
              operation: "runRouteBuildPlan",
              cause,
            }),
        });
      }),
    };
  }),
);

export const runRouteBuildPlanCommand = Effect.fn("runRouteBuildPlanCommand")(function* (
  input: RouteBuildPlanCommandInput,
) {
  const service = yield* RouteBuildPlanService;
  const result = yield* service.buildPlan(input);

  yield* Effect.logInfo(
    `route build plan complete: ${result.selectedRouteCount}/${result.routeCount} selected`,
  );

  return result;
});

export function makeRouteBuildPlanCommandLayer(input: {
  readonly dbPath?: string | undefined;
}): Layer.Layer<RouteBuildPlanService, RouteBuildPlanCommandError | LocalDbOpenError> {
  return RouteBuildPlanServiceLayer.pipe(
    Layer.provide(
      makeLocalDbLayer({
        path: input.dbPath,
      }),
    ),
  );
}
