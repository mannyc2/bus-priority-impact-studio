import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Rail, RailRule } from "@/components/Rail";
import { RouteBadge } from "@/components/RouteBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { ComparableRoute, ReasoningStep, StudioFindingResponse } from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

function categoryChip(category: string) {
  if (category === "Anomaly")
    return { bg: "var(--bp-color-bad-bg)", fg: "var(--bp-color-bad)", label: "ANOMALY" };
  if (category === "Treatment gap")
    return { bg: "var(--bp-color-warn-bg)", fg: "var(--bp-color-warn)", label: "TREATMENT GAP" };
  return { bg: "var(--bp-color-accent-bg)", fg: "var(--bp-color-accent)", label: "EMERGING RISK" };
}

function reviewBadge(finding: StudioFindingResponse["finding"]) {
  const state = finding.review?.publicationState ?? "generated_candidate";
  if (state === "reviewed") {
    return { label: "Reviewed", variant: "good" as const };
  }
  if (state === "review_candidate") {
    return { label: "Review candidate", variant: "warn" as const };
  }
  return { label: "Generated", variant: "neutral" as const };
}

export function FindingDetailPage({ data }: { data: StudioFindingResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { finding, route } = data;
  const chip = categoryChip(finding.category);
  const metricColor = chip.fg;
  const review = reviewBadge(finding);

  return (
    <StudioPage flush>
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] overflow-hidden max-lg:grid-cols-1">
        <article className="overflow-auto px-9 py-7 max-sm:px-4">
          <div className="mb-1.5 flex items-center gap-3">
            <RouteBadge route={route.label} sbs={route.sbs} size="lg" />
            <span
              className="rounded-[2px] px-1.5 py-[2px] font-mono text-[9.5px] font-bold tracking-[0.08em]"
              style={{ background: chip.bg, color: chip.fg }}
            >
              {chip.label}
            </span>
            <Badge variant={review.variant}>{review.label}</Badge>
          </div>
          <h1 className="m-0 max-w-[680px] text-[26px] font-semibold leading-[1.15] tracking-[-0.02em]">
            {finding.title}
          </h1>
          <div className="mb-7 mt-1.5 flex items-center gap-2 font-mono text-[10px] tracking-[0.04em]">
            <span className="font-bold text-[var(--bp-color-ink-55)]">
              &#9670; AI reasoning trail
            </span>
            <span className="text-[var(--bp-color-ink-40)]">
              {finding.reasoning.length} sources &middot; {finding.confidence} confidence
              {finding.review?.detectorId ? ` · ${finding.review.detectorId}` : ""}
            </span>
          </div>
          <ol className="relative m-0 list-none pl-8">
            <div
              aria-hidden
              className="absolute left-[9px] top-2 bottom-2 w-px bg-[var(--bp-color-rule)]"
            />
            {finding.reasoning.map((step) => (
              <ReasoningStepRow key={step.index} step={step} />
            ))}
          </ol>
          <Alert variant="warn" className="mt-2">
            <AlertTitle variant="warn">{finding.caveat.title}</AlertTitle>
            <AlertDescription>{finding.caveat.body}</AlertDescription>
          </Alert>
        </article>
        <Rail edge="right" className="!p-0">
          <div className="bg-[var(--bp-color-card)] px-6 py-5 shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
            <div
              className="font-mono text-[40px] font-bold tabular-nums leading-none tracking-[-0.03em]"
              style={{ color: metricColor }}
            >
              {finding.metric}
            </div>
            <div className="mt-1.5 text-[12px] text-[var(--bp-color-ink-55)]">
              PM-peak trend over 14 months
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto p-5">
            <div className="flex flex-col gap-2">
              <Link
                to="/routes/$routeId"
                params={{ routeId: route.slug }}
                viewTransition
                className="flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] py-2 text-[12.5px] font-semibold text-[var(--bp-color-paper)] no-underline"
              >
                Open {route.label}
                {route.sbs ? " SBS" : ""} route
                <ArrowRight size={13} />
              </Link>
              <Link
                to="/briefs/new"
                search={{ finding: finding.id }}
                viewTransition
                className="flex w-full items-center justify-center rounded-[3px] border border-[var(--bp-color-ink-20)] py-2 text-[12.5px] font-medium text-[var(--bp-color-ink)] no-underline"
              >
                Start brief from this finding
              </Link>
              <button
                type="button"
                className="text-[11.5px] font-medium text-[var(--bp-color-ink-55)] underline-offset-2 hover:underline"
              >
                Save to workspace
              </button>
            </div>
            {finding.comparableRoutes.length > 0 ? (
              <>
                <RailRule />
                <div>
                  <div className="mb-3 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
                    Comparable routes
                  </div>
                  <ul className="m-0 list-none space-y-2 p-0">
                    {finding.comparableRoutes.map((peer) => (
                      <ComparableRouteRow key={peer.slug} peer={peer} />
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </div>
        </Rail>
      </div>
    </StudioPage>
  );
}

function ReasoningStepRow({ step }: { step: ReasoningStep }) {
  const dotColor =
    step.tone === "warn"
      ? "var(--bp-color-warn)"
      : step.tone === "good"
        ? "var(--bp-color-good)"
        : step.tone === "accent"
          ? "var(--bp-color-accent)"
          : "var(--bp-color-ink-40)";
  return (
    <li className="relative mb-7">
      <span
        aria-hidden
        className="absolute -left-[32px] top-1.5 h-2.5 w-2.5 rounded-full shadow-[0_0_0_3px_var(--bp-color-paper)]"
        style={{ background: dotColor }}
      />
      <div className="mb-1 font-mono text-[10px] font-bold tracking-[0.04em] text-[var(--bp-color-ink-55)]">
        {String(step.index).padStart(2, "0")} &middot; {step.title}
      </div>
      <p
        className="mb-1.5 m-0 text-[14px] leading-[1.55] text-[var(--bp-color-ink)]"
        style={{ fontWeight: step.tone === "accent" ? 500 : 400 }}
      >
        {step.detail}
      </p>
      <div className="inline-block rounded-[3px] bg-[var(--bp-color-ink-06)] px-2 py-1 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
        {step.source}
      </div>
    </li>
  );
}

function ComparableRouteRow({ peer }: { peer: ComparableRoute }) {
  const toneColor =
    peer.outcome === "reversed"
      ? "var(--bp-color-good)"
      : peer.outcome === "declining"
        ? "var(--bp-color-bad)"
        : "var(--bp-color-warn)";
  return (
    <li>
      <Link
        to="/routes/$routeId"
        params={{ routeId: peer.slug }}
        viewTransition
        className="grid grid-cols-[auto_1fr_auto] items-center gap-2.5 rounded-[3px] bg-[var(--bp-color-card)] px-3 py-2.5 text-[var(--bp-color-ink)] no-underline shadow-[inset_0_0_0_1px_var(--bp-color-rule)]"
      >
        <RouteBadge route={peer.label} sbs={peer.sbs} size="sm" />
        <div className="min-w-0">
          <div className="text-[11.5px] font-medium">
            {peer.outcome === "reversed"
              ? "Reversed"
              : peer.outcome === "flat"
                ? "Flat"
                : "Still declining"}
          </div>
          <div className="text-[10px] text-[var(--bp-color-ink-55)]">{peer.detail}</div>
        </div>
        <div className="font-mono text-[12px] font-bold tabular-nums" style={{ color: toneColor }}>
          {peer.delta}
        </div>
      </Link>
    </li>
  );
}
