const KEY = "bp:recent-routes";
const MAX = 4;
const subs = new Set<() => void>();

let cache: readonly string[] = [];
let cacheLoaded = false;

function read(): readonly string[] {
  if (cacheLoaded) return cache;
  cacheLoaded = true;
  if (typeof window === "undefined") return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function pushRecentRoute(slug: string): void {
  if (typeof window === "undefined") return;
  const cur = read();
  const next = [slug, ...cur.filter((s) => s !== slug)].slice(0, MAX);
  cache = next;
  cacheLoaded = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage may throw in private mode / quota; in-memory cache still updates
  }
  for (const cb of subs) cb();
}
