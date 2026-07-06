import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RouteBadge } from "../../src/components/RouteBadge";

function render(route: string, sbs: boolean) {
  return renderToStaticMarkup(createElement(RouteBadge, { route, sbs }));
}

describe("RouteBadge normalization", () => {
  test("adds the -SBS suffix from the sbs flag", () => {
    expect(render("M86", true)).toContain("M86-SBS");
  });

  test("does not double the suffix when the label already contains SBS", () => {
    const html = render("M86 SBS", true);
    expect(html).toContain("M86-SBS");
    expect(html).not.toContain("SBS-SBS");
  });

  test("normalizes the hyphenated form", () => {
    expect(render("M86-SBS", false)).toContain("M86-SBS");
  });

  test("normalizes the '+SBS' form", () => {
    const html = render("M86 +SBS", false);
    expect(html).toContain("M86-SBS");
    expect(html).not.toContain("SBS-SBS");
  });

  test("leaves a plain route untouched", () => {
    const html = render("B41", false);
    expect(html).toContain("B41");
    expect(html).not.toContain("-SBS");
  });

  test("renders the roundel on a single line", () => {
    expect(render("M86 SBS", true)).toContain("whitespace-nowrap");
  });
});
