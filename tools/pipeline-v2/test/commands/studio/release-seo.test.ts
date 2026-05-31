import { describe, expect, it } from "bun:test";
import {
  buildSeoTitleManifest,
  buildSitemapXml,
  renderSeoManifestModule,
  SITEMAP_ORIGIN,
} from "../../../src/commands/studio/_release-seo.ts";

const release = {
  generatedAt: "2026-03-01T00:00:00.000Z",
  routes: [
    { slug: "m15-sbs", label: "M15", sbs: true },
    { slug: "b25", label: "B25", sbs: false },
  ],
  findings: [{ id: "promoted-abc", title: "M57: Persistent Low Speed" }],
  briefs: [{ id: "bx12-treatment-benchmark", title: "Bx12 SBS treatment benchmark" }],
};

describe("buildSeoTitleManifest", () => {
  it("derives titles from the release payload, appending SBS for SBS routes", () => {
    const manifest = buildSeoTitleManifest(release);

    expect(manifest.generatedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(manifest.routes).toEqual([
      ["m15-sbs", "M15 SBS"],
      ["b25", "B25"],
    ]);
    expect(manifest.findings).toEqual([["promoted-abc", "M57: Persistent Low Speed"]]);
    expect(manifest.briefs).toEqual([["bx12-treatment-benchmark", "Bx12 SBS treatment benchmark"]]);
  });
});

describe("renderSeoManifestModule", () => {
  it("emits typed maps with one entry per manifest item", () => {
    const module = renderSeoManifestModule(buildSeoTitleManifest(release));

    expect(module).toContain("export const routeTitles: ReadonlyMap<string, string>");
    expect(module).toContain("export const findingTitles: ReadonlyMap<string, string>");
    expect(module).toContain("export const briefTitles: ReadonlyMap<string, string>");
    expect(module).toContain('["m15-sbs", "M15 SBS"]');
    expect(module).toContain('["bx12-treatment-benchmark", "Bx12 SBS treatment benchmark"]');
    expect(module).toContain('SEO_MANIFEST_GENERATED_AT = "2026-03-01T00:00:00.000Z"');
  });
});

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml(SITEMAP_ORIGIN, buildSeoTitleManifest(release));

  it("includes static pages plus every served route, finding, and brief URL", () => {
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/routes/m15-sbs</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/routes/m15-sbs/ladder</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/findings/promoted-abc</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/briefs/bx12-treatment-benchmark</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/briefs/bx12-treatment-benchmark/evidence</loc>`);
  });

  it("does not enumerate parameterized search result pages", () => {
    expect(xml).not.toContain("/search");
  });

  it("is well-formed sitemap XML", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });
});
