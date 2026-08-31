-- Phase 2A.2: persistent privacy-preserving authentication rate limits.
CREATE TABLE "auth_rate_limit_buckets" (
  "scope" TEXT NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "windowEnd" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "auth_rate_limit_buckets_pkey" PRIMARY KEY ("scope", "keyHash", "windowStart"),
  CONSTRAINT "auth_rate_limit_buckets_count_nonnegative" CHECK ("count" >= 0),
  CONSTRAINT "auth_rate_limit_buckets_window_valid" CHECK ("windowEnd" > "windowStart"),
  CONSTRAINT "auth_rate_limit_buckets_key_hash_sha256" CHECK ("keyHash" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "auth_rate_limit_buckets_lookup_idx"
  ON "auth_rate_limit_buckets" ("scope", "keyHash", "windowEnd");

-- Expired buckets are removed opportunistically by the PostgreSQL adapter before each
-- atomic upsert. A scheduled retention job may be added only when persistent computing
-- is introduced; authentication correctness never depends on that cleanup.
