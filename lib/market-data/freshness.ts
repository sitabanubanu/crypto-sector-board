import type { DataQuality } from "./contracts";

export const LIVE_DATA_STALE_AFTER_SECONDS = 90;
export const SNAPSHOT_FALLBACK_STALE_AFTER_SECONDS = 2 * 60 * 60;

export function isTimestampStale(
  asOf: string,
  staleAfterSeconds: number,
  nowMs = Date.now(),
): boolean {
  const asOfMs = Date.parse(asOf);
  if (!Number.isFinite(asOfMs) || staleAfterSeconds <= 0) return true;

  const ageMs = nowMs - asOfMs;
  return ageMs < -60_000 || ageMs > staleAfterSeconds * 1_000;
}

export function isDataQualityStale(
  quality: DataQuality,
  nowMs = Date.now(),
): boolean {
  return (
    quality.isStale ||
    isTimestampStale(quality.asOf, quality.staleAfterSeconds, nowMs)
  );
}
