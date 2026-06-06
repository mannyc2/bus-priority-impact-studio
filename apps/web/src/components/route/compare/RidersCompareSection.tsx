import { ChartFrame } from "@/components/ChartFrame";
import { compareRidersSeries } from "@/components/route/compare/derived";
import { COMPARE_SERIES, seriesLabel } from "@/components/route/compare/series";
import type { CompareSides } from "@/components/route/compare/types";
import { RouteDeltaStrip } from "@/components/route/RouteDeltaStrip";
import { SectionHeader } from "@/components/SectionHeader";
import { TrendOverlay } from "@/components/TrendOverlay";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function RidersCompareSection({ a, b, historyA, historyB }: CompareSides) {
  const ridersA = compareRidersSeries(historyA);
  const ridersB = compareRidersSeries(historyB);
  const hasHistory = ridersA.length > 0 || ridersB.length > 0;

  return (
    <div className="flex flex-col gap-7">
      <RouteDeltaStrip a={a.route} b={b.route} />

      <div>
        <SectionHeader
          title="Ridership trend"
          sub="Monthly boardings in thousands, overlaid where route-month history is available."
        />
        {hasHistory ? (
          <ChartFrame height={180}>
            <TrendOverlay
              a={{ label: seriesLabel(a.route), color: COMPARE_SERIES.a, data: ridersA }}
              b={{ label: seriesLabel(b.route), color: COMPARE_SERIES.b, data: ridersB }}
              height={180}
            />
          </ChartFrame>
        ) : (
          <Alert variant="info">
            <AlertTitle variant="info">No monthly ridership history</AlertTitle>
            <AlertDescription>
              Neither route has route-month ridership rows in this release. The daily-rider and
              rider-hour figures in the KPI strip above remain the comparison basis.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
