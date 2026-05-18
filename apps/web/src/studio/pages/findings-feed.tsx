import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { ConfidenceBar } from "@/components/ConfidenceBar";
import { FilterChips } from "@/components/FilterChips";
import { Rail, RailRule } from "@/components/Rail";
import { RouteBadge } from "@/components/RouteBadge";
import { Badge } from "@/components/ui/badge";
import type { StudioFindingsResponse } from "../api-contract.js";
import { StudioPage } from "../page.js";

const boroughFilters = ["All", "Manhattan", "Bronx", "Brooklyn", "Queens", "Queens/Brooklyn"];

const typeFilters = [
  { id: "all", label: "All findings" },
  { id: "Anomaly", label: "Anomalies" },
  { id: "Treatment gap", label: "Treatment gaps" },
  { id: "Emerging risk", label: "Emerging risks" },
];

const sortOptions = [
  { id: "impact", label: "Rider impact" },
  { id: "confidence", label: "Confidence" },
  { id: "recent", label: "Recently added" },
];

function severityBorderColor(category: string): string {
  if (category === "Anomaly") return "var(--bp-color-bad)";
  if (category === "Treatment gap") return "var(--bp-color-warn)";
  return "var(--bp-color-accent)";
}

export function FindingsFeedPage({ data }: { data: StudioFindingsResponse }) {
  const [borough, setBorough] = useState<string>("All");
  const [type, setType] = useState<string>("all");
  const [sort, setSort] = useState<string>("impact");

  const filtered = data.findings.filter(({ finding, route }) => {
    if (borough !== "All" && route.borough !== borough) return false;
    if (type !== "all" && finding.category !== type) return false;
    return true;
  });

  const typeCounts: Record<string, number> = {
    all: data.findings.length,
    Anomaly: data.findings.filter((f) => f.finding.category === "Anomaly").length,
    "Treatment gap": data.findings.filter((f) => f.finding.category === "Treatment gap").length,
    "Emerging risk": data.findings.filter((f) => f.finding.category === "Emerging risk").length,
  };

  return (
    <StudioPage flush>
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-end gap-8 bg-[var(--bp-color-card)] px-7 py-5 shadow-[inset_0_-1px_0_var(--bp-color-rule)] max-md:flex-col max-md:items-start">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center gap-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em]">
              <span className="text-[var(--bp-color-accent)]">&#9670; AI-analyzed</span>
              <span className="text-[var(--bp-color-ink-40)]">
                updated 2026-05-12 · 340 routes scanned
              </span>
            </div>
            <h1 className="m-0 text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">
              Findings
            </h1>
            <p className="mt-1.5 max-w-[580px] text-[13px] leading-[1.45] text-[var(--bp-color-ink-55)]">
              Notable patterns surfaced across all NYC bus routes. Each finding traces directly to
              the data in the route view - nothing invented.
            </p>
          </div>
          <FilterChips
            ariaLabel="Filter findings by borough"
            value={borough}
            onChange={setBorough}
            options={boroughFilters.map((b) => ({ id: b, label: b }))}
          />
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)] overflow-hidden max-lg:grid-cols-1">
          <Rail edge="left" className="gap-[2px] px-3.5 py-5">
            <div className="mb-2 px-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
              Type
            </div>
            {typeFilters.map((f) => {
              const active = type === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setType(f.id)}
                  className={
                    active
                      ? "flex items-center justify-between rounded-[3px] bg-[var(--bp-color-ink)] px-2.5 py-2 text-[13px] font-semibold text-[var(--bp-color-paper)]"
                      : "flex items-center justify-between rounded-[3px] bg-transparent px-2.5 py-2 text-[13px] text-[var(--bp-color-ink)] hover:bg-[var(--bp-color-paper-deep)]"
                  }
                >
                  <span>{f.label}</span>
                  <span
                    className={
                      active
                        ? "font-mono text-[11px] font-semibold tabular-nums text-[var(--bp-color-paper)] opacity-55"
                        : "font-mono text-[11px] font-semibold tabular-nums text-[var(--bp-color-ink-40)]"
                    }
                  >
                    {typeCounts[f.id] ?? 0}
                  </span>
                </button>
              );
            })}
            <div className="my-3">
              <RailRule />
            </div>
            <div className="mb-2 px-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">
              Sort
            </div>
            {sortOptions.map((o) => {
              const active = sort === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSort(o.id)}
                  className={
                    active
                      ? "rounded-[3px] bg-[var(--bp-color-ink-10)] px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--bp-color-ink)]"
                      : "rounded-[3px] bg-transparent px-2.5 py-1.5 text-left text-[12.5px] text-[var(--bp-color-ink-55)] hover:bg-[var(--bp-color-paper-deep)]"
                  }
                >
                  {o.label}
                </button>
              );
            })}
            <div className="mt-auto">
              <div className="rounded-[3px] bg-[var(--bp-color-card)] p-3 text-[11.5px] leading-[1.55] text-[var(--bp-color-ink-70)] shadow-[inset_0_0_0_1px_var(--bp-color-rule)]">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-[var(--bp-color-accent)]">
                    &#9670;
                  </span>
                  <span className="text-[12px] font-semibold text-[var(--bp-color-ink)]">
                    How findings work
                  </span>
                </div>
                A finding is surfaced when a route&apos;s observed behavior diverges from its
                expected pattern given its treatment stack. Evidence is the same data visible in
                the route view - the AI flags; you judge.
              </div>
            </div>
          </Rail>
          <div className="flex flex-col gap-3.5 overflow-auto p-7 max-sm:p-4">
            {filtered.length === 0 ? (
              <div className="rounded-[3px] bg-[var(--bp-color-paper-deep)] p-4 text-[12.5px] text-[var(--bp-color-ink-55)]">
                No findings match these filters.
              </div>
            ) : null}
            {filtered.map(({ finding, route }) => {
              const borderColor = severityBorderColor(finding.category);
              return (
                <article
                  key={finding.id}
                  className="rounded-[3px] bg-[var(--bp-color-card)] shadow-[0_0_0_1px_var(--bp-color-rule)]"
                  style={{ borderLeft: `3px solid ${borderColor}` }}
                >
                  <Link
                    to="/findings/$findingId"
                    params={{ findingId: finding.id }}
                    viewTransition
                    className="block p-5 text-[var(--bp-color-ink)] no-underline"
                  >
                    <div className="flex items-start justify-between gap-5 max-sm:flex-col">
                      <div className="min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
                          <Badge
                            variant={
                              finding.category === "Anomaly"
                                ? "bad"
                                : finding.category === "Treatment gap"
                                  ? "warn"
                                  : "accent"
                            }
                          >
                            {finding.category}
                          </Badge>
                          <span className="text-[11.5px] text-[var(--bp-color-ink-55)]">
                            {route.borough}
                          </span>
                        </div>
                        <div className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                          {finding.title}
                        </div>
                        <p className="mt-2 max-w-[760px] text-[13px] leading-[1.55] text-[var(--bp-color-ink-70)]">
                          {finding.body}
                        </p>
                      </div>
                      <div className="w-[170px] shrink-0">
                        <div className="mb-2 font-mono text-[18px] font-semibold tabular-nums">
                          {finding.metric}
                        </div>
                        <ConfidenceBar value={finding.confidence === "high" ? 82 : 58} />
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between border-t border-[var(--bp-color-rule)] px-5 py-2.5">
                    <Link
                      to="/routes/$routeId"
                      params={{ routeId: route.slug }}
                      viewTransition
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--bp-color-accent)] no-underline"
                    >
                      Open route
                      <ArrowRight size={13} />
                    </Link>
                    <Link
                      to="/briefs/new"
                      search={{ finding: finding.id }}
                      viewTransition
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--bp-color-ink-70)] no-underline"
                    >
                      Start brief
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </StudioPage>
  );
}
