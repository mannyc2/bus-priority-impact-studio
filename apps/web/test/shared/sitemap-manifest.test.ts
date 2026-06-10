import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { briefTitles, findingTitles, routeTitles } from "../../src/studio/seo-manifest.gen.js";

// Both files are generated together by `studio release`. This guards against the
// committed sitemap drifting from the SEO manifest — the exact failure that left
// crawlers pointed at a deleted finding and missing 11 of 12 briefs.
const sitemap = readFileSync(new URL("../../public/sitemap.xml", import.meta.url), "utf8");
const locs = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((loc): loc is string => loc !== undefined)
    .map((loc) => new URL(loc).pathname),
);

describe("sitemap.xml ↔ seo-manifest.gen.ts", () => {
  it("lists every served route detail", () => {
    for (const slug of routeTitles.keys()) {
      expect(locs).toContain(`/routes/${slug}`);
    }
  });

  it("lists every served finding", () => {
    for (const id of findingTitles.keys()) {
      expect(locs).toContain(`/findings/${id}`);
    }
  });

  it("lists every served brief (reading + evidence)", () => {
    for (const id of briefTitles.keys()) {
      expect(locs).toContain(`/briefs/${id}`);
      expect(locs).toContain(`/briefs/${id}/evidence`);
    }
  });

  it("has no stale finding or brief URLs that the manifest does not back", () => {
    for (const path of locs) {
      const findingId = path.match(/^\/findings\/(.+)$/)?.[1];
      if (findingId !== undefined) {
        expect(findingTitles.has(findingId)).toBe(true);
      }
      const briefId = path.match(/^\/briefs\/([^/]+)(?:\/evidence)?$/)?.[1];
      if (briefId !== undefined) {
        expect(briefTitles.has(briefId)).toBe(true);
      }
    }
  });
});
