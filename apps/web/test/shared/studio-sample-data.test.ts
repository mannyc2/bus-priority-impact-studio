import { describe, expect, it } from "vitest";
import {
  getStudioBrief,
  getStudioFinding,
  getStudioRoute,
  routeSegments,
  studioBriefs,
  studioFindings,
  studioRoutes,
} from "../../src/studio/sample-data.js";

describe("Studio sample data", () => {
  it("keeps canonical slugs addressable without fallback aliases", () => {
    expect(studioRoutes.map((route) => route.slug)).toEqual([
      "m15-sbs",
      "bx12-sbs",
      "m101",
      "b41",
      "b46-sbs",
      "q58",
    ]);
    expect(getStudioRoute("m15-sbs")?.routeId).toBe("M15+");
    expect(getStudioRoute("unknown-route")).toBeUndefined();
  });

  it("links findings and briefs to real route records", () => {
    for (const finding of studioFindings) {
      expect(getStudioRoute(finding.routeSlug), finding.id).toBeDefined();
      expect(getStudioFinding(finding.id)).toBe(finding);
    }

    for (const brief of studioBriefs) {
      expect(getStudioRoute(brief.routeSlug), brief.id).toBeDefined();
      expect(getStudioBrief(brief.id)).toBe(brief);
    }
  });

  it("returns only segment evidence for the requested route", () => {
    expect(routeSegments("m15-sbs").map((segment) => segment.id)).toEqual([
      "madison-28-58-nb",
      "first-14-34-sb",
    ]);
    expect(routeSegments("unknown-route")).toEqual([]);
  });
});
