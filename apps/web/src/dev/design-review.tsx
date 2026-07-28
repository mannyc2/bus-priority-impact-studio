/**
 * `/system` — the design review environment.
 *
 * Two physically separate layers, in two separate file trees:
 *
 *   reviewer chrome — this file. Screen and route selectors, dataset status,
 *     viewport and variant switches, reviewer notes. Instrument styling, dark,
 *     mono, obviously not shippable.
 *   consumer canvas — `./screens/*-canvas.tsx`. A page that could ship
 *     unchanged. No development badge, no fixture vocabulary, no identifiers,
 *     no release detail, no data-quality metric.
 *
 * A screenshot cropped to the canvas is a production proposal. Data QA lives on
 * its own screen (`./screens/resolution-workbench.tsx`), never as a peer tab
 * beside the proposed pages.
 */

import { decodeStrict } from "@bp/domain/decode";
import { PublicEpisodeResolutionAuditArtifactSchema } from "@bp/domain/studio/public-intervention-episode-audit";
import { PublicInterventionEpisodesArtifactSchema } from "@bp/domain/studio/public-intervention-episodes";
import { type ReactNode, useState } from "react";

import { PublicInterventions } from "@/components/interventions/PublicInterventions";
import {
  PublicRouteHistory,
  type RouteHistoryVariant,
} from "@/components/route/PublicRouteHistory";
import { ResolutionWorkbench } from "@/dev/screens/resolution-workbench";
import { episodesForRoute } from "@/studio/public-episode-view";
import auditArtifactJson from "../../../../data/artifacts/quality/intervention-episode-resolution.json";
import publicArtifactJson from "../../../../data/artifacts/studio/v2/interventions/public-episodes.json";

const PUBLIC_ARTIFACT = decodeStrict(PublicInterventionEpisodesArtifactSchema)(publicArtifactJson);
const AUDIT_ARTIFACT = decodeStrict(PublicEpisodeResolutionAuditArtifactSchema)(auditArtifactJson);

type Screen = "interventions" | "route-history" | "workbench";
type Viewport = "desktop" | "narrow";

const SCREENS: readonly { key: Screen; label: string; kind: "proposal" | "operator" }[] = [
  { key: "interventions", label: "Interventions", kind: "proposal" },
  { key: "route-history", label: "Route history", kind: "proposal" },
  { key: "workbench", label: "Resolution workbench", kind: "operator" },
];

const REVIEW_ROUTES: readonly { slug: string; why: string }[] = [
  {
    slug: "m15-sbs",
    why: "the SBS launch predates the speed record; the ACE registry adds one current marker",
  },
  { slug: "q52-sbs", why: "extreme record multiplicity: 296 timeline records" },
  { slug: "bx41", why: "most changes; one interval, one point, one season" },
  { slug: "b44", why: "exact identity: the local route that kept running" },
  { slug: "b44-sbs", why: "exact identity: the new service, same change" },
  { slug: "bx38", why: "the only review route with a published study" },
];

const VARIANTS: readonly { key: RouteHistoryVariant; label: string; note: string }[] = [
  {
    key: "trend",
    label: "A — annotated trend",
    note: "Metric leads. Only changes inside the speed record get a mark.",
  },
  {
    key: "chronology",
    label: "B — chronology first",
    note: "Order and interval lead. The metric is a strip underneath.",
  },
];

const OPEN_QUESTIONS: readonly string[] = [
  "The temporary reconciliation table is pinned to v1-rc25 and capped at eight minted episodes. A release change or a ninth exception fails publication instead of silently growing the table.",
  "ACE and ABLE are admitted from the registry only by exact route and exact day. Thirteen registry rows support an existing episode; sixty-five create a route-specific episode.",
  "The build-out chart measures treatment reach. The list below contains approved, dated change episodes. They are related views, not interchangeable counts.",
  "Production uses the new artifact when present and retains the previous history surface as a missing-artifact fallback.",
];

export function DesignReview() {
  const [screen, setScreen] = useState<Screen>("interventions");
  const [routeSlug, setRouteSlug] = useState("m15-sbs");
  const [variant, setVariant] = useState<RouteHistoryVariant>("chronology");
  const [viewport, setViewport] = useState<Viewport>("desktop");

  const reviewRoute = AUDIT_ARTIFACT.reviewRoutes.find((route) => route.slug === routeSlug);
  const routeId = reviewRoute?.routeId ?? routeSlug;
  const routeEpisodes = episodesForRoute(PUBLIC_ARTIFACT.episodes, routeId);
  const speed = reviewRoute?.speed ?? [];
  const isProposal = screen !== "workbench";

  return (
    <main className="min-h-full bg-[#0d1117] p-5 text-[#c9d1d9] max-sm:p-3">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4">
        <header className="rounded-[3px] border border-[#30363d] bg-[#161b22] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="m-0 font-mono text-[13px] font-semibold tracking-[0.02em] text-[#e6edf3]">
              Design review environment
            </h1>
            <span className="font-mono text-[11px] text-[#8b949e]">
              not a page — the chrome on this dark surface is reviewer tooling
            </span>
          </div>
          <p className="mt-2 max-w-[96ch] font-mono text-[11.5px] leading-[1.6] text-[#8b949e]">
            Real data from the generated public episode artifact. Everything below the white bezel
            is consumer UI and contains no reviewer content; identifiers, dispositions and release
            detail live on the workbench screen only.
          </p>

          <div className="mt-4 flex flex-col gap-3 border-t border-[#30363d] pt-3.5">
            <ControlRow label="Screen">
              {SCREENS.map((entry) => (
                <ChromeButton
                  key={entry.key}
                  active={screen === entry.key}
                  onSelect={() => setScreen(entry.key)}
                  tone={entry.kind === "operator" ? "operator" : "proposal"}
                >
                  {entry.label}
                </ChromeButton>
              ))}
            </ControlRow>

            {screen === "interventions" ? null : (
              <ControlRow label="Stress case">
                {REVIEW_ROUTES.map((entry) => (
                  <ChromeButton
                    key={entry.slug}
                    active={routeSlug === entry.slug}
                    onSelect={() => setRouteSlug(entry.slug)}
                    tone="proposal"
                  >
                    {AUDIT_ARTIFACT.reviewRoutes.find((route) => route.slug === entry.slug)
                      ?.label ?? entry.slug}
                  </ChromeButton>
                ))}
              </ControlRow>
            )}

            {screen === "route-history" ? (
              <ControlRow label="Design variant">
                {VARIANTS.map((entry) => (
                  <ChromeButton
                    key={entry.key}
                    active={variant === entry.key}
                    onSelect={() => setVariant(entry.key)}
                    tone="proposal"
                  >
                    {entry.label}
                  </ChromeButton>
                ))}
              </ControlRow>
            ) : null}

            {isProposal ? (
              <ControlRow label="Viewport">
                <ChromeButton
                  active={viewport === "desktop"}
                  onSelect={() => setViewport("desktop")}
                  tone="proposal"
                >
                  Desktop
                </ChromeButton>
                <ChromeButton
                  active={viewport === "narrow"}
                  onSelect={() => setViewport("narrow")}
                  tone="proposal"
                >
                  Narrow, 390px
                </ChromeButton>
              </ControlRow>
            ) : null}
          </div>

          <DatasetStatus
            screen={screen}
            routeSlug={routeSlug}
            routeId={routeId}
            routeEpisodeCount={routeEpisodes.length}
            variant={variant}
            projectionEpisodes={PUBLIC_ARTIFACT.episodes.length}
            projectionRoutes={AUDIT_ARTIFACT.scope.routeReachCount}
            withheldHere={AUDIT_ARTIFACT.withheld.filter((r) => r.routeSlug === routeSlug).length}
            upstreamOccurrences={AUDIT_ARTIFACT.scope.upstreamOccurrenceCount}
            localEpisodes={AUDIT_ARTIFACT.scope.localMintedEpisodeCount}
            registryEpisodes={AUDIT_ARTIFACT.scope.registryMintedEpisodeCount}
          />
        </header>

        {isProposal ? (
          <section aria-label="Proposed public page">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10.5px] text-[#6e7681]">
              <span>▼ proposed public page begins</span>
              <span>{viewport === "narrow" ? "390px" : "up to 1180px"}</span>
            </div>
            <div
              className="@container mx-auto overflow-hidden rounded-[4px] bg-[var(--bp-color-canvas)] p-6 text-[var(--bp-color-ink)] ring-2 ring-[#30363d] max-sm:p-3"
              style={{ maxWidth: viewport === "narrow" ? 390 : 1180 }}
            >
              {screen === "interventions" ? (
                <PublicInterventions artifact={PUBLIC_ARTIFACT} />
              ) : (
                <PublicRouteHistory
                  variant={variant}
                  input={{
                    routeId,
                    routeLabel: reviewRoute?.label ?? routeId,
                    corridor: reviewRoute?.corridor ?? null,
                    episodes: routeEpisodes,
                    speed,
                  }}
                />
              )}
            </div>
            <div className="mt-1.5 font-mono text-[10.5px] text-[#6e7681]">
              ▲ proposed public page ends
            </div>
          </section>
        ) : (
          <ResolutionWorkbench
            artifact={PUBLIC_ARTIFACT}
            audit={AUDIT_ARTIFACT}
            routeSlug={routeSlug}
          />
        )}

        <section className="rounded-[3px] border border-[#30363d] bg-[#161b22] p-4">
          <h2 className="m-0 font-mono text-[12px] font-semibold text-[#e6edf3]">
            Open questions for the reviewer
          </h2>
          <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
            {OPEN_QUESTIONS.map((question) => (
              <li
                key={question}
                className="border-l border-[#30363d] pl-3 font-mono text-[11.5px] leading-[1.6] text-[#8b949e]"
              >
                {question}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function DatasetStatus({
  screen,
  routeSlug,
  routeId,
  routeEpisodeCount,
  variant,
  projectionEpisodes,
  projectionRoutes,
  withheldHere,
  upstreamOccurrences,
  localEpisodes,
  registryEpisodes,
}: {
  screen: Screen;
  routeSlug: string;
  routeId: string;
  routeEpisodeCount: number;
  variant: RouteHistoryVariant;
  projectionEpisodes: number;
  projectionRoutes: number;
  withheldHere: number;
  upstreamOccurrences: number;
  localEpisodes: number;
  registryEpisodes: number;
}) {
  const coverage = AUDIT_ARTIFACT.reviewRoutes.find((route) => route.slug === routeSlug);
  const why = REVIEW_ROUTES.find((entry) => entry.slug === routeSlug)?.why ?? "";
  const variantNote = VARIANTS.find((entry) => entry.key === variant)?.note ?? "";

  return (
    <dl className="m-0 mt-4 grid gap-x-6 gap-y-1.5 border-t border-[#30363d] pt-3.5 font-mono text-[11px] lg:grid-cols-2">
      <StatusFact
        label="dataset"
        value={`${upstreamOccurrences} approved occurrences + ${localEpisodes} reviewed local episodes + ${registryEpisodes} registry episodes = ${projectionEpisodes} public changes over ${projectionRoutes} exact routes`}
      />
      {screen === "interventions" ? (
        <StatusFact
          label="limitation"
          value="the reviewed corpus leans heavily on one borough programme, so the change list is not a complete history of the city"
        />
      ) : (
        <>
          <StatusFact label="this case" value={`${routeId} — ${why}`} />
          <StatusFact
            label="raw records here"
            value={`${coverage?.timelineCount ?? 0} timeline, ${coverage?.treatmentCount ?? 0} treatment, ${coverage?.changeCandidateCount ?? 0} change candidates`}
          />
          <StatusFact
            label="after the boundary"
            value={`${routeEpisodeCount} public ${routeEpisodeCount === 1 ? "change" : "changes"}, ${withheldHere} records withheld`}
          />
        </>
      )}
      {screen === "route-history" ? <StatusFact label="variant" value={variantNote} /> : null}
    </dl>
  );
}

function StatusFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 max-sm:grid-cols-1">
      <dt className="text-[#6e7681]">{label}</dt>
      <dd className="m-0 min-w-0 text-[#8b949e]">{value}</dd>
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-[92px] shrink-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-[#6e7681]">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function ChromeButton({
  active,
  onSelect,
  tone,
  children,
}: {
  active: boolean;
  onSelect: () => void;
  tone: "proposal" | "operator";
  children: ReactNode;
}) {
  const base =
    "rounded-[2px] border px-2.5 py-1 font-mono text-[11px] transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58a6ff]";
  if (active) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-pressed="true"
        className={`${base} ${
          tone === "operator"
            ? "border-[#e8c87a] bg-[#3a2f14] text-[#e8c87a]"
            : "border-[#58a6ff] bg-[#132b4d] text-[#c9e2ff]"
        }`}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed="false"
      className={`${base} border-[#30363d] bg-[#0d1117] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]`}
    >
      {children}
    </button>
  );
}
