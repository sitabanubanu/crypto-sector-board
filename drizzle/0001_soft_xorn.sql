ALTER TYPE "public"."ingestion_status" ADD VALUE 'skipped_duplicate';--> statement-breakpoint
CREATE INDEX "ingestion_runs_provider_finished_idx" ON "ingestion_runs" USING btree ("provider","finished_at");--> statement-breakpoint
CREATE INDEX "market_candles_cursor_idx" ON "market_candles" USING btree ("provider","timeframe","asset_id","open_time");