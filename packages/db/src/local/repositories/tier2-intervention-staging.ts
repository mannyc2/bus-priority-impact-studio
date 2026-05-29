import { type LocalPipelineDb } from "../client.js";
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

export async function replaceTier2InterventionStagingRows(
  db: LocalPipelineDb,
  input: {
    events: readonly LocalTier2InterventionStagingEvent[];
    routes: readonly LocalTier2InterventionStagingEventRoute[];
    sourceSpans: readonly LocalTier2InterventionStagingEventSourceSpan[];
  },
): Promise<void> {
  await db.delete(localTier2InterventionEventSourceSpan);
  await db.delete(localTier2InterventionEventRoute);
  await db.delete(localTier2InterventionEvent);
  if (input.events.length > 0) {
    await db.insert(localTier2InterventionEvent).values([...input.events]);
  }
  if (input.routes.length > 0) {
    await db.insert(localTier2InterventionEventRoute).values([...input.routes]);
  }
  if (input.sourceSpans.length > 0) {
    await db.insert(localTier2InterventionEventSourceSpan).values([...input.sourceSpans]);
  }
}
