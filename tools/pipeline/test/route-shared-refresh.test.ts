import { describe, expect, test } from "bun:test";
import { refreshRouteSharedSources } from "../src/jobs/build/route-shared-refresh.js";

describe("route shared refresh", () => {
  test("refreshes shared intervention sources once", async () => {
    const calls: string[] = [];
    const deps = {
      ingestAceRoutes: async ({ dbPath }: { dbPath?: string }) => {
        calls.push(`shared:ace-routes:${dbPath}`);
        return {};
      },
      ingestAceViolationSummary: async ({ month, dbPath }: { month?: number; dbPath?: string }) => {
        calls.push(`shared:ace-violations:${month}:${dbPath}`);
        return {};
      },
      ingestBusLanes: async ({ dbPath }: { dbPath?: string }) => {
        calls.push(`shared:bus-lanes:${dbPath}`);
        return {};
      },
    };

    await refreshRouteSharedSources(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline-clean.sqlite",
        refreshSharedSources: true,
      },
      deps as never,
    );

    expect(calls).toEqual(
      expect.arrayContaining([
        "shared:ace-routes:/tmp/pipeline-clean.sqlite",
        "shared:ace-violations:8:/tmp/pipeline-clean.sqlite",
        "shared:bus-lanes:/tmp/pipeline-clean.sqlite",
      ]),
    );
  });

  test("skips refresh when disabled", async () => {
    const calls: string[] = [];
    const deps = {
      ingestAceRoutes: async () => {
        calls.push("shared:ace-routes");
        return {};
      },
      ingestAceViolationSummary: async () => {
        calls.push("shared:ace-violations");
        return {};
      },
      ingestBusLanes: async () => {
        calls.push("shared:bus-lanes");
        return {};
      },
    };

    await refreshRouteSharedSources(
      {
        year: 2026,
        month: 8,
        dbPath: "/tmp/pipeline-clean.sqlite",
        refreshSharedSources: false,
      },
      deps as never,
    );

    expect(calls).toEqual([]);
  });
});
