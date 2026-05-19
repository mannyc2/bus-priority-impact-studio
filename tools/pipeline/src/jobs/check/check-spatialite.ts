import { withLocalPipelineDb } from "../../lib/local-db.js";

type Args = { dbPath: string | null };

type Result = {
  ok: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

function parseCliArgs(args: string[]): Args {
  const i = args.indexOf("--db-path");
  return { dbPath: i === -1 ? null : (args[i + 1] ?? null) };
}

export async function checkSpatialite(args: Partial<Args> = {}): Promise<Result> {
  try {
    return await withLocalPipelineDb(
      args.dbPath ?? undefined,
      async (local) => ({
        ok: true,
        path: local.spatialite?.path ?? null,
        version: local.spatialite?.version ?? null,
        error: null,
      }),
      { spatial: true },
    );
  } catch (err) {
    return { ok: false, path: null, version: null, error: (err as Error).message };
  }
}

export async function checkSpatialiteFromCli(args: string[]): Promise<Result> {
  const result = await checkSpatialite(parseCliArgs(args));
  if (result.ok) {
    console.log(`spatialite OK: ${result.version} (loaded from ${result.path})`);
  } else {
    console.error(result.error);
    process.exitCode = 1;
  }
  return result;
}
