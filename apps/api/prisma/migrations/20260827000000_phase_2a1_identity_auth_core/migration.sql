-- Phase 2A.1: production-grade identity persistence and authentication primitives.
-- This migration intentionally adds no HTTP authentication workflow.

CREATE TYPE "UserStatus" AS ENUM ('pending_verification', 'active', 'disabled');
CREATE TYPE "AccountActionTokenPurpose" AS ENUM ('verify_email', 'reset_password');
CREATE TYPE "AuditActorType" AS ENUM ('human', 'system');

ALTER TABLE "users"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "normalizedEmail" TEXT,
  ADD COLUMN "status" "UserStatus",
  ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3);

-- The verified Foundation development account becomes a deterministic non-routable account.
UPDATE "users"
SET
  "email" = 'dev-user@dentpilot.invalid',
  "normalizedEmail" = 'dev-user@dentpilot.invalid',
  "status" = 'active',
  "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt"),
  "updatedAt" = COALESCE("updatedAt", "createdAt")
WHERE "id" = '00000000-0000-4000-8000-000000000001';

-- A legacy Foundation database could contain only the deterministic development user. Give any
-- additional pre-release user deterministic non-routable data without inventing personal data.
UPDATE "users"
SET
  "email" = 'legacy-' || "id"::text || '@dentpilot.invalid',
  "normalizedEmail" = 'legacy-' || "id"::text || '@dentpilot.invalid',
  "status" = 'active',
  "emailVerifiedAt" = COALESCE("emailVerifiedAt", "createdAt"),
  "updatedAt" = COALESCE("updatedAt", "createdAt")
WHERE "email" IS NULL OR "normalizedEmail" IS NULL OR "status" IS NULL OR "updatedAt" IS NULL;

ALTER TABLE "users"
  ALTER COLUMN "email" SET NOT NULL,
  ALTER COLUMN "normalizedEmail" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'pending_verification',
  ALTER COLUMN "updatedAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "users_normalizedEmail_key" ON "users" ("normalizedEmail");
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_nonempty_check" CHECK (length(trim("email")) > 0),
  ADD CONSTRAINT "users_normalizedEmail_nonempty_check" CHECK (length(trim("normalizedEmail")) > 0);

CREATE TABLE "password_credentials" (
  "userId" UUID NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "passwordChangedAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "password_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "password_credentials_passwordHash_nonempty_check" CHECK (length("passwordHash") > 0)
);

CREATE TABLE "auth_sessions" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "revocationReason" TEXT,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "auth_sessions_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "auth_sessions_tokenHash_hex_check" CHECK ("tokenHash" ~ '^[0-9A-Fa-f]{64}$'),
  CONSTRAINT "auth_sessions_expires_after_created_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "auth_sessions_lastSeen_after_created_check" CHECK ("lastSeenAt" >= "createdAt"),
  CONSTRAINT "auth_sessions_revocation_shape_check" CHECK ("revokedAt" IS NOT NULL OR "revocationReason" IS NULL)
);
CREATE INDEX "auth_sessions_userId_expiresAt_idx" ON "auth_sessions" ("userId", "expiresAt");

CREATE TABLE "account_action_tokens" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "purpose" "AccountActionTokenPurpose" NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "consumedAt" TIMESTAMPTZ(3),
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "account_action_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_action_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "account_action_tokens_tokenHash_key" UNIQUE ("tokenHash"),
  CONSTRAINT "account_action_tokens_tokenHash_hex_check" CHECK ("tokenHash" ~ '^[0-9A-Fa-f]{64}$'),
  CONSTRAINT "account_action_tokens_expires_after_created_check" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "account_action_tokens_terminal_state_check" CHECK (NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL))
);
CREATE INDEX "account_action_tokens_userId_purpose_expiresAt_idx" ON "account_action_tokens" ("userId", "purpose", "expiresAt");

CREATE TABLE "security_events" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "eventType" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "requestId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "security_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "security_events_eventType_nonempty_check" CHECK (length(trim("eventType")) > 0),
  CONSTRAINT "security_events_requestId_nonempty_check" CHECK (length(trim("requestId")) > 0)
);
CREATE INDEX "security_events_userId_occurredAt_idx" ON "security_events" ("userId", "occurredAt");

ALTER TABLE "audit_events"
  ADD COLUMN "actorType" "AuditActorType",
  ADD COLUMN "actorUserId" UUID,
  ADD COLUMN "systemActorKey" TEXT;

UPDATE "audit_events"
SET
  "actorType" = 'human',
  "actorUserId" = "actorId"
WHERE "actorType" IS NULL;

ALTER TABLE "audit_events"
  ALTER COLUMN "actorType" SET NOT NULL,
  DROP CONSTRAINT "audit_events_actorId_fkey",
  DROP COLUMN "actorId";

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD CONSTRAINT "audit_events_actor_shape_check" CHECK (
    ("actorType" = 'human' AND "actorUserId" IS NOT NULL AND "systemActorKey" IS NULL)
    OR
    ("actorType" = 'system' AND "actorUserId" IS NULL AND length(trim("systemActorKey")) > 0)
  );
CREATE INDEX "audit_events_ownerUserId_actorUserId_occurredAt_idx" ON "audit_events" ("ownerUserId", "actorUserId", "occurredAt");
