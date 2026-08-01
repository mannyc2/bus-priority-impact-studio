/**
 * Consumer-canvas building blocks.
 *
 * Everything in this file is proposed public UI. Nothing here may render a
 * record id, a release, a review state, a disposition or a coverage state — the
 * types it receives do not carry them, which is the point of the boundary in
 * the public episode artifact.
 *
 * One change is rendered once. Affected routes and treatment components are
 * relationships nested inside it, disclosed progressively.
 */

import type {
  PublicEpisodeRoute,
  PublicInterventionEpisode,
} from "@bp/domain/studio/public-intervention-episodes";
import { Link } from "@tanstack/react-router";
import { RouteBadge } from "@/components/RouteBadge";
import { SourceNote, type SourceNoteEntry } from "@/components/SourceNote";

/**
 * The shared left gutter. Every change entry and every group heading uses it, so
 * dates and titles line up down the whole page whatever marker they carry.
 */
export const ENTRY_GUTTER = "grid-cols-[22px_minmax(0,1fr)] gap-x-3";

/** Routes named before the rest collapse behind a disclosure. */
const ROUTE_FACE_CAP = 4;
/** Component detail sentences shown before the rest collapse. */
const COMPONENT_FACE_CAP = 3;

export function ChangeEntry({
  episode,
  markerNumber,
  markerTone,
  highlightRouteKey,
}: {
  episode: PublicInterventionEpisode;
  /** Set when the change also carries a numbered marker on a chart above. */
  markerNumber?: string | undefined;
  markerTone?: string | undefined;
  /** The route whose page this is, so its own badge reads first. */
  highlightRouteKey?: string | undefined;
}) {
  return (
    <article className={`grid ${ENTRY_GUTTER} gap-y-2`}>
      {/*
        The gutter is a fixed width at every viewport, so a bullet, a marker
        number and a group heading all start their text at the same x. A marker
        square fills the gutter; a bullet is centred inside it.
      */}
      <div className="flex justify-center">
        {markerNumber === undefined ? (
          <span
            aria-hidden="true"
            className="mt-[7px] block size-[7px] shrink-0 rounded-full bg-[var(--bp-color-ink-20)]"
          />
        ) : (
          <span
            className="flex size-[22px] shrink-0 items-center justify-center rounded-[3px] bg-[var(--bp-color-accent)] font-mono text-[11px] font-bold text-white"
            style={markerTone === undefined ? undefined : { background: markerTone }}
          >
            {markerNumber}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="font-mono text-[11px] tabular-nums text-[var(--bp-color-ink-55)]">
          {episode.date.display}
        </div>
        <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.04em] text-[var(--bp-color-ink-40)]">
          {episode.authority === "producer"
            ? "Resolved MTA source pack"
            : "Tracker camera-enforcement enrichment"}
        </div>
        <h3 className="m-0 mt-1 text-[14.5px] font-semibold leading-snug tracking-[-0.005em]">
          {episode.title}
        </h3>
        {episode.summary.length === 0 ? null : (
          <p className="mt-1.5 max-w-[68ch] text-[12.5px] leading-[1.55] text-[var(--bp-color-ink-70)]">
            {episode.summary}
          </p>
        )}

        <AffectedRoutes routes={episode.routes} highlightRouteKey={highlightRouteKey} />
        <Components episode={episode} />
        <PlacementHistory episode={episode} />
        {episode.finding === null ? null : <Finding episode={episode} />}
        {episode.caveat === null ? null : (
          <p className="mt-2.5 max-w-[68ch] border-l-2 border-[var(--bp-color-warn)] pl-2.5 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-70)]">
            {episode.caveat}
          </p>
        )}
        <div className="mt-2.5">
          <SourceNote entries={sourceEntries(episode)} />
        </div>
      </div>
    </article>
  );
}

/**
 * Affected routes as nested relationships. A change on seven routes is one
 * change with seven relationships, never seven rows. Membership is exact; the
 * UI does not invent a route role the producer did not review.
 */
function AffectedRoutes({
  routes,
  highlightRouteKey,
}: {
  routes: readonly PublicEpisodeRoute[];
  highlightRouteKey: string | undefined;
}) {
  if (routes.length === 0) return null;
  const ordered =
    highlightRouteKey === undefined
      ? routes
      : [
          ...routes.filter((route) => route.routeKey === highlightRouteKey),
          ...routes.filter((route) => route.routeKey !== highlightRouteKey),
        ];
  const face = ordered.slice(0, ROUTE_FACE_CAP);
  const rest = ordered.slice(ROUTE_FACE_CAP);

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {face.map((route) => (
        <RouteRelation key={route.routeKey} route={route} />
      ))}
      {rest.length === 0 ? null : (
        <details className="group">
          <summary className="cursor-pointer list-none text-[11.5px] text-[var(--bp-color-accent)] [&::-webkit-details-marker]:hidden">
            {`and ${rest.length} more ${rest.length === 1 ? "route" : "routes"}`}
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {rest.map((route) => (
              <RouteRelation key={route.routeKey} route={route} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function RouteRelation({ route }: { route: PublicEpisodeRoute }) {
  return (
    <Link
      to="/routes/$routeId"
      params={{ routeId: route.slug }}
      search={{ tab: "history" }}
      viewTransition
      className="inline-flex items-center gap-1.5 no-underline"
    >
      <RouteBadge route={route.routeId} displayLabel={route.label} size="sm" />
      <span className="font-mono text-[10.5px] text-[var(--bp-color-ink-40)]">
        {route.routeKey}
      </span>
    </Link>
  );
}

/**
 * Treatment components nested inside their change. The source states each one
 * in its own sentence, so the sentences are the disclosure — there is no second
 * treatment inventory here.
 */
function Components({ episode }: { episode: PublicInterventionEpisode }) {
  if (episode.components.length === 0) return null;
  const face = episode.components.slice(0, COMPONENT_FACE_CAP);
  const rest = episode.components.slice(COMPONENT_FACE_CAP);

  return (
    <div className="mt-3">
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {face.map((component) => (
          <li key={component.componentId} className="text-[12px] leading-[1.5]">
            <ComponentText component={component} />
          </li>
        ))}
      </ul>
      {rest.length === 0 ? null : (
        <details className="mt-1.5">
          <summary className="cursor-pointer list-none text-[11.5px] text-[var(--bp-color-accent)] [&::-webkit-details-marker]:hidden">
            {`and ${rest.length} more in the same change`}
          </summary>
          <ul className="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
            {rest.map((component) => (
              <li key={component.componentId} className="text-[12px] leading-[1.5]">
                <ComponentText component={component} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ComponentText({
  component,
}: {
  component: PublicInterventionEpisode["components"][number];
}) {
  if (component.authority === "tracker_enrichment") {
    return (
      <>
        <span className="font-semibold">{component.label}</span>
        {component.detail === null ? null : (
          <span className="text-[var(--bp-color-ink-70)]">{` ${component.detail}`}</span>
        )}
      </>
    );
  }
  return (
    <>
      <span className="font-semibold">{`${component.actionLabel}: ${component.treatmentFamilyLabel}`}</span>
      <span className="text-[var(--bp-color-ink-70)]">{` ${component.details}`}</span>
      <span className="ml-1.5 text-[11px] text-[var(--bp-color-ink-55)]">
        {component.extent.label}
      </span>
      {component.extent.description === null ? null : (
        <span className="text-[var(--bp-color-ink-55)]">{` — ${component.extent.description}`}</span>
      )}
      {component.caveats.length === 0 ? null : (
        <ul className="m-0 mt-1 list-disc pl-4 text-[11px] text-[var(--bp-color-ink-55)]">
          {component.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function PlacementHistory({ episode }: { episode: PublicInterventionEpisode }) {
  if (episode.authority !== "producer" || episode.placements.length === 0) return null;
  return (
    <details className="mt-2.5 text-[11.5px] text-[var(--bp-color-ink-55)]">
      <summary className="cursor-pointer list-none text-[var(--bp-color-accent)] [&::-webkit-details-marker]:hidden">
        {`${episode.placements.length} historical placement ${episode.placements.length === 1 ? "record" : "records"}`}
      </summary>
      <ul className="m-0 mt-1.5 list-disc space-y-1 pl-4">
        {episode.placements.map((placement) => (
          <li key={placement.placementKey}>
            {placement.confirmedCurrent === null
              ? `${placement.stateAsOf.replaceAll("_", " ")} as of ${placement.asOfDate}; this is not a confirmed-current claim.`
              : `Confirmed active as of ${placement.confirmedCurrent.asOfDate}.`}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Only a published study mapped to this change may state a result. */
function Finding({ episode }: { episode: PublicInterventionEpisode }) {
  const finding = episode.finding;
  if (finding === null) return null;
  return (
    <div className="mt-3 rounded-[3px] bg-[var(--bp-color-paper-deep)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[14px] font-semibold">{finding.headline}</span>
        <span className="text-[11.5px] text-[var(--bp-color-ink-55)]">{finding.comparison}</span>
      </div>
      {finding.caveat === null ? null : (
        <p className="mt-1.5 text-[11.5px] leading-[1.5] text-[var(--bp-color-ink-55)]">
          {finding.caveat}
        </p>
      )}
    </div>
  );
}

/** Ordinary public source labels. No evidence vocabulary, no identifiers. */
export function sourceEntries(episode: PublicInterventionEpisode): SourceNoteEntry[] {
  return episode.citations.map((citation) => {
    const detail = sourceDetail(citation.publisher, citation.published);
    return {
      label: citation.label,
      ...(citation.url === null ? {} : { href: citation.url }),
      ...(detail === null ? {} : { detail }),
    };
  });
}

function sourceDetail(publisher: string | null, published: string | null): string | null {
  if (publisher === null && published === null) return null;
  if (published === null) return publisher;
  if (publisher === null) return published;
  return `${publisher}, ${published}`;
}
