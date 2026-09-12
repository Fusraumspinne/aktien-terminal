CREATE TABLE "chart_data" (
  "symbol" VARCHAR(32) NOT NULL,
  "provider" VARCHAR(32) NOT NULL DEFAULT 'twelve-data',
  "payload" JSONB NOT NULL,
  "fetched_at" TIMESTAMPTZ(3) NOT NULL,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "chart_data_pkey" PRIMARY KEY ("symbol")
);

CREATE INDEX "chart_data_fetched_at_idx" ON "chart_data"("fetched_at");
