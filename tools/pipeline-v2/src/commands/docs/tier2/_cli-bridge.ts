// Helpers that adapt liche's typed `input.options` shape back into the
// `string[]` args format the v1 FromCli functions expect. Each tier2
// command file defines a Zod options schema with kebab-case flags and
// then calls `optionsToArgs` to produce the equivalent argv array.
//
// No `default` export — the v2 CLI loader ignores `_*.ts` files anyway,
// but the convention keeps this clearly a helper.

export type OptionsLike = Record<string, unknown>;

/**
 * Convert a parsed liche options object to a v1-style args[] array.
 *
 * - String options become `[flag, value]`.
 * - Numeric options become `[flag, String(value)]`.
 * - Boolean `true` options become just `[flag]` (matches v1 trueOption).
 * - `undefined` / `false` are omitted.
 *
 * `mapping` maps the liche option name (camelCase) to the v1 flag string
 * (kebab-case `--flag`).
 */
export function optionsToArgs(options: OptionsLike, mapping: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [optionKey, flag] of Object.entries(mapping)) {
    const value = options[optionKey];
    if (value === undefined || value === null) continue;
    if (typeof value === "boolean") {
      if (value) out.push(flag);
      continue;
    }
    if (typeof value === "string") {
      if (value.length === 0) continue;
      out.push(flag, value);
      continue;
    }
    if (typeof value === "number") {
      out.push(flag, String(value));
      continue;
    }
    if (Array.isArray(value)) {
      // v1 represents list flags as comma-separated strings.
      if (value.length === 0) continue;
      out.push(flag, value.map((v) => String(v)).join(","));
      continue;
    }
    // Any other shape (object): stringify defensively. v1's parsers
    // don't accept anything more exotic than scalars.
    out.push(flag, String(value));
  }
  return out;
}
