import { insertAll, type LocalPipelineDb } from "../client.js";
import {
  localTier2InterventionEvent,
  localTier2InterventionEventRoute,
  localTier2InterventionEventSourceSpan,
} from "../schema.js";

export type LocalTier2InterventionStagingEvent = {
  eventId: string;
  candidateId: string;
  sourceId: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  interventionType: string;
  implementationDate: string;
  implementationMonth: string;
  datePrecision: string;
  eventStatus: string;
  validationState: string;
  duplicateReviewState: string;
  duplicateFingerprint: string;
  promotionState: string;
};

export type LocalTier2InterventionStagingEventRoute = {
  eventId: string;
  routeId: string;
};

export type LocalTier2InterventionStagingEventSourceSpan = {
  eventId: string;
  chunkRank: number;
  chunkId: string;
};

export function replaceTier2InterventionStagingRows(
  db: LocalPipelineDb,
  input: {
    events: readonly LocalTier2InterventionStagingEvent[];
    routes: readonly LocalTier2InterventionStagingEventRoute[];
    sourceSpans: readonly LocalTier2InterventionStagingEventSourceSpan[];
  },
): void {
  db.transaction((tx) => {
    tx.delete(localTier2InterventionEventSourceSpan).run();
    tx.delete(localTier2InterventionEventRoute).run();
    tx.delete(localTier2InterventionEvent).run();
    insertAll(tx, localTier2InterventionEvent, [...input.events]);
    insertAll(tx, localTier2InterventionEventRoute, [...input.routes]);
    insertAll(tx, localTier2InterventionEventSourceSpan, [...input.sourceSpans]);
  });
}
