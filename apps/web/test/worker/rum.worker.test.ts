import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

function postRum(body: unknown, init?: RequestInit): Promise<Response> {
  return worker.fetch(
    new Request("https://example.test/api/v1/rum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
      ...init,
    }),
  );
}

describe("POST /api/v1/rum web-vitals beacon", () => {
  it("accepts a valid report with 204 No Content", async () => {
    const response = await postRum({
      path: "/routes/m15-sbs",
      ttfb: 120,
      fcp: 800,
      lcp: 1500,
      cls: 0.02,
      nav: "navigate",
    });

    expect(response.status).toBe(204);
  });

  it("accepts a path-only report without logging metrics", async () => {
    const response = await postRum({ path: "/findings" });

    expect(response.status).toBe(204);
  });

  it("rejects a malformed body with 400", async () => {
    const response = await postRum("not json at all");

    expect(response.status).toBe(400);
  });

  it("rejects out-of-range or unknown fields with 400", async () => {
    expect((await postRum({ path: "/routes/m15-sbs", cls: 99 })).status).toBe(400);
    expect((await postRum({ path: "/x", surprise: true })).status).toBe(400);
    expect((await postRum({ path: 123 })).status).toBe(400);
  });

  it("does not respond to GET (method guard)", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/v1/rum"));

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });
});
