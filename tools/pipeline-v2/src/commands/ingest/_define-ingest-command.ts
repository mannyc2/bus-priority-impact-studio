import { type CommandDefinition, defineCommand, Schema } from "@bp/pipeline-v2/cli/compat";
import { runLocalDbCommandBoundary } from "../../effect/local-db-command.ts";
import type { OpenLocalPipelineDb } from "../../lib/local-db.ts";

type IngestCommandOptions = { readonly db?: string | undefined };

export function defineIngestCommand<Options extends IngestCommandOptions, Output>(config: {
  readonly path: readonly ["ingest", string];
  readonly summary: string;
  readonly options: Schema.Schema<Options>;
  readonly output: Schema.Schema<Output>;
  readonly operation: string;
  readonly dbPath?: ((options: Options) => string | undefined) | undefined;
  readonly spanAttributes?:
    | ((options: Options) => Record<string, string | number | boolean | null>)
    | undefined;
  readonly runner: (local: OpenLocalPipelineDb, options: Options) => Promise<Output>;
}): CommandDefinition<Options, Output> {
  const command = config.path.join(".");

  return defineCommand({
    path: config.path,
    summary: config.summary,
    input: { options: config.options },
    output: config.output,
    run({ input }) {
      return runLocalDbCommandBoundary({
        dbPath: config.dbPath?.(input.options) ?? input.options.db,
        command,
        operation: config.operation,
        spanAttributes: config.spanAttributes?.(input.options),
        run: (local) => config.runner(local, input.options),
      });
    },
  });
}
