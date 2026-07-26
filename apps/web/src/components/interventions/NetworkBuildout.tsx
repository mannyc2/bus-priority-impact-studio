import { lazy, Suspense } from "react";
import { ChartFallback } from "@/components/ChartFallback";
import {
  buildoutAxisMax,
  buildoutAxisTicks,
  buildoutDescription,
  buildoutEndLabels,
  type NetworkBuildout as NetworkBuildoutModel,
} from "@/studio/network-change-record";

// Lazy boundary: keeps Recharts out of the interventions page chunk. The page
// module is itself lazily imported by its route file, so the build-out chart is
// two hops from the entry bundle and must never leak into it.
const NetworkBuildoutChart = lazy(() =>
  import("./NetworkBuildout.chart.js").then((module) => ({
    default: module.NetworkBuildoutChart,
  })),
);

const PLOT_HEIGHT = 214;

/**
 * How far bus priority has spread. Owns the layout, the right-end labels, the
 * year axis, the readings and the accessible description; the Recharts
 * composition lives behind the lazy split.
 *
 * The labels and ticks are positioned against the same linear domain the chart
 * draws in, which is why the chart carries no margins of its own.
 */
export function NetworkBuildout({ buildout }: { buildout: NetworkBuildoutModel }) {
  const axisMax = buildoutAxisMax(buildout.series);
  const endLabels = buildoutEndLabels(buildout.series, { axisMax });
  const ticks = buildoutAxisTicks(buildout);

  return (
    <section
      aria-labelledby="network-buildout-title"
      className="overflow-hidden rounded-[4px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)]"
    >
      <div className="border-b border-[var(--bp-color-rule)] px-[17px] py-[15px]">
        <h2
          id="network-buildout-title"
          className="m-0 text-[16.5px] font-semibold tracking-[-0.015em]"
        >
          How far bus priority has spread
        </h2>
        <p className="mb-0 mt-1 max-w-[82ch] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          Number of routes running on a street with each kind of treatment, counted from the year it
          first appeared there.
        </p>
      </div>

      <div className="px-[17px] pb-2 pt-5">
        <div role="img" aria-label={buildoutDescription(buildout)} className="relative">
          <div className="pr-[132px] max-md:pr-0" style={{ height: PLOT_HEIGHT }}>
            <Suspense fallback={<ChartFallback height={PLOT_HEIGHT} />}>
              <NetworkBuildoutChart
                series={buildout.series}
                axisMax={axisMax}
                height={PLOT_HEIGHT}
                partialFinalYear={buildout.partialFinalYear ? buildout.lastYear : null}
              />
            </Suspense>
          </div>
          {/* The end labels are the legend. They sit in the reserved gutter at
              each series' own height; on narrow screens the gutter is gone, so
              the same list flows into a wrapped row beneath the plot. */}
          <div className="absolute inset-y-0 right-0 w-[124px] max-md:static max-md:mt-2 max-md:flex max-md:w-auto max-md:flex-wrap max-md:gap-x-3.5 max-md:gap-y-1">
            {endLabels.map((label) => (
              <span
                key={label.familyKey}
                className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[11.5px] font-semibold tabular-nums max-md:static max-md:translate-y-0"
                style={{ top: `${label.topPercent}%`, color: label.color }}
              >
                {label.value}{" "}
                <span className="font-normal text-[var(--bp-color-ink-55)]">{label.endLabel}</span>
              </span>
            ))}
          </div>
        </div>
        {/* The inner box is what the ticks position against: padding on a
            relative element does not shrink its absolute containing block, so
            the gutter has to come off the outer element. */}
        <div className="mt-2 border-t border-[var(--bp-color-rule)] pr-[132px] pt-2 max-md:pr-0">
          <div className="relative h-4">
            {ticks.map((tick) => (
              <span
                key={tick.year}
                className={`absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-[var(--bp-color-ink-40)]${
                  tick.keepWhenNarrow ? "" : " max-md:hidden"
                }`}
                style={{
                  left: `${tick.leftPercent}%`,
                  transform:
                    tick.leftPercent === 0
                      ? "none"
                      : tick.leftPercent === 100
                        ? "translateX(-100%)"
                        : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {buildout.readings.length === 0 ? null : (
        <div className="grid grid-cols-3 gap-px border-t border-[var(--bp-color-rule)] bg-[var(--bp-color-rule)] max-md:grid-cols-1">
          {buildout.readings.map((reading) => (
            <div key={reading.heading} className="bg-[var(--bp-color-card)] px-4 pb-[15px] pt-3.5">
              <h3 className="m-0 text-[13.5px] font-semibold">{reading.heading}</h3>
              <p className="mb-0 mt-[5px] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
                {reading.sentence}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
