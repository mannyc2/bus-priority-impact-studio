import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { routeHead } from "../lib/head.js";
import { staticStudioLoaderStaleTimeMs } from "../studio/api-client.js";

const PublicInterventions = lazy(() =>
  import("../components/interventions/PublicInterventions.js").then((module) => ({
    default: module.PublicInterventions,
  })),
);

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * The three filters the page owns, each omitted at its default so a shared URL
 * carries only what the reader actually chose.
 *
 * `family` is a treatment-family key from the served artifact, not a fixed
 * enum: the retired ledger's `StudioInterventionTreatmentFamily` vocabulary
 * (`enforcement`, `stop_change`, …) is a different one from the episode
 * artifact's (`automated-bus-lane-enforcement`, `bus-stop-or-boarding`, …), so
 * the route validates the SHAPE and the page resolves the value against the
 * facets it actually has.
 */
export type InterventionsSearch = {
  family?: string;
  route?: string;
  /** Every change rather than the first page of them. */
  all?: true;
};

const FAMILY_KEY = /^[a-z0-9-]{1,64}$/u;

export function validateInterventionsSearch(search: Record<string, unknown>): InterventionsSearch {
  const { family: familyValue, route: routeValue, all: allValue } = search;
  const family = typeof familyValue === "string" && FAMILY_KEY.test(familyValue)
    ? familyValue
    : undefined;
  const route = boundedTrimmedSearch(routeValue, 96);
  const all = allValue === true || allValue === "true" ? true : undefined;
  return {
    ...(family === undefined ? {} : { family }),
    ...(route === undefined ? {} : { route }),
    ...(all === undefined ? {} : { all }),
  };
}

function boundedTrimmedSearch(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return undefined;
  for (const character of trimmed) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return undefined;
  }
  return trimmed;
}

export const Route = createFileRoute("/interventions")({
  loader: async ({ abortController }) => {
    const { fetchPublicInterventionEpisodes } = await import(
      "../studio/public-intervention-api.js"
    );
    const publicArtifact = await fetchPublicInterventionEpisodes({
      signal: abortController.signal,
    }).catch((error: unknown) => {
      if (isAbortError(error)) throw error;
      console.warn("Public intervention episode artifact request failed.", { error });
      return null;
    });
    return { publicArtifact };
  },
  validateSearch: (search: Record<string, unknown>): InterventionsSearch =>
    validateInterventionsSearch(search),
  staleTime: staticStudioLoaderStaleTimeMs,
  pendingComponent: InterventionsRouteFallback,
  head: () =>
    routeHead(
      "Interventions",
      "Browse bus-priority intervention timelines and before/after context by route.",
    ),
  component: InterventionsRoute,
});

function InterventionsRoute() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Suspense fallback={<InterventionsRouteFallback />}>
      {data.publicArtifact === null ? (
        <InterventionsUnavailable />
      ) : (
        <main className="min-h-full p-7 max-sm:p-4">
          <PublicInterventions
            artifact={data.publicArtifact}
            search={search}
            onSearchChange={(next) => {
              void navigate({ search: next, replace: true });
            }}
          />
        </main>
      )}
    </Suspense>
  );
}

function InterventionsUnavailable() {
  return (
    <main className="min-h-full p-7 max-sm:p-4">
      <div className="border-b border-[var(--bp-color-rule)] pb-6">
        <h1 className="m-0 text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] max-sm:text-[25px]">
          Interventions
        </h1>
        <p className="mt-3 max-w-[68ch] text-[14px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          The source-backed intervention history is temporarily unavailable.
        </p>
      </div>
    </main>
  );
}

function InterventionsRouteFallback() {
  return (
    <main className="min-h-full p-7 max-sm:p-4">
      <div className="mb-6 h-[84px] max-w-[640px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="mb-5 h-[74px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
      <div className="h-[420px] animate-pulse rounded-[3px] bg-[var(--bp-color-ink-06)]" />
    </main>
  );
}
