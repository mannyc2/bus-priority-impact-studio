import { decodeDefaultGtfsRealtimeFeedMessage } from "./vendor/gtfs-realtime-bindings.js";

export type GtfsRealtimeDecoder = {
  decodeFeedMessage(bytes: Uint8Array): unknown;
};

export function createDefaultGtfsRealtimeDecoder(): GtfsRealtimeDecoder {
  return {
    decodeFeedMessage: decodeDefaultGtfsRealtimeFeedMessage,
  };
}

export function decodeGtfsRealtimeFeedMessage(
  bytes: Uint8Array,
  decoder: GtfsRealtimeDecoder = createDefaultGtfsRealtimeDecoder(),
): unknown {
  return decoder.decodeFeedMessage(bytes);
}
