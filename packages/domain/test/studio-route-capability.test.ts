import { describe, expect, test } from "bun:test";
import {
  freshnessForDataAsOf,
  RouteCapabilityManifestForIndexSchema,
  RouteCapabilityManifestSchema,
  STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY,
} from "../src/studio";

function surface(state: string, extra: Record<string, unknown> = {}) {
  return {
    state,
    reason: null,
    depth: { monthsCovered: 12, grains: ["segment_month"] },
    dataAsOf: "2026-03",
    freshness: "current",
    ...extra,
  };
}

const manifest = {
  artifactKind: "route_capability_manifest",
  schemaVersion: 1,
  generatedAt: "2026-06-10T00:00:00.000Z",
  releaseMonth: "2026-03",
  routes: [
    {
      routeId: "M15+",
      overallState: "partial",
      surfaces: {
        condition: surface("ready"),
        speedHistory: surface("partial"),
        detectorFindings: surface("ready"),
      },
      caveats: ["speed history missing 16 cells"],
    },
    {
      routeId: "Q1",
      overallState: "checked_clean",
      surfaces: {
        condition: surface("ready"),
        detectorFindings: surface("checked_clean"),
      },
      caveats: [],
    },
    {
      routeId: "B99",
      overallState: "insufficient_data",
      surfaces: {
        condition: { state: "insufficient_data", reason: "no summary", depth: null, dataAsOf: null, freshness: "unknown" },
      },
      caveats: ["indexed from catalog only"],
    },
  ],
};

describe("route capability manifest contract", () => {
  test("key is the studio routes projection path", () => {
    expect(STUDIO_ROUTE_CAPABILITY_MANIFEST_KEY).toBe(
      "studio/v2/routes/route-capability-manifest.json",
    );
  });

  test("authoritative schema accepts a three-route manifest", () => {
    const parsed = RouteCapabilityManifestSchema.parse(manifest);
    expect(parsed.routes.map((r) => r.overallState)).toEqual([
      "partial",
      "checked_clean",
      "insufficient_data",
    ]);
  });

  test("authoritative schema is strict at the top level", () => {
    expect(() => RouteCapabilityManifestSchema.parse({ ...manifest, extra: 1 })).toThrow();
  });

  test("light read-schema tolerates forward-compatible additions", () => {
    const forward = {
      ...manifest,
      newManifestField: "later",
      routes: [
        {
          ...manifest.routes[0],
          surfaces: {
            condition: surface("ready", { evidenceRef: "later-field" }),
            materializationCoverage: surface("building"),
          },
        },
      ],
    };
    const parsed = RouteCapabilityManifestForIndexSchema.parse(forward);
    expect(parsed.routes[0]?.surfaces["materializationCoverage"]?.state).toBe("building");
  });
});

describe("freshnessForDataAsOf (C4 shared freshness vocabulary)", () => {
  test("classifies current / recent / stale / unknown", () => {
    expect(freshnessForDataAsOf("2026-03", "2026-03")).toBe("current");
    expect(freshnessForDataAsOf("2026-05", "2026-03")).toBe("current");
    expect(freshnessForDataAsOf("2026-01", "2026-03")).toBe("recent");
    expect(freshnessForDataAsOf("2025-12", "2026-03")).toBe("recent");
    expect(freshnessForDataAsOf("2025-11", "2026-03")).toBe("stale");
    expect(freshnessForDataAsOf(null, "2026-03")).toBe("unknown");
    expect(freshnessForDataAsOf("not-a-month", "2026-03")).toBe("unknown");
  });

  test("crosses year boundaries by month arithmetic, not string compare", () => {
    expect(freshnessForDataAsOf("2025-12", "2026-02")).toBe("recent");
    expect(freshnessForDataAsOf("2025-02", "2026-01")).toBe("stale");
  });
});
