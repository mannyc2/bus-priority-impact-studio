export type SocrataFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

type SocrataHeadersInit = ConstructorParameters<typeof Headers>[0];

export function socrataAppTokenFromEnv(): string | null {
  const socrataAppTokenEnv = "SOCRATA_APP_TOKEN";
  const token = process.env[socrataAppTokenEnv]?.trim();
  return token === undefined || token.length === 0 ? null : token;
}

function headersWithSocrataAppToken(
  headers: SocrataHeadersInit | undefined,
  token: string,
): Headers {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has("X-App-Token")) {
    nextHeaders.set("X-App-Token", token);
  }
  return nextHeaders;
}

export function fetchWithSocrataAppToken(
  fetcher: SocrataFetch | undefined,
  token: string | null = socrataAppTokenFromEnv(),
): SocrataFetch {
  const baseFetch: SocrataFetch = fetcher ?? fetch;
  if (token === null) return baseFetch;

  return (input, init) =>
    baseFetch(input, {
      ...init,
      headers: headersWithSocrataAppToken(init?.headers, token),
    });
}
