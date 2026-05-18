import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AiAttribution, ConfidenceBar, RouteBadge } from "../../design-system/primitives.js";
import { Badge } from "@/components/ui/badge";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioRoute, studioFindings } from "../sample-data.js";

export function FindingsFeedPage() {
  return (
    <StudioPage
      rail={
        <StudioPanel>
          <div className="text-[13px] font-semibold">How findings work</div>
          <p className="mt-3 text-[12px] leading-5 text-[var(--bp-color-ink-70)]">
            Findings are surfaced when observed route behavior diverges from what its treatment
            stack predicts. The AI flags; the analyst judges.
          </p>
        </StudioPanel>
      }
    >
      <StudioHero
        label="◆ AI-analyzed"
        title="Findings"
        body="Notable patterns surfaced across the route network. Each finding traces to the same data used in route views and briefs."
      />
      <AiAttribution>
        No chat thread, no invented recommendations. Every finding starts as a declarative pattern
        with confidence, source count, and a direct route handoff.
      </AiAttribution>
      <div className="mt-5 space-y-3">
        {studioFindings.map((finding) => {
          const route = getStudioRoute(finding.routeSlug);
          if (!route) return null;

          return (
            <Link
              key={finding.id}
              to="/findings/$findingId"
              params={{ findingId: finding.id }}
              viewTransition
              className="block rounded-[3px] bg-[var(--bp-color-card)] p-5 text-[var(--bp-color-ink)] no-underline shadow-[0_0_0_1px_var(--bp-color-rule)]"
            >
              <div className="flex items-start justify-between gap-5 max-sm:flex-col">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <RouteBadge route={route.label} sbs={route.sbs} size="sm" />
                    <Badge variant={finding.category === "Anomaly" ? "warn" : "accent"}>
                      {finding.category}
                    </Badge>
                    <Badge variant={finding.confidence === "high" ? "good" : "warn"}>
                      {finding.confidence}
                    </Badge>
                  </div>
                  <div className="text-[18px] font-semibold tracking-[0]">{finding.title}</div>
                  <p className="mt-2 max-w-[760px] text-[13px] leading-6 text-[var(--bp-color-ink-70)]">
                    {finding.body}
                  </p>
                </div>
                <div className="w-[170px] shrink-0">
                  <div className="mb-2 font-mono text-[18px] font-semibold">{finding.metric}</div>
                  <ConfidenceBar value={finding.confidence === "high" ? 82 : 58} />
                  <div className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-[var(--bp-color-accent)]">
                    Open reasoning
                    <ArrowRight size={13} />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </StudioPage>
  );
}
