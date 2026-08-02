type Plan098OperatorEnvelope<T> = { ok: true; result: T };

type Plan098Fetch = (input: string, init: RequestInit) => Promise<Response>;
type Plan098OperatorPayload = { action?: unknown } & Record<string, unknown>;

const retryableReadActions = new Set([
  "candidate-status",
  "protected-fingerprints",
  "read-receipt",
  "status",
  "verify-plan097-preflight",
]);

function compactDiagnostic(value: string): string {
  const compact = value.trim().replace(/\s+/gu, " ");
  if (compact.length === 0) return "";
  return compact.length <= 300 ? compact : `${compact.slice(0, 300)}…`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createPlan098OperatorClient(input: {
  endpoint: string;
  token: string;
  fetch?: Plan098Fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  readAttempts?: number;
  retryDelayMilliseconds?: number;
}) {
  const fetchOperation = input.fetch ?? fetch;
  const sleep =
    input.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }));
  const readAttempts = input.readAttempts ?? 15;
  const retryDelayMilliseconds = input.retryDelayMilliseconds ?? 2_000;
  if (!Number.isInteger(readAttempts) || readAttempts < 1) {
    throw new Error("Plan 098 operator readAttempts must be a positive integer.");
  }

  return async <T>(payload: Plan098OperatorPayload): Promise<T> => {
    const action = payload.action;
    if (typeof action !== "string" || action.length === 0) {
      throw new Error("Plan 098 operator payload requires an action.");
    }
    const retryableRead = retryableReadActions.has(action);
    const maximumAttempts = retryableRead ? readAttempts : 1;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await fetchOperation(input.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (retryableRead && attempt < maximumAttempts) {
          await sleep(retryDelayMilliseconds);
          continue;
        }
        throw new Error(
          `Plan 098 operator ${action} transport failed after ${attempt} attempt(s): ${errorMessage(error)}`,
        );
      }

      const responseText = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(responseText);
      } catch {
        if (
          retryableRead &&
          (response.status === 404 || response.status >= 500) &&
          attempt < maximumAttempts
        ) {
          await sleep(retryDelayMilliseconds);
          continue;
        }
        const diagnostic = compactDiagnostic(responseText);
        throw new Error(
          `Plan 098 operator ${action} returned non-JSON HTTP ${response.status} after ${attempt} attempt(s)${diagnostic.length === 0 ? "" : `: ${diagnostic}`}`,
        );
      }

      if (
        response.ok &&
        typeof body === "object" &&
        body !== null &&
        "ok" in body &&
        body.ok === true &&
        "result" in body
      ) {
        return (body as Plan098OperatorEnvelope<T>).result;
      }
      if (
        retryableRead &&
        (response.status === 404 || response.status >= 500) &&
        attempt < maximumAttempts
      ) {
        await sleep(retryDelayMilliseconds);
        continue;
      }
      throw new Error(
        `Plan 098 operator ${action} failed with HTTP ${response.status} after ${attempt} attempt(s): ${compactDiagnostic(responseText)}`,
      );
    }
    throw new Error(`Plan 098 operator ${action} exhausted its read retry budget.`);
  };
}

export async function fetchPlan098PublicRead(input: {
  url: string;
  label: string;
  fetch?: Plan098Fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  attempts?: number;
  retryDelayMilliseconds?: number;
  expectedStatuses?: readonly number[];
}): Promise<{ response: Response; body: string }> {
  const fetchOperation = input.fetch ?? fetch;
  const sleep =
    input.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      }));
  const maximumAttempts = input.attempts ?? 15;
  const retryDelayMilliseconds = input.retryDelayMilliseconds ?? 2_000;
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new Error("Plan 098 public read attempts must be a positive integer.");
  }
  if (
    input.expectedStatuses !== undefined &&
    (input.expectedStatuses.length === 0 ||
      input.expectedStatuses.some(
        (status) => !Number.isInteger(status) || status < 100 || status > 599,
      ))
  ) {
    throw new Error("Plan 098 public read expected statuses must be valid HTTP status codes.");
  }
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetchOperation(input.url, { redirect: "follow" });
    } catch (error) {
      if (attempt < maximumAttempts) {
        await sleep(retryDelayMilliseconds);
        continue;
      }
      throw new Error(
        `Plan 098 ${input.label} transport failed after ${attempt} attempt(s): ${errorMessage(error)}`,
      );
    }
    const body = await response.text();
    const accepted =
      input.expectedStatuses === undefined
        ? response.ok
        : input.expectedStatuses.includes(response.status);
    if (accepted) return { response, body };
    if ((response.status === 404 || response.status >= 500) && attempt < maximumAttempts) {
      await sleep(retryDelayMilliseconds);
      continue;
    }
    throw new Error(
      `Plan 098 ${input.label} failed with HTTP ${response.status} after ${attempt} attempt(s)${body.length === 0 ? "" : `: ${compactDiagnostic(body)}`}`,
    );
  }
  throw new Error(`Plan 098 ${input.label} exhausted its read retry budget.`);
}
