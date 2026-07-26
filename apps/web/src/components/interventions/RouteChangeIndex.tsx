import { Link } from "@tanstack/react-router";
import { RouteBadge } from "@/components/RouteBadge";
import {
  ROUTE_CHANGE_GROUP_LABELS,
  ROUTE_CHANGE_GROUPS,
  type RouteChangeGroup,
  type RouteChangeIndex as RouteChangeIndexModel,
  type RouteChangeResult,
  type RouteChangeRow,
} from "@/studio/network-change-record";

/** Rows shown per group. The ledger below is the place to read all of them. */
export const ROUTE_CHANGE_INDEX_ROWS = 8;

const GROUP_DESCRIPTIONS = {
  recent: "Ordered by when they last changed.",
  most: "Ordered by how many documented changes they carry.",
  measured: "The routes with a published study, most recent change first.",
  proposed: "Routes named in a change a published plan has proposed.",
  never: "Routes with no documented change on the tracked network.",
} satisfies Record<RouteChangeGroup, string>;

export function RouteChangeIndex({
  index,
  routesWithAnyChange,
  routesWithNoChange,
  firstYear,
  ledgerHref,
  onGroupChange,
}: {
  index: RouteChangeIndexModel;
  routesWithAnyChange: number;
  routesWithNoChange: number;
  firstYear: number;
  ledgerHref: string;
  onGroupChange: (group: RouteChangeGroup) => void;
}) {
  return (
    <section
      aria-labelledby="route-change-index-title"
      className="mt-5 overflow-hidden rounded-[4px] border border-[var(--bp-color-rule)] bg-[var(--bp-color-card)]"
    >
      <div className="border-b border-[var(--bp-color-rule)] px-[17px] py-[15px]">
        <h2
          id="route-change-index-title"
          className="m-0 text-[16.5px] font-semibold tracking-[-0.015em]"
        >
          Which routes are changing
        </h2>
        <p className="mb-0 mt-1 max-w-[82ch] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          {`${GROUP_DESCRIPTIONS[index.group]} Showing ${index.rows.length} of ${index.totalRoutes}.`}
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Route change view"
        className="flex flex-wrap border-b border-[var(--bp-color-rule)]"
      >
        {ROUTE_CHANGE_GROUPS.map((group) => (
          <button
            key={group}
            type="button"
            role="tab"
            aria-selected={index.group === group}
            aria-controls="route-change-index-rows"
            onClick={() => onGroupChange(group)}
            className={`border-r border-[var(--bp-color-rule)] px-[15px] py-2.5 text-[12.5px] ${
              index.group === group
                ? "bg-[var(--bp-color-paper-deep)] font-semibold text-[var(--bp-color-ink)]"
                : "text-[var(--bp-color-ink-55)] hover:text-[var(--bp-color-ink)]"
            }`}
          >
            {ROUTE_CHANGE_GROUP_LABELS[group]}
          </button>
        ))}
        <span className="flex-1" />
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-[120px_minmax(0,1fr)_140px_158px] gap-4 border-b border-[var(--bp-color-rule)] bg-[var(--bp-color-paper-deep)] px-[17px] py-2 text-[11px] font-semibold text-[var(--bp-color-ink-55)] max-md:hidden"
      >
        <span>Route</span>
        <span>Most recent change</span>
        <span>Changes by year</span>
        <span>Result</span>
      </div>

      <ol id="route-change-index-rows" className="m-0 list-none p-0">
        {index.rows.map((row) => (
          <IndexRow key={row.slug} row={row} />
        ))}
      </ol>

      <div className="flex flex-wrap justify-between gap-[18px] border-t border-[var(--bp-color-rule)] px-[17px] py-3 text-[12.5px] text-[var(--bp-color-ink-55)]">
        <span>
          {`${routesWithAnyChange} routes have changed since ${firstYear}. ${routesWithNoChange} have no documented change at all.`}
        </span>
        <a href={ledgerHref} className="font-semibold text-[var(--bp-color-accent)] no-underline">
          Open the full record
        </a>
      </div>
    </section>
  );
}

function IndexRow({ row }: { row: RouteChangeRow }) {
  const total = row.spark.reduce((sum, bar) => sum + bar.count, 0);
  const peak = Math.max(1, ...row.spark.map((bar) => bar.count));
  return (
    <li className="grid grid-cols-[120px_minmax(0,1fr)_140px_158px] items-center gap-4 border-b border-[var(--bp-color-rule)] px-[17px] py-[11px] last:border-b-0 max-md:grid-cols-1 max-md:gap-1.5">
      <Link
        to="/routes/$routeId"
        params={{ routeId: row.slug }}
        search={{ tab: "history" }}
        viewTransition
        className="flex items-center gap-2 no-underline"
      >
        <RouteBadge route={row.routeId} displayLabel={row.displayLabel} sbs={row.sbs} size="sm" />
        <b className="text-[12.5px] font-semibold text-[var(--bp-color-ink)]">{row.displayLabel}</b>
      </Link>
      <span className="text-[13px]">
        {row.headline}
        {row.date === null ? null : (
          <span className="text-[var(--bp-color-ink-55)]">{` ${row.date}`}</span>
        )}
      </span>
      {/* A row of empty stubs reads as data; a route with nothing in the window
          shows nothing. */}
      {total === 0 ? (
        <span className="max-md:hidden" />
      ) : (
        <span
          role="img"
          aria-label={`Changes by year: ${row.spark.map((bar) => `${bar.year} ${bar.count}`).join(", ")}`}
          className="flex h-[22px] items-end gap-0.5"
        >
          {row.spark.map((bar) => (
            <span
              key={bar.year}
              className="min-h-0.5 flex-1 rounded-[1px] bg-[var(--bp-color-accent)] opacity-75"
              style={{ height: `${Math.max(9, (bar.count / peak) * 100)}%` }}
            />
          ))}
        </span>
      )}
      <ResultCell result={row.result} />
    </li>
  );
}

const RESULT_TONE_COLORS = {
  good: "var(--bp-color-good)",
  bad: "var(--bp-color-bad)",
  neutral: "var(--bp-color-ink)",
} as const;

function ResultCell({ result }: { result: RouteChangeResult }) {
  if (result.kind === "state") {
    return <span className="text-[12px] text-[var(--bp-color-ink-55)]">{result.label}</span>;
  }
  return (
    <span className="text-[12px] tabular-nums text-[var(--bp-color-ink-55)]">
      <b className="font-semibold" style={{ color: RESULT_TONE_COLORS[result.tone] }}>
        {result.label}
      </b>
      {result.magnitude === null ? null : ` ${result.magnitude}`}
    </span>
  );
}
