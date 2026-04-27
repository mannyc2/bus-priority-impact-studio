import { describe, expect, test } from "bun:test";
import { RouteIdCodec, RouteScorecardSchema } from "@bp/domain";
import * as z from "zod";
import type { D1DatabaseLike, D1PreparedStatement, D1Result, D1Value } from "../src/index.js";
import {
  deserializeRouteScorecard,
  getRouteScorecard,
  serializeRouteScorecard,
} from "../src/index.js";

type QueryCall = {
  query: string;
  bound: D1Value[];
};

class FakeStatement<T> implements D1PreparedStatement<T> {
  constructor(
    private readonly call: QueryCall,
    private readonly rows: T[],
  ) {}

  bind(...values: D1Value[]): D1PreparedStatement<T> {
    this.call.bound = values;
    return this;
  }

  async first(): Promise<T | null> {
    return this.rows[0] ?? null;
  }

  async all(): Promise<D1Result<T>> {
    return { results: this.rows };
  }
}

class FakeDb implements D1DatabaseLike {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rows: unknown[]) {}

  prepare<T = unknown>(query: string): D1PreparedStatement<T> {
    const call = { query, bound: [] };
    this.calls.push(call);

    return new FakeStatement(call, this.rows as T[]);
  }
}

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

describe("D1 route scorecard read model", () => {
  test("round-trips scorecards through a compact row shape", () => {
    const row = serializeRouteScorecard(scorecard);
    const parsed = deserializeRouteScorecard(row);

    expect(parsed).toEqual(scorecard);
  });

  test("rejects corrupted citation JSON at the repository boundary", () => {
    const row = serializeRouteScorecard(scorecard);

    expect(() => deserializeRouteScorecard({ ...row, citations_json: "not-json" })).toThrow();
  });

  test("gets one scorecard by route and month", async () => {
    const db = new FakeDb([serializeRouteScorecard(scorecard)]);

    const row = await getRouteScorecard(db, "M1", "2026-01");

    expect(db.calls[0]?.query).toContain("FROM route_scorecard");
    expect(db.calls[0]?.bound).toEqual(["M1", "2026-01"]);
    expect(row).toEqual(scorecard);
  });

  test("returns null when a scorecard row does not exist", async () => {
    const db = new FakeDb([]);

    await expect(getRouteScorecard(db, "M2", "2026-01")).resolves.toBeNull();
  });
});
