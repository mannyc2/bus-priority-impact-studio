import { and, asc, eq } from "drizzle-orm";
import { insertAll, type LocalPipelineDb } from "../client.js";
import {
  localRouteArtifact,
  localRouteBatchBuiltRoute,
  localRouteBatchIssue,
  localRouteBatchStatus,
  localRouteBriefPeakWindow,
  localRouteBriefSlowestWindow,
  localRouteBriefSummary,
  localRouteComparisonRank,
  localRouteEquityContext,
  localRouteMonthSourceStatus,
  localRouteMonthTrend,
  localRouteReliabilityBaseline,
  localRouteReliabilityGapWindow,
  localRouteScorecard,
} from "../schema.js";

export type LocalRouteScorecard = typeof localRouteScorecard.$inferSelect;
export type LocalRouteArtifact = typeof localRouteArtifact.$inferSelect;
export type LocalRouteBriefSummary = typeof localRouteBriefSummary.$inferSelect;
export type LocalRouteBriefPeakWindow = typeof localRouteBriefPeakWindow.$inferSelect;
export type LocalRouteBriefSlowestWindow = typeof localRouteBriefSlowestWindow.$inferSelect;
export type LocalRouteComparisonRank = typeof localRouteComparisonRank.$inferSelect;
export type LocalRouteBatchStatus = typeof localRouteBatchStatus.$inferSelect;
export type LocalRouteBatchBuiltRoute = typeof localRouteBatchBuiltRoute.$inferSelect;
export type LocalRouteBatchIssue = typeof localRouteBatchIssue.$inferSelect;
export type LocalRouteReliabilityBaseline = typeof localRouteReliabilityBaseline.$inferSelect;
export type LocalRouteReliabilityGapWindow = typeof localRouteReliabilityGapWindow.$inferSelect;
export type LocalRouteMonthSourceStatus = typeof localRouteMonthSourceStatus.$inferSelect;
export type LocalRouteMonthTrend = typeof localRouteMonthTrend.$inferSelect;
export type LocalRouteEquityContext = typeof localRouteEquityContext.$inferSelect;
export type PersistedRouteBatchProgress = {
  status: LocalRouteBatchStatus | null;
  builtRoutes: LocalRouteBatchBuiltRoute[];
  issues: LocalRouteBatchIssue[];
};

export function replaceRouteScorecard(
  db: LocalPipelineDb,
  row: typeof localRouteScorecard.$inferInsert,
): void {
  db.transaction((tx) => {
    tx.delete(localRouteScorecard)
      .where(
        and(eq(localRouteScorecard.routeId, row.routeId), eq(localRouteScorecard.month, row.month)),
      )
      .run();
    tx.insert(localRouteScorecard).values(row).run();
  });
}

export async function listRouteScorecards(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteScorecard[]> {
  return db
    .select()
    .from(localRouteScorecard)
    .where(eq(localRouteScorecard.month, month))
    .orderBy(asc(localRouteScorecard.routeId));
}

export function replaceRouteArtifactsForMonth(
  db: LocalPipelineDb,
  month: string,
  rows: readonly (typeof localRouteArtifact.$inferInsert)[],
): void {
  db.transaction((tx) => {
    tx.delete(localRouteArtifact).where(eq(localRouteArtifact.month, month)).run();
    insertAll(tx, localRouteArtifact, [...rows]);
  });
}

export async function listRouteArtifacts(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteArtifact[]> {
  return db
    .select()
    .from(localRouteArtifact)
    .where(eq(localRouteArtifact.month, month))
    .orderBy(asc(localRouteArtifact.routeId), asc(localRouteArtifact.artifactName));
}

export function replaceRouteBriefRows(
  db: LocalPipelineDb,
  input: {
    summary: typeof localRouteBriefSummary.$inferInsert;
    peakWindows: readonly (typeof localRouteBriefPeakWindow.$inferInsert)[];
    slowestWindows: readonly (typeof localRouteBriefSlowestWindow.$inferInsert)[];
  },
): void {
  const { routeId, month } = input.summary;
  db.transaction((tx) => {
    tx.delete(localRouteBriefPeakWindow)
      .where(
        and(
          eq(localRouteBriefPeakWindow.routeId, routeId),
          eq(localRouteBriefPeakWindow.month, month),
        ),
      )
      .run();
    tx.delete(localRouteBriefSlowestWindow)
      .where(
        and(
          eq(localRouteBriefSlowestWindow.routeId, routeId),
          eq(localRouteBriefSlowestWindow.month, month),
        ),
      )
      .run();
    tx.delete(localRouteBriefSummary)
      .where(
        and(eq(localRouteBriefSummary.routeId, routeId), eq(localRouteBriefSummary.month, month)),
      )
      .run();
    tx.insert(localRouteBriefSummary).values(input.summary).run();
    insertAll(tx, localRouteBriefPeakWindow, [...input.peakWindows]);
    insertAll(tx, localRouteBriefSlowestWindow, [...input.slowestWindows]);
  });
}

export async function listRouteBriefSummaries(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBriefSummary[]> {
  return db
    .select()
    .from(localRouteBriefSummary)
    .where(eq(localRouteBriefSummary.month, month))
    .orderBy(asc(localRouteBriefSummary.routeId));
}

export async function listRouteBriefPeakWindows(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBriefPeakWindow[]> {
  return db
    .select()
    .from(localRouteBriefPeakWindow)
    .where(eq(localRouteBriefPeakWindow.month, month))
    .orderBy(asc(localRouteBriefPeakWindow.routeId), asc(localRouteBriefPeakWindow.windowRank));
}

export async function listRouteBriefSlowestWindows(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBriefSlowestWindow[]> {
  return db
    .select()
    .from(localRouteBriefSlowestWindow)
    .where(eq(localRouteBriefSlowestWindow.month, month))
    .orderBy(
      asc(localRouteBriefSlowestWindow.routeId),
      asc(localRouteBriefSlowestWindow.windowRank),
    );
}

export function replaceRouteComparisonRanks(
  db: LocalPipelineDb,
  month: string,
  rows: readonly (typeof localRouteComparisonRank.$inferInsert)[],
): void {
  db.transaction((tx) => {
    tx.delete(localRouteComparisonRank).where(eq(localRouteComparisonRank.month, month)).run();
    insertAll(tx, localRouteComparisonRank, [...rows]);
  });
}

export async function listRouteComparisonRanks(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteComparisonRank[]> {
  return db
    .select()
    .from(localRouteComparisonRank)
    .where(eq(localRouteComparisonRank.month, month))
    .orderBy(asc(localRouteComparisonRank.rank));
}

export function replaceRouteBatch(
  db: LocalPipelineDb,
  input: {
    status: typeof localRouteBatchStatus.$inferInsert;
    builtRoutes: readonly (typeof localRouteBatchBuiltRoute.$inferInsert)[];
    issues: readonly (typeof localRouteBatchIssue.$inferInsert)[];
  },
): void {
  db.transaction((tx) => {
    tx.delete(localRouteBatchBuiltRoute)
      .where(eq(localRouteBatchBuiltRoute.month, input.status.month))
      .run();
    tx.delete(localRouteBatchIssue).where(eq(localRouteBatchIssue.month, input.status.month)).run();
    tx.delete(localRouteBatchStatus)
      .where(eq(localRouteBatchStatus.month, input.status.month))
      .run();
    tx.insert(localRouteBatchStatus).values(input.status).run();
    insertAll(tx, localRouteBatchBuiltRoute, [...input.builtRoutes]);
    insertAll(tx, localRouteBatchIssue, [...input.issues]);
  });
}

export async function getRouteBatchStatus(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBatchStatus | null> {
  return (
    (
      await db.select().from(localRouteBatchStatus).where(eq(localRouteBatchStatus.month, month))
    )[0] ?? null
  );
}

export async function listRouteBatchBuiltRoutes(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBatchBuiltRoute[]> {
  return db
    .select()
    .from(localRouteBatchBuiltRoute)
    .where(eq(localRouteBatchBuiltRoute.month, month))
    .orderBy(asc(localRouteBatchBuiltRoute.routeRank));
}

export async function listRouteBatchIssues(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteBatchIssue[]> {
  return db
    .select()
    .from(localRouteBatchIssue)
    .where(eq(localRouteBatchIssue.month, month))
    .orderBy(asc(localRouteBatchIssue.issueRank));
}

export async function getPersistedRouteBatchProgress(
  db: LocalPipelineDb,
  month: string,
): Promise<PersistedRouteBatchProgress> {
  const [status, builtRoutes, issues] = await Promise.all([
    getRouteBatchStatus(db, month),
    listRouteBatchBuiltRoutes(db, month),
    listRouteBatchIssues(db, month),
  ]);

  return {
    status,
    builtRoutes,
    issues,
  };
}

export function replaceRouteReliabilityRows(
  db: LocalPipelineDb,
  month: string,
  input: {
    baselines: readonly (typeof localRouteReliabilityBaseline.$inferInsert)[];
    gapWindows: readonly (typeof localRouteReliabilityGapWindow.$inferInsert)[];
    sourceStatuses: readonly (typeof localRouteMonthSourceStatus.$inferInsert)[];
  },
): void {
  db.transaction((tx) => {
    tx.delete(localRouteReliabilityGapWindow)
      .where(eq(localRouteReliabilityGapWindow.month, month))
      .run();
    tx.delete(localRouteMonthSourceStatus)
      .where(
        and(
          eq(localRouteMonthSourceStatus.month, month),
          eq(localRouteMonthSourceStatus.sourceScope, "reliability"),
        ),
      )
      .run();
    tx.delete(localRouteReliabilityBaseline)
      .where(eq(localRouteReliabilityBaseline.month, month))
      .run();
    insertAll(tx, localRouteReliabilityBaseline, [...input.baselines]);
    insertAll(tx, localRouteReliabilityGapWindow, [...input.gapWindows]);
    insertAll(tx, localRouteMonthSourceStatus, [...input.sourceStatuses]);
  });
}

export async function listRouteReliabilityBaselines(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteReliabilityBaseline[]> {
  return db
    .select()
    .from(localRouteReliabilityBaseline)
    .where(eq(localRouteReliabilityBaseline.month, month))
    .orderBy(asc(localRouteReliabilityBaseline.routeId));
}

export async function listRouteReliabilityGapWindows(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteReliabilityGapWindow[]> {
  return db
    .select()
    .from(localRouteReliabilityGapWindow)
    .where(eq(localRouteReliabilityGapWindow.month, month))
    .orderBy(
      asc(localRouteReliabilityGapWindow.routeId),
      asc(localRouteReliabilityGapWindow.windowRank),
    );
}

export function replaceRouteMonthTrends(
  db: LocalPipelineDb,
  rows: readonly (typeof localRouteMonthTrend.$inferInsert)[],
): void {
  db.transaction((tx) => {
    tx.delete(localRouteMonthTrend).run();
    insertAll(tx, localRouteMonthTrend, [...rows]);
  });
}

export async function listRouteMonthTrends(db: LocalPipelineDb): Promise<LocalRouteMonthTrend[]> {
  return db
    .select()
    .from(localRouteMonthTrend)
    .orderBy(asc(localRouteMonthTrend.routeId), asc(localRouteMonthTrend.month));
}

export function replaceRouteEquityRows(
  db: LocalPipelineDb,
  month: string,
  input: {
    rows: readonly (typeof localRouteEquityContext.$inferInsert)[];
    sourceStatuses: readonly (typeof localRouteMonthSourceStatus.$inferInsert)[];
  },
): void {
  db.transaction((tx) => {
    tx.delete(localRouteEquityContext).where(eq(localRouteEquityContext.month, month)).run();
    tx.delete(localRouteMonthSourceStatus)
      .where(
        and(
          eq(localRouteMonthSourceStatus.month, month),
          eq(localRouteMonthSourceStatus.sourceScope, "equity_context"),
        ),
      )
      .run();
    insertAll(tx, localRouteEquityContext, [...input.rows]);
    insertAll(tx, localRouteMonthSourceStatus, [...input.sourceStatuses]);
  });
}

export async function listRouteEquityContexts(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteEquityContext[]> {
  return db
    .select()
    .from(localRouteEquityContext)
    .where(eq(localRouteEquityContext.month, month))
    .orderBy(asc(localRouteEquityContext.routeId));
}

export async function listRouteMonthSourceStatuses(
  db: LocalPipelineDb,
  month: string,
): Promise<LocalRouteMonthSourceStatus[]> {
  return db
    .select()
    .from(localRouteMonthSourceStatus)
    .where(eq(localRouteMonthSourceStatus.month, month))
    .orderBy(
      asc(localRouteMonthSourceStatus.routeId),
      asc(localRouteMonthSourceStatus.sourceScope),
      asc(localRouteMonthSourceStatus.sourceId),
    );
}
