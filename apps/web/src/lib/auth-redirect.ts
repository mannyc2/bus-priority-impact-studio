export function safeAppRedirect(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  const origin =
    typeof window === "undefined" ? "https://buspriorityimpact.studio" : window.location.origin;

  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith("/") && !value.startsWith("//") ? value : undefined;
  }
}
