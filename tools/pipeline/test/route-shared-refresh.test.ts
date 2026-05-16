import { describe, expect, test } from "bun:test";
import { refreshRouteSharedSources } from "../src/jobs/build/route-shared-refresh.js";

describe("route shared refresh", () => {
  test("refreshes shared intervention sources once", async () => {
    const calls: string[] = [];
    const deps = {
      ingestAceRoutes: async () => {
        calls.push("shared:ace-routes");
        return {};
      },
      ingestAceViolationSummary: async ({ month }: { month?: number }) => {
        calls.push(`shared:ace-violations:${month}`);
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
        refreshSharedSources: true,
      },
      deps as never,
    );

    expect(calls).toEqual(
      expect.arrayContaining(["shared:ace-routes", "shared:ace-violations:8", "shared:bus-lanes"]),
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
        refreshSharedSources: false,
      },
      deps as never,
    );

    expect(calls).toEqual([]);
  });
});
