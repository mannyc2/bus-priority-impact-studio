import { ChartFrame } from "@/components/ChartFrame";
import { InterventionOverlay } from "@/components/InterventionOverlay";
import { compareSpeedSeries } from "@/components/route/compare/derived";
import { COMPARE_SERIES, seriesLabel } from "@/components/route/compare/series";
import type { CompareSides } from "@/components/route/compare/types";
import { SectionHeader } from "@/components/SectionHeader";
import { TrendOverlay } from "@/components/TrendOverlay";

export function TimelineCompareSection({ a, b, historyA, historyB }: CompareSides) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <SectionHeader
          title="Intervention history"
          sub="Both routes' dated interventions on one shared timeline - who acted on this corridor, and when. Hover a marker for detail."
        />
        <InterventionOverlay
          a={{
            label: seriesLabel(a.route),
            color: COMPARE_SERIES.a,
            events: a.route.interventions,
          }}
          b={{
            label: seriesLabel(b.route),
            color: COMPARE_SERIES.b,
            events: b.route.interventions,
          }}
        />
      </div>

      <div>
        <SectionHeader
          title="Speed history"
          sub="Route-month speed trend for both routes; the gap is the divergence to read against the intervention timeline above."
        />
        <ChartFrame height={196}>
          <TrendOverlay
            a={{
              label: seriesLabel(a.route),
              color: COMPARE_SERIES.a,
              data: compareSpeedSeries(a, historyA),
              baseline: a.route.scheduledMph,
            }}
            b={{
              label: seriesLabel(b.route),
              color: COMPARE_SERIES.b,
              data: compareSpeedSeries(b, historyB),
              baseline: b.route.scheduledMph,
            }}
            height={196}
          />
        </ChartFrame>
      </div>
    </div>
  );
}
