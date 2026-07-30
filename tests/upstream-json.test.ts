import { afterEach, describe, expect, test, vi } from "vitest";
import { proxyJson } from "../lib/server/upstream-json";

const options = {
  cacheControl: "public, s-maxage=20",
  maxBytes: 64,
  timeoutMs: 50,
};

function response(
  body: BodyInit | null,
  {
    status = 200,
    contentType = "application/json",
    contentLength,
    headers = {},
  }: {
    status?: number;
    contentType?: string;
    contentLength?: string;
    headers?: Record<string, string>;
  } = {},
): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      ...(contentLength ? { "content-length": contentLength } : {}),
      ...headers,
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded upstream JSON proxy", () => {
  test("returns validated JSON with only safe response headers", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      void init;
      return response('{"ok":true}', {
        headers: {
          "x-cg-pro-api-key": "must-not-leak",
          "set-cookie": "must-not-leak",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyJson("https://provider.example/data", {
      ...options,
      headers: { "x-cg-pro-api-key": "server-secret" },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(result.headers.get("cache-control")).toBe(options.cacheControl);
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(result.headers.has("x-cg-pro-api-key")).toBe(false);
    expect(result.headers.has("set-cookie")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/data",
      expect.objectContaining({
        cache: "no-store",
        redirect: "error",
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-cg-pro-api-key": "server-secret",
        }),
      }),
    );
  });

  test("never caches an upstream error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response('{"error":"rate limited"}', { status: 429 })),
    );

    const result = await proxyJson("https://provider.example/data", options);

    expect(result.status).toBe(429);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects non-JSON content types and invalid JSON", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response("hello", { contentType: "text/plain" }))
      .mockResolvedValueOnce(response("{broken"));
    vi.stubGlobal("fetch", fetchMock);

    const wrongType = await proxyJson(
      "https://provider.example/wrong-type",
      options,
    );
    const invalidJson = await proxyJson(
      "https://provider.example/invalid-json",
      options,
    );

    expect(wrongType.status).toBe(502);
    expect(invalidJson.status).toBe(502);
    expect(wrongType.headers.get("cache-control")).toBe("no-store");
    expect(invalidJson.headers.get("cache-control")).toBe("no-store");
  });

  test("rejects both declared and streamed bodies above the byte limit", async () => {
    const oversizedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"value":"'));
        controller.enqueue(new TextEncoder().encode("x".repeat(80)));
        controller.enqueue(new TextEncoder().encode('"}'));
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response('{"ok":true}', { contentLength: "1000" }),
      )
      .mockResolvedValueOnce(
        response(oversizedStream, { contentType: "application/json" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const declared = await proxyJson(
      "https://provider.example/declared-large",
      options,
    );
    const streamed = await proxyJson(
      "https://provider.example/streamed-large",
      options,
    );

    expect(declared.status).toBe(502);
    expect(streamed.status).toBe(502);
    expect(await declared.json()).toEqual({
      error: "Market-data provider response exceeded the size limit",
    });
  });

  test("aborts a provider that exceeds the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async (_url: string, init?: RequestInit): Promise<Response> =>
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = proxyJson("https://provider.example/slow", options);
    await vi.advanceTimersByTimeAsync(options.timeoutMs);
    const result = await pending;

    expect(result.status).toBe(504);
    expect(await result.json()).toEqual({
      error: "Market-data provider timed out",
    });
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
});
