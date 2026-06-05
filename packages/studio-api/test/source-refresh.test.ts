import { describe, expect, it } from "bun:test";
import { handleStudioScheduled } from "@bp/studio-api/server/scheduled";
import {
  ROUTE_SPEED_WATCHER_CRON,
  runRouteSpeedMonthlyWatcher,
  runScheduledGtfsRtCaptureBatch,
  runScheduledProductionRefresh,
  runScheduledSourceRefresh,
} from "../src/server/jobs/source-refresh.js";

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

  it("can take two spaced GTFS-RT snapshots during one cron invocation", async () => {
    const bucket = new FakeR2Bucket();
    const delays: number[] = [];
    const fetchedUrls: string[] = [];
    const results = await runScheduledGtfsRtCaptureBatch(
      {
        GTFS_RT_RAW: bucket as unknown as R2Bucket,
        MTA_BUS_TIME_API_KEY: "secret-key",
        GTFS_RT_SAMPLES_PER_CRON: "2",
        GTFS_RT_SAMPLE_SECONDS: "30",
      },
      {
        now: new Date("2026-05-17T12:00:00.000Z"),
        delay: async (milliseconds) => {
          delays.push(milliseconds);
        },
        fetcher: async (input) => {
          fetchedUrls.push(String(input));
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        },
      },
    );

    expect(delays).toEqual([30_000]);
    expect(fetchedUrls).toHaveLength(2);
    expect(results.map((result) => result.objectKey)).toEqual([
      "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120000000Z.pb",
      "gtfs-rt/vehicle_positions/2026-05-17/2026-05-17T120030000Z.pb",
    ]);
    expect(bucket.writes.has(results[0]?.objectKey ?? "")).toBe(true);
    expect(bucket.writes.has(results[1]?.objectKey ?? "")).toBe(true);
  });

  it("checks route-speed publication and writes a monthly watcher artifact", async () => {
    const bucket = new FakeR2Bucket();
    const result = await runRouteSpeedMonthlyWatcher(
      {
        ARTIFACTS: bucket as unknown as R2Bucket,
        LAST_BUILT_SPEED_MONTH: "2026-02",
        SOCRATA_APP_TOKEN: "app-token",
      },
      {
        now: new Date("2026-05-17T12:00:00.000Z"),
        minSpeedRoutes: 2,
        fetcher: async (input, init) => {
          const url = new URL(String(input));
          expect(url.hostname).toBe("data.ny.gov");
          expect(url.pathname).toBe("/api/v3/views/kufs-yh3x/query.json");
          expect(init?.method).toBe("POST");
          const headers = new Headers(init?.headers);
          expect(headers.get("X-App-Token")).toBe("app-token");
          expect(headers.get("Content-Type")).toBe("application/json");
          const body = JSON.parse(String(init?.body));
          expect(body.includeSynthetic).toBe(false);
          expect(body.query).toContain("GROUP BY year,month,route_id");
          expect(body.query).toContain("LIMIT 50000");

          return Response.json([
            {
              year: "2026",
              month: "3",
              route_id: "M1",
              row_count: "10",
              bus_trip_count: "100",
            },
            {
              year: "2026",
              month: "3",
              route_id: "M2",
              row_count: "12",
              bus_trip_count: "120",
            },
          ]);
        },
      },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "checked",
        latestCompleteMonth: "2026-03",
        lastBuiltMonth: "2026-02",
        shouldRebuild: true,
        artifactKey: "source-availability/route-speed-availability-worker.json",
      }),
    );
    const artifact = JSON.parse(String(bucket.writes.get(result.artifactKey ?? "")));
    expect(artifact).toEqual(
      expect.objectContaining({
        sourceId: "bus_segment_speeds_2025",
        latestCompleteMonth: "2026-03",
        shouldRebuild: true,
      }),
    );
  });

  it("skips route-speed publication checks when the artifacts bucket is not configured", async () => {
    const result = await runRouteSpeedMonthlyWatcher(
      { LAST_BUILT_SPEED_MONTH: "2026-03" },
      { now: new Date("2026-05-17T12:00:00.000Z") },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "ARTIFACTS R2 binding is not configured.",
        latestCompleteMonth: null,
        lastBuiltMonth: "2026-03",
        shouldRebuild: false,
      }),
    );
  });

  it("skips route-speed publication checks when the Socrata token is not configured", async () => {
    const result = await runRouteSpeedMonthlyWatcher(
      {
        ARTIFACTS: new FakeR2Bucket() as unknown as R2Bucket,
        LAST_BUILT_SPEED_MONTH: "2026-03",
      },
      { now: new Date("2026-05-17T12:00:00.000Z") },
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: "SOCRATA_APP_TOKEN secret is not configured.",
        latestCompleteMonth: null,
        lastBuiltMonth: "2026-03",
        shouldRebuild: false,
      }),
    );
  });

  it("keeps the every-minute production cron to GTFS-RT capture only", async () => {
    const rawBucket = new FakeR2Bucket();
    const artifactsBucket = new FakeR2Bucket();
    const result = await runScheduledProductionRefresh(
      {
        GTFS_RT_RAW: rawBucket as unknown as R2Bucket,
        ARTIFACTS: artifactsBucket as unknown as R2Bucket,
        LAST_BUILT_SPEED_MONTH: "2026-03",
      },
      { cron: "* * * * *" },
    );

    expect(result.gtfsRt).toHaveLength(1);
    expect(result.gtfsRt[0]).toEqual(expect.objectContaining({ status: "skipped" }));
    expect(result.routeSpeed).toEqual(
      expect.objectContaining({
        status: "skipped",
        reason: `Route speed watcher runs on cron ${ROUTE_SPEED_WATCHER_CRON}.`,
        shouldRebuild: false,
      }),
    );
    expect(result.statusArtifactKey).toBe("source-refresh/latest.json");
    const status = JSON.parse(String(artifactsBucket.writes.get("source-refresh/latest.json")));
    expect(status).toEqual(
      expect.objectContaining({
        cron: "* * * * *",
        gtfsRt: expect.objectContaining({
          sampleCount: 1,
          capturedCount: 0,
        }),
        routeSpeed: expect.objectContaining({
          status: "skipped",
          shouldRebuild: false,
        }),
      }),
    );
  });

  it("delegates scheduled events through the Studio API scheduled facade", async () => {
    const artifactsBucket = new FakeR2Bucket();
    await handleStudioScheduled({ cron: "* * * * *" } as ScheduledController, {
      ARTIFACTS: artifactsBucket as unknown as R2Bucket,
      LAST_BUILT_SPEED_MONTH: "2026-03",
    });

    const status = JSON.parse(String(artifactsBucket.writes.get("source-refresh/latest.json")));
    expect(status).toEqual(
      expect.objectContaining({
        cron: "* * * * *",
        routeSpeed: expect.objectContaining({
          status: "skipped",
          shouldRebuild: false,
        }),
      }),
    );
  });
});
