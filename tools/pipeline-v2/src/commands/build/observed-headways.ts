import { defineCommand, z } from "@liche/core";
import {
  type LocalGtfsRtVehiclePosition,
  listGtfsRtVehiclePositions,
  replaceObservedHeadwayRows,
} from "@bp/db/local";
import {
  dbOptions,
  localDbFromCtx,
  type OpenLocalPipelineDb,
  withLocalDb,
} from "../../lib/local-db.ts";

const maxHeadwaySeconds = 6 * 60 * 60;

export type ObservedStopEvent = {
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

export type ObservedHeadwaySample = {
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

export type BuildObservedHeadwaysResult = {
  runId: string;
  vehiclePositionCount: number;
  stopEventCount: number;
  headwaySampleCount: number;
};

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

export async function runBuildObservedHeadways(inputs: {
  local: OpenLocalPipelineDb;
  runId: string;
}): Promise<BuildObservedHeadwaysResult> {
  const vehiclePositions = await listGtfsRtVehiclePositions(inputs.local.db, inputs.runId);
  const rows = deriveObservedHeadwayRows(inputs.runId, vehiclePositions);
  await replaceObservedHeadwayRows(inputs.local.db, inputs.runId, rows);

  return {
    runId: inputs.runId,
    vehiclePositionCount: vehiclePositions.length,
    stopEventCount: rows.stopEvents.length,
    headwaySampleCount: rows.headwaySamples.length,
  };
}

export default defineCommand({
  path: ["build", "observed-headways"],
  summary: "Derive per-stop observed headway samples from GTFS-RT vehicle positions.",
  input: {
    options: dbOptions.extend({
      runId: z.string().min(1).describe("GTFS-RT collection run id"),
    }),
  },
  middleware: [withLocalDb()],
  output: z.object({
    runId: z.string(),
    vehiclePositionCount: z.number(),
    stopEventCount: z.number(),
    headwaySampleCount: z.number(),
  }),
  async run({ ctx, input }) {
    return runBuildObservedHeadways({
      local: localDbFromCtx(ctx),
      runId: input.options.runId,
    });
  },
});
