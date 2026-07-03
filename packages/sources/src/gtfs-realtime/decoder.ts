import { decodeGtfsRealtimeBytes } from "@nyc-transit-kit/mta/gtfs-realtime";
import { Effect } from "effect";
import type { GtfsRtFeedType } from "./index.js";

export type GtfsRealtimeDecoder = {
  decodeFeedMessage(bytes: Uint8Array, feedType?: GtfsRtFeedType | "mixed"): unknown;
};

export function createDefaultGtfsRealtimeDecoder(): GtfsRealtimeDecoder {
  return {
    decodeFeedMessage(bytes, feedType = "vehicle_positions") {
      const feed =
        feedType === "trip_updates"
          ? "trip-updates"
          : feedType === "alerts"
            ? "alerts"
            : "vehicle-positions";
      return Effect.runSync(decodeGtfsRealtimeBytes(bytes, feed)).raw;
    },
  };
}

export function decodeGtfsRealtimeFeedMessage(
  bytes: Uint8Array,
  decoder: GtfsRealtimeDecoder = createDefaultGtfsRealtimeDecoder(),
  feedType?: GtfsRtFeedType | "mixed",
): unknown {
  return decoder.decodeFeedMessage(bytes, feedType);
}
