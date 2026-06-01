import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { HourStrip } from "@/components/HourStrip";
import { Rail, RailRule, RailSection } from "@/components/Rail";
import { RouteHeaderCompact } from "@/components/RouteHeader";
import { TreatmentRow } from "@/components/TreatmentRow";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteLadderResponse, StudioSegment } from "../api-contract.js";
import { StudioPage } from "../page.js";
import { NotFoundPage } from "./not-found.js";

type Phase = "idle" | "guessing" | "revealed";

export function RouteLadderPage({ data }: { data: StudioRouteLadderResponse | null }) {
  if (data === null) return <NotFoundPage />;
  const { route, segments } = data;

  const sortedByImpact = [...segments].sort((a, b) => b.riderHours - a.riderHours);
  const topImpactId = sortedByImpact[0]?.id;

  const [selectedId, setSelectedId] = useState<string | null>(topImpactId ?? null);
  const [challengePhase, setChallengePhase] = useState<Phase>("idle");
  const [guessId, setGuessId] = useState<string | null>(null);
  const speedsHidden = challengePhase === "guessing";

  function handleSegmentClick(segment: StudioSegment) {
    if (challengePhase === "guessing") {
      setGuessId(segment.id);
      setChallengePhase("revealed");
      setSelectedId(segment.id);
      return;
    }
    setSelectedId(segment.id);
  }

  function resetChallenge() {
    setChallengePhase("idle");
    setGuessId(null);
    setSelectedId(topImpactId ?? null);
  }

  const selected = segments.find((s) => s.id === selectedId) ?? null;

  return (
    <StudioPage flush>
      <div className="grid min-h-full grid-cols-[240px_minmax(0,1fr)_360px] max-xl:grid-cols-[200px_minmax(0,1fr)] max-lg:grid-cols-1">
        <Rail edge="left" className="gap-[22px] p-[22px]">
          <RailSection eyebrow="What you're looking at">
            <p className="m-0 text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
              {route.label}
              {route.sbs ? " SBS" : ""} as a vertical ladder - north at the top, south at the
              bottom. The spine is colored by bus-lane continuity.{" "}
              <span className="font-semibold text-[var(--bp-color-bad)]">Click any segment</span> to
              focus.
            </p>
          </RailSection>
          <RailRule />
          <RailSection eyebrow="Legend">
            <div className="flex flex-col gap-2.5 text-[11.5px] text-[var(--bp-color-ink-70)]">
              <LegendRow
                swatch="bar"
                color="var(--bp-color-bad)"
                label="< 5.0 mph"
                sub="below pedestrian pace"
              />
              <LegendRow
                swatch="bar"
                color="var(--bp-color-warn)"
                label="5.0 – 6.5 mph"
                sub="slow"
              />
              <LegendRow
                swatch="bar"
                color="var(--bp-color-ink-40)"
                label="> 6.5 mph"
                sub="nominal"
              />
              <LegendRow
                swatch="tall"
                color="var(--bp-color-accent)"
                label="Scheduled"
                sub="timepoint pace"
              />
            </div>
          </RailSection>
          <RailRule />
          <RailSection eyebrow="Spine = lane coverage">
            <div className="flex flex-col gap-1.5 text-[11.5px] text-[var(--bp-color-ink-70)]">
              <LegendRow swatch="block" color="var(--bp-color-good)" label="Full lane" />
              <LegendRow swatch="block" color="var(--bp-color-warn)" label="Partial" />
              <LegendRow swatch="block" color="var(--bp-color-ink-20)" label="None" />
            </div>
          </RailSection>
          <RailRule />
          <RailSection eyebrow="Story">
            <p className="m-0 text-[12px] leading-[1.6] text-[var(--bp-color-ink-70)]">
              One segment{" "}
              <strong className="font-semibold text-[var(--bp-color-bad)]">
                breaks the pattern
              </strong>
              : Madison Av - E 28-58 St. It&apos;s the only spine break in the route&apos;s bus-lane
              coverage, and it carries the highest rider-hour delay of any segment.
            </p>
          </RailSection>
          <RailRule />
          <RailSection eyebrow="Analyst challenge">
            {challengePhase === "idle" ? (
              <>
                <p className="mb-2.5 mt-0 text-[11.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                  Can you read the worst corridor from treatments alone - before seeing the speed
                  numbers?
                </p>
                <button
                  type="button"
                  onClick={() => setChallengePhase("guessing")}
                  className="flex w-full items-center justify-between rounded-[3px] bg-[var(--bp-color-ink)] px-3 py-2.5 text-[12px] font-semibold text-[var(--bp-color-paper)]"
                >
                  <span>Hide speeds - guess first</span>
                  <span className="opacity-55">&rarr;</span>
                </button>
              </>
            ) : challengePhase === "guessing" ? (
              <div className="rounded-[3px] bg-[var(--bp-color-accent-bg)] p-3 text-[12px] leading-[1.6] text-[var(--bp-color-accent)]">
                Which segment has the highest rider-hour delay?{" "}
                <strong className="font-bold">Click a segment to commit your guess.</strong>
              </div>
            ) : (
              <ChallengeReveal
                correct={guessId === topImpactId}
                guessed={segments.find((s) => s.id === guessId) ?? null}
                topSegment={sortedByImpact[0] ?? null}
                onReset={resetChallenge}
              />
            )}
          </RailSection>
        </Rail>

        <main className="min-w-0 overflow-auto p-7 max-sm:p-4">
          <RouteHeaderCompact
            routeLabel={route.label}
            sbs={route.sbs}
            title={route.corridorFull}
            meta={
              <>
                {route.borough} &middot; {route.termini.north} &harr; {route.termini.south} &middot;{" "}
                {route.miles} mi &middot; {route.stops} stops
              </>
            }
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
          <div className="grid grid-cols-[1fr_64px_1fr] gap-4 px-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            <span className="text-right">Observed speed</span>
            <span className="text-center">Treatments</span>
            <span>Segment</span>
          </div>
          <div className="mt-3 rounded-[3px] bg-[var(--bp-color-card)] py-2 text-center text-[11.5px] font-semibold tracking-[0.02em] text-[var(--bp-color-ink-70)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            {route.termini.north}
          </div>
          <ol className="relative m-0 mt-3 list-none p-0">
            <div
              aria-hidden
              className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 bg-[var(--bp-color-ink-20)]"
            />
            <div className="relative space-y-5">
              {segments.map((segment, index) => {
                const isSelected = selected?.id === segment.id;
                const isTop = segment.id === topImpactId;
                const bad = segment.speedMph < 5;
                const warn = segment.speedMph < 6.5;
                const spineColor =
                  segment.lane === "yes"
                    ? "var(--bp-color-good)"
                    : segment.lane === "partial"
                      ? "var(--bp-color-warn)"
                      : "var(--bp-color-bad)";
                return (
                  <li
                    key={segment.id}
                    className="relative grid grid-cols-[1fr_64px_1fr] items-center gap-4"
                  >
                    <div className="text-right">
                      <div
                        className="font-mono text-[20px] font-semibold tabular-nums leading-none"
                        style={{
                          color: bad
                            ? "var(--bp-color-bad)"
                            : warn
                              ? "var(--bp-color-warn)"
                              : "var(--bp-color-good)",
                          filter: speedsHidden ? "blur(8px)" : undefined,
                        }}
                      >
                        {segment.speedMph.toFixed(1)}
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-[var(--bp-color-ink-55)]">
                        mph observed
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSegmentClick(segment)}
                      className="relative z-10 flex h-[52px] w-[52px] items-center justify-center justify-self-center rounded-full bg-[var(--bp-color-paper)] font-mono text-[12px] font-bold transition-shadow"
                      style={{
                        boxShadow: isSelected
                          ? `inset 0 0 0 3px ${spineColor}`
                          : "inset 0 0 0 2px var(--bp-color-ink)",
                        color: isSelected ? spineColor : "var(--bp-color-ink)",
                      }}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </button>
                    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-3 text-left shadow-[0_0_0_1px_var(--bp-color-rule)]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[12.5px] font-semibold">
                          {segment.from} {"→"} {segment.to}
                        </div>
                        {isTop && challengePhase !== "guessing" ? (
                          <Badge variant="accent">top impact</Badge>
                        ) : null}
                      </div>
                      <div className="mt-2">
                        <HourStrip hours={segment.hours} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-55)]">
                          {segment.riderHours.toLocaleString()} RH/day
                        </span>
                        <TreatmentRow lane={segment.lane} ace={segment.ace} tsp={segment.tsp} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </div>
          </ol>
          <div className="mt-3 rounded-[3px] bg-[var(--bp-color-card)] py-2 text-center text-[11.5px] font-semibold tracking-[0.02em] text-[var(--bp-color-ink-70)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
            {route.termini.south}
          </div>
          <p className="mt-4 text-center text-[11px] text-[var(--bp-color-ink-55)]">
            Click any segment to focus its detail.
          </p>
        </main>

        <Rail edge="right" className="gap-4 p-[22px] max-xl:hidden">
          {selected ? (
            <SelectedSegmentDetail segment={selected} routeSlug={route.slug} />
          ) : (
            <RailSection>
              <div className="text-[12.5px] text-[var(--bp-color-ink-55)]">
                Select a segment on the ladder to see its detail.
              </div>
            </RailSection>
          )}
        </Rail>
      </div>
    </StudioPage>
  );
}

function LegendRow({
  swatch,
  color,
  label,
  sub,
}: {
  swatch: "bar" | "tall" | "block";
  color: string;
  label: string;
  sub?: string;
}) {
  const shape =
    swatch === "tall"
      ? "h-[18px] w-[6px]"
      : swatch === "block"
        ? "h-[22px] w-[22px] rounded-[2px]"
        : "h-[6px] w-[32px] rounded-[1px]";
  return (
    <div className="flex items-center gap-2.5">
      <span className={shape} style={{ background: color }} />
      <div>
        <div className="text-[11.5px] font-medium text-[var(--bp-color-ink)]">{label}</div>
        {sub ? <div className="text-[10px] text-[var(--bp-color-ink-55)]">{sub}</div> : null}
      </div>
    </div>
  );
}

function ChallengeReveal({
  correct,
  guessed,
  topSegment,
  onReset,
}: {
  correct: boolean;
  guessed: StudioSegment | null;
  topSegment: StudioSegment | null;
  onReset: () => void;
}) {
  if (!topSegment) return null;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="rounded-[3px] p-3 text-[12px] leading-[1.55]"
        style={{
          background: correct ? "var(--bp-color-good-bg)" : "var(--bp-color-warn-bg)",
          color: correct ? "var(--bp-color-good)" : "var(--bp-color-warn)",
        }}
      >
        <strong>{correct ? "✓ Correct." : "Not quite."}</strong>{" "}
        {!correct && guessed ? (
          <>
            You picked <strong className="text-[var(--bp-color-ink)]">{guessed.from}</strong>.
            <br />
          </>
        ) : null}
        <span className="text-[var(--bp-color-ink-70)]">
          The worst by rider-hours is{" "}
          <strong className="text-[var(--bp-color-ink)]">
            {topSegment.from} - {topSegment.to}
          </strong>{" "}
          ({topSegment.riderHours.toLocaleString()} rider-hours/day).{" "}
          {topSegment.aiNote ?? "Compare its treatments to its neighbors."}
        </span>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="rounded-[3px] border border-[var(--bp-color-rule)] bg-transparent px-2.5 py-1.5 text-left text-[11.5px] text-[var(--bp-color-ink-70)]"
      >
        Reset challenge
      </button>
    </div>
  );
}

function SelectedSegmentDetail({
  segment,
  routeSlug,
}: {
  segment: StudioSegment;
  routeSlug: string;
}) {
  const bad = segment.speedMph < 5;
  const warn = segment.speedMph < 6.5;
  return (
    <>
      <RailSection eyebrow="Selected segment">
        <div className="text-[17px] font-semibold leading-[1.2] tracking-[-0.015em]">
          {segment.from} {"→"} {segment.to}
        </div>
        <div className="mt-1 font-mono text-[11px] text-[var(--bp-color-ink-55)]">
          {segment.direction} &middot; Mar 2026 &middot; weekday median
        </div>
      </RailSection>
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-3.5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <div className="flex items-baseline gap-3">
          <div
            className="font-mono text-[38px] font-semibold tabular-nums leading-none tracking-[-0.03em]"
            style={{
              color: bad
                ? "var(--bp-color-bad)"
                : warn
                  ? "var(--bp-color-warn)"
                  : "var(--bp-color-ink)",
            }}
          >
            {segment.speedMph.toFixed(1)}
          </div>
          <div>
            <div className="text-[12px] font-semibold">mph weekday avg</div>
            <div className="mt-0.5 font-mono text-[10.5px] tabular-nums text-[var(--bp-color-ink-55)]">
              vs{" "}
              <strong className="font-semibold text-[var(--bp-color-accent)]">
                {segment.scheduledMph.toFixed(1)}
              </strong>{" "}
              scheduled &middot;{" "}
              <strong className="font-semibold text-[var(--bp-color-bad)]">
                -{(segment.scheduledMph - segment.speedMph).toFixed(1)}
              </strong>
            </div>
          </div>
        </div>
      </div>
      <RailSection eyebrow="Severity by hour">
        <HourStrip hours={segment.hours} />
      </RailSection>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-3 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <div className="text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
            Treatments
          </div>
          <div className="mt-2">
            <TreatmentRow lane={segment.lane} ace={segment.ace} tsp={segment.tsp} align="start" />
          </div>
        </div>
        <div className="rounded-[3px] bg-[var(--bp-color-card)] p-3 shadow-[0_0_0_1px_var(--bp-color-rule)]">
          <div className="text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
            Rider-hours / day
          </div>
          <div
            className="mt-1 font-mono text-[22px] font-semibold tabular-nums leading-none tracking-[-0.02em]"
            style={{
              color: segment.riderHours > 15000 ? "var(--bp-color-bad)" : "var(--bp-color-ink)",
            }}
          >
            {segment.riderHours.toLocaleString()}
          </div>
        </div>
      </div>
      {segment.aiNote ? (
        <p className="m-0 flex items-start gap-2 text-[11.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          <span className="mt-[2px] shrink-0 font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
            &#9670;
          </span>
          <span>{segment.aiNote}</span>
        </p>
      ) : null}
      <div className="mt-auto flex flex-col gap-1.5">
        <Link
          to="/briefs/new"
          search={{ route: routeSlug }}
          viewTransition
          className="flex w-full items-center justify-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] py-2 text-[12.5px] font-semibold text-[var(--bp-color-paper)] no-underline"
        >
          Send to brief
          <ArrowRight size={13} />
        </Link>
      </div>
    </>
  );
}
