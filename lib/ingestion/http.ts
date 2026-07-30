export interface FetchJsonOptions {
  fetcher?: typeof fetch;
  headers?: HeadersInit;
  maxBytes?: number;
  retries?: number;
  retryBaseMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

export class ProviderHttpError extends Error {
  readonly status: number | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: {
      cause?: unknown;
      retryable: boolean;
      retryAfterMs?: number | null;
      status?: number | null;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderHttpError";
    this.status = options.status ?? null;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "provider endpoint";
  }
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1_000, 60_000);
  }

  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(Math.max(0, date - Date.now()), 60_000)
    : null;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Preserve the provider error if the runtime also fails to cancel a body.
  }
}

export async function fetchJsonWithRetry(
  url: string,
  {
    fetcher = fetch,
    headers,
    maxBytes = 8 * 1024 * 1024,
    retries = 3,
    retryBaseMs = 500,
    sleep = defaultSleep,
    timeoutMs = 12_000,
  }: FetchJsonOptions = {},
): Promise<unknown> {
  const endpoint = safeEndpoint(url);
  let finalError: ProviderHttpError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(url, {
        headers: {
          accept: "application/json",
          ...Object.fromEntries(new Headers(headers).entries()),
        },
        redirect: "error",
        signal: controller.signal,
      });

      if (!response.ok) {
        const retryable = isRetryableStatus(response.status);
        const retryAfterMs = retryAfterMilliseconds(response);
        await cancelResponseBody(response);
        throw new ProviderHttpError(
          `Provider request failed with HTTP ${response.status} at ${endpoint}.`,
          {
            retryable,
            retryAfterMs,
            status: response.status,
          },
        );
      }

      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBytes) {
        await cancelResponseBody(response);
        throw new ProviderHttpError(
          `Provider response exceeded ${maxBytes} bytes at ${endpoint}.`,
          { retryable: false, status: response.status },
        );
      }

      const body = await response.arrayBuffer();
      if (body.byteLength > maxBytes) {
        throw new ProviderHttpError(
          `Provider response exceeded ${maxBytes} bytes at ${endpoint}.`,
          { retryable: false, status: response.status },
        );
      }

      try {
        return JSON.parse(new TextDecoder().decode(body)) as unknown;
      } catch (error) {
        throw new ProviderHttpError(
          `Provider returned invalid JSON at ${endpoint}.`,
          { cause: error, retryable: false, status: response.status },
        );
      }
    } catch (error) {
      const providerError =
        error instanceof ProviderHttpError
          ? error
          : new ProviderHttpError(
              `Provider request failed at ${endpoint}.`,
              {
                cause: error,
                retryable:
                  error instanceof TypeError ||
                  (error instanceof Error && error.name === "AbortError"),
              },
            );
      finalError = providerError;

      if (!providerError.retryable || attempt === retries) {
        throw providerError;
      }

      await sleep(
        providerError.retryAfterMs ?? retryBaseMs * 2 ** attempt,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    finalError ??
    new ProviderHttpError(`Provider request failed at ${endpoint}.`, {
      retryable: false,
    })
  );
}
