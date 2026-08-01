import { describe, expect, test } from "bun:test";
import {
  createPlan098OperatorClient,
  fetchPlan098PublicRead,
} from "../../src/lib/plan098-operator-client";

describe("Plan 098 production operator client", () => {
  test("retries a read-only action across transient non-JSON provider responses", async () => {
    const responses = [
      new Response("upstream unavailable", { status: 503 }),
      Response.json({ ok: true, result: { kind: "legacy", generation: 0 } }),
    ];
    const sleeps: number[] = [];
    let attempts = 0;
    const operator = createPlan098OperatorClient({
      endpoint: "https://operator.example.test",
      token: "secret",
      fetch: async () => {
        attempts += 1;
        const response = responses.shift();
        if (response === undefined) throw new Error("unexpected request");
        return response;
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      retryDelayMilliseconds: 25,
    });

    await expect(operator({ action: "status" })).resolves.toEqual({
      kind: "legacy",
      generation: 0,
    });
    expect(attempts).toBe(2);
    expect(sleeps).toEqual([25]);
  });

  test("does not retry a mutation whose provider response is ambiguous", async () => {
    let attempts = 0;
    const operator = createPlan098OperatorClient({
      endpoint: "https://operator.example.test",
      token: "secret",
      fetch: async () => {
        attempts += 1;
        return new Response("provider failure", { status: 503 });
      },
      sleep: async () => undefined,
    });

    await expect(operator({ action: "register-candidate" })).rejects.toThrow(
      "register-candidate returned non-JSON HTTP 503 after 1 attempt(s): provider failure",
    );
    expect(attempts).toBe(1);
  });

  test("surfaces structured fail-closed diagnostics without retrying terminal responses", async () => {
    let attempts = 0;
    const operator = createPlan098OperatorClient({
      endpoint: "https://operator.example.test",
      token: "secret",
      fetch: async () => {
        attempts += 1;
        return Response.json(
          { error: "plan098_operator_failure", message: "pointer invariant failed" },
          { status: 409 },
        );
      },
      sleep: async () => undefined,
    });

    await expect(operator({ action: "status" })).rejects.toThrow(
      "status failed with HTTP 409 after 1 attempt(s)",
    );
    expect(attempts).toBe(1);
  });

  test("retries public smoke reads across transient gateway responses", async () => {
    const responses = [
      Response.json({ error: { code: "BAD_GATEWAY" } }, { status: 502 }),
      Response.json({ releaseId: "pub_20260725T164123260Z" }),
    ];
    const sleeps: number[] = [];
    const result = await fetchPlan098PublicRead({
      url: "https://public.example.test/api/v1/map/manifest",
      label: "adopt-a smoke /api/v1/map/manifest",
      fetch: async () => {
        const response = responses.shift();
        if (response === undefined) throw new Error("unexpected request");
        return response;
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      retryDelayMilliseconds: 25,
    });

    expect(result.response.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ releaseId: "pub_20260725T164123260Z" });
    expect(sleeps).toEqual([25]);
  });
});
