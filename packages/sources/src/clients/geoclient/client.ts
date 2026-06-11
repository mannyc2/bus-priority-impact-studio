/**
 * Thin wrapper over NYC Geoclient v2 (api.nyc.gov/geoclient/v2).
 *
 * The free tier is rate-limited; callers should cache responses through the
 * local_address_geocode table (handled in tools/pipeline). This client
 * itself is stateless and only owns: URL construction, retries on 429/5xx,
 * response normalization, and key auth.
 *
 * Geoclient does not return a LION `physical_id` directly. It returns
 * `physicalId` only on the older Geosupport-style call; on the modern API
 * the relevant field is `physicalId` from the address detail response. We
 * tolerate either spelling and surface it as `physicalId`.
 */

export type GeoclientFetch = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }>;

export type GeoclientAddressInput = {
  houseNumber: string;
  street: string;
  borough: string; // "manhattan" | "bronx" | "brooklyn" | "queens" | "staten island" — case-insensitive
};

export type GeoclientIntersectionInput = {
  crossStreetOne: string;
  crossStreetTwo: string;
  borough: string;
};

export type GeoclientResult = {
  physicalId: string | null;
  lat: number | null;
  lng: number | null;
  confidence: string;
  raw: unknown;
};

export class GeoclientHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GeoclientHttpError";
  }
}

export type Geoclient = {
  address(input: GeoclientAddressInput): Promise<GeoclientResult | null>;
  intersection(input: GeoclientIntersectionInput): Promise<GeoclientResult | null>;
  search(text: string): Promise<GeoclientResult | null>;
};

type GeoclientOptions = {
  apiKey: string;
  baseUrl?: string;
  fetcher?: GeoclientFetch;
  maxRetries?: number;
  retryDelayMs?: number;
};

// v1 (path: /geo/geoclient/v1, suffix: .json) was deactivated 2026-01-13.
// v2 lives at /geoclient/v2 (no /geo/ prefix) and the endpoints are bare
// path segments (no .json). See geoclient-current-v2.yaml for the spec.
const DEFAULT_BASE_URL = "https://api.nyc.gov/geoclient/v2";

export function createGeoclient(options: GeoclientOptions): Geoclient {
  const base = options.baseUrl ?? DEFAULT_BASE_URL;
  const fetcher: GeoclientFetch =
    options.fetcher ??
    ((input, init) =>
      fetch(input, init).then((r) => ({
        ok: r.ok,
        status: r.status,
        statusText: r.statusText,
        json: () => r.json(),
      })));
  const maxRetries = options.maxRetries ?? 4;
  const retryDelayMs = options.retryDelayMs ?? 500;

  async function call(path: string, params: Record<string, string>): Promise<unknown> {
    const url = new URL(`${base.replace(/\/$/, "")}/${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    let attempt = 0;
    let lastError: Error | null = null;
    while (attempt <= maxRetries) {
      const response = await fetcher(url.toString(), {
        headers: { "Ocp-Apim-Subscription-Key": options.apiKey, Accept: "application/json" },
      });
      if (response.ok) return response.json();
      if (response.status === 429 || response.status >= 500) {
        lastError = new GeoclientHttpError(
          `Geoclient ${path} ${response.status} ${response.statusText}`,
          response.status,
        );
        await sleep(retryDelayMs * 2 ** attempt);
        attempt += 1;
        continue;
      }
      throw new GeoclientHttpError(
        `Geoclient ${path} ${response.status} ${response.statusText}`,
        response.status,
      );
    }
    throw lastError ?? new GeoclientHttpError(`Geoclient ${path} exhausted retries`, 0);
  }

  return {
    async address(input) {
      const body = (await call("address", {
        houseNumber: input.houseNumber,
        street: input.street,
        borough: input.borough,
      })) as { address?: unknown } | null;
      return body == null ? null : extractResult(body, "address");
    },
    async intersection(input) {
      const body = (await call("intersection", {
        crossStreetOne: input.crossStreetOne,
        crossStreetTwo: input.crossStreetTwo,
        borough: input.borough,
      })) as { intersection?: unknown } | null;
      return body == null ? null : extractResult(body, "intersection");
    },
    async search(text) {
      const body = (await call("search", { input: text })) as {
        results?: Array<{ response?: unknown }>;
      } | null;
      if (body == null) return null;
      const first = body.results?.[0]?.response;
      if (first == null) return null;
      return extractResult({ address: first }, "address");
    },
  };
}

type GeoclientDetail = Record<string, unknown> & {
  geosupportReturnCode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  physicalId?: unknown;
  workAreaFormatIdLeft?: unknown;
};

function extractResult(body: Record<string, unknown>, key: string): GeoclientResult | null {
  const detail = (body[key] ?? body) as GeoclientDetail | undefined;
  if (!detail) return null;
  const physicalId =
    typeof detail.physicalId === "string"
      ? detail.physicalId
      : typeof detail.workAreaFormatIdLeft === "string"
        ? detail.workAreaFormatIdLeft
        : null;
  // Only accept `latitude` / `longitude` (decimal degrees, WGS84). The
  // `*InternalLabel` fields are NYC state-plane integer labels, NOT lat/lng;
  // using them as coordinates would silently corrupt downstream snapping.
  const lat = typeof detail.latitude === "number" ? detail.latitude : null;
  const lng = typeof detail.longitude === "number" ? detail.longitude : null;
  const confidence =
    typeof detail.geosupportReturnCode === "string" ? `grc=${detail.geosupportReturnCode}` : "ok";
  return { physicalId, lat, lng, confidence, raw: detail };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
