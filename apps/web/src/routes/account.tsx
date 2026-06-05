import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { routeHead } from "../lib/head.js";
import { requireAuthenticatedRoute } from "../lib/route-auth.js";
import { isSignedIn, useIdentity } from "../studio/hooks/use-identity.js";

export const Route = createFileRoute("/account")({
  beforeLoad: ({ location }) => requireAuthenticatedRoute({ location }),
  head: () => routeHead("Account", "Manage your account."),
  component: AccountRoute,
});

function AccountRoute() {
  const state = useIdentity();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut(): Promise<void> {
    setSigningOut(true);
    await fetch("/api/v1/auth/signout", { method: "POST", credentials: "same-origin" });
    navigate({ to: "/", replace: true });
  }

  if (state.status === "loading") {
    return <AccountShell>Loading…</AccountShell>;
  }
  if (state.status === "error") {
    return <AccountShell>Couldn't load account: {state.error}</AccountShell>;
  }
  if (!isSignedIn(state.data)) {
    return (
      <AccountShell>
        You're not signed in.{" "}
        <button
          type="button"
          className="text-[var(--bp-color-link)] underline"
          onClick={() => navigate({ to: "/signin" })}
        >
          Sign in
        </button>
      </AccountShell>
    );
  }
  return (
    <AccountShell>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-[var(--bp-color-muted)]">Email</dt>
        <dd>{state.data.identity.email}</dd>
        <dt className="text-[var(--bp-color-muted)]">Display name</dt>
        <dd>{state.data.identity.displayName ?? <em>—</em>}</dd>
        <dt className="text-[var(--bp-color-muted)]">Operator role</dt>
        <dd>
          {state.data.operator === null
            ? "Public account"
            : `${state.data.operator.workspaceId} (${state.data.operator.scopes.join(", ")})`}
        </dd>
      </dl>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="mt-4 rounded-[3px] border border-[var(--bp-color-rule)] px-3 py-2 text-[13px] disabled:opacity-50"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </AccountShell>
  );
}

function AccountShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-8 font-sans text-[14px]">
      <h1 className="text-[18px] font-semibold">Account</h1>
      {children}
    </main>
  );
}
