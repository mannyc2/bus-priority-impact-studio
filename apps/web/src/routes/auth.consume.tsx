import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { safeAppRedirect } from "../lib/auth-redirect.js";
import { routeHead } from "../lib/head.js";

export const Route = createFileRoute("/auth/consume")({
  head: () => routeHead("Sign in", "Completing sign-in."),
  validateSearch: (search: Record<string, unknown>): { token?: string; next?: string } => {
    const typedSearch = search as { token?: unknown; next?: unknown };
    const { token, next } = typedSearch;
    return {
      ...(typeof token === "string" ? { token } : {}),
      ...(typeof next === "string" ? { next } : {}),
    };
  },
  component: AuthConsumeRoute,
});

function AuthConsumeRoute() {
  const { token, next } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof token !== "string" || token.length === 0) {
      setError("Missing token.");
      return;
    }
    fetch("/api/v1/auth/magic-link/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        navigate({ to: safeAppRedirect(next) ?? "/", replace: true });
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      });
  }, [token, next, navigate]);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-3 p-8 font-sans text-[14px]">
      <h1 className="text-[18px] font-semibold">Signing in…</h1>
      {error !== null ? (
        <p className="text-[var(--bp-color-bad)]">
          {error} The link may be expired or already used.
        </p>
      ) : (
        <p className="text-[var(--bp-color-muted)]">One moment.</p>
      )}
    </main>
  );
}
