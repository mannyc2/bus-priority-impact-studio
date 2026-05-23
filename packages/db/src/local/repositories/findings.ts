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
  touchKind: "direct_route" | "route_lion_link" | "parking_location_match";
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
  month: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  routeId: string | null;
  physicalId: string | null;
  category: "reliability" | "speed" | "intervention" | "data_quality" | "context";
  severity: "info" | "low" | "medium" | "high";
  confidence: "insufficient" | "low" | "medium" | "high";
  detectorScore: number;
  reasonCode: string;
  claimSafeLabel:
    | "no_issue_clean"
    | "issue_clean"
    | "issue_needs_review"
    | "insufficient_evidence"
    | "source_lag_expected";
  claimText: string;
  status: "open" | "promoted" | "dismissed" | "superseded";
  reviewState: "unreviewed" | "needs_review" | "approved" | "rejected";
  windowStart: string | null;
  windowEnd: string | null;
  createdAt: string;
};

export type LocalFindingEvidenceLink = {
  linkId: string;
  candidateId: string;
  evidenceKind:
    | "metric"
    | "context_event"
    | "source_row"
    | "missing_data"
    | "source_doc"
    | "coverage_audit";
  evidenceRole:
    | "primary"
    | "context"
    | "counter_evidence"
    | "caveat"
    | "missing_data"
    | "coverage_audit";
  evidenceRef: string;
  evidenceWeight: number | null;
  note: string | null;
};

export type LocalFindingCoverageAudit = {
  auditId: string;
  detectorRunId: string;
  detectorId: string;
  month: string;
  scopeKind: "route" | "segment" | "corridor" | "system";
  scopeId: string;
  outcome: "hit" | "clean_no_hit" | "skipped_missing_input" | "skipped_failed_join" | "source_lag";
  reasonCode: string | null;
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

export type ReplaceFindingsForMonthArgs = {
  month: string;
  detectorId: string;
  candidates: readonly LocalFindingCandidate[];
  evidence: readonly LocalFindingEvidenceLink[];
  coverage: readonly LocalFindingCoverageAudit[];
};

// Replace every candidate, evidence link, and coverage row for a single
// (month, detector) pair. Lets the detector job be idempotent against a fixed
// release month without churning unrelated detectors. Evidence rows cascade
// via the FK on candidate_id, but we delete them explicitly so the call also
// works when the caller wants to drop a detector entirely (candidates=[]).
export async function replaceFindingsForMonth(
  db: LocalPipelineDb,
  args: ReplaceFindingsForMonthArgs,
): Promise<void> {
  const candidateMatch = and(
    eq(localFindingCandidate.month, args.month),
    eq(localFindingCandidate.detectorId, args.detectorId),
  );
  const existing = (await db
    .select({ candidateId: localFindingCandidate.candidateId })
    .from(localFindingCandidate)
    .where(candidateMatch)) as Array<{ candidateId: string }>;
  const existingIds = existing.map((row) => row.candidateId);
  if (existingIds.length > 0) {
    for (let i = 0; i < existingIds.length; i += UPSERT_CHUNK) {
      const chunk = existingIds.slice(i, i + UPSERT_CHUNK);
      await db
        .delete(localFindingEvidenceLink)
        .where(inArray(localFindingEvidenceLink.candidateId, chunk));
    }
  }
  await db.delete(localFindingCandidate).where(candidateMatch);
  await db
    .delete(localFindingCoverageAudit)
    .where(
      and(
        eq(localFindingCoverageAudit.month, args.month),
        eq(localFindingCoverageAudit.detectorId, args.detectorId),
      ),
    );

  if (args.candidates.length > 0) {
    await chunked(args.candidates, async (chunk) => {
      await db.insert(localFindingCandidate).values(chunk);
    });
  }
  if (args.evidence.length > 0) {
    await chunked(args.evidence, async (chunk) => {
      await db.insert(localFindingEvidenceLink).values(chunk);
    });
  }
  if (args.coverage.length > 0) {
    await chunked(args.coverage, async (chunk) => {
      await db.insert(localFindingCoverageAudit).values(chunk);
    });
  }
}

// Replace every row tagged with a specific detector_run_id. Useful for
// re-running a single audit pass without trusting (month, detector_id) as the
// idempotency key (e.g. ad-hoc detector backtests).
export async function replaceFindingRun(
  db: LocalPipelineDb,
  args: {
    detectorRunId: string;
    candidates: readonly LocalFindingCandidate[];
    evidence: readonly LocalFindingEvidenceLink[];
    coverage: readonly LocalFindingCoverageAudit[];
  },
): Promise<void> {
  const existing = (await db
    .select({ candidateId: localFindingCandidate.candidateId })
    .from(localFindingCandidate)
    .where(eq(localFindingCandidate.detectorRunId, args.detectorRunId))) as Array<{
    candidateId: string;
  }>;
  const existingIds = existing.map((row) => row.candidateId);
  if (existingIds.length > 0) {
    for (let i = 0; i < existingIds.length; i += UPSERT_CHUNK) {
      const chunk = existingIds.slice(i, i + UPSERT_CHUNK);
      await db
        .delete(localFindingEvidenceLink)
        .where(inArray(localFindingEvidenceLink.candidateId, chunk));
    }
  }
  await db
    .delete(localFindingCandidate)
    .where(eq(localFindingCandidate.detectorRunId, args.detectorRunId));
  await db
    .delete(localFindingCoverageAudit)
    .where(eq(localFindingCoverageAudit.detectorRunId, args.detectorRunId));

  if (args.candidates.length > 0) {
    await chunked(args.candidates, async (chunk) => {
      await db.insert(localFindingCandidate).values(chunk);
    });
  }
  if (args.evidence.length > 0) {
    await chunked(args.evidence, async (chunk) => {
      await db.insert(localFindingEvidenceLink).values(chunk);
    });
  }
  if (args.coverage.length > 0) {
    await chunked(args.coverage, async (chunk) => {
      await db.insert(localFindingCoverageAudit).values(chunk);
    });
  }
}
