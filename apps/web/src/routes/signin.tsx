import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { safeAppRedirect } from "../lib/auth-redirect.js";
import { routeHead } from "../lib/head.js";

type SignInSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/signin")({
  validateSearch: (search: { redirect?: unknown }): SignInSearch => {
    const redirect =
      typeof search.redirect === "string" ? safeAppRedirect(search.redirect) : undefined;
    return redirect === undefined ? {} : { redirect };
  },
  head: () => routeHead("Sign in", "Sign in to save alerts, searches, and comment on briefs."),
  component: SignInRoute,
});

function SignInRoute() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [devLink, setDevLink] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("sending");
    setDevLink(null);
    try {
      const response = await fetch("/api/v1/auth/magic-link/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, ...(redirect === undefined ? {} : { next: redirect }) }),
      });
      if (response.status === 204) {
        setStatus("sent");
        return;
      }
      if (response.status === 202) {
        const body = (await response.json()) as { __devMagicLink?: string };
        if (typeof body.__devMagicLink === "string") setDevLink(body.__devMagicLink);
        setStatus("sent");
        return;
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <main className="mx-auto flex max-w-sm flex-col gap-3 p-8 font-sans text-[14px]">
        <h1 className="text-[18px] font-semibold">Check your email</h1>
        <p className="text-[var(--bp-color-muted)]">
          We sent a sign-in link to {email}. Click it to finish signing in. The link expires in 15
          minutes.
        </p>
        {devLink !== null ? (
          <p className="text-[12px]">
            Dev fallback link:{" "}
            <button
              type="button"
              className="text-[var(--bp-color-link)] underline"
              onClick={() => navigate({ to: devLink, replace: true })}
            >
              {devLink}
            </button>
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-3 p-8 font-sans text-[14px]">
      <h1 className="text-[18px] font-semibold">Sign in</h1>
      <p className="text-[var(--bp-color-muted)]">
        Enter your email and we'll send you a one-time sign-in link.
      </p>
      <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] uppercase tracking-wide">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-[3px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)] px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={status === "sending" || email.length === 0}
          className="mt-1 rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-2 text-white disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Send sign-in link"}
        </button>
        {status === "error" ? (
          <p className="text-[12px] text-[var(--bp-color-bad)]">
            Something went wrong. Try again in a moment.
          </p>
        ) : null}
      </form>
    </main>
  );
}
