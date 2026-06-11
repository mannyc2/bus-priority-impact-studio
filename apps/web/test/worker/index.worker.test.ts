import { HealthResponseSchema } from "@bp/domain/routes";
import { describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/index.js";
import worker from "../../src/worker/index.js";

function htmlAsset(paths?: string[]): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL): Promise<Response> => {
      const request = input instanceof Request ? input : new Request(input);
      paths?.push(new URL(request.url).pathname);
      return new Response(
        '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
        {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        },
      );
    },
  } as unknown as Fetcher;
}

describe("Worker adapter and SPA shell", () => {
  it("delegates API requests to the Studio API package", async () => {
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

  it("delegates non-API deep links to static assets", async () => {
    const paths: string[] = [];
    const env: Env = { ASSETS: htmlAsset(paths) };
    const response = await worker.fetch(new Request("https://example.test/routes/b46"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(paths).toEqual(["/routes/b46"]);
  });

  it("falls back to the root SPA document when a deep link has no direct asset", async () => {
    const paths: string[] = [];
    const assets = {
      fetch: async (input: RequestInfo | URL): Promise<Response> => {
        const request = input instanceof Request ? input : new Request(input);
        const pathname = new URL(request.url).pathname;
        paths.push(pathname);
        if (pathname !== "/") {
          return new Response("Not found", { status: 404 });
        }
        return new Response(
          '<!doctype html><html><head></head><body><div id="root"></div></body></html>',
          {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        );
      },
    } as unknown as Fetcher;

    const response = await worker.fetch(new Request("https://example.test/routes/m57"), {
      ASSETS: assets,
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("<title>M57 Route Detail | Bus Priority Impact Studio</title>");
    expect(paths).toEqual(["/routes/m57", "/"]);
  });

  it("injects crawlable SEO metadata into SPA fallback HTML", async () => {
    const response = await worker.fetch(new Request("https://example.test/routes/m15-sbs"), {
      ASSETS: htmlAsset(),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("stale-while-revalidate");
    expect(html).toContain("<title>M15 SBS Route Detail | Bus Priority Impact Studio</title>");
    expect(html).toContain('name="description"');
    expect(html).toContain('rel="canonical" href="https://example.test/routes/m15-sbs"');
  });

  it("serves the root document through static assets with SEO metadata", async () => {
    const response = await worker.fetch(new Request("https://example.test/"), {
      ASSETS: htmlAsset(),
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Bus Priority Impact Studio</title>");
    expect(html).toContain('rel="canonical" href="https://example.test/"');
  });

  it("keeps the dev-only system route closed in production fallback", async () => {
    const response = await worker.fetch(new Request("https://example.test/system"), {
      ASSETS: htmlAsset(),
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
