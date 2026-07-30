-- OKX SPOT volCcy24h is quote-currency volume. P3 initially stored it in
-- volume_base_24h; move only rows with the exact legacy shape so this repair
-- remains safe and idempotent.
UPDATE "market_quotes_latest"
SET
  "volume_quote_24h" = "volume_base_24h",
  "volume_base_24h" = NULL
WHERE
  "provider" = 'okx'
  AND "volume_base_24h" IS NOT NULL
  AND "volume_quote_24h" IS NULL;
