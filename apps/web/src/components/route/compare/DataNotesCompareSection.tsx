import { DataAsOf } from "@/components/DataAsOf";
import { CompareRouteTag } from "@/components/route/compare/CompareRouteTag";
import { COMPARE_SERIES } from "@/components/route/compare/series";
import type { CompareSides } from "@/components/route/compare/types";
import { routeHistoryWindow } from "@/components/route/route-derived";
import { SectionHeader } from "@/components/SectionHeader";
import type { StudioRouteDetailResponse, StudioRouteHistoryResponse } from "@/studio/api-contract";

export function DataNotesCompareSection({ a, b, historyA, historyB }: CompareSides) {
  return (
    <div className="flex flex-col gap-7">
      <div>
        <SectionHeader
          title="Data provenance, side by side"
          sub="What backs each route's numbers in this release. A comparison is only as strong as the weaker side's coverage."
        />
        <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
          <QualityCard detail={a} history={historyA} color={COMPARE_SERIES.a} />
          <QualityCard detail={b} history={historyB} color={COMPARE_SERIES.b} />
        </div>
      </div>
    </div>
  );
}

function QualityCard({
  detail,
  history,
  color,
}: {
  detail: StudioRouteDetailResponse;
  history: StudioRouteHistoryResponse | null;
  color: string;
}) {
  const { route, quality, segments } = detail;
  const rows: [string, string][] = [
    ["Primary window", routeHistoryWindow(history) ?? "Current projection"],
    ["Route-month rows", history ? String(history.coverage.pointCount) : "—"],
    ["Timepoint segments", String(segments.length)],
    ["Quality confidence", quality.confidence],
  ];
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-3">
        <CompareRouteTag route={route} color={color} />
      </div>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 py-2 shadow-[inset_0_-1px_0_var(--bp-color-rule)] last:shadow-none"
        >
          <span className="text-[12px] text-[var(--bp-color-ink-55)]">{label}</span>
          <span className="text-right text-[12.5px] font-semibold">{value}</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 py-2">
        <span className="text-[12px] text-[var(--bp-color-ink-55)]">Freshness</span>
        <DataAsOf dataAsOf={detail.dossier?.dataAsOf ?? null} />
      </div>
      {quality.caveats.length > 0 ? (
        <p className="m-0 mt-3 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          {quality.caveats.join("; ")}
        </p>
      ) : null}
    </div>
  );
}
