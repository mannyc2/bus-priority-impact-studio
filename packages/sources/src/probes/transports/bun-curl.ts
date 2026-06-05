import type { HttpProbe } from "../contracts.js";

const sourceProbeUserAgent =
  "Mozilla/5.0 (compatible; BusPriorityImpactStudio/0.1; +https://www.mta.info/open-data)";

function headerValue(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? undefined;
}

function parseContentLength(value: string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCurlHeadOutput(output: string, fallbackUrl: string): HttpProbe {
  const marker = "__CURL_EFFECTIVE_URL__:";
  const [headersText = "", finalUrlText] = output.split(marker);
  const finalUrl = finalUrlText?.trim() || fallbackUrl;
  const headerBlocks = headersText
    .trim()
    .split(/\r?\n\r?\n/)
    .filter((block) => block.startsWith("HTTP/"));
  const finalBlock = headerBlocks.at(-1);

  if (finalBlock === undefined) {
    throw new Error("curl did not return an HTTP header block.");
  }

  const [statusLine, ...headerLines] = finalBlock.split(/\r?\n/);
  const statusMatch = statusLine?.match(/^HTTP\/\S+\s+(\d{3})/);
  if (statusMatch?.[1] === undefined) {
    throw new Error(`curl returned an unparseable HTTP status line: ${statusLine ?? ""}`);
  }

  const headers = new Headers();
  for (const line of headerLines) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const status = Number.parseInt(statusMatch[1], 10);
  const contentType = headerValue(headers, "content-type");
  const contentLengthBytes = parseContentLength(headers.get("content-length"));
  const lastModified = headerValue(headers, "last-modified");
  const etag = headerValue(headers, "etag");
  const responseDate = headerValue(headers, "date");

  return {
    method: "HEAD",
    transport: "curl",
    status,
    ok: status >= 200 && status < 400,
    finalUrl,
    ...(contentType === undefined ? {} : { contentType }),
    ...(contentLengthBytes === undefined ? {} : { contentLengthBytes }),
    ...(lastModified === undefined ? {} : { lastModified }),
    ...(etag === undefined ? {} : { etag }),
    ...(responseDate === undefined ? {} : { responseDate }),
  };
}

export async function fetchCurlHeadMetadata(url: string): Promise<HttpProbe> {
  const proc = Bun.spawn(
    [
      "curl",
      "--head",
      "--location",
      "--silent",
      "--show-error",
      "--max-time",
      "20",
      "--user-agent",
      sourceProbeUserAgent,
      "--dump-header",
      "-",
      "--output",
      "/dev/null",
      "--write-out",
      `\n__CURL_EFFECTIVE_URL__:%{url_effective}\n`,
      url,
    ],
    {
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `curl exited with code ${exitCode}`);
  }

  return parseCurlHeadOutput(stdout, url);
}
