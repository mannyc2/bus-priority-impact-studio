import { redirect } from "@tanstack/react-router";
import type { IdentityMeResponse, StudioActorScope } from "../studio/api-contract.js";
import { safeAppRedirect } from "./auth-redirect.js";

type RouteAuthOptions = {
  location: { href: string };
  scopes?: readonly StudioActorScope[];
};

type MeResponse = IdentityMeResponse | { identity: null; operator: null };

async function fetchMe(): Promise<MeResponse> {
  const response = await fetch("/api/v1/me", { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as MeResponse;
}

export async function requireAuthenticatedRoute({
  location,
  scopes = [],
}: RouteAuthOptions): Promise<IdentityMeResponse> {
  let me: MeResponse;
  try {
    me = await fetchMe();
  } catch {
    throw redirect({
      to: "/signin",
      search: { redirect: safeAppRedirect(location.href) ?? "/" },
      replace: true,
    });
  }

  if (me.identity === null) {
    throw redirect({
      to: "/signin",
      search: { redirect: safeAppRedirect(location.href) ?? "/" },
      replace: true,
    });
  }

  if (
    scopes.length > 0 &&
    (me.operator === null || !scopes.every((scope) => me.operator?.scopes.includes(scope)))
  ) {
    throw redirect({ to: "/account", replace: true });
  }

  return me;
}
