import { describe, expect, test } from "bun:test";
import { searchAutocompleteEnterAction } from "../../src/components/SearchAutocomplete";

const suggestions = [{ id: "m15-sbs" }, { id: "b41" }];

describe("SearchAutocomplete keyboard submit", () => {
  test("submits trimmed free text when no suggestion is highlighted", () => {
    expect(
      searchAutocompleteEnterAction({
        activeIndex: -1,
        filtered: suggestions,
        query: "  flatbush  ",
        canSubmit: true,
      }),
    ).toEqual({ kind: "submit", query: "flatbush" });
  });

  test("selects a highlighted suggestion before free-text submit", () => {
    expect(
      searchAutocompleteEnterAction({
        activeIndex: 1,
        filtered: suggestions,
        query: "flatbush",
        canSubmit: true,
      }),
    ).toEqual({ kind: "select", id: "b41" });
  });

  test("does nothing for blank free-text submit", () => {
    expect(
      searchAutocompleteEnterAction({
        activeIndex: -1,
        filtered: suggestions,
        query: "   ",
        canSubmit: true,
      }),
    ).toBeNull();
  });
});
