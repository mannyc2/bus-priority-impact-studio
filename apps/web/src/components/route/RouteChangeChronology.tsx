import type { ReactNode } from "react";
import {
  axisMonthFraction,
  type ChronologyAxis,
  type ChronologyBand,
  type RouteChangeChronology as RouteChangeChronologyModel,
} from "@/components/route/route-change-chronology";
import type { TrendPoint } from "@/components/route/route-derived";

type ChronologyBandView = ChronologyBand;

const VIEWBOX_WIDTH = 880;
const VIEWBOX_HEIGHT = 80;
/** Keeps the context line off both edges of its box. */
const SPEED_PADDING = 8;
/** Point-precision changes render as a fixed marker, never a 1-day-wide bar. */
const POINT_MARKER_PX = 17;
/** Room a point marker's label needs before the next band in its row. */
const MIN_POINT_LABEL_FRACTION = 0.18;

/**
 * The chronology card: a faint speed line for context, one band per change
 * positioned by its date interval, and a hatched region wherever two or more
 * bands intersect. The overlap is the payload — it is the one thing no metric
 * tab can show. Colour never carries it alone: every overlapping change repeats
 * the claim in words in its own entry below.
 *
 * `children` are the change entries, which live inside this card in the
 * approved comp rather than in a second one.
 */
export function RouteChangeChronology({
  chronology,
  routeLabel,
  speedPoints,
  children,
}: {
  chronology: RouteChangeChronologyModel;
  routeLabel: string;
  speedPoints: readonly TrendPoint[];
  children?: ReactNode;
}) {
  const { axis, bands, overlaps } = chronology;
  const rowCount = bands.reduce((count, band) => Math.max(count, band.row + 1), 0);
  const speed = speedPath(speedPoints, axis);

  return (
    <section className="overflow-hidden rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="border-b border-[var(--bp-color-rule)] p-[17px]">
        <h2 className="m-0 text-[16.5px] font-semibold leading-tight tracking-[-0.015em]">
          What changed, and what changed with it
        </h2>
        <p className="mt-1 max-w-[78ch] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          Each bar is a change, drawn across the period it was being built or rolled out. Where bars
          overlap, the two changes cannot be told apart in the data.
        </p>
      </div>

      {bands.length === 0 ? (
        <p className="px-[17px] py-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
          No change on this route carries a date we can place on a timeline.
        </p>
      ) : (
        <div
          className="px-[17px] pt-4 pb-1.5"
          role="img"
          aria-label={chronologyLabel(routeLabel, axis, bands.length, overlaps.length)}
        >
          {speed === null ? null : (
            <div className="relative h-20">
              <span className="absolute left-0 top-[-2px] text-[11px] text-[var(--bp-color-ink-55)]">
                Average speed
              </span>
              <svg
                className="block h-full w-full"
                viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <title>Average speed context</title>
                {speed.areas.map((area) => (
                  <path key={area} d={area} fill="var(--bp-color-accent)" opacity="0.07" />
                ))}
                {speed.lines.map((line) => (
                  <path
                    key={line}
                    d={line}
                    fill="none"
                    stroke="var(--bp-color-accent)"
                    strokeWidth="1.5"
                  />
                ))}
              </svg>
            </div>
          )}

          <div className="relative mt-2 flex flex-col gap-[5px] pt-4">
            {overlaps.map((overlap) => (
              <span
                key={`${overlap.start}:${overlap.end}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 border-x border-dashed border-[var(--bp-color-ink-40)] bg-[repeating-linear-gradient(45deg,var(--bp-color-ink-10)_0_3px,transparent_3px_7px)]"
                style={overlapStyle(overlap.start, overlap.end, axis)}
              />
            ))}
            {overlaps.map((overlap) => (
              <span
                key={`label:${overlap.start}`}
                aria-hidden="true"
                className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10.5px] text-[var(--bp-color-ink-55)]"
                style={{ left: overlapCenter(overlap.start, overlap.end, axis) }}
              >
                {`${overlap.changeKeys.length} changes at once`}
              </span>
            ))}
            {Array.from({ length: rowCount }, (_, row) => (
              <div key={row} className="relative h-[25px]">
                {bands
                  .filter((band) => band.row === row)
                  .map((band, index, rowBands) =>
                    band.shape === "point" ? (
                      <span key={band.changeKey}>
                        <span
                          className="absolute top-1 h-[17px] w-[17px] rounded-[2px]"
                          style={{ left: percent(band.start), background: band.color }}
                        />
                        {labelFits(band, rowBands[index + 1]) ? (
                          <span
                            className="absolute top-[5px] whitespace-nowrap text-[11.5px] font-semibold text-[var(--bp-color-ink-70)] max-md:hidden"
                            style={{
                              left: `calc(${percent(band.start)} + ${POINT_MARKER_PX + 4}px)`,
                            }}
                          >
                            {band.label}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span
                        key={band.changeKey}
                        className="absolute top-0 flex h-[25px] items-center overflow-hidden rounded-[2px] px-[9px] text-[11.5px] font-semibold whitespace-nowrap text-white"
                        style={{
                          left: percent(band.start),
                          width: percent(Math.max(band.end - band.start, 0.01)),
                          background: band.color,
                        }}
                      >
                        {band.label}
                      </span>
                    ),
                  )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex justify-between border-t border-[var(--bp-color-rule)] pt-2 font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-40)]">
            {axis.ticks.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
        </div>
      )}

      {children}
    </section>
  );
}

function chronologyLabel(
  routeLabel: string,
  axis: ChronologyAxis,
  changeCount: number,
  overlapCount: number,
): string {
  const span = `${axis.startYear} to ${axis.endYear}`;
  const changes = `${changeCount} dated ${changeCount === 1 ? "change" : "changes"}`;
  const overlaps =
    overlapCount === 0
      ? "none of them overlap"
      : `${overlapCount} ${overlapCount === 1 ? "period" : "periods"} where changes overlap`;
  return `Changes on the ${routeLabel} from ${span}: ${changes}, ${overlaps}.`;
}

/**
 * A point marker's label is unpositioned text, so it can only be drawn when the
 * next band in the same row leaves room for it. Cramped rows drop the label and
 * let the change entry below carry the name.
 */
function labelFits(band: ChronologyBandView, next: ChronologyBandView | undefined): boolean {
  return next === undefined || next.start - band.start >= MIN_POINT_LABEL_FRACTION;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}

function overlapStyle(start: string, end: string, axis: ChronologyAxis) {
  const left = axisMonthFraction(start.slice(0, 7), axis);
  const right = axisMonthFraction(end.slice(0, 7), axis);
  return { left: percent(left), width: percent(Math.max(right - left, 0.006)) };
}

/** Clamped so the centred label stays inside the track at narrow widths. */
function overlapCenter(start: string, end: string, axis: ChronologyAxis): string {
  const left = axisMonthFraction(start.slice(0, 7), axis);
  const right = axisMonthFraction(end.slice(0, 7), axis);
  return percent(Math.min(0.88, Math.max(0.12, (left + right) / 2)));
}

/**
 * The context layer: monthly speed as a faint line and area. It carries no
 * y-axis and no numbers — it exists so the bands can be read against something,
 * not so anyone measures it. Gaps in the series break the line rather than
 * inventing a segment across them.
 */
function speedPath(
  points: readonly TrendPoint[],
  axis: ChronologyAxis,
): { lines: string[]; areas: string[] } | null {
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]));
  if (values.length < 2) return null;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low;
  const y = (value: number) => {
    if (span <= 0) return VIEWBOX_HEIGHT / 2;
    const usable = VIEWBOX_HEIGHT - SPEED_PADDING * 2;
    return SPEED_PADDING + (1 - (value - low) / span) * usable;
  };

  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];
  for (const point of points) {
    if (point.value === null) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    run.push({ x: axisMonthFraction(point.month, axis) * VIEWBOX_WIDTH, y: y(point.value) });
  }
  if (run.length > 1) runs.push(run);
  if (runs.length === 0) return null;

  const lines = runs.map(
    (segment) =>
      `M${segment.map((node) => `${node.x.toFixed(1)} ${node.y.toFixed(1)}`).join(" L")}`,
  );
  const areas = runs.map((segment) => {
    const first = segment[0];
    const last = segment.at(-1);
    if (first === undefined || last === undefined) return "";
    return `${`M${segment.map((node) => `${node.x.toFixed(1)} ${node.y.toFixed(1)}`).join(" L")}`} L${last.x.toFixed(1)} ${VIEWBOX_HEIGHT} L${first.x.toFixed(1)} ${VIEWBOX_HEIGHT} Z`;
  });
  return { lines, areas: areas.filter((area) => area.length > 0) };
}
