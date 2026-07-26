/**
 * Typed documented change dates.
 *
 * Source documents state dates in prose, so every documented change is read
 * once into an interval carrying an explicit precision. This module is the only
 * place a documented date string may be interpreted: ordering, grouping,
 * overlap and display all read the typed value and never the raw string.
 *
 * There is no runtime `Date` and no date library here. Every interval endpoint
 * is a fixed string, and the only arithmetic is days-in-month plus a leap-year
 * check on February.
 */

export type ChangeDatePrecision = "day" | "month" | "quarter" | "year" | "range" | "unknown";

export type ChangeDate =
  | {
      precision: Exclude<ChangeDatePrecision, "unknown">;
      /** Inclusive ISO calendar day the interval opens on. */
      start: string;
      /** Inclusive ISO calendar day the interval closes on. */
      end: string;
      /** Human display at the stated precision, e.g. "Spring 2026". */
      display: string;
      /** The exact source string this was read from. */
      raw: string;
    }
  | { precision: "unknown"; display: string; raw: string };

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Seasons map to calendar quarters, not to meteorological seasons. A
 * meteorological winter opens in December of a neighbouring year, which would
 * break `winter < spring < summer < fall` inside a single year; a calendar
 * quarter keeps those four monotone and states its own imprecision through
 * `precision: "quarter"`. A source that spells a cross-year winter is therefore
 * still read as the first quarter of the year it names.
 */
const SEASON_QUARTERS: Record<string, { firstMonth: number; lastMonth: number; label: string }> = {
  winter: { firstMonth: 1, lastMonth: 3, label: "Winter" },
  spring: { firstMonth: 4, lastMonth: 6, label: "Spring" },
  summer: { firstMonth: 7, lastMonth: 9, label: "Summer" },
  fall: { firstMonth: 10, lastMonth: 12, label: "Fall" },
  autumn: { firstMonth: 10, lastMonth: 12, label: "Fall" },
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_MONTH = /^\d{4}-\d{2}$/u;
const YEAR_AND_SEASON = /^\d{4}-[A-Za-z]+$/u;
// Four digits on both sides, so `2013-2014` is a span and never a month.
const YEAR_SPAN = /^\d{4}[-/]\d{4}$/u;
const YEAR_ONLY = /^\d{4}$/u;
const YEAR_IN_TEXT = /\b(?:19|20)\d{2}\b/gu;
const MONTH_IN_TEXT =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/iu;

/** Reads any documented date string. Never throws; unparseable input is `unknown`. */
export function parseChangeDate(raw: string | null | undefined): ChangeDate {
  const source = raw ?? "";
  const trimmed = source.trim();

  if (ISO_DAY.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = Number(trimmed.slice(5, 7));
    const day = Number(trimmed.slice(8, 10));
    return known("day", trimmed, trimmed, `${day} ${monthName(month)} ${year}`, source);
  }

  if (ISO_MONTH.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const month = Number(trimmed.slice(5, 7));
    return known("month", ...monthSpan(year, month), `${monthName(month)} ${year}`, source);
  }

  if (YEAR_AND_SEASON.test(trimmed)) {
    const year = trimmed.slice(0, 4);
    const quarter = SEASON_QUARTERS[trimmed.slice(5).toLowerCase()];
    if (quarter !== undefined) {
      return known(
        "quarter",
        isoDay(year, quarter.firstMonth, 1),
        isoDay(year, quarter.lastMonth, lastDayOfMonth(year, quarter.lastMonth)),
        `${quarter.label} ${year}`,
        source,
      );
    }
  }

  if (YEAR_SPAN.test(trimmed)) {
    const first = Number(trimmed.slice(0, 4));
    const second = Number(trimmed.slice(5, 9));
    const low = String(Math.min(first, second));
    const high = String(Math.max(first, second));
    return known("range", ...yearSpan(low, high), `${low} to ${high}`, source);
  }

  if (YEAR_ONLY.test(trimmed)) {
    return known("year", ...yearSpan(trimmed, trimmed), trimmed, source);
  }

  const years = [...new Set([...trimmed.matchAll(YEAR_IN_TEXT)].map((match) => match[0]))].sort();
  const lowest = years[0];
  const highest = years.at(-1);
  if (lowest === undefined || highest === undefined) return unknownDate(source);
  if (lowest !== highest) return known("range", ...yearSpan(lowest, highest), trimmed, source);

  const matched = MONTH_IN_TEXT.exec(trimmed)?.[0].toLowerCase();
  const month = MONTH_NAMES.findIndex((name) => name.toLowerCase() === matched) + 1;
  if (month === 0) return known("year", ...yearSpan(lowest, lowest), trimmed, source);
  return known("month", ...monthSpan(lowest, month), trimmed, source);
}

/** Newest first. `unknown` always sorts last, never first. Ties broken on end, then raw. */
export function compareChangeDatesNewestFirst(left: ChangeDate, right: ChangeDate): number {
  if (left.precision === "unknown" && right.precision === "unknown") {
    return left.raw.localeCompare(right.raw);
  }
  if (left.precision === "unknown") return 1;
  if (right.precision === "unknown") return -1;
  return (
    right.start.localeCompare(left.start) ||
    // Same opening day: the shorter, more precise interval leads.
    left.end.localeCompare(right.end) ||
    left.raw.localeCompare(right.raw)
  );
}

/** True when two known intervals share at least one day. `unknown` never overlaps. */
export function changeDatesOverlap(left: ChangeDate, right: ChangeDate): boolean {
  if (left.precision === "unknown" || right.precision === "unknown") return false;
  return left.start <= right.end && right.start <= left.end;
}

/** Group heading: the calendar year for a single-year interval, "2013–2014"
 *  for a multi-year interval, "Undated" for unknown. */
export function changeDateGroupLabel(value: ChangeDate): string {
  if (value.precision === "unknown") return "Undated";
  const startYear = value.start.slice(0, 4);
  const endYear = value.end.slice(0, 4);
  return startYear === endYear ? startYear : `${startYear}–${endYear}`;
}

/** Machine-sortable key, for callers that must keep a string sort. Known dates
 *  return the ISO `start`; unknown returns "" so callers can partition. */
export function changeDateSortKey(value: ChangeDate): string {
  return value.precision === "unknown" ? "" : value.start;
}

function known(
  precision: Exclude<ChangeDatePrecision, "unknown">,
  start: string,
  end: string,
  display: string,
  raw: string,
): ChangeDate {
  return { precision, start, end, display, raw };
}

function unknownDate(raw: string): ChangeDate {
  return { precision: "unknown", display: "Date not stated", raw };
}

function monthSpan(year: string, month: number): [string, string] {
  return [isoDay(year, month, 1), isoDay(year, month, lastDayOfMonth(year, month))];
}

function yearSpan(startYear: string, endYear: string): [string, string] {
  return [isoDay(startYear, 1, 1), isoDay(endYear, 12, 31)];
}

function isoDay(year: string, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function lastDayOfMonth(year: string, month: number): number {
  if (month === 2 && isLeapYear(Number(year))) return 29;
  return DAYS_IN_MONTH[month - 1] ?? 31;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
