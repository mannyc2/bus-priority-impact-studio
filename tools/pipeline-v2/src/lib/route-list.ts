import { fromCliPath } from "./paths.ts";

export async function loadRouteListFromFile(path: string | undefined): Promise<string[]> {
  if (path === undefined) return [];
  const resolvedPath = fromCliPath(path);
  const parsed = JSON.parse(await Bun.file(resolvedPath).text()) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Route list file must contain a JSON array: ${resolvedPath}`);
  }
  const routes = parsed.map((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Route list file contains a non-string route id at index ${index}.`);
    }
    return value.trim();
  });
  return [...new Set(routes)].sort();
}

export async function mergeRoutesWithFile(
  routes: readonly string[],
  routesFile: string | undefined,
): Promise<string[]> {
  return [...new Set([...routes, ...(await loadRouteListFromFile(routesFile))])].sort();
}
