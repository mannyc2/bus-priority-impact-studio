import { decodeStrict } from "@bp/domain/decode";
import {
  type CanonicalPublishedAt,
  CanonicalPublishedAtSchema,
  type CoverageWindow,
  CoverageWindowSchema,
  type ReleaseId,
  ReleaseIdSchema,
  releaseIdFromPublishedAt,
} from "@bp/domain/studio/shared";
import { and, desc, eq } from "drizzle-orm";
import type { D1ServingDb } from "../client.js";
import { mapReleaseCatalog } from "../schema.js";

export type MapReleaseCatalogEntry = {
  readonly releaseId: ReleaseId;
  readonly publishedAt: CanonicalPublishedAt;
  readonly coverage: CoverageWindow;
  readonly manifestKey: string;
  readonly manifestSha256: string;
  readonly releaseProfile: "full";
  readonly verificationStatus: "pass";
  readonly routeCount: number;
};

const entryKeys = [
  "coverage",
  "manifestKey",
  "manifestSha256",
  "publishedAt",
  "releaseId",
  "releaseProfile",
  "routeCount",
  "verificationStatus",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decodeNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${field} must be a non-empty string without NUL bytes.`);
  }
  return value;
}

function decodeSha256(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("manifestSha256 must be a lowercase hexadecimal SHA-256 digest.");
  }
  return value;
}

function decodeRouteCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("routeCount must be a non-negative safe integer.");
  }
  return value;
}

/**
 * Decode catalog metadata at both the D1 read and registration-write boundaries.
 * The exact-key check keeps the small publication contract closed.
 */
export function decodeMapReleaseCatalogEntry(input: unknown): MapReleaseCatalogEntry {
  if (!isRecord(input)) {
    throw new Error("Map release catalog metadata must be an object.");
  }

  const actualKeys = Object.keys(input).toSorted();
  if (
    actualKeys.length !== entryKeys.length ||
    actualKeys.some((key, index) => key !== entryKeys[index])
  ) {
    throw new Error("Map release catalog metadata has missing or unexpected fields.");
  }

  const candidate = input as Record<(typeof entryKeys)[number], unknown>;
  const releaseId = decodeStrict(ReleaseIdSchema)(candidate.releaseId);
  const publishedAt = decodeStrict(CanonicalPublishedAtSchema)(candidate.publishedAt);
  const coverage = decodeStrict(CoverageWindowSchema)(candidate.coverage);
  if (releaseIdFromPublishedAt(publishedAt) !== releaseId) {
    throw new Error("releaseId does not match publishedAt.");
  }
  if (candidate.releaseProfile !== "full") {
    throw new Error("releaseProfile must be full before catalog registration.");
  }
  if (candidate.verificationStatus !== "pass") {
    throw new Error("verificationStatus must be pass before catalog registration.");
  }

  return {
    releaseId,
    publishedAt,
    coverage,
    manifestKey: decodeNonEmptyString(candidate.manifestKey, "manifestKey"),
    manifestSha256: decodeSha256(candidate.manifestSha256),
    releaseProfile: "full",
    verificationStatus: "pass",
    routeCount: decodeRouteCount(candidate.routeCount),
  };
}

async function selectLatestVerifiedFullMapRelease(db: D1ServingDb) {
  return db
    .select({
      release_id: mapReleaseCatalog.releaseId,
      published_at: mapReleaseCatalog.publishedAt,
      coverage_start: mapReleaseCatalog.coverageStart,
      coverage_end: mapReleaseCatalog.coverageEnd,
      manifest_key: mapReleaseCatalog.manifestKey,
      manifest_sha256: mapReleaseCatalog.manifestSha256,
      release_profile: mapReleaseCatalog.releaseProfile,
      verification_status: mapReleaseCatalog.verificationStatus,
      route_count: mapReleaseCatalog.routeCount,
    })
    .from(mapReleaseCatalog)
    .where(
      and(
        eq(mapReleaseCatalog.releaseProfile, "full"),
        eq(mapReleaseCatalog.verificationStatus, "pass"),
      ),
    )
    .orderBy(desc(mapReleaseCatalog.publishedAt), desc(mapReleaseCatalog.releaseId))
    .limit(1);
}

export type MapReleaseCatalogRow = Awaited<
  ReturnType<typeof selectLatestVerifiedFullMapRelease>
>[number];

export async function findLatestVerifiedFullMapRelease(
  db: D1ServingDb,
): Promise<MapReleaseCatalogEntry | null> {
  const row = (await selectLatestVerifiedFullMapRelease(db))[0];
  if (row === undefined) return null;

  return decodeMapReleaseCatalogEntry({
    releaseId: row.release_id,
    publishedAt: row.published_at,
    coverage: {
      start: row.coverage_start,
      end: row.coverage_end,
    },
    manifestKey: row.manifest_key,
    manifestSha256: row.manifest_sha256,
    releaseProfile: row.release_profile,
    verificationStatus: row.verification_status,
    routeCount: row.route_count,
  });
}
