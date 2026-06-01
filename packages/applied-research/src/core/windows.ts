export type IsoMonthString = `${number}-${number}`;

export type HistoryWindow = {
  readonly startMonth: IsoMonthString;
  readonly endMonth: IsoMonthString;
  readonly months: readonly IsoMonthString[];
  readonly complete: boolean;
  readonly missingMonths: readonly IsoMonthString[];
};

function parseMonth(month: IsoMonthString): { year: number; month: number } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    throw new Error(`Invalid ISO month: ${month}`);
  }

  return { year, month: monthNumber };
}

function formatMonth(year: number, month: number): IsoMonthString {
  return `${year}-${String(month).padStart(2, "0")}` as IsoMonthString;
}

export function previousMonth(month: IsoMonthString): IsoMonthString {
  const parsed = parseMonth(month);
  if (parsed.month === 1) {
    return formatMonth(parsed.year - 1, 12);
  }

  return formatMonth(parsed.year, parsed.month - 1);
}

export function monthRange(startMonth: IsoMonthString, endMonth: IsoMonthString): IsoMonthString[] {
  const start = parseMonth(startMonth);
  const end = parseMonth(endMonth);
  const startOrdinal = start.year * 12 + start.month;
  const endOrdinal = end.year * 12 + end.month;

  if (endOrdinal < startOrdinal) {
    throw new Error(`History window end ${endMonth} is before start ${startMonth}`);
  }

  const months: IsoMonthString[] = [];
  for (let ordinal = startOrdinal; ordinal <= endOrdinal; ordinal += 1) {
    const zeroBased = ordinal - 1;
    months.push(formatMonth(Math.floor(zeroBased / 12), (zeroBased % 12) + 1));
  }

  return months;
}

export function buildHistoryWindow(params: {
  readonly startMonth: IsoMonthString;
  readonly endMonth: IsoMonthString;
  readonly availableMonths: readonly IsoMonthString[];
}): HistoryWindow {
  const months = monthRange(params.startMonth, params.endMonth);
  const available = new Set(params.availableMonths);
  const missingMonths = months.filter((month) => !available.has(month));

  return {
    startMonth: params.startMonth,
    endMonth: params.endMonth,
    months,
    complete: missingMonths.length === 0,
    missingMonths,
  };
}
