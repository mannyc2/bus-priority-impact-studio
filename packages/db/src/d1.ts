export type D1Value = string | number | boolean | null;

export type D1Result<T> = {
  results?: T[];
};

export type D1PreparedStatement<T = unknown> = {
  bind(...values: D1Value[]): D1PreparedStatement<T>;
  first(): Promise<T | null>;
  all(): Promise<D1Result<T>>;
};

export type D1DatabaseLike = {
  prepare<T = unknown>(query: string): D1PreparedStatement<T>;
};
