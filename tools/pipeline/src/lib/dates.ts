export function isoMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function monthRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Array<{ year: number; month: number; isoMonth: string }> {
  const months: Array<{ year: number; month: number; isoMonth: string }> = [];
  let cursor = { year: startYear, month: startMonth };

  while (cursor.year < endYear || (cursor.year === endYear && cursor.month <= endMonth)) {
    months.push({ ...cursor, isoMonth: isoMonth(cursor.year, cursor.month) });
    cursor = nextMonth(cursor.year, cursor.month);
  }

  return months;
}

export function isoMonthStart(year: number, month: number): string {
  return `${isoMonth(year, month)}-01T00:00:00`;
}

export function nextIsoMonthStart(year: number, month: number): string {
  const next = nextMonth(year, month);
  return isoMonthStart(next.year, next.month);
}
