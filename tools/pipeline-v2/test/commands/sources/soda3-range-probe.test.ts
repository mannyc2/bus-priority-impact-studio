import { describe, expect, test } from "bun:test";
import { runSoda3RangeProbe } from "../../../src/commands/sources/soda3-range-probe.ts";

const manifestText = `
verified_at: "2026-06-05"
sources:
  - id: current_bus_routes
    type: socrata_dataset
    priority: core
    purpose: Current routes.
    status: active
    domain: data.ny.gov
    dataset_id: 5t4n-d72c
    url: https://data.ny.gov/Transportation/MTA-Regional-Bus-Routes/5t4n-d72c
    api: soda3
    default_access:
      kind: export
      format: csv
    backfill:
      kind: soda3_export
      format: csv
      supportsByteRange: true
      recommendedChunkBytes: 65536
      defaultQuery: SELECT route_id LIMIT 1
`;

describe("runSoda3RangeProbe", () => {
  test("returns a dry-run plan without network access by default", async () => {
    const result = await runSoda3RangeProbe({
      sourceId: "current_bus_routes",
      manifestText,
      appToken: null,
      now: () => new Date("2026-06-05T00:00:00Z"),
    });

    expect(result).toMatchObject({
      command: "sources:soda3-range-probe",
      checkedAt: "2026-06-05T00:00:00.000Z",
      exportUrl: "https://data.ny.gov/api/v3/views/5t4n-d72c/export.csv",
      query: "SELECT route_id LIMIT 1",
      rangeHeader: "bytes=0-255",
      dryRun: true,
      tokenConfigured: false,
      httpStatus: null,
    });
  });

  test("executes an authenticated SODA3 export range request when opted in", async () => {
    const result = await runSoda3RangeProbe({
      sourceId: "current_bus_routes",
      manifestText,
      appToken: "test-token",
      execute: true,
      rangeStart: 10,
      rangeEndInclusive: 19,
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        expect(url.href).toBe("https://data.ny.gov/api/v3/views/5t4n-d72c/export.csv");
        expect(init?.method).toBe("POST");
        const headers = new Headers(init?.headers);
        expect(headers.get("X-App-Token")).toBe("test-token");
        expect(headers.get("Range")).toBe("bytes=10-19");
        expect(JSON.parse(String(init?.body))).toEqual({
          query: "SELECT route_id LIMIT 1",
        });
        return new Response("0123456789", {
          status: 206,
          headers: {
            "accept-ranges": "bytes",
            "content-length": "10",
            "content-range": "bytes 10-19/100",
            "content-type": "text/csv",
          },
        });
      },
      now: () => new Date("2026-06-05T00:00:00Z"),
    });

    expect(result).toMatchObject({
      dryRun: false,
      httpStatus: 206,
      ok: true,
      rangeSatisfied: true,
      contentRange: "bytes 10-19/100",
      acceptRanges: "bytes",
      contentLengthBytes: 10,
      contentType: "text/csv",
      byteLength: 10,
    });
  });
});
