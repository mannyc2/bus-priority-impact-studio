import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { RouteIdCodec, RouteScorecardSchema } from "@bp/domain";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as z from "zod";
import type { D1ServingDb } from "../src/d1/index.js";
import {
  deserializeRouteScorecard,
  getRouteScorecard,
  serializeRouteScorecard,
  serializeRouteScorecardCitations,
} from "../src/d1/index.js";
import { routeScorecard, routeScorecardCitation } from "../src/d1/schema.js";

const scorecard = RouteScorecardSchema.parse({
  schemaVersion: 1,
  routeId: z.decode(RouteIdCodec, "m1"),
  month: "2026-01",
  routeScore: 80,
  coverageStatus: "full",
  averageSpeedMph: 8.1,
  hotspotCount: 1,
  citations: [
    {
      sourceId: "fixture.mta.bus.segment_speeds",
      title: "Fixture segment-speed source",
      url: "https://example.test/segment-speeds",
      verifiedAt: "2026-04-27T12:00:00Z",
    },
  ],
});

async function createTestDb(): Promise<{ db: D1ServingDb; sqlite: Database }> {
  const sqlite = new Database(":memory:");
  const migrationSql = await Bun.file(
    new URL("../migrations/d1/0000_tense_jane_foster.sql", import.meta.url),
  ).text();
  sqlite.exec(migrationSql);

  return {
    db: drizzle(sqlite, {
      schema: { routeScorecard, routeScorecardCitation },
    }) as unknown as D1ServingDb,
    sqlite,
  };
}

describe("D1 route scorecard read model", () => {
  test("round-trips scorecards through a compact row shape", () => {
    const row = serializeRouteScorecard(scorecard);
    const citations = serializeRouteScorecardCitations(scorecard);
    const parsed = deserializeRouteScorecard(row, citations);

    expect(parsed).toEqual(scorecard);
  });

  test("rejects missing citation child rows at the repository boundary", () => {
    const row = serializeRouteScorecard(scorecard);

    expect(() => deserializeRouteScorecard(row, [])).toThrow();
  });

  test("gets one scorecard by route and month", async () => {
    const { db, sqlite } = await createTestDb();
    await db.insert(routeScorecard).values({
      routeId: scorecard.routeId,
      month: scorecard.month,
      routeScore: scorecard.routeScore,
      coverageStatus: scorecard.coverageStatus,
      averageSpeedMph: scorecard.averageSpeedMph,
      hotspotCount: scorecard.hotspotCount,
    });
    await db.insert(routeScorecardCitation).values(
      scorecard.citations.map((citation, index) => ({
        routeId: scorecard.routeId,
        month: scorecard.month,
        citationRank: index + 1,
        sourceId: citation.sourceId,
        title: citation.title,
        url: citation.url,
        verifiedAt: citation.verifiedAt,
      })),
    );

    const row = await getRouteScorecard(db, "M1", "2026-01");

    expect(row).toEqual(scorecard);
    sqlite.close();
  });

  test("returns null when a scorecard row does not exist", async () => {
    const { db, sqlite } = await createTestDb();

    await expect(getRouteScorecard(db, "M2", "2026-01")).resolves.toBeNull();
    sqlite.close();
  });
});
