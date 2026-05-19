import { eq, sql } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import {
  localContextEvent,
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
