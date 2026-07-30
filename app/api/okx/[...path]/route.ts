import {
  getOkxProxyPolicy,
  getProxyPath,
} from "@/lib/server/market-proxy-policy";
import {
  forbiddenProxyResponse,
  invalidProxyRequestResponse,
  isAllowedBrowserRequest,
  proxyJson,
} from "@/lib/server/upstream-json";

export const runtime = "edge";

export async function GET(req: Request) {
  if (!isAllowedBrowserRequest(req)) {
    return forbiddenProxyResponse();
  }

  const path = getProxyPath(req.url, "/api/okx");
  if (!path) {
    return invalidProxyRequestResponse();
  }
  const policy = getOkxProxyPolicy(path, req.url);
  if (!policy) {
    return invalidProxyRequestResponse();
  }

  return proxyJson(policy.url, {
    cacheControl: policy.cacheControl,
    maxBytes: policy.maxBytes,
  });
}
