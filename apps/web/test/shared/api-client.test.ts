import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchStudioInterventionsEvidence,
  fetchStudioRoute,
  StudioApiError,
} from "../../src/studio/api-client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(handler: typeof globalThis.fetch) {
  globalThis.fetch = handler;
}

describe("Studio API client", () => {
  test("throws StudioApiError with server error details", async () => {
    const fetchFailure = async () =>
      Response.json(
        {
          error: {
            code: "SERVING_PROJECTION_MISSING",
            message: "Serving projection is missing.",
          },
        },
        { status: 503 },
      );
    mockFetch(fetchFailure as unknown as typeof globalThis.fetch);

    try {
      await fetchStudioInterventionsEvidence();
      throw new Error("Expected fetchStudioInterventionsEvidence to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(StudioApiError);
      if (error instanceof StudioApiError) {
        expect(error.status).toBe(503);
        expect(error.code).toBe("SERVING_PROJECTION_MISSING");
        expect(error.message).toBe("Serving projection is missing.");
      }
    }
  });

  test("returns null for nullable 404 responses", async () => {
    mockFetch(
      (async () => new Response(null, { status: 404 })) as unknown as typeof globalThis.fetch,
    );

    await expect(fetchStudioRoute("M1")).resolves.toBeNull();
  });
});
