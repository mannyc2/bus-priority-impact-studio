/** Shared SoQL query-building helpers for Socrata data sources. */

/** Single-quote a string value for use in a SoQL WHERE clause. */
export function soqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Build a SoQL IN clause: `field in('a','b','c')`. */
export function soqlIn(field: string, values: readonly string[]): string {
  return `${field} in(${values.map(soqlQuote).join(",")})`;
}

/**
 * Build a SoQL WHERE fragment for a year/month range on datasets
 * that expose separate `year` and `month` integer columns (e.g. bus segment speeds).
 */
export function soqlYearMonthRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): string {
  return [
    `(year > ${startYear} OR (year = ${startYear} AND month >= ${startMonth}))`,
    `(year < ${endYear} OR (year = ${endYear} AND month <= ${endMonth}))`,
  ].join(" AND ");
}
