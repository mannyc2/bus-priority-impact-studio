import { CorridorMap } from "@/components/CorridorMap";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import type { StudioRouteDetailResponse } from "@/studio/api-contract";

export function RouteMapSection({ data }: { data: StudioRouteDetailResponse }) {
  const { route, segments } = data;
  const flagged = segments.find((segment) => segment.flagged) ?? null;
  const mapArtifacts = data.artifactRefs.filter(
    (artifact) =>
      artifact.key.startsWith("map/") ||
      artifact.contentType.includes("geo") ||
      artifact.name.toLowerCase().includes("map"),
  );
  const laneSegments = segments.filter((segment) => segment.lane !== "none").length;
  const treatmentSegments = segments.filter((segment) => segment.ace || segment.tsp).length;

  return (
    <section className="flex flex-col gap-5">
      <SectionHeader
        title="Route geography and flagged segments"
        sub="Visible timepoint segments, pace coloring, and bus-priority treatment coverage for this route."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={flagged ? "bad" : "neutral"}>
              {flagged ? "flagged segment" : "no segment flag"}
            </Badge>
            <Badge variant="neutral">{segments.length} segments</Badge>
          </div>
        }
      />
      <div className="rounded-[3px] bg-[var(--bp-color-card)] p-5 shadow-[0_0_0_1px_var(--bp-color-rule)]">
        <CorridorMap route={route} segments={segments} highlightId={flagged?.id} />
      </div>
      <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
        <MapStat
          label="Bus-lane coverage"
          value={`${route.laneCoverage}%`}
          sub={`${laneSegments} visible segment(s)`}
        />
        <MapStat
          label="ACE / TSP overlap"
          value={String(treatmentSegments)}
          sub="visible segments with program evidence"
        />
        <MapStat
          label="Map evidence"
          value={String(mapArtifacts.length)}
          sub={mapArtifacts.length > 0 ? "route map reference(s)" : "citywide map layer"}
        />
      </div>
    </section>
  );
}

function MapStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[3px] bg-[var(--bp-color-card)] p-4 shadow-[0_0_0_1px_var(--bp-color-rule)]">
      <div className="mb-2 text-[11.5px] font-semibold text-[var(--bp-color-ink-55)]">{label}</div>
      <div className="font-mono text-[28px] font-semibold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-[1.4] text-[var(--bp-color-ink-55)]">{sub}</div>
    </div>
  );
}
