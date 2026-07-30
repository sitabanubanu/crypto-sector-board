import { afterEach, describe, expect, test, vi } from "vitest";
import gateCandles from "./fixtures/gate/candles.json";
import okxCandles from "./fixtures/okx/candles.json";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("per-instrument kline cache", () => {
  test("Gate fetches only newly requested instruments within the TTL", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      void input;
      return jsonResponse(gateCandles);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchGateKlines } = await import("../lib/gate");

    const first = await fetchGateKlines(["BTC_USDT"]);
    const second = await fetchGateKlines(["BTC_USDT", "ETH_USDT"]);

    expect([...first.keys()]).toEqual(["BTC_USDT"]);
    expect([...second.keys()]).toEqual(["BTC_USDT", "ETH_USDT"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("BTC_USDT");
    expect(String(fetchMock.mock.calls[1][0])).toContain("ETH_USDT");
  });

  test("OKX fetches only newly requested instruments within the TTL", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      void input;
      return jsonResponse(okxCandles);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchOkxKlines } = await import("../lib/okx");

    const first = await fetchOkxKlines(["BTC-USDT"]);
    const second = await fetchOkxKlines(["BTC-USDT", "ETH-USDT"]);

    expect([...first.keys()]).toEqual(["BTC-USDT"]);
    expect([...second.keys()]).toEqual(["BTC-USDT", "ETH-USDT"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("BTC-USDT");
    expect(String(fetchMock.mock.calls[1][0])).toContain("ETH-USDT");
  });

  test("a failed Gate instrument is not cached and is retried immediately", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T01:00:00.000Z"));
    let attempts = 0;
    const fetchMock = vi.fn(async () => {
      attempts += 1;
      return attempts <= 3
        ? jsonResponse({ error: "temporary" }, 503)
        : jsonResponse(gateCandles);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchGateKlines } = await import("../lib/gate");

    const firstRequest = fetchGateKlines(["ETH_USDT"]);
    await vi.runAllTimersAsync();
    const first = await firstRequest;
    const second = await fetchGateKlines(["ETH_USDT"]);

    expect(first.has("ETH_USDT")).toBe(false);
    expect(second.has("ETH_USDT")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  test("concurrent requests share the same in-flight instrument request", async () => {
    let release: (() => void) | undefined;
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await waitForRelease;
      return jsonResponse(gateCandles);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchGateKlines } = await import("../lib/gate");

    const firstRequest = fetchGateKlines(["BTC_USDT"]);
    const secondRequest = fetchGateKlines(["BTC_USDT"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    release?.();
    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    expect(first.has("BTC_USDT")).toBe(true);
    expect(second.has("BTC_USDT")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
