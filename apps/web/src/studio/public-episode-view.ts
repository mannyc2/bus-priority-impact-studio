import type {
  PublicInterventionEpisode,
  PublicNetworkBuildoutSnapshot,
} from "@bp/domain/studio/public-intervention-episodes";
import {
  type ChangeDate,
  changeDatesOverlap,
  compareChangeDatesNewestFirst,
} from "@/studio/change-date";
import {
  BUILDOUT_FAMILIES,
  type BuildoutSeries,
  buildoutReadings,
  type NetworkBuildout,
} from "@/studio/network-change-record";

export function compareEpisodesNewestFirst(
  left: PublicInterventionEpisode,
  right: PublicInterventionEpisode,
): number {
  return (
    compareChangeDatesNewestFirst(comparableDate(left), comparableDate(right)) ||
    left.title.localeCompare(right.title)
  );
}

function episodeStartKey(episode: PublicInterventionEpisode): string {
  return episode.date.intervalStart ?? episode.date.intervalEnd ?? "9999";
}

/** Exact public route-key match. Distinct B44 producer keys never collapse. */
export function episodesForRoute(
  episodes: readonly PublicInterventionEpisode[],
  routeKey: string,
): PublicInterventionEpisode[] {
  return episodes
    .filter((episode) => episode.routes.some((route) => route.routeKey === routeKey))
    .toSorted(compareEpisodesNewestFirst);
}

export type KindFacet = { kindKey: string; label: string; episodeCount: number };

export function publicKindFacets(episodes: readonly PublicInterventionEpisode[]): KindFacet[] {
  const counts = new Map<string, { label: string; episodeCount: number }>();
  for (const episode of episodes) {
    for (const family of episode.treatmentFamilies) {
      const current = counts.get(family.treatmentFamilyKey);
      counts.set(family.treatmentFamilyKey, {
        label: family.label,
        episodeCount: (current?.episodeCount ?? 0) + 1,
      });
    }
  }
  return [...counts.entries()]
    .map(([kindKey, value]) => ({
      kindKey,
      label: value.label,
      episodeCount: value.episodeCount,
    }))
    .toSorted(
      (left, right) =>
        right.episodeCount - left.episodeCount || left.label.localeCompare(right.label),
    );
}

export function filterEpisodes(
  episodes: readonly PublicInterventionEpisode[],
  filters: { kindKey: string | null; routeQuery: string },
): PublicInterventionEpisode[] {
  const query = filters.routeQuery.trim().toLowerCase();
  return episodes.filter((episode) => {
    if (
      filters.kindKey !== null &&
      !episode.treatmentFamilies.some((family) => family.treatmentFamilyKey === filters.kindKey)
    ) {
      return false;
    }
    if (query.length === 0) return true;
    return episode.routes.some(
      (route) =>
        route.label.toLowerCase().includes(query) ||
        route.routeId.toLowerCase().includes(query) ||
        route.routeKey.includes(query),
    );
  });
}

export type ChronologyAxis = {
  startYear: number;
  endYear: number;
  ticks: readonly string[];
};
export type ChronologyBand = {
  episodeId: string;
  row: number;
  start: number;
  end: number;
  shape: "point" | "bar";
  label: string;
};
export type ChronologyOverlap = {
  start: string;
  end: string;
  episodeIds: readonly string[];
};

const MIN_BAND_FRACTION = 0.02;
const BAND_GUTTER_FRACTION = 0.01;

export function chronologyAxis(
  episodes: readonly PublicInterventionEpisode[],
  months: readonly string[],
): ChronologyAxis {
  const years: number[] = [];
  for (const episode of episodes) {
    if (episode.date.intervalStart !== null) {
      years.push(Number(episode.date.intervalStart.slice(0, 4)));
    }
    if (episode.date.intervalEnd !== null) {
      years.push(Number(episode.date.intervalEnd.slice(0, 4)));
    }
  }
  for (const month of months) years.push(Number(month.slice(0, 4)));
  const finite = years.filter((year) => Number.isFinite(year));
  if (finite.length === 0) return { startYear: 0, endYear: 0, ticks: [] };
  const startYear = Math.min(...finite);
  const endYear = Math.max(...finite);
  const span = endYear - startYear;
  const intervals = span >= 9 ? 4 : span >= 4 ? 3 : Math.max(1, span);
  const ticks = Array.from({ length: intervals + 1 }, (_, index) =>
    String(startYear + Math.round((index * span) / intervals)),
  );
  return { startYear, endYear, ticks: [...new Set(ticks)] };
}

export function axisFraction(isoDay: string, axis: ChronologyAxis): number {
  const span = axis.endYear + 1 - axis.startYear;
  if (span <= 0) return 0;
  const year = Number(isoDay.slice(0, 4));
  const month = Number(isoDay.slice(5, 7));
  const day = Number(isoDay.slice(8, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0;
  const value = year + (month - 1) / 12 + (day - 1) / 372;
  return Math.min(1, Math.max(0, (value - axis.startYear) / span));
}

export function axisMonthFraction(isoMonth: string, axis: ChronologyAxis): number {
  return axisFraction(`${isoMonth}-01`, axis);
}

export function packChronologyBands(
  episodes: readonly PublicInterventionEpisode[],
  axis: ChronologyAxis,
): ChronologyBand[] {
  const byStart = [...episodes].sort(
    (left, right) =>
      episodeStartKey(left).localeCompare(episodeStartKey(right)) ||
      left.episodeId.localeCompare(right.episodeId),
  );
  const rowEnds: number[] = [];
  const bands: ChronologyBand[] = [];
  for (const episode of byStart) {
    if (episode.date.intervalStart === null || episode.date.intervalEnd === null) continue;
    const start = axisFraction(episode.date.intervalStart, axis);
    const end = axisFraction(episode.date.intervalEnd, axis);
    const shape = episode.date.precision === "day" ? "point" : "bar";
    const packEnd = Math.max(end, start + MIN_BAND_FRACTION);
    let row = rowEnds.findIndex((rowEnd) => start >= rowEnd + BAND_GUTTER_FRACTION);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = packEnd;
    bands.push({ episodeId: episode.episodeId, row, start, end, shape, label: episode.title });
  }
  return bands;
}

export function chronologyOverlaps(
  episodes: readonly PublicInterventionEpisode[],
): ChronologyOverlap[] {
  const spans: { start: string; end: string; episodeIds: Set<string> }[] = [];
  for (const [index, left] of episodes.entries()) {
    for (const right of episodes.slice(index + 1)) {
      if (
        left.date.intervalStart === null ||
        left.date.intervalEnd === null ||
        right.date.intervalStart === null ||
        right.date.intervalEnd === null
      ) {
        continue;
      }
      if (!changeDatesOverlap(comparableDate(left), comparableDate(right))) continue;
      spans.push({
        start:
          left.date.intervalStart >= right.date.intervalStart
            ? left.date.intervalStart
            : right.date.intervalStart,
        end:
          left.date.intervalEnd <= right.date.intervalEnd
            ? left.date.intervalEnd
            : right.date.intervalEnd,
        episodeIds: new Set([left.episodeId, right.episodeId]),
      });
    }
  }
  spans.sort(
    (left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end),
  );
  const merged: typeof spans = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last !== undefined && span.start <= last.end) {
      if (span.end > last.end) last.end = span.end;
      for (const id of span.episodeIds) last.episodeIds.add(id);
    } else {
      merged.push({ ...span, episodeIds: new Set(span.episodeIds) });
    }
  }
  return merged.map((span) => ({
    start: span.start,
    end: span.end,
    episodeIds: [...span.episodeIds].sort(),
  }));
}

export type TrendMarker = {
  month: string;
  label: string;
  episodeIds: readonly string[];
};

export function trendMarkers(
  episodes: readonly PublicInterventionEpisode[],
  months: readonly string[],
): TrendMarker[] {
  const window = [...months].sort();
  const first = window[0];
  const last = window.at(-1);
  if (first === undefined || last === undefined) return [];
  const byMonth = new Map<string, string[]>();
  for (const episode of [...episodes].sort((left, right) =>
    episodeStartKey(left).localeCompare(episodeStartKey(right)),
  )) {
    const start = episode.date.intervalStart ?? episode.date.intervalEnd;
    if (start === null) continue;
    const month = start.slice(0, 7);
    if (month < first || month > last) continue;
    const group = byMonth.get(month) ?? [];
    group.push(episode.episodeId);
    byMonth.set(month, group);
  }
  let index = 0;
  return [...byMonth.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([month, episodeIds]) => {
      const firstNumber = index + 1;
      const lastNumber = index + episodeIds.length;
      index = lastNumber;
      return {
        month,
        label: firstNumber === lastNumber ? String(firstNumber) : `${firstNumber}–${lastNumber}`,
        episodeIds,
      };
    });
}

export function hasEpisodeInsideSeries(
  episodes: readonly PublicInterventionEpisode[],
  months: readonly string[],
): boolean {
  return trendMarkers(episodes, months).length > 0;
}

export function episodesOutsideSeries(
  episodes: readonly PublicInterventionEpisode[],
  months: readonly string[],
): PublicInterventionEpisode[] {
  const first = [...months].sort()[0];
  if (first === undefined) return [...episodes];
  return episodes.filter(
    (episode) => episode.date.intervalEnd !== null && episode.date.intervalEnd.slice(0, 7) < first,
  );
}

function comparableDate(episode: PublicInterventionEpisode): ChangeDate {
  const { date } = episode;
  if (date.intervalStart === null || date.intervalEnd === null) {
    return { precision: "unknown", display: date.display, raw: date.value };
  }
  const precision =
    date.precision === "season"
      ? "quarter"
      : date.precision === "upper_bound_day"
        ? "range"
        : date.precision;
  return {
    precision,
    start: date.intervalStart,
    end: date.intervalEnd,
    display: date.display,
    raw: date.value,
  };
}

export function networkBuildoutModel(snapshot: PublicNetworkBuildoutSnapshot): NetworkBuildout {
  const years = Array.from(
    { length: snapshot.lastYear - snapshot.firstYear + 1 },
    (_, index) => snapshot.firstYear + index,
  );
  const routesByKey = new Map(
    snapshot.series.map((entry) => [entry.familyKey, entry.routesByYear]),
  );
  const series: BuildoutSeries[] = BUILDOUT_FAMILIES.map((family) => {
    const routesByYear = routesByKey.get(family.key) ?? [];
    const values = years.map((year, index) => ({
      year,
      routes: routesByYear[index] ?? 0,
    }));
    return {
      familyKey: family.key,
      label: family.label,
      endLabel: family.endLabel,
      color: family.color,
      values,
      endValue: values.at(-1)?.routes ?? 0,
    };
  });
  return {
    series,
    firstYear: snapshot.firstYear,
    lastYear: snapshot.lastYear,
    lastCompleteYear: snapshot.lastCompleteYear,
    partialFinalYear: snapshot.partialFinalYear,
    readings: buildoutReadings(
      series,
      snapshot.firstYear,
      snapshot.lastYear,
      snapshot.lastCompleteYear,
    ),
    routesWithAnyChange: snapshot.routesWithDocumentedWork,
    routesWithNoChange: snapshot.routeCount - snapshot.routesWithDocumentedWork,
  };
}

/**
 * One real change rendered once. The pack models a rollout as one episode per
 * affected route, so an enforcement activation or a network redesign arrives as
 * dozens of episodes sharing a date, a treatment mix, a source and a title. The
 * merge is display-only: every route, component, placement and citation of
 * every member survives the union, and per-route pages are unaffected because a
 * single route never holds two members of the same change.
 */
export type MergedEpisode = PublicInterventionEpisode & {
  /** Episode ids folded into this entry (length 1 when nothing merged). */
  mergedEpisodeIds: readonly string[];
};

/** Camera-enforcement titles end in the route phrase the builder appended. */
function titleStem(episode: PublicInterventionEpisode): string {
  if (episode.authority !== "tracker_enrichment") return episode.title;
  const separator = episode.title.indexOf(" on ");
  return separator === -1 ? episode.title : episode.title.slice(0, separator);
}

function mergeKey(episode: PublicInterventionEpisode): string {
  return `${episode.authority}|${episode.date.value}|${familyKey(episode)}|${titleStem(episode).toLowerCase()}`;
}

function familyKey(episode: PublicInterventionEpisode): string {
  return episode.treatmentFamilies
    .map((family) => family.treatmentFamilyKey)
    .toSorted()
    .join(",");
}

function unionBy<T>(items: readonly T[], identity: (item: T) => string): T[] {
  const kept = new Map<string, T>();
  for (const item of items) {
    const key = identity(item);
    if (!kept.has(key)) kept.set(key, item);
  }
  return [...kept.values()];
}

export function mergeIdenticalEpisodes(
  episodes: readonly PublicInterventionEpisode[],
): MergedEpisode[] {
  const buckets = new Map<string, PublicInterventionEpisode[]>();
  for (const episode of canonicalOrder(episodes)) {
    const key = mergeKey(episode);
    const bucket = buckets.get(key) ?? [];
    bucket.push(episode);
    buckets.set(key, bucket);
  }
  const merged: MergedEpisode[] = [];
  for (const bucket of buckets.values()) {
    const first = bucket[0];
    if (first === undefined) continue;
    merged.push(foldEpisodes(first, bucket));
  }
  return merged;
}

/** Canonical input order, so a shuffled list merges to an identical result. */
function canonicalOrder(
  episodes: readonly PublicInterventionEpisode[],
): PublicInterventionEpisode[] {
  return episodes.toSorted(
    (left, right) =>
      compareEpisodesNewestFirst(left, right) || left.episodeId.localeCompare(right.episodeId),
  );
}

function foldEpisodes(
  first: PublicInterventionEpisode,
  members: readonly PublicInterventionEpisode[],
): MergedEpisode {
  const mergedEpisodeIds = members.map((episode) => episode.episodeId).toSorted();
  if (members.length === 1) return { ...first, mergedEpisodeIds };
  const routes = unionBy(
    members.flatMap((episode) => episode.routes),
    (route) => route.routeKey,
  );
  const citations = unionBy(
    members.flatMap((episode) => episode.citations),
    (citation) => citation.label,
  );
  if (first.authority === "producer") {
    return {
      ...first,
      routes,
      citations,
      components: unionBy(
        members.flatMap((episode) => (episode.authority === "producer" ? episode.components : [])),
        (component) => component.componentId,
      ),
      placements: unionBy(
        members.flatMap((episode) => (episode.authority === "producer" ? episode.placements : [])),
        (placement) => placement.placementKey,
      ),
      mergedEpisodeIds,
    };
  }
  return {
    ...first,
    title: mergedTitle(first, routes),
    routes,
    citations,
    components: unionBy(
      members.flatMap((episode) =>
        episode.authority === "tracker_enrichment" ? episode.components : [],
      ),
      (component) => component.componentId,
    ),
    mergedEpisodeIds,
  };
}

/** A merged entry names its routes rather than inheriting one member's phrase. */
function mergedTitle(
  first: PublicInterventionEpisode,
  routes: readonly { label: string }[],
): string {
  if (routes.length < 2) return first.title;
  const stem = titleStem(first);
  return routes.length === 2
    ? `${stem} on ${routes.map((route) => route.label).join(" and ")}`
    : `${stem} on ${routes.length} routes`;
}

export type NetworkChangeGroup = {
  groupId: string;
  heading: string | null;
  dateDisplay: string;
  sourceLabel: string | null;
  routeCount: number;
  episodes: readonly MergedEpisode[];
};

const GROUP_THRESHOLD = 3;

export function networkChangeGroups(episodes: readonly MergedEpisode[]): NetworkChangeGroup[] {
  const buckets = new Map<string, MergedEpisode[]>();
  for (const episode of [...episodes].sort(compareEpisodesNewestFirst)) {
    /* Grouping is a same-day display convenience. It keys on the day and the
       treatment mix — never on a citation, which one member can carry an extra
       of and fall out of its own group. */
    const key = `${episodeStartKey(episode)}|${familyKey(episode)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(episode);
    buckets.set(key, bucket);
  }
  const groups: NetworkChangeGroup[] = [];
  for (const [key, bucket] of buckets) {
    const first = bucket[0];
    if (first === undefined) continue;
    const routeCount = new Set(
      bucket.flatMap((episode) => episode.routes.map((route) => route.routeKey)),
    ).size;
    if (bucket.length < GROUP_THRESHOLD) {
      for (const episode of bucket) {
        groups.push({
          groupId: episode.episodeId,
          heading: null,
          dateDisplay: episode.date.display,
          sourceLabel: episode.citations[0]?.label ?? null,
          routeCount: new Set(episode.routes.map((route) => route.routeKey)).size,
          episodes: [episode],
        });
      }
    } else {
      groups.push({
        groupId: `grp_${stableGroupId(key)}`,
        heading: `${bucket.length} changes on ${routeCount} ${routeCount === 1 ? "route" : "routes"}`,
        dateDisplay: first.date.display,
        sourceLabel: first.citations[0]?.label ?? null,
        routeCount,
        episodes: bucket,
      });
    }
  }
  return groups.toSorted(
    (left, right) =>
      compareEpisodesNewestFirst(
        left.episodes[0] as PublicInterventionEpisode,
        right.episodes[0] as PublicInterventionEpisode,
      ) || left.groupId.localeCompare(right.groupId),
  );
}

function stableGroupId(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
