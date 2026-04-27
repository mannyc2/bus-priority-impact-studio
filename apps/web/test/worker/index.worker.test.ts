import { HealthResponseSchema } from "@bp/domain";
import { describe, expect, it } from "vitest";
import worker from "../../src/worker/index.js";

describe("Worker production-behavior harness", () => {
  it("serves a validated health response", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"));

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        ok: true,
        service: "bus-priority-impact-studio",
      }),
    );
  });

  it("keeps unknown API routes closed", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/missing"));

    expect(response.status).toBe(404);
  });
});
