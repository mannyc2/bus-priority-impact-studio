/** Low-level SQL literal helpers used by the D1 seed exporter. */

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function sqlJson(value: unknown): string {
  return sqlString(JSON.stringify(value));
}

export function boolInt(value: boolean): number {
  return value ? 1 : 0;
}

export function sqlNullableNumber(value: number | null): string {
  return value === null ? "NULL" : String(value);
}
