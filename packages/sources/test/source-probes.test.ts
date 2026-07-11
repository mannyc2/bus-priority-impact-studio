import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import { SocrataDatasetIdSchema } from "@bp/sources/core";
import { probeSource } from "@bp/sources/probes";
import { parseCurlHeadOutput } from "@bp/sources/probes/transports/bun-curl";
import type { ManifestSource, SocrataManifestSource } from "@bp/sources/registry";
import { parseSourceManifestObject } from "@bp/sources/registry";

const now = () => new Date("2026-04-27T00:00:00.000Z");

describe("source probes", () => {
  test("accepts the typed NOAA station download entry", () => {
    const manifest = parseSourceManifestObject({
      verified_at: "2026-06-05",
      sources: [
        {
          id: "noaa_ghcn_daily_nyc",
          type: "file_download",
          priority: "secondary",
          domain: "ncei.noaa.gov",
          url: "https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/",
          purpose: "NYC daily weather observations.",
          stations: [{ id: "USW00094728", name: "NY CITY CENTRAL PARK" }],
          status: "active",
        },
      ],
    });

    expect(manifest.sources[0]).toMatchObject({
      id: "noaa_ghcn_daily_nyc",
      domain: "ncei.noaa.gov",
      stations: [{ id: "USW00094728" }],
    });
  });

  test("allows manifest notes without reopening old Socrata endpoint fields", () => {
    const manifest = parseSourceManifestObject({
      verified_at: "2026-06-05",
      sources: [
        {
          id: "nyc_dot_street_opening_permits",
          type: "socrata_dataset",
          priority: "secondary",
          domain: "data.cityofnewyork.us",
          dataset_id: "9jic-byiu",
          url: "https://data.cityofnewyork.us/Transportation/Street-Opening-Permits/9jic-byiu",
          api: "soda3",
          default_access: { kind: "query", format: "json" },
          purpose: "Alias source with operator notes.",
          status: "alias_of_construction_permits",
          notes: "Do not double-ingest.",
        },
      ],
    });

    expect(manifest.sources[0]).toMatchObject({
      id: "nyc_dot_street_opening_permits",
      notes: "Do not double-ingest.",
    });
    expect(() =>
      parseSourceManifestObject({
        verified_at: "2026-06-05",
        sources: [
          {
            ...manifest.sources[0],
            api_json: "https://data.cityofnewyork.us/resource/9jic-byiu.json",
          },
        ],
      }),
    ).toThrow();
  });

  test("reports the tagged manifest member that failed", () => {
    expect(() =>
      parseSourceManifestObject({
        verified_at: "2026-06-05",
        sources: [
          {
            id: "wrong-member-body",
            type: "socrata_dataset",
            priority: "core",
            purpose: "Carries a URL-source body under the Socrata tag.",
            status: "invalid_fixture",
            url: "https://example.com/source",
          },
        ],
      }),
    ).toThrow(/\["sources"\]\[0\]\["domain"\]/);
  });

  test("probes Socrata metadata and row counts", async () => {
    const source: SocrataManifestSource = {
      id: "bus_segment_speeds_2025",
      type: "socrata_dataset",
      priority: "core",
      domain: "data.ny.gov",
      dataset_id: decodeStrict(SocrataDatasetIdSchema)("kufs-yh3x"),
      url: "https://data.ny.gov/Transportation/example/kufs-yh3x",
      api: "soda3",
      default_access: { kind: "query", format: "json" },
      backfill: { kind: "soda3_export", format: "csv", supportsByteRange: false },
      purpose: "Core speed source.",
      status: "needs_schema_probe",
    };

    const output = await probeSource(source, {
      now,
      fetcher: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/api/views/kufs-yh3x")) {
          return Response.json({
            id: "kufs-yh3x",
            name: "MTA Bus Speeds Sample",
            rowsUpdatedAt: 1_766_256_000,
            columns: [],
          });
        }

        if (url.endsWith("/api/views/kufs-yh3x/columns.json")) {
          return Response.json([
            { name: "route_id", dataTypeName: "text", fieldName: "route_id" },
            { name: "average_speed", dataTypeName: "number", fieldName: "average_speed" },
          ]);
        }

        if (url.endsWith("/api/v3/views/kufs-yh3x/query.json")) {
          expect(init?.method).toBe("POST");
          const body = JSON.parse(String(init?.body));
          expect(body).toEqual({ query: "SELECT count(*)", includeSynthetic: false });
          return Response.json([{ count: "42" }]);
        }

        return new Response("not found", { status: 404 });
      },
    });

    expect(output.probeStatus).toBe("active");
    expect(output.socrata?.columnCount).toBe(2);
    expect(output.socrata?.rowCount).toBe(42);
    expect(output.socrata?.rowsCsvUrl).toBe(
      "https://data.ny.gov/api/v3/views/kufs-yh3x/export.csv",
    );
  });

  test("uses lightweight HTTP metadata for web and static sources", async () => {
    const source: ManifestSource = {
      id: "mta_open_data_program",
      type: "web_page",
      priority: "core",
      url: "https://www.mta.info/open-data",
      purpose: "Open data page.",
      status: "seed_verified",
    };

    const output = await probeSource(source, {
      now,
      fetcher: async (_input, init) => {
        expect(init?.method).toBe("HEAD");
        return new Response(null, {
          status: 200,
          headers: {
            "content-type": "text/html",
            "content-length": "123",
            "last-modified": "Mon, 27 Apr 2026 00:00:00 GMT",
          },
        });
      },
    });

    expect(output.probeStatus).toBe("active");
    expect(output.http?.method).toBe("HEAD");
    expect(output.http?.transport).toBe("fetch");
    expect(output.http?.contentLengthBytes).toBe(123);
  });

  test("parses final curl header blocks for fetch-blocked documentation pages", () => {
    const probe = parseCurlHeadOutput(
      [
        "HTTP/2 301",
        "location: https://www.mta.info/open-data",
        "",
        "HTTP/2 200",
        "content-type: text/html; charset=UTF-8",
        "content-length: 123",
        "last-modified: Mon, 27 Apr 2026 00:00:00 GMT",
        "",
        "__CURL_EFFECTIVE_URL__:https://www.mta.info/open-data",
        "",
      ].join("\n"),
      "https://www.mta.info/open-data",
    );

    expect(probe.ok).toBe(true);
    expect(probe.status).toBe(200);
    expect(probe.transport).toBe("curl");
    expect(probe.contentLengthBytes).toBe(123);
  });

  test("skips Bus Time feeds without a local API key", async () => {
    const source: ManifestSource = {
      id: "bus_time_gtfsrt_alerts",
      type: "gtfs_realtime_api",
      priority: "optional",
      url: "https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>",
      purpose: "Realtime alerts.",
      status: "needs_api_key",
    };

    const output = await probeSource(source, { now });

    expect(output.probeStatus).toBe("skipped");
    expect(output.redactedUrl).toContain("<redacted>");
  });

  test("redacts Bus Time API keys from persisted realtime probe output", async () => {
    const secret = "secret-key";
    const source: ManifestSource = {
      id: "bus_time_gtfsrt_alerts",
      type: "gtfs_realtime_api",
      priority: "optional",
      url: "https://gtfsrt.prod.obanyc.com/alerts?key=<YOUR_KEY>",
      purpose: "Realtime alerts.",
      status: "needs_api_key",
    };

    const output = await probeSource(source, {
      now,
      busTimeApiKey: secret,
      fetcher: async (input, init) => {
        expect(String(input)).toContain(secret);
        expect(init?.method).toBe("GET");
        return new Response("protobuf", {
          status: 200,
          headers: { "content-type": "application/x-protobuf" },
        });
      },
    });

    expect(output.probeStatus).toBe("active");
    expect(JSON.stringify(output)).not.toContain(secret);
  });
});
