import { describe, expect, test } from "bun:test";
import { createStudioApiClient } from "@bp/studio-api/client";
import {
  buildRoutePath,
  getStudioApiRoute,
  isApiPath,
  studioApiRoutes,
  studioRouteTemplate,
} from "@bp/studio-api/contracts";
import { dispatchStudioApiRequest } from "@bp/studio-api/server";
import { handleStudioScheduled } from "@bp/studio-api/server/scheduled";
import { handleStudioFetch } from "@bp/studio-api/server/worker";

describe("Studio API package exports", () => {
  test("exposes only explicit hard-cutover subpaths", async () => {
    const packageJson = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as {
      exports?: Record<string, string>;
    };

    expect(packageJson.exports?.["."]).toBeUndefined();
    expect(packageJson.exports?.["./authoring"]).toBeUndefined();
    expect(Object.keys(packageJson.exports ?? {}).sort()).toEqual([
      "./client",
      "./client/fetch",
      "./contracts",
      "./contracts/openapi",
      "./server",
      "./server/auth",
      "./server/authoring",
      "./server/authoring/agent",
      "./server/scheduled",
      "./server/testing",
      "./server/worker",
    ]);
  });

  test("legacy package entrypoints are not importable", async () => {
    const importBySpecifier = (specifier: string) => import(specifier);

    await expect(importBySpecifier("@bp/studio-api")).rejects.toThrow();
    await expect(importBySpecifier("@bp/studio-api/authoring")).rejects.toThrow();
  });

  test("legacy source barrels stay deleted", async () => {
    const packageRoot = new URL("../", import.meta.url);

    expect(await Bun.file(new URL("src/index.ts", packageRoot)).exists()).toBe(false);
    expect(await Bun.file(new URL("src/authoring.ts", packageRoot)).exists()).toBe(false);
  });

  test("contracts and client subpaths are usable without server entrypoints", () => {
    expect(isApiPath("/api/v1/studio/routes")).toBe(true);
    expect(studioRouteTemplate("/api/v1/studio/routes/m15-sbs")).toBe(
      "/api/v1/studio/routes/:routeId",
    );
    expect(studioApiRoutes.length).toBeGreaterThan(20);

    const route = getStudioApiRoute("studio.route");
    expect(buildRoutePath(route, { params: { routeId: "M15-SBS" } })).toBe(
      "/api/v1/studio/routes/M15-SBS",
    );

    const client = createStudioApiClient();
    expect(client.path("studio.brief", { params: { briefId: "brief-m15" } })).toBe(
      "/api/v1/studio/briefs/brief-m15",
    );
  });

  test("server subpaths expose Worker entrypoints", () => {
    expect(dispatchStudioApiRequest).toBeFunction();
    expect(handleStudioFetch).toBeFunction();
    expect(handleStudioScheduled).toBeFunction();
  });
});
