import { timingSafeEqual } from "node:crypto";
import {
  runMarketDataRecovery,
  type MarketDataRecoveryDependencies,
} from "@/lib/ingestion/recovery";

interface MarketDataCronDependencies
  extends MarketDataRecoveryDependencies {
  getCronSecret: () => string | undefined;
  onError?: (error: unknown) => void;
}

function noStoreJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function isAuthorizedCronRequest(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
}

export function createMarketDataCronHandler(
  dependencies: MarketDataCronDependencies,
): (request: Request) => Promise<Response> {
  return async function marketDataCronHandler(request: Request) {
    if (
      !isAuthorizedCronRequest(
        request,
        dependencies.getCronSecret(),
      )
    ) {
      return noStoreJson(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "A valid cron authorization token is required.",
          },
        },
        401,
      );
    }

    try {
      const result = await runMarketDataRecovery(dependencies);
      return noStoreJson(
        {
          ok: result.healthy,
          action: result.action,
          statusBefore: result.healthBefore.status,
          statusAfter: result.healthAfter.status,
          generatedAt: result.healthAfter.generatedAt,
          health: {
            latestCandleAt: result.healthAfter.latestCandleAt,
            latestQuoteAt: result.healthAfter.latestQuoteAt,
            missingBucketCount:
              result.healthAfter.missingBucketCount,
            freshQuotes: result.healthAfter.quotes.fresh,
            expectedQuotes: result.healthAfter.quotes.expected,
          },
          ingestion: result.runs.map((run) => ({
            task: run.task,
            provider: run.provider,
            status: run.status,
            requestedCount: run.requestedCount,
            acceptedCount: run.acceptedCount,
            rejectedCount: run.rejectedCount,
            errorCount: run.errors.length,
          })),
        },
        result.healthy ? 200 : 503,
      );
    } catch (error) {
      dependencies.onError?.(error);
      return noStoreJson(
        {
          error: {
            code: "MARKET_DATA_RECOVERY_FAILED",
            message: "Market data recovery did not complete.",
          },
        },
        503,
      );
    }
  };
}
