import {
  type LocalGtfsRtVehiclePosition,
  listGtfsRtVehiclePositions,
  replaceObservedHeadwayRows,
} from "@bp/db/local";
import { parseCliOptions } from "../../lib/cli-args.js";
import { withLocalPipelineDb } from "../../lib/local-db.js";
import { fromCliPath } from "../../lib/paths.js";
import { createDbContext, type DbArgs } from "../../lib/route-job.js";

const maxHeadwaySeconds = 6 * 60 * 60;

type BuildObservedHeadwaysArgs = DbArgs & {
  runId?: string;
};

type ObservedStopEvent = {
  runId: string;
  eventRank: number;
  routeId: string;
  sourceRouteId: string | null;
  directionId: number | null;
  stopId: string;
  vehicleKey: string;
  vehicleId: string | null;
  vehicleLabel: string | null;
  tripId: string | null;
  observedTimestamp: number;
  sampleIndex: number;
  currentStatus: string | null;
  latitude: number | null;
  longitude: number | null;
};

type ObservedHeadwaySample = {
  runId: string;
  sampleRank: number;
  routeId: string;
  sourceRouteId: string | null;
  directionId: number | null;
  stopId: string;
  previousVehicleKey: string;
  vehicleKey: string;
  previousObservedTimestamp: number;
  observedTimestamp: number;
  headwaySeconds: number;
  headwayMinutes: number;
};

type BuildObservedHeadwaysResult = {
  runId: string;
  vehiclePositionCount: number;
  stopEventCount: number;
  headwaySampleCount: number;
};

function requireRunId(value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error("Missing required argument: --run-id");
  }

  return value;
}

function vehicleKey(row: LocalGtfsRtVehiclePosition): string {
  return row.vehicleId ?? row.tripId ?? row.entityId;
}

function eventGroupKey(row: LocalGtfsRtVehiclePosition): string {
  return [row.routeId, row.directionId ?? "", row.stopId, vehicleKey(row)].join("::");
}

function hasObservedStopSignal(row: LocalGtfsRtVehiclePosition): boolean {
  return row.routeId !== null && row.stopId !== null && row.timestamp !== null;
}

function compareEvents(left: ObservedStopEvent, right: ObservedStopEvent): number {
  return (
    left.routeId.localeCompare(right.routeId) ||
    (left.directionId ?? -1) - (right.directionId ?? -1) ||
    left.stopId.localeCompare(right.stopId) ||
    left.observedTimestamp - right.observedTimestamp ||
    left.vehicleKey.localeCompare(right.vehicleKey)
  );
}

function headwayGroupKey(event: ObservedStopEvent): string {
  return [event.routeId, event.directionId ?? "", event.stopId].join("::");
}

export function deriveObservedHeadwayRows(
  runId: string,
  vehiclePositions: readonly LocalGtfsRtVehiclePosition[],
): { stopEvents: ObservedStopEvent[]; headwaySamples: ObservedHeadwaySample[] } {
  const eventByGroup = new Map<string, ObservedStopEvent>();

  for (const row of vehiclePositions) {
    if (!hasObservedStopSignal(row)) {
      continue;
    }

    const key = eventGroupKey(row);
    const candidate: ObservedStopEvent = {
      runId,
      eventRank: 0,
      routeId: row.routeId ?? "",
      sourceRouteId: row.sourceRouteId,
      directionId: row.directionId,
      stopId: row.stopId ?? "",
      vehicleKey: vehicleKey(row),
      vehicleId: row.vehicleId,
      vehicleLabel: row.vehicleLabel,
      tripId: row.tripId,
      observedTimestamp: row.timestamp ?? 0,
      sampleIndex: row.sampleIndex,
      currentStatus: row.currentStatus,
      latitude: row.latitude,
      longitude: row.longitude,
    };
    const existing = eventByGroup.get(key);
    if (
      existing === undefined ||
      candidate.observedTimestamp < existing.observedTimestamp ||
      (candidate.observedTimestamp === existing.observedTimestamp &&
        candidate.sampleIndex < existing.sampleIndex)
    ) {
      eventByGroup.set(key, candidate);
    }
  }

  const stopEvents = [...eventByGroup.values()].sort(compareEvents).map((event, index) => ({
    ...event,
    eventRank: index + 1,
  }));
  const headwaySamples: ObservedHeadwaySample[] = [];
  const previousByGroup = new Map<string, ObservedStopEvent>();

  for (const event of stopEvents) {
    const groupKey = headwayGroupKey(event);
    const previous = previousByGroup.get(groupKey);
    previousByGroup.set(groupKey, event);

    if (previous === undefined || previous.vehicleKey === event.vehicleKey) {
      continue;
    }

    const headwaySeconds = event.observedTimestamp - previous.observedTimestamp;
    if (headwaySeconds <= 0 || headwaySeconds > maxHeadwaySeconds) {
      continue;
    }

    headwaySamples.push({
      runId,
      sampleRank: headwaySamples.length + 1,
      routeId: event.routeId,
      sourceRouteId: event.sourceRouteId,
      directionId: event.directionId,
      stopId: event.stopId,
      previousVehicleKey: previous.vehicleKey,
      vehicleKey: event.vehicleKey,
      previousObservedTimestamp: previous.observedTimestamp,
      observedTimestamp: event.observedTimestamp,
      headwaySeconds,
      headwayMinutes: Number((headwaySeconds / 60).toFixed(2)),
    });
  }

  return { stopEvents, headwaySamples };
}

export async function buildObservedHeadways(
  args: BuildObservedHeadwaysArgs,
): Promise<BuildObservedHeadwaysResult> {
  const options = createDbContext(args);
  const runId = requireRunId(args.runId);

  return withLocalPipelineDb(options.dbPath, async (local) => {
    const vehiclePositions = await listGtfsRtVehiclePositions(local.db, runId);
    const rows = deriveObservedHeadwayRows(runId, vehiclePositions);
    await replaceObservedHeadwayRows(local.db, runId, rows);

    return {
      runId,
      vehiclePositionCount: vehiclePositions.length,
      stopEventCount: rows.stopEvents.length,
      headwaySampleCount: rows.headwaySamples.length,
    };
  });
}

function parseCliArgs(args: string[]): BuildObservedHeadwaysArgs {
  return parseCliOptions(args, {} as BuildObservedHeadwaysArgs, [
    {
      flags: ["--run-id"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.runId = value;
        }
      },
    },
    {
      flags: ["--db"],
      apply: (target, value) => {
        if (value !== undefined) {
          target.dbPath = fromCliPath(value);
        }
      },
    },
  ]);
}

export async function buildObservedHeadwaysFromCli(
  args: string[],
): Promise<BuildObservedHeadwaysResult> {
  return buildObservedHeadways(parseCliArgs(args));
}
