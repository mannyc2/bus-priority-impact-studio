import {
  type D1PreparedStatement,
  type D1Result,
  type D1Value,
  serializeRouteScorecard,
  serializeRouteScorecardCitations,
} from "@bp/db/d1";
import { HealthResponseSchema, RouteScorecardSchema } from "@bp/domain";
import { describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";

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

  async raw(): Promise<unknown[][]> {
    return this.rows.map((row) => Object.values(row as Record<string, unknown>));
  }
}

class FakeDb {
  readonly calls: QueryCall[] = [];

  constructor(private readonly rowsByTable: Record<string, unknown[]>) {}

  prepare<T = unknown>(query: string): D1PreparedStatement<T> {
    const call = { query, bound: [] };
    this.calls.push(call);
    const table = Object.keys(this.rowsByTable).find((candidate) => query.includes(candidate));
    const rows = (table === undefined ? [] : this.rowsByTable[table]) as T[];

    return new FakeStatement(call, rows);
  }
}

const scorecard = RouteScorecardSchema.parse({
  schemaVersion: 1,
  routeId: "M1",
  month: "2026-03",
  routeScore: 16,
  coverageStatus: "full",
  averageSpeedMph: 6.7409,
  hotspotCount: 10,
  citations: [
    {
      sourceId: "mta_bus_route_segment_speeds",
      title: "MTA Bus Route Segment Speeds",
      url: "https://data.ny.gov/Transportation/MTA-Bus-Route-Segment-Speeds/kufs-yh3x",
      verifiedAt: "2026-04-27T00:00:00.000Z",
    },
  ],
});

describe("Worker production-behavior harness", () => {
  it("serves a validated health response", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/health"));

    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual(
      expect.objectContaining({
        ok: true,
        service: "bus-priority-impact-studio",
      }),
    );
  });

  it("keeps unknown API routes closed", async () => {
    const response = await worker.fetch(new Request("https://example.test/api/missing"));

    expect(response.status).toBe(404);
  });

  it("serves a D1-backed route scorecard", async () => {
    const db = new FakeDb({
      route_scorecard_citation: serializeRouteScorecardCitations(scorecard),
      route_scorecard: [serializeRouteScorecard(scorecard)],
    });
    const env = { DB: db as unknown as D1Database } satisfies Env;
    const response = await worker.fetch(
      new Request("https://example.test/api/routes/m1/scorecard?month=2026-03"),
      env,
    );

    expect(response.status).toBe(200);
    expect(RouteScorecardSchema.parse(await response.json())).toEqual(scorecard);
    expect(db.calls[0]?.bound).toEqual(expect.arrayContaining(["M1", "2026-03"]));
  });

  it("rejects route scorecard requests without a valid month", async () => {
    const response = await worker.fetch(
      new Request("https://example.test/api/routes/M1/scorecard"),
      { DB: new FakeDb({}) as unknown as D1Database },
    );

    expect(response.status).toBe(400);
  });
});
