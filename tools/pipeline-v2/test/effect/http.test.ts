import { describe, expect, test } from "bun:test";
import { runPipelineHttpPromise } from "../../src/effect/http.ts";

describe("pipeline HTTP Effect boundary", () => {
  test("retries a failed attempt and returns the successful response", async () => {
    const attempts: number[] = [];
    const failedAttempts: { attempt: number; tag: string }[] = [];

    const result = await runPipelineHttpPromise({
      command: "fixture.http",
      operation: "download",
      url: "https://example.test/data.json",
      maxAttempts: 3,
      retryDelayMs: 0,
      onAttemptFailed: ({ attempt, error }) => {
        failedAttempts.push({ attempt, tag: error._tag });
      },
      run: async ({ attempt, maxAttempts }) => {
        attempts.push(attempt);
        expect(maxAttempts).toBe(3);
        if (attempt === 1) throw new Error("HTTP 500");
        return "ok";
      },
    });

    expect(result).toBe("ok");
    expect(attempts).toEqual([1, 2]);
    expect(failedAttempts).toEqual([{ attempt: 1, tag: "HttpRequestError" }]);
  });

  test("surfaces typed rate-limit errors after retries are exhausted", async () => {
    const attempts: number[] = [];
    const url = "https://example.test/limited.json";

    await expect(
      runPipelineHttpPromise({
        command: "fixture.http",
        operation: "download",
        url,
        maxAttempts: 2,
        retryDelayMs: 0,
        run: async ({ attempt }) => {
          attempts.push(attempt);
          throw new Error("HTTP 429");
        },
      }),
    ).rejects.toMatchObject({
      _tag: "RateLimitError",
      attempt: 2,
      maxAttempts: 2,
      status: 429,
      url,
    });
    expect(attempts).toEqual([1, 2]);
  });
});
