import { describe, expect, test } from "bun:test";
import {
  type ChangeDate,
  type ChangeDatePrecision,
  changeDateGroupLabel,
  changeDateSortKey,
  changeDatesOverlap,
  compareChangeDatesNewestFirst,
  parseChangeDate,
} from "../../src/studio/change-date";

/**
 * The complete free-text date vocabulary of the published route evidence,
 * measured on 2026-07-24: 67 distinct literals over 205 timeline records. Every
 * literal is pinned here so a new upstream form cannot be absorbed silently.
 */
const FREE_TEXT_LITERALS: readonly (readonly [string, ChangeDatePrecision])[] = [
  // 41 `YYYY-<season>` literals.
  ["2010-summer", "quarter"],
  ["2011-fall", "quarter"],
  ["2011-spring", "quarter"],
  ["2011-winter", "quarter"],
  ["2012-fall", "quarter"],
  ["2012-spring", "quarter"],
  ["2012-summer", "quarter"],
  ["2012-winter", "quarter"],
  ["2013-fall", "quarter"],
  ["2013-spring", "quarter"],
  ["2013-summer", "quarter"],
  ["2014-fall", "quarter"],
  ["2014-spring", "quarter"],
  ["2014-summer", "quarter"],
  ["2014-winter", "quarter"],
  ["2015-fall", "quarter"],
  ["2015-spring", "quarter"],
  ["2015-summer", "quarter"],
  ["2015-winter", "quarter"],
  ["2016-fall", "quarter"],
  ["2016-spring", "quarter"],
  ["2016-winter", "quarter"],
  ["2017-spring", "quarter"],
  ["2017-winter", "quarter"],
  ["2019-fall", "quarter"],
  ["2019-summer", "quarter"],
  ["2019-winter", "quarter"],
  ["2020-spring", "quarter"],
  ["2022-fall", "quarter"],
  ["2022-summer", "quarter"],
  ["2022-winter", "quarter"],
  ["2023-fall", "quarter"],
  ["2024-fall", "quarter"],
  ["2024-spring", "quarter"],
  ["2024-summer", "quarter"],
  ["2024-winter", "quarter"],
  ["2025-fall", "quarter"],
  ["2025-spring", "quarter"],
  ["2025-summer", "quarter"],
  ["2026-fall", "quarter"],
  ["2026-spring", "quarter"],
  // 4 `YYYY-YYYY` literals.
  ["2013-2014", "range"],
  ["2014-2015", "range"],
  ["2015-2016", "range"],
  ["2017-2018", "range"],
  // 1 `YYYY/YYYY` literal.
  ["2019/2020", "range"],
  // 5 prose literals containing a year.
  ["Late 2018/Early 2019", "range"],
  ["late 2025 or 2026", "range"],
  ["March 18 and 23, 2010", "month"],
  ["March 18 and 24, 2010", "month"],
  // U+2013 EN DASH, not a hyphen.
  ["November 16–19, 2020", "month"],
  // 16 literals with no year at all.
  ["TBD", "unknown"],
  ["February 13th", "unknown"],
  ["June 12", "unknown"],
  ["May 21", "unknown"],
  ["Thursday, March 19th at 6:00pm", "unknown"],
  ["Thursday, March 19 at 6:00pm", "unknown"],
  ["Early April", "unknown"],
  ["Early Summer", "unknown"],
  ["July 14", "unknown"],
  ["June - September", "unknown"],
  ["June 16", "unknown"],
  ["Late Summer/Fall", "unknown"],
  ["May 17", "unknown"],
  ["September 27 & 28", "unknown"],
  ["Spring", "unknown"],
  ["Summer", "unknown"],
];

function interval(raw: string): [string, string] {
  const value = parseChangeDate(raw);
  if (value.precision === "unknown") throw new Error(`expected a known interval for ${raw}`);
  return [value.start, value.end];
}

describe("parseChangeDate over the complete documented vocabulary", () => {
  test("reads every one of the 67 free-text literals at its stated precision", () => {
    expect(FREE_TEXT_LITERALS).toHaveLength(67);
    expect(new Set(FREE_TEXT_LITERALS.map(([raw]) => raw)).size).toBe(67);
    for (const [raw, precision] of FREE_TEXT_LITERALS) {
      expect(parseChangeDate(raw).precision, raw).toBe(precision);
    }
  });

  test("keeps the exact precision totals the measured vocabulary promises", () => {
    const totals = new Map<ChangeDatePrecision, number>();
    for (const [raw] of FREE_TEXT_LITERALS) {
      const { precision } = parseChangeDate(raw);
      totals.set(precision, (totals.get(precision) ?? 0) + 1);
    }
    expect(totals.get("quarter")).toBe(41);
    expect(totals.get("range")).toBe(7);
    expect(totals.get("month")).toBe(3);
    expect(totals.get("unknown")).toBe(16);
    expect(41 + 7 + 3 + 16).toBe(FREE_TEXT_LITERALS.length);
    expect([...totals.values()].reduce((sum, count) => sum + count, 0)).toBe(
      FREE_TEXT_LITERALS.length,
    );
  });

  test("gives one literal of each of the five shapes an exact interval", () => {
    // Seasons are calendar quarters: spring is Q2.
    expect(interval("2026-spring")).toEqual(["2026-04-01", "2026-06-30"]);
    expect(interval("2013-2014")).toEqual(["2013-01-01", "2014-12-31"]);
    expect(interval("2019/2020")).toEqual(["2019-01-01", "2020-12-31"]);
    expect(interval("November 16–19, 2020")).toEqual(["2020-11-01", "2020-11-30"]);
    expect(parseChangeDate("TBD")).toEqual({
      precision: "unknown",
      display: "Date not stated",
      raw: "TBD",
    });
  });

  test("maps each season to its calendar quarter and keeps them monotone in a year", () => {
    expect(interval("2015-winter")).toEqual(["2015-01-01", "2015-03-31"]);
    expect(interval("2015-spring")).toEqual(["2015-04-01", "2015-06-30"]);
    expect(interval("2015-summer")).toEqual(["2015-07-01", "2015-09-30"]);
    expect(interval("2015-fall")).toEqual(["2015-10-01", "2015-12-31"]);
    expect(interval("2015-AUTUMN")).toEqual(["2015-10-01", "2015-12-31"]);
  });

  test("resolves the six prose literals exactly as the parse rules require", () => {
    expect(interval("Late 2018/Early 2019")).toEqual(["2018-01-01", "2019-12-31"]);
    expect(interval("late 2025 or 2026")).toEqual(["2025-01-01", "2026-12-31"]);
    expect(interval("March 18 and 23, 2010")).toEqual(["2010-03-01", "2010-03-31"]);
    expect(interval("March 18 and 24, 2010")).toEqual(["2010-03-01", "2010-03-31"]);
    expect(interval("November 16–19, 2020")).toEqual(["2020-11-01", "2020-11-30"]);
    // A single year with no month name stays a year, and keeps its own text.
    expect(parseChangeDate("circa 2019")).toMatchObject({
      precision: "year",
      start: "2019-01-01",
      end: "2019-12-31",
      display: "circa 2019",
    });
  });
});

describe("parseChangeDate over strict ISO input", () => {
  test("reads the three ISO shapes", () => {
    expect(parseChangeDate("2025-10-02")).toEqual({
      precision: "day",
      start: "2025-10-02",
      end: "2025-10-02",
      display: "2 October 2025",
      raw: "2025-10-02",
    });
    expect(parseChangeDate("2024-05")).toEqual({
      precision: "month",
      start: "2024-05-01",
      end: "2024-05-31",
      display: "May 2024",
      raw: "2024-05",
    });
    expect(parseChangeDate("1963")).toEqual({
      precision: "year",
      start: "1963-01-01",
      end: "1963-12-31",
      display: "1963",
      raw: "1963",
    });
  });

  test("closes February on the right day without a runtime date", () => {
    expect(interval("2024-02")).toEqual(["2024-02-01", "2024-02-29"]);
    expect(interval("2023-02")).toEqual(["2023-02-01", "2023-02-28"]);
    expect(interval("1900-02")).toEqual(["1900-02-01", "1900-02-28"]);
    expect(interval("2000-02")).toEqual(["2000-02-01", "2000-02-29"]);
  });

  test("treats absent and unreadable input as unknown", () => {
    for (const raw of [null, undefined, "", "   ", "undated", "Undated"]) {
      expect(parseChangeDate(raw).precision, String(raw)).toBe("unknown");
    }
    expect(parseChangeDate(null).raw).toBe("");
    expect(parseChangeDate("undated").display).toBe("Date not stated");
  });

  test("displays each precision at its own grain", () => {
    expect(parseChangeDate("2025-10-02").display).toBe("2 October 2025");
    expect(parseChangeDate("2024-05").display).toBe("May 2024");
    expect(parseChangeDate("2026-spring").display).toBe("Spring 2026");
    expect(parseChangeDate("2013").display).toBe("2013");
    expect(parseChangeDate("2013-2014").display).toBe("2013 to 2014");
  });
});

describe("chronological order", () => {
  test("sorts newest first and always puts unknown last", () => {
    const ordered = ["TBD", "2026-04", "2013-2014", "2026-spring", "2025-10-02"]
      .map((raw) => parseChangeDate(raw))
      .sort(compareChangeDatesNewestFirst)
      .map((value) => value.raw);

    expect(ordered).toEqual(["2026-04", "2026-spring", "2025-10-02", "2013-2014", "TBD"]);
  });

  test("breaks an equal opening day in favour of the shorter interval", () => {
    const month = parseChangeDate("2026-04");
    const quarter = parseChangeDate("2026-spring");
    expect(month.precision === "unknown" ? null : month.start).toBe("2026-04-01");
    expect(quarter.precision === "unknown" ? null : quarter.start).toBe("2026-04-01");
    expect(compareChangeDatesNewestFirst(month, quarter)).toBeLessThan(0);
    expect(compareChangeDatesNewestFirst(quarter, month)).toBeGreaterThan(0);
  });

  test("never lets an unknown date outrank a known one, in either argument order", () => {
    const unknown = parseChangeDate("TBD");
    const other = parseChangeDate("Spring");
    for (const raw of ["1963", "2026-04", "2013-2014", "2026-spring"]) {
      const value = parseChangeDate(raw);
      expect(compareChangeDatesNewestFirst(unknown, value)).toBeGreaterThan(0);
      expect(compareChangeDatesNewestFirst(value, unknown)).toBeLessThan(0);
    }
    expect(compareChangeDatesNewestFirst(unknown, other)).toBeGreaterThan(0);
    expect(compareChangeDatesNewestFirst(unknown, unknown)).toBe(0);
  });

  test("exposes a string sort key that partitions unknown dates", () => {
    expect(changeDateSortKey(parseChangeDate("2026-spring"))).toBe("2026-04-01");
    expect(changeDateSortKey(parseChangeDate("2025-10-02"))).toBe("2025-10-02");
    expect(changeDateSortKey(parseChangeDate("TBD"))).toBe("");
  });
});

describe("interval overlap", () => {
  const overlaps = (left: string, right: string): boolean =>
    changeDatesOverlap(parseChangeDate(left), parseChangeDate(right));

  test("detects shared days between known intervals", () => {
    expect(overlaps("2013", "2013-03")).toBe(true);
    expect(overlaps("2013-2014", "2014")).toBe(true);
    expect(overlaps("2013", "2015")).toBe(false);
    expect(overlaps("2013-fall", "2013-10-15")).toBe(true);
    expect(overlaps("2013-spring", "2013-summer")).toBe(false);
  });

  test("is symmetric and reflexive for known intervals", () => {
    expect(overlaps("2013-03", "2013")).toBe(true);
    expect(overlaps("2026-spring", "2026-spring")).toBe(true);
  });

  test("never overlaps an unknown date, including itself", () => {
    const unknown: ChangeDate = parseChangeDate("TBD");
    expect(changeDatesOverlap(unknown, unknown)).toBe(false);
    expect(overlaps("TBD", "2013")).toBe(false);
    expect(overlaps("2013", "TBD")).toBe(false);
  });
});

describe("group labels", () => {
  test("names a single-year interval by its year", () => {
    expect(changeDateGroupLabel(parseChangeDate("2025-10-02"))).toBe("2025");
    expect(changeDateGroupLabel(parseChangeDate("2024-05"))).toBe("2024");
    expect(changeDateGroupLabel(parseChangeDate("2026-spring"))).toBe("2026");
    expect(changeDateGroupLabel(parseChangeDate("1963"))).toBe("1963");
  });

  test("keeps a multi-year interval in one EN DASH group", () => {
    expect(changeDateGroupLabel(parseChangeDate("2013-2014"))).toBe("2013–2014");
    expect(changeDateGroupLabel(parseChangeDate("2019/2020"))).toBe("2019–2020");
    expect(changeDateGroupLabel(parseChangeDate("Late 2018/Early 2019"))).toBe("2018–2019");
    expect(changeDateGroupLabel(parseChangeDate("2013-2014"))).not.toContain("-");
  });

  test("names an unknown date Undated", () => {
    expect(changeDateGroupLabel(parseChangeDate("TBD"))).toBe("Undated");
    expect(changeDateGroupLabel(parseChangeDate(null))).toBe("Undated");
  });
});
