import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  AiAttribution,
  Caveat,
  ChartFrame,
  RouteBadge,
  Spark,
  Timeline,
} from "../../design-system/primitives.js";
import { Badge } from "@/components/ui/badge";
import { bpiColors } from "../../design-system/tokens.js";
import { StudioHero, StudioPage, StudioPanel } from "../page.js";
import { getStudioFinding, getStudioRoute } from "../sample-data.js";
import { NotFoundPage } from "./not-found.js";

export function FindingDetailPage({ findingId }: { findingId: string }) {
  const finding = getStudioFinding(findingId);
  if (!finding) return <NotFoundPage />;

  const route = getStudioRoute(finding.routeSlug);
  if (!route) return <NotFoundPage />;

  return (
    <StudioPage
      rail={
        <StudioPanel>
          <div className="mb-3 text-[13px] font-semibold">Reasoning trail</div>
          <Timeline
            events={[
              {
                date: "01",
                title: "Detected route trend",
                detail: "Speed changed outside peer expectation.",
                tone: "accent",
              },
              {
                date: "02",
                title: "Checked treatment stack",
                detail: "Lane, ACE, and TSP coverage compared by segment.",
                tone: "good",
              },
              {
                date: "03",
                title: "Attached caveats",
                detail: "Attribution caveat kept with the finding.",
                tone: "bad",
              },
            ]}
          />
        </StudioPanel>
      }
    >
      <StudioHero
        label={
          <span className="inline-flex items-center gap-2">
            <RouteBadge route={route.label} sbs={route.sbs} size="md" />
            <Badge variant="accent">{finding.category}</Badge>
          </span>
        }
        title={finding.title}
        body={finding.body}
        action={
          <Link
            to="/briefs/new"
            search={{ finding: finding.id }}
            viewTransition
            className="inline-flex h-9 items-center gap-1.5 rounded-[3px] bg-[var(--bp-color-ink)] px-3.5 text-[12.5px] font-medium text-[var(--bp-color-paper)] no-underline"
          >
            Start brief
            <ArrowRight size={14} />
          </Link>
        }
      />
      <AiAttribution>
        This finding is a prompt for review, not a conclusion. Its evidence is intentionally visible
        before any brief is generated.
      </AiAttribution>
      <div className="mt-5 grid grid-cols-[1fr_280px] gap-5 max-lg:grid-cols-1">
        <ChartFrame title={finding.metric} source="Route trend and peer baseline">
          <div className="flex h-[220px] items-center justify-center">
            <Spark
              data={route.spark}
              width={520}
              height={130}
              baseline={route.scheduledMph}
              color={bpiColors.accent}
              fill
            />
          </div>
        </ChartFrame>
        <StudioPanel>
          <div className="text-[13px] font-semibold">Evidence bundle</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="neutral">Speed</Badge>
            <Badge variant="neutral">Ridership</Badge>
            <Badge variant="neutral">ACE</Badge>
            <Badge variant="neutral">Bus lanes</Badge>
          </div>
          <Caveat tone="warn" title="Interpretation caveat">
            Peer comparisons narrow the explanation but do not prove a single causal intervention.
          </Caveat>
        </StudioPanel>
      </div>
    </StudioPage>
  );
}
