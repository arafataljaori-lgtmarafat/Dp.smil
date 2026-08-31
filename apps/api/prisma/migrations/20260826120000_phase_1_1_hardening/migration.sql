-- Phase 1.1: tenant-safe referential integrity, request-safe idempotency,
-- correlation propagation, and immutable generation provenance.

-- Add fields as nullable/defaulted first so existing Phase 1 databases migrate safely.
ALTER TABLE "generation_jobs"
  ADD COLUMN "requestFingerprint" CHAR(64),
  ADD COLUMN "generationContractVersion" TEXT,
  ADD COLUMN "correlationId" TEXT;

UPDATE "generation_jobs"
SET
  "requestFingerprint" = md5('legacy:' || "id"::text) || md5('legacy:' || "id"::text),
  "generationContractVersion" = 'legacy-phase1-unknown',
  "correlationId" = 'legacy:' || "id"::text
WHERE "requestFingerprint" IS NULL;

ALTER TABLE "generation_jobs"
  ALTER COLUMN "requestFingerprint" SET NOT NULL,
  ALTER COLUMN "generationContractVersion" SET NOT NULL,
  ALTER COLUMN "correlationId" SET NOT NULL;

ALTER TABLE "generation_versions"
  ADD COLUMN "sourceMediaId" UUID,
  ADD COLUMN "sourceSha256" CHAR(64),
  ADD COLUMN "generationContractVersion" TEXT,
  ADD COLUMN "parameters" JSONB;

UPDATE "generation_versions" AS version
SET
  "sourceMediaId" = job."sourceMediaId",
  "sourceSha256" = source."sha256",
  "generationContractVersion" = job."generationContractVersion",
  "parameters" = '{}'::jsonb
FROM "generation_jobs" AS job
JOIN "media_assets" AS source ON source."id" = job."sourceMediaId"
WHERE version."generationJobId" = job."id"
  AND version."sourceMediaId" IS NULL;

ALTER TABLE "generation_versions"
  ALTER COLUMN "sourceMediaId" SET NOT NULL,
  ALTER COLUMN "sourceSha256" SET NOT NULL,
  ALTER COLUMN "generationContractVersion" SET NOT NULL,
  ALTER COLUMN "parameters" SET NOT NULL;

ALTER TABLE "audit_events" ADD COLUMN "correlationId" TEXT;
UPDATE "audit_events" AS audit
SET "correlationId" = COALESCE(job."correlationId", 'legacy:' || audit."id"::text)
FROM "generation_jobs" AS job
WHERE audit."generationJobId" = job."id"
  AND audit."correlationId" IS NULL;
UPDATE "audit_events"
SET "correlationId" = 'legacy:' || "id"::text
WHERE "correlationId" IS NULL;
ALTER TABLE "audit_events" ALTER COLUMN "correlationId" SET NOT NULL;

-- Fail closed when a legacy database already contains a cross-tenant graph.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "media_assets" child JOIN "cases" parent ON parent."id" = child."caseId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "creation_projects" child JOIN "cases" parent ON parent."id" = child."caseId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "creation_projects" child JOIN "media_assets" parent ON parent."id" = child."sourceMediaId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "generation_jobs" child JOIN "cases" parent ON parent."id" = child."caseId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "generation_jobs" child JOIN "creation_projects" parent ON parent."id" = child."projectId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "generation_jobs" child JOIN "media_assets" parent ON parent."id" = child."sourceMediaId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "generation_versions" child JOIN "generation_jobs" parent ON parent."id" = child."generationJobId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "generation_versions" child JOIN "media_assets" parent ON parent."id" = child."mediaAssetId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "audit_events" child JOIN "cases" parent ON parent."id" = child."caseId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "audit_events" child JOIN "creation_projects" parent ON parent."id" = child."projectId"
    WHERE child."clinicId" <> parent."clinicId"
  ) OR EXISTS (
    SELECT 1 FROM "audit_events" child JOIN "generation_jobs" parent ON parent."id" = child."generationJobId"
    WHERE child."clinicId" <> parent."clinicId"
  ) THEN
    RAISE EXCEPTION 'Phase 1.1 cannot migrate cross-clinic relational data safely';
  END IF;
END $$;

-- Generation idempotency is scoped to an immutable logical operation, not the whole clinic.
DROP INDEX "generation_jobs_clinicId_idempotencyKey_key";
CREATE UNIQUE INDEX "generation_jobs_clinicId_projectId_idempotencyKey_key"
  ON "generation_jobs"("clinicId", "projectId", "idempotencyKey");
CREATE INDEX "generation_jobs_clinicId_requestFingerprint_idx"
  ON "generation_jobs"("clinicId", "requestFingerprint");

-- Replace single-column relationship checks with composite tenant-safe checks.
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_caseId_fkey";
ALTER TABLE "creation_projects" DROP CONSTRAINT "creation_projects_caseId_fkey";
ALTER TABLE "creation_projects" DROP CONSTRAINT "creation_projects_sourceMediaId_fkey";
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_caseId_fkey";
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_projectId_fkey";
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_sourceMediaId_fkey";
ALTER TABLE "generation_versions" DROP CONSTRAINT "generation_versions_generationJobId_fkey";
ALTER TABLE "generation_versions" DROP CONSTRAINT "generation_versions_mediaAssetId_fkey";
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_caseId_fkey";
ALTER TABLE "audit_events" DROP CONSTRAINT "audit_events_generationJobId_fkey";

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_clinicId_caseId_fkey"
  FOREIGN KEY ("clinicId", "caseId") REFERENCES "cases"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creation_projects"
  ADD CONSTRAINT "creation_projects_clinicId_caseId_fkey"
  FOREIGN KEY ("clinicId", "caseId") REFERENCES "cases"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "creation_projects_clinicId_sourceMediaId_fkey"
  FOREIGN KEY ("clinicId", "sourceMediaId") REFERENCES "media_assets"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_clinicId_caseId_fkey"
  FOREIGN KEY ("clinicId", "caseId") REFERENCES "cases"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_jobs_clinicId_projectId_fkey"
  FOREIGN KEY ("clinicId", "projectId") REFERENCES "creation_projects"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_jobs_clinicId_sourceMediaId_fkey"
  FOREIGN KEY ("clinicId", "sourceMediaId") REFERENCES "media_assets"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_versions"
  ADD CONSTRAINT "generation_versions_clinicId_generationJobId_fkey"
  FOREIGN KEY ("clinicId", "generationJobId") REFERENCES "generation_jobs"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_versions_clinicId_mediaAssetId_fkey"
  FOREIGN KEY ("clinicId", "mediaAssetId") REFERENCES "media_assets"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_versions_clinicId_sourceMediaId_fkey"
  FOREIGN KEY ("clinicId", "sourceMediaId") REFERENCES "media_assets"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_clinicId_caseId_fkey"
  FOREIGN KEY ("clinicId", "caseId") REFERENCES "cases"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_clinicId_projectId_fkey"
  FOREIGN KEY ("clinicId", "projectId") REFERENCES "creation_projects"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_clinicId_generationJobId_fkey"
  FOREIGN KEY ("clinicId", "generationJobId") REFERENCES "generation_jobs"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
