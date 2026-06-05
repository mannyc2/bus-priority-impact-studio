export type ServerTimingMetric = {
  name: string;
  durationMs: number;
};

export function appendServerTiming(headers: Headers, metric: ServerTimingMetric): void {
  headers.append("Server-Timing", `${metric.name};dur=${metric.durationMs.toFixed(1)}`);
}

export async function withServerTiming(
  name: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now();
  const response = await handler();
  const headers = new Headers(response.headers);
  appendServerTiming(headers, { name, durationMs: Date.now() - startedAt });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export class ServerTimingRecorder {
  readonly #metrics: ServerTimingMetric[] = [];

  async measure<T>(name: string, action: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      return await action();
    } finally {
      this.#metrics.push({ name, durationMs: Date.now() - startedAt });
    }
  }

  apply(headers: Headers): void {
    for (const metric of this.#metrics) {
      appendServerTiming(headers, metric);
    }
  }
}
