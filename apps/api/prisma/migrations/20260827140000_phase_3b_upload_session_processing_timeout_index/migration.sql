-- CreateIndex
CREATE INDEX "media_upload_sessions_status_startedAt_idx" ON "media_upload_sessions"("status", "startedAt");
