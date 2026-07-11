import { isLocalDevHost } from "./spa.js";

export function withSecurityHeaders(response: Response, url: URL): Response {
  const headers = new Headers(response.headers);
  setIfAbsent(headers, "X-Content-Type-Options", "nosniff");
  setIfAbsent(headers, "Referrer-Policy", "strict-origin-when-cross-origin");

  if (headers.get("Content-Type")?.includes("text/html")) {
    setIfAbsent(headers, "Content-Security-Policy", contentSecurityPolicy(url));
  }

  if (!isLocalDevHost(url.hostname)) {
    setIfAbsent(headers, "Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function contentSecurityPolicy(url: URL): string {
  const scriptSources = isLocalDevHost(url.hostname) ? "'self' 'unsafe-inline'" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

function setIfAbsent(headers: Headers, name: string, value: string): void {
  if (!headers.has(name)) headers.set(name, value);
}
