/**
 * Proposed public Interventions page.
 *
 * Answers, in this order: how has bus-priority work spread across the network,
 * what changed and where, and what is proposed next. It does not lead with data
 * quality, source volume or a curated set of clean cases, and it never shows one
 * real change as several rows because several routes were affected.
 *
 * Everything below reads only `PublicInterventionEpisode` and the two
 * network-scale objects the complete route projection can support.
 */

import type {
  PublicInterventionEpisodesArtifact,
  PublicProposedPlan,
} from "@bp/domain/studio/public-intervention-episodes";
import { useMemo, useState } from "react";

import { NetworkBuildout } from "@/components/interventions/NetworkBuildout";
import { ChangeEntry, ENTRY_GUTTER } from "@/components/interventions/PublicChangeEntry";
import { RouteBadge } from "@/components/RouteBadge";
import { SectionCard } from "@/components/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  filterEpisodes,
  type NetworkChangeGroup,
  networkBuildoutModel,
  networkChangeGroups,
  publicKindFacets,
} from "@/studio/public-episode-view";

/** Groups shown before the rest go behind the browse-everything link. */
const GROUP_PAGE = 12;
/** Plan rows expanded on the face. */
const PLAN_FACE_CAP = 4;

export function PublicInterventions({
  artifact,
  initialRouteQuery = "",
}: {
  artifact: PublicInterventionEpisodesArtifact;
  initialRouteQuery?: string | undefined;
}) {
  const { episodes } = artifact;
  const [kindKey, setKindKey] = useState<string | null>(null);
  const [routeQuery, setRouteQuery] = useState(initialRouteQuery);
  const [showAll, setShowAll] = useState(false);

  const facets = useMemo(() => publicKindFacets(episodes), [episodes]);
  const filtered = useMemo(
    () => filterEpisodes(episodes, { kindKey, routeQuery }),
    [episodes, kindKey, routeQuery],
  );
  const groups = useMemo(() => networkChangeGroups(filtered), [filtered]);
  const shown = showAll ? groups : groups.slice(0, GROUP_PAGE);
  const buildout = networkBuildoutModel(artifact.networkBuildout);
  const proposed = artifact.proposedPlans;

  return (
    <div className="flex flex-col gap-5">
      <header className="border-b border-[var(--bp-color-rule)] pb-6">
        <h1 className="m-0 max-w-[24ch] text-[34px] font-semibold leading-[1.06] tracking-[-0.03em] @max-md:text-[25px]">
          How bus priority spread—and the dated changes we can document.
        </h1>
        <p className="mt-3 max-w-[76ch] text-[14px] leading-[1.55] text-[var(--bp-color-ink-70)]">
          See the network-wide footprint of bus-priority treatments, then browse source-backed
          changes with a confirmed date and affected route.
        </p>
      </header>

      {/*
        The shipped build-out chart, fed from the measured cumulative table. One
        chart, one line per kind of work, labelled at its right end — reusing the
        production component rather than drawing the same object a second way.
      */}
      <div>
        <NetworkBuildout buildout={buildout} />
      </div>

      <SectionCard
        title="What changed"
        sub="Each source-backed dated change appears once, with the routes it affected and the work it covered."
        right={
          <div className="flex items-center gap-2 @max-md:w-full">
            <label className="sr-only" htmlFor="route-filter">
              Filter by route
            </label>
            <Input
              id="route-filter"
              value={routeQuery}
              onChange={(event) => {
                setRouteQuery(event.target.value);
                setShowAll(false);
              }}
              placeholder="Find a route"
              className="h-8 w-[160px] text-[12.5px] @max-md:w-full"
            />
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          <FacetChip
            label="Everything"
            count={episodes.length}
            active={kindKey === null}
            onSelect={() => {
              setKindKey(null);
              setShowAll(false);
            }}
          />
          {facets.map((facet) => (
            <FacetChip
              key={facet.kindKey}
              label={facet.label}
              count={facet.episodeCount}
              active={kindKey === facet.kindKey}
              onSelect={() => {
                setKindKey(facet.kindKey === kindKey ? null : facet.kindKey);
                setShowAll(false);
              }}
            />
          ))}
        </div>

        {groups.length === 0 ? (
          <p className="mt-5 text-[12.5px] text-[var(--bp-color-ink-55)]">
            No source-backed dated change matches that.
          </p>
        ) : (
          <ol className="m-0 mt-5 flex list-none flex-col p-0">
            {shown.map((group) => (
              <li
                key={group.groupId}
                className="border-t border-[var(--bp-color-rule)] py-5 first:border-t-0 first:pt-0 last:pb-0"
              >
                <ChangeGroup group={group} />
              </li>
            ))}
          </ol>
        )}

        {groups.length <= GROUP_PAGE ? null : (
          <div className="mt-5 border-t border-[var(--bp-color-rule)] pt-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? "Show recent changes only"
                : `Browse every dated change (${groups.length - GROUP_PAGE} more)`}
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="What is proposed next"
        sub={`${proposed.changeCount} proposed changes, grouped by the plan that proposed them.`}
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {proposed.plans.slice(0, PLAN_FACE_CAP).map((plan) => (
            <PlanRow key={plan.planId} plan={plan} />
          ))}
        </ul>
        {proposed.plans.length <= PLAN_FACE_CAP ? null : (
          <details className="mt-4 border-t border-[var(--bp-color-rule)] pt-3">
            <summary className="cursor-pointer list-none text-[12px] text-[var(--bp-color-accent)] [&::-webkit-details-marker]:hidden">
              {`${proposed.plans.length - PLAN_FACE_CAP} smaller plans`}
            </summary>
            <ul className="m-0 mt-3 flex list-none flex-col p-0">
              {proposed.plans.slice(PLAN_FACE_CAP).map((plan) => (
                <PlanRow key={plan.planId} plan={plan} />
              ))}
            </ul>
          </details>
        )}
        <p className="mt-4 max-w-[70ch] text-[12px] leading-[1.5] text-[var(--bp-color-ink-70)]">
          A proposal has no start date until the agency sets one, so none of these appear on a
          timeline.
        </p>
      </SectionCard>
    </div>
  );
}

function FacetChip({
  label,
  count,
  active,
  onSelect,
}: {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "primary" : "secondary"}
      onClick={onSelect}
      aria-pressed={active}
      className="h-auto rounded-[3px] px-2.5 py-1.5 text-[11.5px] font-medium"
    >
      {label}
      <span className={active ? "ml-1.5 opacity-70" : "ml-1.5 text-[var(--bp-color-ink-40)]"}>
        {count}
      </span>
    </Button>
  );
}

/**
 * A group is a display convenience, not an identity. When one plan changes sixty
 * routes on one day, the day is the heading and every change keeps its own row
 * inside it.
 */
function ChangeGroup({ group }: { group: NetworkChangeGroup }) {
  const single = group.episodes[0];
  if (group.heading === null && single !== undefined) {
    return <ChangeEntry episode={single} />;
  }

  return (
    <details>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {/* Same gutter as a change entry, so a group heading and the entries
            inside it share one left edge. */}
        <div className={`grid ${ENTRY_GUTTER}`}>
          <span
            aria-hidden="true"
            className="mt-[3px] flex size-[22px] items-center justify-center rounded-[3px] bg-[var(--bp-color-ink-10)] font-mono text-[10.5px] font-bold text-[var(--bp-color-ink-55)]"
          >
            {group.episodes.length}
          </span>
          <div className="min-w-0">
            <div className="font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-55)]">
              {group.dateDisplay}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-[14.5px] font-semibold leading-snug">{group.heading}</span>
              <span className="text-[12px] text-[var(--bp-color-accent)]">Open</span>
            </div>
            {group.sourceLabel === null ? null : (
              <p className="mt-1 max-w-[68ch] text-[12.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
                {group.sourceLabel}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.episodes
                .slice(0, 10)
                .flatMap((episode) =>
                  episode.routes.map((route) => (
                    <RouteBadge
                      key={`${episode.episodeId}:${route.routeId}`}
                      route={route.routeId}
                      displayLabel={route.label}
                      size="sm"
                    />
                  )),
                )}
              {group.routeCount <= 10 ? null : (
                <span className="self-center text-[11px] text-[var(--bp-color-ink-55)]">
                  {`and ${group.routeCount - 10} more`}
                </span>
              )}
            </div>
          </div>
        </div>
      </summary>
      <ol className="m-0 mt-4 flex list-none flex-col gap-4 pl-[34px] @max-md:pl-[26px]">
        {group.episodes.map((episode) => (
          <li key={episode.episodeId}>
            <ChangeEntry episode={episode} />
          </li>
        ))}
      </ol>
    </details>
  );
}

function PlanRow({ plan }: { plan: PublicProposedPlan }) {
  const total = plan.mix.reduce((sum, slice) => sum + slice.count, 0);
  return (
    <li className="border-b border-[var(--bp-color-rule)] py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[13px] font-semibold leading-snug">{plan.label}</span>
        <span className="font-mono text-[11.5px] tabular-nums text-[var(--bp-color-ink-55)]">
          {`${plan.changeCount} changes, ${plan.routeCount} routes`}
        </span>
      </div>
      {total === 0 ? null : (
        <>
          <div
            className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--bp-color-ink-06)]"
            aria-hidden="true"
          >
            {plan.mix.map((slice, index) => (
              <span
                key={slice.label}
                style={{
                  width: `${(slice.count / total) * 100}%`,
                  background: MIX_TONES[index % MIX_TONES.length],
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {plan.mix.map((slice, index) => (
              <span
                key={slice.label}
                className="inline-flex items-center gap-1.5 text-[11px] text-[var(--bp-color-ink-55)]"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: MIX_TONES[index % MIX_TONES.length] }}
                />
                {`${slice.label} ${slice.count}`}
              </span>
            ))}
          </div>
        </>
      )}
    </li>
  );
}

const MIX_TONES = [
  "var(--bp-color-accent)",
  "var(--bp-route-queens)",
  "var(--bp-route-bronx)",
  "var(--bp-route-si)",
] as const;
