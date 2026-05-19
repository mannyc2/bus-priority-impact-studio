import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  getGeocodeCacheRow,
  type LocalGeocodeCacheRow,
  type LocalPipelineDb,
  upsertGeocodeCacheRow,
} from "@bp/db/local";
import {
  canonicalBoroughCode,
  canonicalBoroughName,
  createGeoclient,
  type Geoclient,
  GeoclientHttpError,
  normalizeStreetName,
} from "@bp/sources/nyc-geoclient";

/**
 * Geocoder facade used by per-source geocode jobs. Wraps:
 *   - lat/lng snap to nearest LION segment (spatialite-backed)
 *   - Geoclient lookup (address / intersection / free-text)
 *   - fuzzy fallback via LION street_name when Geoclient returns null
 *
 * All lookups flow through the local_address_geocode cache so re-runs are
 * free and idempotent. Misses are cached as physical_id=null rows.
 */

export type GeocodeInputAddress = {
  kind: "address";
  houseNumber: string;
  street: string;
  borough: string;
};

export type GeocodeInputIntersection = {
  kind: "intersection";
  crossStreetOne: string;
  crossStreetTwo: string;
  borough: string;
};

export type GeocodeInputLatLng = {
  kind: "latlng";
  lat: number;
  lng: number;
  hintStreet?: string | null;
  hintBorough?: string | null;
};

export type GeocodeInput = GeocodeInputAddress | GeocodeInputIntersection | GeocodeInputLatLng;

export type GeocodeOutcome = {
  physicalId: string | null;
  lat: number | null;
  lng: number | null;
  confidence: string;
  cached: boolean;
};

export type GeocoderOptions = {
  db: LocalPipelineDb;
  sqlite: Database;
  sourceLabel: string;
  geoclient?: Geoclient | null;
  snapMaxMeters?: number;
};

const ALL_BOROUGH_NAMES = ["manhattan", "bronx", "brooklyn", "queens", "staten island"] as const;

export class Geocoder {
  private readonly db: LocalPipelineDb;
  private readonly sqlite: Database;
  private readonly sourceLabel: string;
  private readonly geoclient: Geoclient | null;
  private readonly snapMaxMeters: number;
  private snapQuery: ReturnType<Database["prepare"]> | null = null;
  private fuzzyQuery: ReturnType<Database["prepare"]> | null = null;
  private readonly warnedHttpStatuses = new Set<number>();

  constructor(options: GeocoderOptions) {
    this.db = options.db;
    this.sqlite = options.sqlite;
    this.sourceLabel = options.sourceLabel;
    this.geoclient = options.geoclient ?? null;
    this.snapMaxMeters = options.snapMaxMeters ?? 60;
  }

  async resolve(input: GeocodeInput): Promise<GeocodeOutcome> {
    const rawKey = canonicalKey(this.sourceLabel, input);
    const cached = await getGeocodeCacheRow(this.db, rawKey);
    if (cached) {
      return cacheRowToOutcome(cached, true);
    }

    const outcome = await this.resolveUncached(input);

    const isHit = outcome.physicalId != null;
    const row: LocalGeocodeCacheRow = {
      rawKey,
      sourceLabel: this.sourceLabel,
      inputKind: input.kind,
      inputJson: JSON.stringify(input),
      physicalId: outcome.physicalId,
      lat: outcome.lat,
      lng: outcome.lng,
      confidence: isHit ? outcome.confidence : null,
      errorReason: isHit ? null : outcome.confidence,
      geocodedAt: new Date().toISOString(),
      rawResponse: null,
    };
    await upsertGeocodeCacheRow(this.db, row);
    return outcome;
  }

  private async resolveUncached(input: GeocodeInput): Promise<GeocodeOutcome> {
    if (input.kind === "latlng") {
      const snap = this.snapLatLng(input.lat, input.lng);
      if (snap) return { ...snap, cached: false };
      const fuzzy = this.fuzzyByStreet(input.hintStreet ?? null, input.hintBorough ?? null);
      if (fuzzy) return { ...fuzzy, cached: false };
      return { physicalId: null, lat: null, lng: null, confidence: "snap_miss", cached: false };
    }

    // Geoclient v2 only accepts borough as a name like "manhattan" / "brooklyn"
    // (or 2-letter / numeric forms). Source data uses county codes ("K", "NY"),
    // single letters, or community-board strings ("01 BROOKLYN"); resolve here
    // before any API call so we never send a guess.
    const boroughForApi = canonicalBoroughName(input.borough);

    let geoclientMissStatus: number | null = null;
    if (this.geoclient) {
      // When the source row lacks a parseable borough, brute-force try all
      // five. NYC street + house number is borough-unique often enough that
      // exactly one will resolve; the rest 404 quickly. Only for address
      // kind — intersections cost too many round-trips to brute-force and
      // rarely benefit.
      // When the source row lacks a borough we don't know it, so trying all
      // five is the only way to recover. NYC streets are usually
      // borough-unique, so most rows resolve on the right borough and 404
      // quickly on the others. Cost: at most ~5 round-trips per no-borough
      // row; affordable because the no-borough pool is small.
      const boroughsToTry = boroughForApi !== null ? [boroughForApi] : [...ALL_BOROUGH_NAMES];

      for (const borough of boroughsToTry) {
        try {
          const result =
            input.kind === "address"
              ? await this.geoclient.address({
                  houseNumber: input.houseNumber,
                  street: input.street,
                  borough,
                })
              : await this.geoclient.intersection({
                  crossStreetOne: input.crossStreetOne,
                  crossStreetTwo: input.crossStreetTwo,
                  borough,
                });
          if (result?.physicalId) {
            const inferredTag = boroughForApi === null ? `inferred_${borough}:` : "";
            return {
              physicalId: result.physicalId,
              lat: result.lat,
              lng: result.lng,
              confidence: `geoclient_${input.kind}:${inferredTag}${result.confidence}`,
              cached: false,
            };
          }
          if (result?.lat != null && result.lng != null) {
            const snap = this.snapLatLng(result.lat, result.lng);
            if (snap) {
              return { ...snap, confidence: `geoclient_latlng_snap`, cached: false };
            }
          }
        } catch (err) {
          if (!(err instanceof GeoclientHttpError)) throw err;
          if (err.status === 401 || err.status === 403 || err.status >= 500) {
            throw err;
          }
          geoclientMissStatus ??= err.status;
          this.warnOnceForStatus(err.status, err.message);
          // For brute-force borough trials, keep iterating; a 400 in one
          // borough doesn't preclude success in another. We only return a
          // cached http error when *every* attempt failed.
        }
      }
    }

    if (geoclientMissStatus !== null) {
      return {
        physicalId: null,
        lat: null,
        lng: null,
        confidence: `geoclient_http_${geoclientMissStatus}`,
        cached: false,
      };
    }

    const fuzzyStreet = input.kind === "address" ? input.street : input.crossStreetOne;
    const fuzzy = this.fuzzyByStreet(fuzzyStreet, input.borough);
    if (fuzzy) return { ...fuzzy, cached: false };

    if (this.geoclient && !boroughForApi) {
      return { physicalId: null, lat: null, lng: null, confidence: "no_borough", cached: false };
    }
    return { physicalId: null, lat: null, lng: null, confidence: "no_match", cached: false };
  }

  private warnOnceForStatus(status: number, message: string): void {
    if (this.warnedHttpStatuses.has(status)) return;
    this.warnedHttpStatuses.add(status);
    console.warn(
      `[geocoder ${this.sourceLabel}] Geoclient returned HTTP ${status}; caching affected lookups as misses. First message: ${message}`,
    );
  }

  private snapLatLng(lat: number, lng: number): Omit<GeocodeOutcome, "cached"> | null {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (!this.snapQuery) {
      // Envelope width derives from snapMaxMeters so a caller-tuned snap
      // radius doesn't silently exceed the R-tree prefilter. 2x oversize +
      // m/92_000 ≈ NYC degree-per-meter (see build-route-lion-link).
      const envelopeDeg = (this.snapMaxMeters * 2) / 92_000;
      this.snapQuery = this.sqlite.prepare(
        `SELECT g.physical_id AS physical_id,
                ST_Distance(g.geom, MakePoint(?, ?, 4326), 1) AS dist_m
           FROM local_lion_segment_geom g
          WHERE g.ROWID IN (
                  SELECT ROWID FROM SpatialIndex
                   WHERE f_table_name = 'local_lion_segment_geom'
                     AND search_frame = ST_Expand(MakePoint(?, ?, 4326), ${envelopeDeg})
                )
          ORDER BY dist_m ASC
          LIMIT 1`,
      );
    }
    const row = this.snapQuery.get(lng, lat, lng, lat) as
      | { physical_id: string; dist_m: number | null }
      | undefined;
    if (!row || row.dist_m == null || row.dist_m > this.snapMaxMeters) return null;
    return {
      physicalId: row.physical_id,
      lat,
      lng,
      confidence: `latlng_snap:${row.dist_m.toFixed(1)}m`,
    };
  }

  private fuzzyByStreet(
    streetRaw: string | null,
    boroughRaw: string | null,
  ): Omit<GeocodeOutcome, "cached"> | null {
    const street = normalizeStreetName(streetRaw);
    if (!street) return null;
    const borough = canonicalBoroughCode(boroughRaw);
    if (!this.fuzzyQuery) {
      this.fuzzyQuery = this.sqlite.prepare(
        `SELECT physical_id FROM local_lion_segment
          WHERE UPPER(street_name) = ?
            AND (? IS NULL OR UPPER(borough) = ? OR borough = ?)
          ORDER BY physical_id
          LIMIT 1`,
      );
    }
    const row = this.fuzzyQuery.get(street, borough, boroughLetterFromCode(borough), borough) as
      | { physical_id: string }
      | undefined;
    if (!row) return null;
    return { physicalId: row.physical_id, lat: null, lng: null, confidence: "street_only" };
  }
}

function canonicalKey(sourceLabel: string, input: GeocodeInput): string {
  const payload = JSON.stringify({ sourceLabel, input });
  return createHash("sha256").update(payload).digest("hex");
}

function cacheRowToOutcome(row: LocalGeocodeCacheRow, cached: boolean): GeocodeOutcome {
  return {
    physicalId: row.physicalId,
    lat: row.lat,
    lng: row.lng,
    confidence: row.confidence ?? row.errorReason ?? "cached",
    cached,
  };
}

function boroughLetterFromCode(code: string | null): string | null {
  if (code == null) return null;
  switch (code) {
    case "1":
      return "M";
    case "2":
      return "X";
    case "3":
      return "B";
    case "4":
      return "Q";
    case "5":
      return "R";
    default:
      return null;
  }
}

export function createGeoclientFromEnv(): Geoclient | null {
  const key = process.env["NYC_GEOCLIENT_KEY"];
  if (!key || key.length === 0) return null;
  return createGeoclient({ apiKey: key });
}
