function headersFrom(init: HeadersInit | undefined): Headers {
  const headers = new Headers();
  if (init === undefined) return headers;

  for (const [key, value] of new Headers(
    init as ConstructorParameters<typeof Headers>[0],
  ).entries()) {
    headers.set(key, value);
  }

  return headers;
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = headersFrom(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function noStoreHeaders(init?: HeadersInit): Headers {
  const headers = headersFrom(init);
  headers.set("Cache-Control", "no-store");
  return headers;
}

export function noContentResponse(init?: ResponseInit): Response {
  return new Response(null, {
    ...init,
    status: init?.status ?? 204,
    headers: noStoreHeaders(init?.headers),
  });
}
