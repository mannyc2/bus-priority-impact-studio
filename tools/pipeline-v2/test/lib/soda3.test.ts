import { describe, expect, test } from "bun:test";
import { decodeStrict } from "@bp/domain/decode";
import { SocrataDatasetIdSchema } from "@bp/sources/core";
import type { SocrataManifestSource } from "@bp/sources/registry";
import { createSoda3SourceClient } from "../../src/lib/soda3.ts";

const source: SocrataManifestSource = {
  id: "test_soda3_source",
  type: "socrata_dataset",
  priority: "core",
  domain: "data.ny.gov",
  dataset_id: decodeStrict(SocrataDatasetIdSchema)("abcd-1234"),
  url: "https://data.ny.gov/Transportation/example/abcd-1234",
  api: "soda3",
  default_access: { kind: "query", format: "json" },
  purpose: "Test source.",
  status: "active",
};

describe("pipeline SODA3 native client", () => {
  test("retries transient provider responses before returning rows", async () => {
    const statuses = [500, 200];
    const client = createSoda3SourceClient(source, {
      appToken: null,
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async () => {
        const status = statuses.shift() ?? 200;
        return Response.json([{ route_id: "M15" }], { status });
      },
    });

    await expect(client.rows({ select: "route_id", limit: 1 })).resolves.toEqual([
      { route_id: "M15" },
    ]);
    expect(statuses).toEqual([]);
  });

  test("maps exhausted 429 responses to the pipeline rate-limit error shape", async () => {
    const attempts: number[] = [];
    const client = createSoda3SourceClient(source, {
      appToken: null,
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async () => {
        attempts.push(attempts.length + 1);
        return new Response("limited", { status: 429 });
      },
    });

    await expect(client.rows({ select: "route_id", limit: 1 })).rejects.toMatchObject({
      _tag: "RateLimitError",
      command: "soda3",
      operation: source.id,
      url: "https://data.ny.gov/api/v3/views/abcd-1234/query.json",
      attempt: 2,
      maxAttempts: 2,
      status: 429,
    });
    expect(attempts).toEqual([1, 2]);
  });

  test("maps exhausted 5xx responses to the pipeline request error shape", async () => {
    const attempts: number[] = [];
    const client = createSoda3SourceClient(source, {
      appToken: null,
      retryCount: 1,
      retryDelayMs: 0,
      fetcher: async () => {
        attempts.push(attempts.length + 1);
        return new Response("unavailable", { status: 503 });
      },
    });

    await expect(client.rows({ select: "route_id", limit: 1 })).rejects.toMatchObject({
      _tag: "HttpRequestError",
      command: "soda3",
      operation: source.id,
      url: "https://data.ny.gov/api/v3/views/abcd-1234/query.json",
      attempt: 2,
      maxAttempts: 2,
      status: 503,
    });
    expect(attempts).toEqual([1, 2]);
  });
});
