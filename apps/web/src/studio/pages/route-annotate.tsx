import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { ClaimList } from "@/components/ClaimList";
import { Rail } from "@/components/Rail";
import { RouteHeaderCompact } from "@/components/RouteHeader";
import { SegmentRow, SegmentRowHeader } from "@/components/SegmentRow";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse, StudioSegment } from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

export function RouteAnnotatePage({ data }: { data: StudioRouteDetailResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { route, segments } = data;

  const [selectedId, setSelectedId] = useState<string | null>(
    segments.find((s) => s.flagged)?.id ?? segments[0]?.id ?? null,
  );
  const [draftClaims, setDraftClaims] = useState<{ n: number; title: string; strength: number }[]>([
    {
      n: 1,
      title: `${route.label}${route.sbs ? " SBS" : ""} is the slowest SBS route in Manhattan`,
      strength: 5,
    },
    { n: 2, title: "A single corridor accounts for 43% of measured delay", strength: 4 },
    { n: 3, title: "ACE rollout coincides with +0.7 mph PM-peak gain", strength: 3 },
    { n: 4, title: "Treatment gap on Madison Av", strength: 2 },
  ]);

  function seedClaim(text: string) {
    setDraftClaims((current) => [...current, { n: current.length + 1, title: text, strength: 3 }]);
  }

  return (
    <StudioPage flush>
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_360px] overflow-hidden max-lg:grid-cols-1">
        <main className="overflow-auto p-7 max-sm:p-4">
          <RouteHeaderCompact
            routeLabel={route.label}
            sbs={route.sbs}
            title={route.corridorFull}
            meta={<>{route.borough} &middot; annotating</>}
            right={
              <Link
                to="/routes/$routeId"
                params={{ routeId: route.slug }}
                viewTransition
                className="inline-flex h-8 items-center gap-1.5 rounded-[3px] border border-[var(--bp-color-ink-20)] bg-[var(--bp-color-card-raised)] px-3 text-[12px] font-medium text-[var(--bp-color-ink)] no-underline"
              >
                <ChevronLeft size={14} />
                Route detail
              </Link>
            }
          />
          <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-[16px] font-semibold tracking-[-0.01em]">
                Top slow segments by rider-hours lost
              </h2>
              <p className="mt-1 max-w-[620px] text-[12px] leading-normal text-[var(--bp-color-ink-70)]">
                Select a segment to start a claim from it. Click any metric to attach as evidence.
              </p>
            </div>
            <Badge variant="accent">SELECT MODE</Badge>
          </div>
          <div className="overflow-x-auto rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            <div className="min-w-[760px]">
              <SegmentRowHeader />
              {segments.slice(0, 5).map((segment) => (
                <div key={segment.id}>
                  <SegmentRow
                    dir={segment.direction}
                    from={segment.from}
                    to={segment.to}
                    mph={segment.speedMph}
                    sched={segment.scheduledMph}
                    riderHours={segment.riderHours}
                    hours={segment.hours}
                    lane={segment.lane}
                    ace={segment.ace}
                    tsp={segment.tsp}
                    noteOpen={selectedId === segment.id}
                    {...(segment.flagged ? { flag: "top" as const } : {})}
                    onClick={() => setSelectedId(segment.id)}
                  />
                  {selectedId === segment.id ? (
                    <InlineClaimSeed
                      segment={segment}
                      onSeed={(text) => seedClaim(text)}
                      briefId="m15-madison-corridor"
                      routeSlug={route.slug}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 text-[11.5px] text-[var(--bp-color-ink-55)]">
            Showing 5 of {segments.length} timepoint segments.
          </div>
          </section>
        </main>
        <Rail edge="right" className="gap-4 p-[22px]">
          <section>
            <div className="mb-1 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
              Brief in progress
            </div>
            <div className="text-[14px] font-semibold">
              {route.label}
              {route.sbs ? " SBS" : ""} - Madison corridor
            </div>
            <div className="text-[11.5px] text-[var(--bp-color-ink-55)]">draft v0.4</div>
          </section>
          <ClaimList
            density="compact"
            claims={draftClaims.map((c, i) => ({
              n: c.n,
              title: c.title,
              strength: c.strength,
              evidence: 2,
              caveats: 1,
              editing: i === draftClaims.length - 1,
            }))}
          />
          <div className="mt-auto flex flex-col gap-2">
            <Link
              to="/briefs/$briefId/edit"
              params={{ briefId: "m15-madison-corridor" }}
              viewTransition
              className="flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] py-2 text-[12.5px] font-semibold text-[var(--bp-color-paper)] no-underline"
            >
              Open full composer
              <ArrowRight size={13} />
            </Link>
            <Link
              to="/briefs/$briefId"
              params={{ briefId: "m15-madison-corridor" }}
              viewTransition
              className="flex w-full items-center justify-center rounded-[3px] border border-[var(--bp-color-ink-20)] py-2 text-[12.5px] font-medium text-[var(--bp-color-ink)] no-underline"
            >
              Preview brief
            </Link>
          </div>
        </Rail>
      </div>
    </StudioPage>
  );
}

function InlineClaimSeed({
  segment,
  onSeed,
  briefId,
  routeSlug,
}: {
  segment: StudioSegment;
  onSeed: (text: string) => void;
  briefId: string;
  routeSlug: string;
}) {
  const seeds =
    segment.suggestedSeeds && segment.suggestedSeeds.length > 0
      ? segment.suggestedSeeds
      : [
          `${segment.from} -> ${segment.to} drives a large share of route delay`,
          `Buses run slower than scheduled on ${segment.from} - ${segment.to}`,
          `Treatment coverage is incomplete on this segment`,
        ];
  return (
    <div className="bg-[var(--bp-color-ink)] p-4 text-[var(--bp-color-paper)] shadow-[inset_0_-1px_0_var(--bp-color-rule)]">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] opacity-70">
        Start a claim
      </div>
      <div className="mt-1 text-[12px] opacity-90">
        from {segment.from} {"→"} {segment.to} ({segment.direction}) &middot;{" "}
        {segment.miles?.toFixed(1) ?? "-"} mi &middot; {segment.timepoints ?? "-"} timepoints
      </div>
      <div className="mt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] opacity-70">
        Suggested claim seeds
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 max-md:grid-cols-1">
        {seeds.map((text, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSeed(text)}
            className={
              i === 0
                ? "rounded-[3px] bg-[var(--bp-color-accent)] p-3 text-left text-[12px] font-medium text-white"
                : "rounded-[3px] bg-[var(--bp-color-paper)] p-3 text-left text-[12px] font-medium text-[var(--bp-color-ink)]"
            }
          >
            {text}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Link
          to="/briefs/$briefId/edit"
          params={{ briefId }}
          viewTransition
          className="inline-flex h-8 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-paper)] px-3 text-[12px] font-medium text-[var(--bp-color-ink)] no-underline"
        >
          Open in composer
          <ArrowRight size={13} />
        </Link>
        <Link
          to="/briefs/new"
          search={{ route: routeSlug }}
          viewTransition
          className="text-[11.5px] font-medium text-[var(--bp-color-paper)] opacity-70 no-underline"
        >
          Attach as evidence only
        </Link>
      </div>
    </div>
  );
}
