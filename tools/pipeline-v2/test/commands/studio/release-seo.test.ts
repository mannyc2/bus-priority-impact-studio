import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSeoTitleManifest,
  buildSitemapXml,
  renderSeoManifestModule,
  SITEMAP_ORIGIN,
} from "../../../src/commands/studio/_release-seo.ts";

const releaseSeoPath = join(import.meta.dir, "../../../src/commands/studio/_release-seo.ts");

const release = {
  generatedAt: "2026-03-01T00:00:00.000Z",
  routes: [
    { slug: "m15-sbs", label: "M15 SBS", sbs: true, displayLabel: "M15 SBS" },
    { slug: "b25", label: "B25", sbs: false },
  ],
};

describe("buildSeoTitleManifest", () => {
  it("derives titles from release labels without synthesizing SBS", () => {
    const manifest = buildSeoTitleManifest(release);

    expect(manifest.generatedAt).toBe("2026-03-01T00:00:00.000Z");
    expect(manifest.routes).toEqual([
      ["m15-sbs", "M15 SBS"],
      ["b25", "B25"],
    ]);
  });
});

describe("renderSeoManifestModule", () => {
  it("emits a typed route map with one entry per manifest route", () => {
    const module = renderSeoManifestModule(buildSeoTitleManifest(release));

    expect(module).toContain("export const routeTitles: ReadonlyMap<string, string>");
    expect(module).toContain('["m15-sbs", "M15 SBS"]');
    expect(module).toContain('SEO_MANIFEST_GENERATED_AT = "2026-03-01T00:00:00.000Z"');
  });
});

describe("buildSitemapXml", () => {
  const xml = buildSitemapXml(SITEMAP_ORIGIN, buildSeoTitleManifest(release));

  it("includes static pages plus every served route URL", () => {
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/map</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/interventions</loc>`);
    expect(xml).toContain(`<loc>${SITEMAP_ORIGIN}/routes/m15-sbs</loc>`);
  });

  it("does not enumerate retired product pages", () => {
    expect(xml).not.toContain("/search");
    expect(xml).not.toContain("/compare");
    expect(xml).not.toContain("/findings");
    expect(xml).not.toContain("/briefs");
    expect(xml).not.toContain("/docs");
    expect(xml).not.toContain("/methods");
  });

  it("is well-formed sitemap XML", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });
});

describe("writeSeoArtifacts boundary", () => {
  it("keeps generated file writes behind the Effect FileSystem service", () => {
    const source = readFileSync(releaseSeoPath, "utf8");

    expect(source).toContain("runPipelineFileSystemBoundary({");
    expect(source).toContain("writeSeoArtifacts");
    expect(source).not.toContain('from "node:fs/promises"');
    expect(source).not.toContain("Bun.write");
  });
  it("uses an official display label verbatim without synthesizing SBS", () => {
    const manifest = buildSeoTitleManifest({
      generatedAt: "2026-07-18T00:00:00.000Z",
      routes: [
        {
          slug: "b44-sbs",
          label: "B44",
          sbs: true,
          displayLabel: "B44 Select",
        },
      ],
    });

    expect(manifest.routes).toEqual([["b44-sbs", "B44 Select"]]);
  });
});
