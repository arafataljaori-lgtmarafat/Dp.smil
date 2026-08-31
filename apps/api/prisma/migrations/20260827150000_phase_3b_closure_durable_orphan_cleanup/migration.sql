ALTER TABLE "media_upload_sessions"
  ADD COLUMN "storageCleanupPending" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "media_upload_sessions_status_storageCleanupPending_idx"
  ON "media_upload_sessions"("status", "storageCleanupPending");

ALTER TABLE "media_upload_sessions"
  ADD CONSTRAINT "media_upload_sessions_cleanup_pending_state_check"
  CHECK (
    NOT "storageCleanupPending"
    OR (
      "status" = 'failed'::"MediaUploadSessionStatus"
      AND "targetStorageKey" IS NOT NULL
      AND "committedMediaId" IS NULL
    )
  );
