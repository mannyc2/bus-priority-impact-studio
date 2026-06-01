import type {
  ObservedHeadwayForStopDirectionHourEwt,
  ScheduleStopArrivalForStopDirectionHourEwt,
  StopDirectionHourEwtScheduleSelection,
} from "../feature-resolvers";
import type { EwtRouteMonthReliabilityRow } from "../score-vectors";

export const LOCAL_PIPELINE_SQLITE_CORPUS = "local-pipeline-sqlite";

export type LocalPipelineSqliteCorpus = typeof LOCAL_PIPELINE_SQLITE_CORPUS;

export type LocalResearchPort<TParams, TOutput> = {
  readonly id: string;
  readonly corpus: LocalPipelineSqliteCorpus;
  readonly load: (params: TParams) => TOutput;
};

export function createLocalResearchPort<TParams, TOutput>(input: {
  id: string;
  load: (params: TParams) => TOutput;
}): LocalResearchPort<TParams, TOutput> {
  return {
    id: input.id,
    corpus: LOCAL_PIPELINE_SQLITE_CORPUS,
    load: input.load,
  };
}

export type EwtRouteMonthRowsQuery = {
  readonly startMonth: string;
  readonly endMonth: string;
};

export type EwtRouteMonthRowsPort = LocalResearchPort<
  EwtRouteMonthRowsQuery,
  readonly EwtRouteMonthReliabilityRow[]
>;

export function createEwtRouteMonthRowsPort(
  load: (params: EwtRouteMonthRowsQuery) => readonly EwtRouteMonthReliabilityRow[],
): EwtRouteMonthRowsPort {
  return createLocalResearchPort({
    id: "ewt_route_month_rows",
    load,
  });
}

export type StopDirectionHourEwtFeatureInputQuery = {
  readonly month: string;
  readonly routeId: string;
  readonly runId: string;
  readonly scheduleSource: "auto" | StopDirectionHourEwtScheduleSelection["kind"];
  readonly gtfsRunId: string | null;
};

export type StopDirectionHourEwtFeatureInputRows = {
  readonly selection: StopDirectionHourEwtScheduleSelection;
  readonly scheduleArrivals: readonly ScheduleStopArrivalForStopDirectionHourEwt[];
  readonly observedHeadways: readonly ObservedHeadwayForStopDirectionHourEwt[];
};

export type StopDirectionHourEwtFeatureInputPort = LocalResearchPort<
  StopDirectionHourEwtFeatureInputQuery,
  StopDirectionHourEwtFeatureInputRows
>;

export function createStopDirectionHourEwtFeatureInputPort(
  load: (params: StopDirectionHourEwtFeatureInputQuery) => StopDirectionHourEwtFeatureInputRows,
): StopDirectionHourEwtFeatureInputPort {
  return createLocalResearchPort({
    id: "stop_direction_hour_ewt_feature_inputs",
    load,
  });
}
