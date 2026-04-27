import { describe, expect, test } from "bun:test";
import type { ManifestSource, SocrataManifestSource } from "../src/index.js";
import { SocrataDatasetIdSchema } from "../src/index.js";
import { parseCurlHeadOutput, probeSource } from "../src/probes/index.js";

const now = () => new Date("2026-04-27T00:00:00.000Z");

describe("source probes", () => {
  test("probes Socrata metadata and row counts", async () => {
    const source: SocrataManifestSource = {
      id: "bus_segment_speeds_2025",
      type: "socrata_dataset",
      priority: "core",
      domain: "data.ny.gov",
      dataset_id: SocrataDatasetIdSchema.parse("kufs-yh3x"),
      url: "https://data.ny.gov/Transportation/example/kufs-yh3x",
      api_json: "https://data.ny.gov/resource/kufs-yh3x.json",
      columns_json: "https://data.ny.gov/api/views/kufs-yh3x/columns.json",
      rows_csv: "https://data.ny.gov/api/views/kufs-yh3x/rows.csv?accessType=DOWNLOAD",
      purpose: "Core speed source.",
      status: "needs_schema_probe",
    };

    const output = await probeSource(source, {
      now,
      fetcher: async (input) => {
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

        if (url.includes("/resource/kufs-yh3x.json")) {
          return Response.json([{ count: "42" }]);
        }

        return new Response("not found", { status: 404 });
      },
    });

    expect(output.probeStatus).toBe("active");
    expect(output.socrata?.columnCount).toBe(2);
    expect(output.socrata?.rowCount).toBe(42);
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
