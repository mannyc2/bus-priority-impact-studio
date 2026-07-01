import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeTitles } from "../../src/studio/seo-manifest.gen.js";

// Both files are generated together by `studio release`. This guards against the
// committed sitemap drifting from the SEO manifest.
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

  it("has no retired product URLs", () => {
    for (const path of locs) {
      expect(path).not.toMatch(/^\/(?:briefs|compare|docs|findings|search)(?:\/|$)/);
    }
  });
});
