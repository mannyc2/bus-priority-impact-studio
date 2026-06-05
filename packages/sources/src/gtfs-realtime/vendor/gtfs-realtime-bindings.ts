import GtfsRealtimeBindings from "gtfs-realtime-bindings";

export function decodeDefaultGtfsRealtimeFeedMessage(bytes: Uint8Array): unknown {
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  return GtfsRealtimeBindings.transit_realtime.FeedMessage.toObject(feed, {
    defaults: false,
    enums: String,
    longs: Number,
  });
}
