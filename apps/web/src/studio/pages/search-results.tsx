import { Link } from "@tanstack/react-router";
import { Briefcase, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { RouteBadge } from "@/components/RouteBadge";
import { SearchField } from "@/components/SearchField";
import { Badge } from "@/components/ui/badge";
import type { StudioSearchResponse } from "../api-contract.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";

export function SearchResultsPage({ data }: { data: StudioSearchResponse }) {
  return (
    <StudioPage>
      <StudioHero
        label="Search results"
        title={`Results for "${data.query}"`}
        body="Results are grouped by their natural object type so agents and humans can decide whether they need a route, a segment, a brief, or a methodology note."
      />
      <div className="mb-6 max-w-[780px]">
        <SearchField
          defaultValue={data.query}
          placeholder="Search route, segment, brief..."
          shortcut="/"
        />
      </div>
      <div className="grid grid-cols-[220px_1fr] gap-6 max-lg:grid-cols-1">
        <StudioPanel>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--bp-color-ink-55)]">
            Facets
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge variant="accent">Routes</Badge>
            <Badge variant="neutral">Segments</Badge>
            <Badge variant="neutral">Briefs</Badge>
            <Badge variant="neutral">Methods</Badge>
          </div>
        </StudioPanel>
        <div className="space-y-4">
          <ResultGroup title="Routes" count={data.routes.length}>
            {data.routes.slice(0, 3).map((route) => (
              <Link
                key={route.slug}
                to="/routes/$routeId"
                params={{ routeId: route.slug }}
                viewTransition
                className="grid grid-cols-[140px_1fr_auto] items-center gap-4 border-b border-[var(--bp-color-rule)] py-3 text-[var(--bp-color-ink)] no-underline last:border-b-0 max-sm:grid-cols-1"
              >
                <RouteBadge route={route.label} sbs={route.sbs} size="md" />
                <div>
                  <div className="text-[13px] font-semibold">{route.corridor}</div>
                  <div className="mt-1 text-[12px] text-[var(--bp-color-ink-55)]">
                    {route.borough} - {route.reliability}
                  </div>
                </div>
                <Badge variant={route.speedMph < 5 ? "bad" : "warn"}>
                  {route.speedMph.toFixed(1)} mph
                </Badge>
              </Link>
            ))}
          </ResultGroup>
          <ResultGroup title="Findings" count={data.findings.length}>
            {data.findings.map(({ finding }) => (
              <Link
                key={finding.id}
                to="/findings/$findingId"
                params={{ findingId: finding.id }}
                viewTransition
                className="flex items-start gap-3 border-b border-[var(--bp-color-rule)] py-3 text-[var(--bp-color-ink)] no-underline last:border-b-0"
              >
                <Briefcase size={16} />
                <div>
                  <div className="text-[13px] font-semibold">{finding.title}</div>
                  <div className="mt-1 text-[12px] text-[var(--bp-color-ink-55)]">
                    {finding.metric}
                  </div>
                </div>
              </Link>
            ))}
          </ResultGroup>
          <ResultGroup title="Briefs" count={data.briefs.length}>
            {data.briefs.map(({ brief }) => (
              <Link
                key={brief.id}
                to="/briefs/$briefId"
                params={{ briefId: brief.id }}
                viewTransition
                className="flex items-start gap-3 border-b border-[var(--bp-color-rule)] py-3 text-[var(--bp-color-ink)] no-underline last:border-b-0"
              >
                <FileText size={16} />
                <div>
                  <div className="text-[13px] font-semibold">{brief.title}</div>
                  <div className="mt-1 text-[12px] text-[var(--bp-color-ink-55)]">
                    {brief.summary}
                  </div>
                </div>
              </Link>
            ))}
          </ResultGroup>
        </div>
      </div>
    </StudioPage>
  );
}

function ResultGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
        <span className="font-mono text-[11px] text-[var(--bp-color-ink-55)]">{count}</span>
      </div>
      {children}
    </section>
  );
}
