import { describe, expect, test } from "vitest";
import {
  handlePlan098ServingReleaseRequest,
  PLAN098_OPERATION_PATH,
} from "../../src/worker/operations/plan098-serving-release.js";

function request(token = "test-token") {
  return new Request(`https://operator.example.test${PLAN098_OPERATION_PATH}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "status" }),
  });
}

describe("Plan 098 isolated production operator", () => {
  test("is closed unless its dedicated deployment flag is enabled", async () => {
    const response = await handlePlan098ServingReleaseRequest(request(), {});
    expect(response.status).toBe(404);
  });

  test("rejects missing and incorrect execution tokens", async () => {
    const env = { PLAN098_OPERATOR_ENABLED: "true", PLAN098_EXECUTION_TOKEN: "expected" };
    expect((await handlePlan098ServingReleaseRequest(request("wrong"), env)).status).toBe(401);
    expect(
      (
        await handlePlan098ServingReleaseRequest(
          new Request(`https://operator.example.test${PLAN098_OPERATION_PATH}`, {
            method: "POST",
          }),
          env,
        )
      ).status,
    ).toBe(401);
  });

  test("fails closed when an authorized deployment lacks exact production bindings", async () => {
    const response = await handlePlan098ServingReleaseRequest(request(), {
      PLAN098_OPERATOR_ENABLED: "true",
      PLAN098_EXECUTION_TOKEN: "test-token",
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: "plan098_operator_failure" }),
    );
  });
});
