/** Low-level SQL literal helpers used by the D1 seed exporter. */

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function boolInt(value: boolean): number {
  return value ? 1 : 0;
}

export function sqlNullableNumber(value: number | null): string {
  return value === null ? "NULL" : String(value);
}

export function sqlNullableString(value: string | null): string {
  return value === null ? "NULL" : sqlString(value);
}
