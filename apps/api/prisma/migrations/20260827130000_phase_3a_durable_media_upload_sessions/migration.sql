-- CreateEnum
CREATE TYPE "MediaUploadSessionStatus" AS ENUM ('created', 'processing', 'committed', 'failed', 'expired');

-- CreateTable
CREATE TABLE "media_upload_sessions" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "MediaUploadSessionStatus" NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "processingToken" TEXT,
    "targetMediaId" UUID,
    "targetStorageKey" TEXT,
    "committedMediaId" UUID,
    "errorCode" TEXT,

    CONSTRAINT "media_upload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_upload_sessions_ownerUserId_caseId_createdAt_idx" ON "media_upload_sessions"("ownerUserId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "media_upload_sessions_status_expiresAt_idx" ON "media_upload_sessions"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "media_upload_sessions_ownerUserId_caseId_committedMediaId_idx" ON "media_upload_sessions"("ownerUserId", "caseId", "committedMediaId");

-- CreateIndex
CREATE UNIQUE INDEX "media_upload_sessions_ownerUserId_caseId_idempotencyKey_key" ON "media_upload_sessions"("ownerUserId", "caseId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "media_upload_sessions_ownerUserId_id_key" ON "media_upload_sessions"("ownerUserId", "id");

-- AddForeignKey
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_ownerUserId_caseId_fkey" FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_upload_sessions" ADD CONSTRAINT "media_upload_sessions_ownerUserId_caseId_committedMediaId_fkey" FOREIGN KEY ("ownerUserId", "caseId", "committedMediaId") REFERENCES "media_assets"("ownerUserId", "caseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The state shape is enforced in PostgreSQL so a service bug cannot create a
-- logically impossible ingest ledger entry. Finalization methods additionally
-- compare the processing fencing token in their UPDATE predicates.
ALTER TABLE "media_upload_sessions"
  ADD CONSTRAINT "media_upload_sessions_idempotency_key_nonempty_check"
  CHECK (length(btrim("idempotencyKey")) > 0),
  ADD CONSTRAINT "media_upload_sessions_expiry_after_creation_check"
  CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT "media_upload_sessions_state_shape_check"
  CHECK (
    (
      "status" = 'created'
      AND "startedAt" IS NULL
      AND "finishedAt" IS NULL
      AND "processingToken" IS NULL
      AND "targetMediaId" IS NULL
      AND "targetStorageKey" IS NULL
      AND "committedMediaId" IS NULL
      AND "errorCode" IS NULL
    )
    OR (
      "status" = 'processing'
      AND "startedAt" IS NOT NULL
      AND "finishedAt" IS NULL
      AND "processingToken" IS NOT NULL
      AND "targetMediaId" IS NOT NULL
      AND "targetStorageKey" IS NOT NULL
      AND length(btrim("targetStorageKey")) > 0
      AND "committedMediaId" IS NULL
      AND "errorCode" IS NULL
    )
    OR (
      "status" = 'committed'
      AND "startedAt" IS NOT NULL
      AND "finishedAt" IS NOT NULL
      AND "committedMediaId" IS NOT NULL
      AND "errorCode" IS NULL
    )
    OR (
      "status" = 'failed'
      AND "finishedAt" IS NOT NULL
      AND "committedMediaId" IS NULL
      AND "errorCode" IS NOT NULL
      AND length(btrim("errorCode")) > 0
    )
    OR (
      "status" = 'expired'
      AND "finishedAt" IS NOT NULL
      AND "committedMediaId" IS NULL
    )
  );
