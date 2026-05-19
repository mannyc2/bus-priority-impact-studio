import { and, asc, eq, inArray, lt, type SQL, sql } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import {
  localContextEvent,
  localContextEventRouteTouch,
  localFindingCandidate,
  localFindingCoverageAudit,
  localFindingEvidenceLink,
} from "../schema.js";

export type LocalContextEvent = {
  eventId: string;
  sourceId: string;
  sourceRowId: string;
  eventKind: string;
  occurredAt: string;
  endedAt: string | null;
  physicalId: string | null;
  lat: number | null;
  lng: number | null;
  routeId: string | null;
  payloadJson: string;
  ingestedAt: string;
};

export type LocalContextEventRouteTouch = {
  eventId: string;
  routeId: string;
  sourceId: string;
  eventKind: string;
  occurredAt: string;
  endedAt: string | null;
  physicalId: string | null;
  touchKind: "direct_route" | "route_lion_link";
  evidenceRole: "primary" | "context";
  overlapMeters: number | null;
  bufferMeters: number | null;
  routeFanout: number;
  matchWeight: number;
  computedAt: string;
};

export type ListContextEventRouteTouchesArgs = {
  windowStart: string;
  windowEnd: string;
  routeId?: string;
  eventKinds?: readonly string[];
  evidenceRoles?: readonly LocalContextEventRouteTouch["evidenceRole"][];
  limit?: number;
};

export type LocalFindingCandidate = {
  candidateId: string;
  detectorId: string;
  detectorRunId: string;
  routeId: string | null;
  physicalId: string | null;
  severity: "info" | "low" | "medium" | "high";
  claimText: string;
  windowStart: string | null;
  windowEnd: string | null;
  status: "open" | "superseded" | "dismissed" | "promoted";
  createdAt: string;
};

export type LocalFindingEvidenceLink = {
  linkId: string;
  candidateId: string;
  evidenceKind: "metric" | "context_event" | "source_row" | "missing_data";
  evidenceRef: string;
  evidenceWeight: number | null;
  note: string | null;
};

export type LocalFindingCoverageAudit = {
  auditId: string;
  detectorRunId: string;
  detectorId: string;
  scopeKind: "route" | "segment" | "corridor";
  scopeId: string;
  outcome: "hit" | "miss_no_evidence" | "skipped_missing_input";
  reason: string | null;
  inputsSeenJson: string | null;
  inputsExpectedJson: string | null;
  createdAt: string;
};

const UPSERT_CHUNK = 250;

async function chunked<T>(rows: readonly T[], run: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    await run(rows.slice(i, i + UPSERT_CHUNK));
  }
}

export async function upsertContextEvents(
  db: LocalPipelineDb,
  rows: readonly LocalContextEvent[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, async (chunk) => {
    await db
      .insert(localContextEvent)
      .values(chunk)
      .onConflictDoUpdate({
        target: localContextEvent.eventId,
        set: {
          sourceId: sql`excluded.source_id`,
          sourceRowId: sql`excluded.source_row_id`,
          eventKind: sql`excluded.event_kind`,
          occurredAt: sql`excluded.occurred_at`,
          endedAt: sql`excluded.ended_at`,
          physicalId: sql`excluded.physical_id`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          routeId: sql`excluded.route_id`,
          payloadJson: sql`excluded.payload_json`,
          ingestedAt: sql`excluded.ingested_at`,
        },
      });
  });
}

export async function countContextEvents(db: LocalPipelineDb): Promise<number> {
  const rows = (await db
    .select({ n: sql<number>`count(*)` })
    .from(localContextEvent)) as unknown as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
}

export async function listContextEventRouteTouchesForWindow(
  db: LocalPipelineDb,
  args: ListContextEventRouteTouchesArgs,
): Promise<LocalContextEventRouteTouch[]> {
  const conditions: SQL[] = [
    lt(localContextEventRouteTouch.occurredAt, args.windowEnd),
    sql`coalesce(${localContextEventRouteTouch.endedAt}, ${localContextEventRouteTouch.occurredAt}) >= ${args.windowStart}`,
  ];
  if (args.routeId !== undefined) {
    conditions.push(eq(localContextEventRouteTouch.routeId, args.routeId));
  }
  if (args.eventKinds !== undefined && args.eventKinds.length > 0) {
    conditions.push(inArray(localContextEventRouteTouch.eventKind, [...args.eventKinds]));
  }
  if (args.evidenceRoles !== undefined && args.evidenceRoles.length > 0) {
    conditions.push(inArray(localContextEventRouteTouch.evidenceRole, [...args.evidenceRoles]));
  }

  const query = db
    .select()
    .from(localContextEventRouteTouch)
    .where(and(...conditions))
    .orderBy(
      asc(localContextEventRouteTouch.routeId),
      asc(localContextEventRouteTouch.occurredAt),
      asc(localContextEventRouteTouch.eventId),
    );

  const rows = args.limit === undefined ? await query : await query.limit(args.limit);
  return rows as LocalContextEventRouteTouch[];
}

export async function insertFindingCandidate(
  db: LocalPipelineDb,
  row: LocalFindingCandidate,
): Promise<void> {
  await db.insert(localFindingCandidate).values(row);
}

export async function insertFindingEvidenceLinks(
  db: LocalPipelineDb,
  rows: readonly LocalFindingEvidenceLink[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, async (chunk) => {
    await db.insert(localFindingEvidenceLink).values(chunk);
  });
}

export async function insertCoverageAudit(
  db: LocalPipelineDb,
  rows: readonly LocalFindingCoverageAudit[],
): Promise<void> {
  if (rows.length === 0) return;
  await chunked(rows, async (chunk) => {
    await db.insert(localFindingCoverageAudit).values(chunk);
  });
}

export async function listCandidatesByRoute(
  db: LocalPipelineDb,
  routeId: string,
): Promise<LocalFindingCandidate[]> {
  return (await db
    .select()
    .from(localFindingCandidate)
    .where(eq(localFindingCandidate.routeId, routeId))) as LocalFindingCandidate[];
}

export async function listEvidenceForCandidate(
  db: LocalPipelineDb,
  candidateId: string,
): Promise<LocalFindingEvidenceLink[]> {
  return (await db
    .select()
    .from(localFindingEvidenceLink)
    .where(eq(localFindingEvidenceLink.candidateId, candidateId))) as LocalFindingEvidenceLink[];
}
