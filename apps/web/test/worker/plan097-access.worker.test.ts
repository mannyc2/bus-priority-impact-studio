/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { verifyPlan097AccessRequest } from "../../src/worker/operations/plan097-access.js";

const issuer = "https://plan097-test.cloudflareaccess.com";
const audience = "plan097-access-audience";
const serviceTokenId = "plan097-service-token.access";

async function signedRequest(input?: {
  issuer?: string;
  audience?: string;
  commonName?: string;
}): Promise<{
  request: Request;
  keySet: ReturnType<typeof createLocalJWKSet>;
}> {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "plan097-test-key";
  publicJwk.use = "sig";
  const token = await new SignJWT({ common_name: input?.commonName ?? serviceTokenId })
    .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
    .setIssuer(input?.issuer ?? issuer)
    .setAudience(input?.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return {
    request: new Request("https://plan097-operation.test/__operations/plan097", {
      headers: { "Cf-Access-Jwt-Assertion": token },
    }),
    keySet: createLocalJWKSet({ keys: [publicJwk] }),
  };
}

describe("Plan 097 Cloudflare Access verification", () => {
  it("accepts only an RS256 Access JWT for the configured issuer, audience, and service token", async () => {
    const valid = await signedRequest();
    const env = {
      PLAN097_ACCESS_TEAM_DOMAIN: issuer,
      PLAN097_ACCESS_AUD: audience,
      PLAN097_ACCESS_SERVICE_TOKEN_ID: serviceTokenId,
    };

    expect(await verifyPlan097AccessRequest(valid.request, env, valid.keySet)).toBe(true);

    for (const drift of [
      { issuer: "https://wrong.cloudflareaccess.com" },
      { audience: "wrong-audience" },
      { commonName: "other-service-token.access" },
    ]) {
      const invalid = await signedRequest(drift);
      expect(await verifyPlan097AccessRequest(invalid.request, env, invalid.keySet)).toBe(false);
    }
  });

  it("fails closed for missing JWT or malformed Access configuration", async () => {
    const valid = await signedRequest();
    const env = {
      PLAN097_ACCESS_TEAM_DOMAIN: issuer,
      PLAN097_ACCESS_AUD: audience,
      PLAN097_ACCESS_SERVICE_TOKEN_ID: serviceTokenId,
    };

    expect(
      await verifyPlan097AccessRequest(
        new Request("https://plan097-operation.test/__operations/plan097"),
        env,
        valid.keySet,
      ),
    ).toBe(false);
    expect(
      await verifyPlan097AccessRequest(
        valid.request,
        { ...env, PLAN097_ACCESS_TEAM_DOMAIN: "https://example.com" },
        valid.keySet,
      ),
    ).toBe(false);
    expect(
      await verifyPlan097AccessRequest(
        valid.request,
        { ...env, PLAN097_ACCESS_AUD: "" },
        valid.keySet,
      ),
    ).toBe(false);
  });
});
