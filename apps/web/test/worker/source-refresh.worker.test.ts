import { describe, expect, it } from "vitest";
import { runScheduledSourceRefresh } from "../../src/worker/source-refresh.js";

class FakeR2Bucket {
  readonly writes = new Map<string, ArrayBuffer | string>();

  async put(key: string, value: ArrayBuffer | string): Promise<void> {
    this.writes.set(key, value);
  }
}

describe("scheduled source refresh", () => {
  it("skips GTFS-RT capture when the raw bucket is not configured", async () => {
    const result = await runScheduledSourceRefresh(
      { MTA_BUS_TIME_API_KEY: "test-key" },
      { now: new Date("2026-05-17T12:00:00.000Z") },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "GTFS_RT_RAW R2 binding is not configured.",
        objectKey: null,
      }),
    );
  });

  it("skips GTFS-RT capture when the API key is not configured", async () => {
    const result = await runScheduledSourceRefresh(
      { GTFS_RT_RAW: new FakeR2Bucket() as unknown as R2Bucket },
      { now: new Date("2026-05-17T12:00:00.000Z") },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "MTA_BUS_TIME_API_KEY secret is not configured.",
        objectKey: null,
      }),
    );
  });

  it("captures a vehicle-position protobuf and redacted manifest", async () => {
    const bucket = new FakeR2Bucket();
    const result = await runScheduledSourceRefresh(
      {
        GTFS_RT_RAW: bucket as unknown as R2Bucket,
        MTA_BUS_TIME_API_KEY: "secret-key",
      },
      {
        now: new Date("2026-05-17T12:00:00.000Z"),
        fetcher: async (input) => {
          expect(String(input)).toBe(
            "https://gtfsrt.prod.obanyc.com/vehiclePositions?key=secret-key",
          );

          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "captured",
        objectKey: "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120000000Z.pb",
        manifestKey: "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120000000Z.json",
        byteLength: 3,
      }),
    );
    expect(bucket.writes.has(result.objectKey ?? "")).toBe(true);
    const manifest = JSON.parse(String(bucket.writes.get(result.manifestKey ?? "")));
    expect(manifest.sourceUrl).toContain("key=REDACTED");
    expect(JSON.stringify(manifest)).not.toContain("secret-key");
  });
});
