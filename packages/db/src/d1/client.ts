import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";
import {
  D1_GENERATED_CANDIDATE_TABLES,
  D1_MIXED_LEGACY_TABLES,
} from "./serving-table-ownership.js";

export type D1ServingSchema = typeof schema;
export type D1ServingDb = DrizzleD1Database<D1ServingSchema> & { $client: D1Database };

export type ServingQueryScope = { candidateId: string };

const CANDIDATE_TABLES = [...D1_GENERATED_CANDIDATE_TABLES, ...D1_MIXED_LEGACY_TABLES].toSorted(
  (left, right) => right.length - left.length,
);
const CANDIDATE_TABLE_PATTERN = new RegExp(
  `\\b(from|join)\\s+"(${CANDIDATE_TABLES.join("|")})"`,
  "giu",
);

export function scopeServingQuery(
  query: string,
  candidateId: string,
): { query: string; bindings: string[] } {
  const bindings: string[] = [];
  const scoped = query.replace(
    CANDIDATE_TABLE_PATTERN,
    (_match, keyword: string, table: string) => {
      bindings.push(candidateId);
      return `${keyword} (SELECT * FROM "${table}_v2" WHERE candidate_id = ?) AS "${table}"`;
    },
  );
  return { query: scoped, bindings };
}

class ScopedPreparedStatement {
  readonly #statement: D1PreparedStatement;
  readonly #scopeBindings: readonly string[];
  readonly #queryBindings: readonly unknown[];

  constructor(
    statement: D1PreparedStatement,
    scopeBindings: readonly string[],
    queryBindings: readonly unknown[] = [],
  ) {
    this.#statement = statement;
    this.#scopeBindings = scopeBindings;
    this.#queryBindings = queryBindings;
  }

  #bound(): D1PreparedStatement {
    return this.#statement.bind(...this.#scopeBindings, ...this.#queryBindings);
  }

  bind(...values: unknown[]): ScopedPreparedStatement {
    return new ScopedPreparedStatement(this.#statement, this.#scopeBindings, values);
  }

  first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    return colName === undefined ? this.#bound().first<T>() : this.#bound().first<T>(colName);
  }

  run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.#bound().run<T>();
  }

  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return this.#bound().all<T>();
  }

  raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    if (options?.columnNames === true) {
      return this.#bound().raw<T>({ columnNames: true });
    }
    return this.#bound().raw<T>();
  }
}

export function createCandidateScopedD1Database(
  database: D1Database,
  scope: ServingQueryScope,
): D1Database {
  return new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "prepare") return Reflect.get(target, property, receiver);
      return (query: string): D1PreparedStatement => {
        const scoped = scopeServingQuery(query, scope.candidateId);
        return new ScopedPreparedStatement(
          target.prepare(scoped.query),
          scoped.bindings,
        ) as unknown as D1PreparedStatement;
      };
    },
  });
}

export function createD1ServingDb(database: D1Database, scope?: ServingQueryScope): D1ServingDb {
  return drizzle(
    scope === undefined ? database : createCandidateScopedD1Database(database, scope),
    {
      schema,
    },
  );
}
