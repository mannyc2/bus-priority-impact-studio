import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapThumb } from "../../src/components/MapThumb.js";

const fallbackPath =
  "M12,68 L36,44 L90,28 L110.4,14.399999999999999";

function extractPath(markup: string): string {
  const match = markup.match(/<path[^>]+d="([^"]+)"/);
  expect(match).not.toBeNull();
  return match?.[1] ?? "";
}

function extractCircleCenters(markup: string): Array<{ cx: number; cy: number }> {
  return [...markup.matchAll(/<circle[^>]+cx="([^"]+)"[^>]+cy="([^"]+)"/g)].map((match) => ({
    cx: Number(match[1]),
    cy: Number(match[2]),
  }));
}

describe("MapThumb route-shape slice render audit", () => {
  test("renders source route geometry instead of the decorative fallback line", () => {
    const markup = renderToStaticMarkup(
      createElement(MapThumb, {
        width: 120,
        height: 80,
        label: "MTA route-shape slice",
        line: {
          coordinates: [
            [-73.991, 40.705],
            [-73.986, 40.715],
            [-73.979, 40.722],
          ],
        },
      }),
    );

    const path = extractPath(markup);
    expect(path).not.toBe(fallbackPath);
    expect(path.startsWith("M12,72")).toBe(true);
    expect(path).toContain("L51.999999999");
    expect(path.endsWith("108,8")).toBe(true);
    expect(markup).toContain("MTA route-shape slice");

    const stops = extractCircleCenters(markup);
    expect(stops).toHaveLength(2);
    expect(stops).toEqual([
      { cx: 12, cy: 72 },
      { cx: 108, cy: 8 },
    ]);
  });

  test("keeps a visible fallback for explicit geometry-unavailable states", () => {
    const markup = renderToStaticMarkup(
      createElement(MapThumb, {
        width: 120,
        height: 80,
        label: "geometry unavailable",
        line: null,
      }),
    );

    expect(extractPath(markup)).toBe(fallbackPath);
    expect(markup).toContain("geometry unavailable");
    expect(extractCircleCenters(markup)).toHaveLength(2);
  });
});
