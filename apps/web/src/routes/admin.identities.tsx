import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { routeHead } from "../lib/head.js";
import type {
  AdminIdentitiesListResponse,
  AdminIdentityEntry,
  StudioActorScope,
} from "../studio/api-contract.js";
import { isSignedIn, useIdentity } from "../studio/hooks/use-identity.js";

const ALL_SCOPES: StudioActorScope[] = [
  "read:briefs",
  "write:briefs",
  "review:briefs",
  "publish:briefs",
  "admin:identities",
];

export const Route = createFileRoute("/admin/identities")({
  head: () => routeHead("Admin · Identities", "Grant operator scopes to public identities."),
  component: AdminIdentitiesRoute,
});

function AdminIdentitiesRoute() {
  const state = useIdentity();
  const navigate = useNavigate();

  if (state.status === "loading") return <Shell>Loading…</Shell>;
  if (state.status === "error") return <Shell>Failed: {state.error}</Shell>;
  if (!isSignedIn(state.data)) {
    return (
      <Shell>
        Not signed in.{" "}
        <button
          type="button"
          className="text-[var(--bp-color-link)] underline"
          onClick={() => navigate({ to: "/signin" })}
        >
          Sign in
        </button>
      </Shell>
    );
  }
  const operator = state.data.operator;
  if (operator === null || !operator.scopes.includes("admin:identities")) {
    return (
      <Shell>
        You need the <code>admin:identities</code> scope to view this page.
      </Shell>
    );
  }
  return <AdminIdentitiesContent defaultWorkspaceId={operator.workspaceId} />;
}

function AdminIdentitiesContent({ defaultWorkspaceId }: { defaultWorkspaceId: string }) {
  const [query, setQuery] = useState("");
  const [identities, setIdentities] = useState<AdminIdentityEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string) => {
    setError(null);
    try {
      const url = new URL("/api/v1/admin/identities", window.location.origin);
      if (search.length > 0) url.searchParams.set("query", search);
      const response = await fetch(url.toString(), { credentials: "same-origin" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as AdminIdentitiesListResponse;
      setIdentities(data.identities);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  return (
    <Shell>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email or display name"
          className="flex-1 rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-1.5 text-[13px]"
        />
        <button
          type="submit"
          className="rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-1.5 text-[13px] text-white"
        >
          Search
        </button>
      </form>
      {error !== null ? (
        <p className="text-[12px] text-[var(--bp-color-bad)]">{error}</p>
      ) : null}
      {identities === null ? (
        <p className="text-[12px] text-[var(--bp-color-muted)]">Loading…</p>
      ) : identities.length === 0 ? (
        <p className="text-[12px] text-[var(--bp-color-muted)]">No identities.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {identities.map((identity) => (
            <IdentityRow
              key={identity.identityId}
              identity={identity}
              defaultWorkspaceId={defaultWorkspaceId}
              onChanged={() => void load(query)}
            />
          ))}
        </ul>
      )}
    </Shell>
  );
}

function IdentityRow({
  identity,
  defaultWorkspaceId,
  onChanged,
}: {
  identity: AdminIdentityEntry;
  defaultWorkspaceId: string;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [workspaceId, setWorkspaceId] = useState(
    identity.operator?.workspaceId ?? defaultWorkspaceId,
  );
  const [scopes, setScopes] = useState<Set<StudioActorScope>>(
    new Set<StudioActorScope>(identity.operator?.scopes ?? ["read:briefs"]),
  );
  const [busy, setBusy] = useState(false);

  async function grant(): Promise<void> {
    setBusy(true);
    try {
      await fetch(
        `/api/v1/admin/identities/${encodeURIComponent(identity.identityId)}/grant-operator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ workspaceId, scopes: Array.from(scopes) }),
        },
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(): Promise<void> {
    setBusy(true);
    try {
      await fetch(
        `/api/v1/admin/identities/${encodeURIComponent(identity.identityId)}/revoke-operator`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ workspaceId: identity.operator?.workspaceId ?? workspaceId }),
        },
      );
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-2 text-[13px]">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="font-medium">{identity.displayName ?? identity.email}</div>
          <div className="text-[11px] text-[var(--bp-color-muted)]">
            {identity.email}
            {identity.operator !== null
              ? ` · operator on ${identity.operator.workspaceId} (${identity.operator.scopes.join(", ")})`
              : " · public account"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-[11px] text-[var(--bp-color-link)] underline"
        >
          {expanded ? "Close" : identity.operator === null ? "Grant operator" : "Edit"}
        </button>
      </div>
      {expanded ? (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide">Workspace</span>
            <input
              type="text"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              className="rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-paper)] px-2 py-1 text-[12px]"
            />
          </label>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="text-[11px] uppercase tracking-wide">Scopes</legend>
            {ALL_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-1 text-[12px]">
                <input
                  type="checkbox"
                  checked={scopes.has(scope)}
                  onChange={() => {
                    setScopes((current) => {
                      const next = new Set(current);
                      if (next.has(scope)) next.delete(scope);
                      else next.add(scope);
                      return next;
                    });
                  }}
                />
                {scope}
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void grant()}
              disabled={busy || scopes.size === 0}
              className="rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-1 text-[12px] text-white disabled:opacity-50"
            >
              {identity.operator === null ? "Grant" : "Update"}
            </button>
            {identity.operator !== null ? (
              <button
                type="button"
                onClick={() => void revoke()}
                disabled={busy}
                className="rounded-[3px] border border-[var(--bp-color-rule)] px-3 py-1 text-[12px]"
              >
                Revoke
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 p-8 font-sans text-[14px]">
      <h1 className="text-[18px] font-semibold">Admin · Identities</h1>
      {children}
    </main>
  );
}
