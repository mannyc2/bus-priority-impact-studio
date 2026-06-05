import { and, eq } from "drizzle-orm";
import type { LocalPipelineDb } from "../client.js";
import {
  local311ServiceRequest,
  localDotStreetPermit,
  localDotTrafficSpeed,
  localDotTrafficVolumeCount,
  localNypdCollision,
} from "../schema.js";

export type LocalGeocodeUpdate = {
  physicalId: string | null;
  confidence: string;
};

export async function updateTrafficSpeedGeocode(
  db: LocalPipelineDb,
  key: { linkId: string; sampledAt: string },
  update: LocalGeocodeUpdate,
): Promise<void> {
  await db
    .update(localDotTrafficSpeed)
    .set({
      physicalId: update.physicalId,
      geocodeConfidence: update.confidence,
    })
    .where(
      and(
        eq(localDotTrafficSpeed.linkId, key.linkId),
        eq(localDotTrafficSpeed.sampledAt, key.sampledAt),
      ),
    );
}

export async function updateTrafficVolumeGeocode(
  db: LocalPipelineDb,
  key: { requestId: number; segmentId: number; sampledAt: string },
  update: LocalGeocodeUpdate,
): Promise<void> {
  await db
    .update(localDotTrafficVolumeCount)
    .set({
      physicalId: update.physicalId,
      geocodeConfidence: update.confidence,
    })
    .where(
      and(
        eq(localDotTrafficVolumeCount.requestId, key.requestId),
        eq(localDotTrafficVolumeCount.segmentId, key.segmentId),
        eq(localDotTrafficVolumeCount.sampledAt, key.sampledAt),
      ),
    );
}

export async function updateNypdCollisionGeocode(
  db: LocalPipelineDb,
  collisionId: string,
  update: LocalGeocodeUpdate,
): Promise<void> {
  await db
    .update(localNypdCollision)
    .set({
      physicalId: update.physicalId,
      geocodeConfidence: update.confidence,
    })
    .where(eq(localNypdCollision.collisionId, collisionId));
}

export async function updateDotStreetPermitGeocode(
  db: LocalPipelineDb,
  permitNumber: string,
  update: LocalGeocodeUpdate,
): Promise<void> {
  await db
    .update(localDotStreetPermit)
    .set({
      physicalId: update.physicalId,
      geocodeConfidence: update.confidence,
    })
    .where(eq(localDotStreetPermit.permitNumber, permitNumber));
}

export async function update311ServiceRequestGeocode(
  db: LocalPipelineDb,
  uniqueKey: string,
  update: LocalGeocodeUpdate,
): Promise<void> {
  await db
    .update(local311ServiceRequest)
    .set({
      physicalId: update.physicalId,
      geocodeConfidence: update.confidence,
    })
    .where(eq(local311ServiceRequest.uniqueKey, uniqueKey));
}
