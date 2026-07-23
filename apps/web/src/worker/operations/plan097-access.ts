import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

export type Plan097AccessEnv = {
  PLAN097_ACCESS_TEAM_DOMAIN?: string | undefined;
  PLAN097_ACCESS_AUD?: string | undefined;
  PLAN097_ACCESS_SERVICE_TOKEN_ID?: string | undefined;
};

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function accessIssuer(value: string | undefined): string | null {
  if (value === undefined || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".cloudflareaccess.com") ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.port.length > 0 ||
      url.pathname !== "/" ||
      url.search.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function remoteKeySet(issuer: string): JWTVerifyGetKey {
  const existing = remoteKeySets.get(issuer);
  if (existing !== undefined) return existing;
  const created = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  remoteKeySets.set(issuer, created);
  return created;
}

export async function verifyPlan097AccessRequest(
  request: Request,
  env: Plan097AccessEnv,
  keySet?: JWTVerifyGetKey,
): Promise<boolean> {
  const issuer = accessIssuer(env.PLAN097_ACCESS_TEAM_DOMAIN);
  const audience = env.PLAN097_ACCESS_AUD;
  const serviceTokenId = env.PLAN097_ACCESS_SERVICE_TOKEN_ID;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (
    issuer === null ||
    audience === undefined ||
    audience.length === 0 ||
    serviceTokenId === undefined ||
    serviceTokenId.length === 0 ||
    token === null ||
    token.length === 0
  ) {
    return false;
  }

  try {
    const { payload, protectedHeader } = await jwtVerify(token, keySet ?? remoteKeySet(issuer), {
      issuer,
      audience,
      algorithms: ["RS256"],
    });
    // biome-ignore lint/complexity/useLiteralKeys: JOSE payload claims are index-signature typed.
    return protectedHeader.alg === "RS256" && payload["common_name"] === serviceTokenId;
  } catch {
    return false;
  }
}
