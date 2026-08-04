/**
 * Proposed public Route History tab, in two variants.
 *
 *   A — an annotated metric trend: the published route speed series leads, with
 *       one numbered marker per change that falls inside it.
 *   B — a chronology first: order, interval and overlap lead, with the speed
 *       series reduced to a faint strip underneath.
 *
 * Both read the same episodes and the same published series, so the comparison
 * is about information architecture rather than about data. Neither carries a
 * current-treatment inventory, a source index or a data-status summary: if it
 * has a date it is history, and if it is a condition it belongs to the metric
 * that measures it.
 */

import type { PublicInterventionEpisode } from "@bp/domain/studio/public-intervention-episodes";
import { ChangeEntry } from "@/components/interventions/PublicChangeEntry";
import { RouteBadge } from "@/components/RouteBadge";
import type { TrendMarker as ChartTrendMarker } from "@/components/route/intervention-trend-model";
import { SectionCard } from "@/components/SectionCard";
import { SpeedTrend } from "@/components/SpeedTrend";
import {
  axisFraction,
  axisMonthFraction,
  type ChronologyAxis,
  chronologyAxis,
  chronologyOverlaps,
  episodesOutsideSeries,
  hasEpisodeInsideSeries,
  packChronologyBands,
  trendMarkers,
} from "@/studio/public-episode-view";

export type RouteHistoryVariant = "trend" | "chronology";

export type RouteHistoryInput = {
  routeKey: string;
  routeId: string;
  routeLabel: string;
  corridor: string | null;
  episodes: readonly PublicInterventionEpisode[];
  speed: readonly { month: string; value: number | null }[];
};

const BAND_TONES = [
  "var(--bp-color-accent)",
  "var(--bp-route-queens)",
  "var(--bp-route-bronx)",
  "var(--bp-route-si)",
  "var(--bp-route-express)",
  "var(--bp-route-brooklyn)",
] as const;

export function PublicRouteHistory({
  input,
  variant,
  showHeader = true,
}: {
  input: RouteHistoryInput;
  variant?: RouteHistoryVariant | undefined;
  showHeader?: boolean | undefined;
}) {
  const resolvedVariant =
    variant ??
    (hasEpisodeInsideSeries(
      input.episodes,
      input.speed.map((point) => point.month),
    )
      ? "trend"
      : "chronology");
  return (
    <div className="flex flex-col gap-5">
      {showHeader ? (
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--bp-color-rule)] pb-4">
          <RouteBadge route={input.routeId} displayLabel={input.routeLabel} size="lg" />
          <div className="min-w-0">
            {/* The badge beside it already names the route. */}
            <h1 className="m-0 text-[22px] font-semibold leading-tight tracking-[-0.02em]">
              History
            </h1>
            {input.corridor === null ? null : (
              <p className="mt-0.5 text-[12.5px] text-[var(--bp-color-ink-55)]">{input.corridor}</p>
            )}
          </div>
        </header>
      ) : null}

      {resolvedVariant === "trend" ? (
        <TrendVariant input={input} />
      ) : (
        <ChronologyVariant input={input} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant A — annotated metric trend
// ---------------------------------------------------------------------------

function TrendVariant({ input }: { input: RouteHistoryInput }) {
  const months = input.speed.map((point) => point.month);
  const markers = trendMarkers(input.episodes, months);
  const numbers = markerNumbers(markers);
  const before = episodesOutsideSeries(input.episodes, months);
  const inWindow = input.episodes.filter((episode) => numbers.has(episode.episodeId));
  const firstMonth = months[0];

  return (
    <>
      <SectionCard
        title="Average speed, and the changes inside it"
        sub="Monthly average speed for this route. Numbered marks are the changes that fall inside the record."
      >
        <SpeedTrend
          mode="calendar"
          points={input.speed}
          markers={markers.map(toChartMarker)}
          height={230}
          seriesLabel={`${input.routeLabel} average speed (mph)`}
          tone="var(--bp-color-accent)"
        />
        <p className="mt-2.5 max-w-[74ch] text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          A mark shows the month a change arrived. It does not say the change moved the line: this
          route is not a controlled comparison, and other things changed in the same months.
        </p>
      </SectionCard>

      <SectionCard
        title="Changes inside the speed record"
        sub={
          inWindow.length === 0
            ? "None yet."
            : `${inWindow.length} ${inWindow.length === 1 ? "change" : "changes"}, most recent first.`
        }
      >
        {inWindow.length === 0 ? (
          <p className="text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
            {firstMonth === undefined
              ? "We hold no speed record for this route."
              : `Every source-backed dated change on this route happened before our speed record opens in ${monthLabel(firstMonth)}.`}
          </p>
        ) : (
          <ChangeList episodes={inWindow} numbers={numbers} highlightRouteKey={input.routeKey} />
        )}
      </SectionCard>

      {before.length === 0 ? null : (
        <SectionCard
          title="Changes before the speed record"
          sub={
            firstMonth === undefined
              ? undefined
              : `Our speed record opens in ${monthLabel(firstMonth)}, so these cannot be measured here.`
          }
        >
          <ChangeList episodes={before} numbers={numbers} highlightRouteKey={input.routeKey} />
        </SectionCard>
      )}
    </>
  );
}

function markerNumbers(
  markers: readonly { label: string; episodeIds: readonly string[] }[],
): Map<string, string> {
  const numbers = new Map<string, string>();
  let index = 0;
  for (const marker of markers) {
    for (const episodeId of marker.episodeIds) {
      index += 1;
      numbers.set(episodeId, String(index));
    }
  }
  return numbers;
}

function toChartMarker(marker: {
  month: string;
  label: string;
  episodeIds: readonly string[];
}): ChartTrendMarker {
  // The chart's marker type predates this projection and still carries lineage
  // arrays. They stay empty: a public marker has no record ids to give.
  return {
    month: marker.month,
    label: marker.label,
    count: marker.episodeIds.length,
    eventIds: [],
    occurrenceIds: [],
    treatmentIds: [],
    recordAnchorId: null,
  };
}

// ---------------------------------------------------------------------------
// Variant B — chronology first
// ---------------------------------------------------------------------------

function ChronologyVariant({ input }: { input: RouteHistoryInput }) {
  const months = input.speed.map((point) => point.month);
  const axis = chronologyAxis(input.episodes, months);
  const bands = packChronologyBands(input.episodes, axis);
  const overlaps = chronologyOverlaps(input.episodes);
  const rowCount = bands.reduce((count, band) => Math.max(count, band.row + 1), 0);
  const toneByEpisode = new Map(
    [...bands]
      .sort((left, right) => left.start - right.start)
      .map((band, index) => [band.episodeId, BAND_TONES[index % BAND_TONES.length] as string]),
  );
  const numbers = new Map(
    [...bands]
      .sort((left, right) => left.start - right.start)
      .map((band, index) => [band.episodeId, String(index + 1)]),
  );

  return (
    <>
      <SectionCard
        title="What changed, and in what order"
        sub="Each numbered mark is one dated change, drawn across the interval the sources give it."
      >
        {bands.length === 0 ? (
          <p className="text-[12.5px] text-[var(--bp-color-ink-70)]">
            No source-backed change on this route carries a date we can place on a timeline.
          </p>
        ) : (
          <div
            role="img"
            aria-label={chronologyLabel(input.routeLabel, axis, bands.length, overlaps.length)}
          >
            <div className="relative flex flex-col gap-1.5">
              {overlaps.map((overlap) => (
                <span
                  key={`${overlap.start}:${overlap.end}`}
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 border-x border-dashed border-[var(--bp-color-ink-40)] bg-[repeating-linear-gradient(45deg,var(--bp-color-ink-10)_0_3px,transparent_3px_7px)]"
                  style={{
                    left: percent(axisFraction(overlap.start, axis)),
                    width: percent(
                      Math.max(
                        axisFraction(overlap.end, axis) - axisFraction(overlap.start, axis),
                        0.006,
                      ),
                    ),
                  }}
                />
              ))}
              {Array.from({ length: rowCount }, (_, row) => {
                const rowBands = bands.filter((band) => band.row === row);
                return (
                  <div key={row} className="relative h-[24px]">
                    {rowBands.map((band, index) => (
                      <span key={band.episodeId}>
                        <span
                          className={
                            band.shape === "point"
                              ? "absolute top-0.5 flex size-[19px] items-center justify-center rounded-[2px] font-mono text-[10px] font-bold text-white"
                              : "absolute top-0 flex h-[24px] min-w-[19px] items-center pl-1.5 font-mono text-[10px] font-bold text-white"
                          }
                          style={{
                            left: percent(band.start),
                            background: toneByEpisode.get(band.episodeId),
                            ...(band.shape === "point"
                              ? {}
                              : { width: percent(Math.max(band.end - band.start, 0.012)) }),
                          }}
                        >
                          {numbers.get(band.episodeId)}
                        </span>
                        {/*
                          A band this narrow on a decade-long axis cannot hold its
                          own name, so the name sits beside it, bounded by the gap
                          to the next band in the row so two never collide.
                        */}
                        {labelStyle(band, rowBands[index + 1]) === null ? null : (
                          <span
                            className="absolute top-[4px] truncate text-[11.5px] font-medium text-[var(--bp-color-ink-70)] @max-lg:hidden"
                            style={labelStyle(band, rowBands[index + 1]) ?? undefined}
                          >
                            {band.label}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>

            <SpeedStrip speed={input.speed} axis={axis} />

            <div className="mt-2 flex justify-between border-t border-[var(--bp-color-rule)] pt-2 font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-40)]">
              {axis.ticks.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
          </div>
        )}
        <p className="mt-3 max-w-[74ch] text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          {overlaps.length > 0
            ? "Documented change intervals overlap, so the speed record cannot separate their effects."
            : "No documented change intervals overlap."}
        </p>
      </SectionCard>

      <SectionCard
        title="Every change, most recent first"
        sub={`${input.episodes.length} ${input.episodes.length === 1 ? "change" : "changes"} on this route.`}
      >
        <ChangeList
          episodes={input.episodes}
          numbers={numbers}
          highlightRouteKey={input.routeKey}
          tones={toneByEpisode}
        />
      </SectionCard>
    </>
  );
}

/**
 * Secondary context only. The strip is drawn on the chronology's axis, so it
 * covers just the months the record holds and says nothing about the rest.
 */
function SpeedStrip({
  speed,
  axis,
}: {
  speed: readonly { month: string; value: number | null }[];
  axis: ChronologyAxis;
}) {
  const values = speed.flatMap((point) => (point.value === null ? [] : [point.value]));
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const width = 880;
  const height = 34;
  const nodes = speed.flatMap((point) =>
    point.value === null
      ? []
      : [
          {
            x: axisMonthFraction(point.month, axis) * width,
            y: span <= 0 ? height / 2 : 3 + (1 - (point.value - low) / span) * (height - 6),
          },
        ],
  );
  const path = `M${nodes.map((node) => `${node.x.toFixed(1)} ${node.y.toFixed(1)}`).join(" L")}`;
  const first = speed.find((point) => point.value !== null)?.month;
  const recordStart = first === undefined ? 0 : axisMonthFraction(first, axis);

  return (
    <div className="mt-3 border-t border-[var(--bp-color-rule)] pt-2">
      <div className="mb-1 text-[10.5px] text-[var(--bp-color-ink-55)]">
        {first === undefined
          ? "Average speed"
          : `Average speed, recorded from ${monthLabel(first)}`}
      </div>
      {/*
        The record opens years after the first change, so the months it does not
        cover are marked as such rather than left as blank space that reads like
        a flat line.
      */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,var(--bp-color-ink-06)_0_4px,transparent_4px_8px)]"
          style={{ width: percent(recordStart) }}
        />
        <svg
          className="relative block h-[34px] w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={`${path} L${nodes.at(-1)?.x.toFixed(1) ?? 0} ${height} L${nodes[0]?.x.toFixed(1) ?? 0} ${height} Z`}
            fill="var(--bp-color-ink)"
            opacity="0.06"
          />
          <path d={path} fill="none" stroke="var(--bp-color-ink-40)" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
}

function chronologyLabel(
  routeLabel: string,
  axis: ChronologyAxis,
  changeCount: number,
  overlapCount: number,
): string {
  const changes = `${changeCount} dated ${changeCount === 1 ? "change" : "changes"}`;
  const overlaps =
    overlapCount === 0
      ? "none of them overlap"
      : `${overlapCount} ${overlapCount === 1 ? "period" : "periods"} where changes overlap`;
  return `Changes on the ${routeLabel} from ${axis.startYear} to ${axis.endYear}: ${changes}, ${overlaps}.`;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function ChangeList({
  episodes,
  numbers,
  highlightRouteKey,
  tones,
}: {
  episodes: readonly PublicInterventionEpisode[];
  numbers: ReadonlyMap<string, string>;
  highlightRouteKey: string;
  tones?: ReadonlyMap<string, string>;
}) {
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {episodes.map((episode) => (
        <li
          key={episode.episodeId}
          className="border-t border-[var(--bp-color-rule)] py-4 first:border-t-0 first:pt-0 last:pb-0"
        >
          <ChangeEntry
            episode={episode}
            markerNumber={numbers.get(episode.episodeId)}
            markerTone={tones?.get(episode.episodeId)}
            highlightRouteKey={highlightRouteKey}
          />
        </li>
      ))}
    </ol>
  );
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

/** Below this share of the axis a label has no room to say anything. */
const MIN_LABEL_FRACTION = 0.07;
/** A point marker is this wide, so its label starts clear of it. */
const POINT_MARKER_PX = 19;

/**
 * Where a band's label sits and how wide it may be. The gap to the next band in
 * the row is the budget: no label is drawn when the gap cannot hold one, and no
 * label may run into its neighbour.
 */
function labelStyle(
  band: { start: number; end: number; shape: "point" | "bar" },
  next: { start: number } | undefined,
): { left: string; maxWidth: string } | null {
  const bandEnd = band.shape === "point" ? band.start : Math.max(band.start, band.end);
  const offset = band.shape === "point" ? POINT_MARKER_PX + 5 : 8;
  const gap = next === undefined ? 1 - bandEnd : next.start - bandEnd;
  if (gap < MIN_LABEL_FRACTION) return null;
  return {
    left: `calc(${percent(bandEnd)} + ${offset}px)`,
    maxWidth: `calc(${percent(gap)} - ${offset + 6}px)`,
  };
}

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function monthLabel(isoMonth: string): string {
  const month = MONTH_LABELS[Number(isoMonth.slice(5, 7)) - 1];
  return month === undefined ? isoMonth : `${month} ${isoMonth.slice(0, 4)}`;
}
