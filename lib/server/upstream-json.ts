const DEFAULT_TIMEOUT_MS = 10_000;

interface ProxyJsonOptions {
  cacheControl: string;
  headers?: HeadersInit;
  maxBytes: number;
  timeoutMs?: number;
}

class UpstreamBodyTooLargeError extends Error {}

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new UpstreamBodyTooLargeError();
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new UpstreamBodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function isAllowedBrowserRequest(request: Request): boolean {
  // Fetch Metadata and Origin checks are defense-in-depth CSRF signals only.
  // They are forgeable by non-browser clients; the strict upstream allowlists
  // remain the actual authorization boundary for these public proxy routes.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function forbiddenProxyResponse(): Response {
  return errorResponse("Cross-site requests are not allowed", 403);
}

export function invalidProxyRequestResponse(): Response {
  return errorResponse("Unsupported market-data request", 400);
}

export async function proxyJson(
  upstreamUrl: string,
  options: ProxyJsonOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(upstreamUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
      redirect: "error",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      await response.body?.cancel();
      return errorResponse("Market-data provider returned an invalid response", 502);
    }

    const body = await readLimitedBody(response, options.maxBytes);
    const bodyText = new TextDecoder().decode(body);
    try {
      JSON.parse(bodyText);
    } catch {
      return errorResponse("Market-data provider returned invalid JSON", 502);
    }

    return new Response(bodyText, {
      status: response.status,
      headers: {
        "Cache-Control": response.ok ? options.cacheControl : "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof UpstreamBodyTooLargeError) {
      return errorResponse("Market-data provider response exceeded the size limit", 502);
    }
    if (controller.signal.aborted) {
      return errorResponse("Market-data provider timed out", 504);
    }
    return errorResponse("Market-data provider is unavailable", 502);
  } finally {
    clearTimeout(timeout);
  }
}
