import { getActiveProviderInstrumentIds } from "@/lib/market-data/registry";
import {
  getCoinGeckoProxyPolicy,
  getProxyPath,
} from "@/lib/server/market-proxy-policy";
import {
  forbiddenProxyResponse,
  invalidProxyRequestResponse,
  isAllowedBrowserRequest,
  proxyJson,
} from "@/lib/server/upstream-json";

export const runtime = "edge";

const allowedCoinIds = new Set(
  getActiveProviderInstrumentIds("coingecko"),
);

export async function GET(req: Request) {
  if (!isAllowedBrowserRequest(req)) {
    return forbiddenProxyResponse();
  }

  const path = getProxyPath(req.url, "/api/cg");
  if (!path) {
    return invalidProxyRequestResponse();
  }
  const apiKey = process.env.COINGECKO_API_KEY?.trim();
  const apiBaseUrl = apiKey
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
  const policy = getCoinGeckoProxyPolicy(
    path,
    req.url,
    allowedCoinIds,
    apiBaseUrl,
  );
  if (!policy) {
    return invalidProxyRequestResponse();
  }

  return proxyJson(policy.url, {
    cacheControl: policy.cacheControl,
    headers: apiKey ? { "x-cg-pro-api-key": apiKey } : undefined,
    maxBytes: policy.maxBytes,
  });
}
