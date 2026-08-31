-- Product-model correction: personal user ownership replaces the pre-production
-- clinic workspace model. Existing data is retained only when each legacy clinic
-- resolves to exactly one user owner; all ambiguity fails closed.

ALTER TABLE "cases" ADD COLUMN "ownerUserId" UUID;
ALTER TABLE "media_assets" ADD COLUMN "ownerUserId" UUID;
ALTER TABLE "creation_projects" ADD COLUMN "ownerUserId" UUID;
ALTER TABLE "generation_jobs" ADD COLUMN "ownerUserId" UUID;
ALTER TABLE "generation_versions" ADD COLUMN "ownerUserId" UUID;
ALTER TABLE "audit_events" ADD COLUMN "ownerUserId" UUID;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "clinics" AS clinic
    LEFT JOIN "clinic_memberships" AS membership ON membership."clinicId" = clinic."id"
    GROUP BY clinic."id"
    HAVING COUNT(membership."userId") <> 1
  ) THEN
    RAISE EXCEPTION 'Personal ownership migration requires exactly one legacy membership for every clinic';
  END IF;
END $$;

UPDATE "cases" AS record
SET "ownerUserId" = membership."userId"
FROM "clinic_memberships" AS membership
WHERE membership."clinicId" = record."clinicId";

UPDATE "media_assets" AS record
SET "ownerUserId" = membership."userId"
FROM "clinic_memberships" AS membership
WHERE membership."clinicId" = record."clinicId";

UPDATE "creation_projects" AS record
SET "ownerUserId" = membership."userId"
FROM "clinic_memberships" AS membership
WHERE membership."clinicId" = record."clinicId";

UPDATE "generation_jobs" AS record
SET "ownerUserId" = membership."userId"
FROM "clinic_memberships" AS membership
WHERE membership."clinicId" = record."clinicId";

UPDATE "generation_versions" AS record
SET "ownerUserId" = membership."userId"
FROM "clinic_memberships" AS membership
WHERE membership."clinicId" = record."clinicId";

UPDATE "audit_events" AS record
SET "ownerUserId" = membership."userId"
FROM "clinic_memberships" AS membership
WHERE membership."clinicId" = record."clinicId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "cases" WHERE "ownerUserId" IS NULL
    UNION ALL SELECT 1 FROM "media_assets" WHERE "ownerUserId" IS NULL
    UNION ALL SELECT 1 FROM "creation_projects" WHERE "ownerUserId" IS NULL
    UNION ALL SELECT 1 FROM "generation_jobs" WHERE "ownerUserId" IS NULL
    UNION ALL SELECT 1 FROM "generation_versions" WHERE "ownerUserId" IS NULL
    UNION ALL SELECT 1 FROM "audit_events" WHERE "ownerUserId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Personal ownership migration could not determine an owner for all data';
  END IF;
END $$;

-- Retire all clinic-scoped foreign keys before converting their composite forms.
ALTER TABLE "audit_events"
  DROP CONSTRAINT "audit_events_clinicId_caseId_fkey",
  DROP CONSTRAINT "audit_events_clinicId_projectId_fkey",
  DROP CONSTRAINT "audit_events_clinicId_generationJobId_fkey",
  DROP CONSTRAINT "audit_events_clinicId_fkey";
ALTER TABLE "generation_versions"
  DROP CONSTRAINT "generation_versions_clinicId_generationJobId_fkey",
  DROP CONSTRAINT "generation_versions_clinicId_mediaAssetId_fkey",
  DROP CONSTRAINT "generation_versions_clinicId_sourceMediaId_fkey",
  DROP CONSTRAINT "generation_versions_clinicId_fkey";
ALTER TABLE "generation_jobs"
  DROP CONSTRAINT "generation_jobs_clinicId_caseId_fkey",
  DROP CONSTRAINT "generation_jobs_clinicId_projectId_fkey",
  DROP CONSTRAINT "generation_jobs_clinicId_sourceMediaId_fkey",
  DROP CONSTRAINT "generation_jobs_clinicId_fkey";
ALTER TABLE "creation_projects"
  DROP CONSTRAINT "creation_projects_clinicId_caseId_fkey",
  DROP CONSTRAINT "creation_projects_clinicId_sourceMediaId_fkey",
  DROP CONSTRAINT "creation_projects_clinicId_fkey";
ALTER TABLE "media_assets"
  DROP CONSTRAINT "media_assets_clinicId_caseId_fkey",
  DROP CONSTRAINT "media_assets_clinicId_sourceMediaId_fkey",
  DROP CONSTRAINT "media_assets_clinicId_fkey";
ALTER TABLE "cases" DROP CONSTRAINT "cases_clinicId_fkey";

DROP INDEX "cases_clinicId_createdAt_idx";
DROP INDEX "cases_clinicId_id_key";
DROP INDEX "media_assets_clinicId_caseId_createdAt_idx";
DROP INDEX "media_assets_clinicId_sha256_idx";
DROP INDEX "media_assets_clinicId_id_key";
DROP INDEX "creation_projects_clinicId_caseId_createdAt_idx";
DROP INDEX "creation_projects_clinicId_id_key";
DROP INDEX "generation_jobs_clinicId_projectId_idempotencyKey_key";
DROP INDEX "generation_jobs_clinicId_requestFingerprint_idx";
DROP INDEX "generation_jobs_clinicId_caseId_createdAt_idx";
DROP INDEX "generation_jobs_clinicId_status_createdAt_idx";
DROP INDEX "generation_jobs_clinicId_id_key";
DROP INDEX "generation_versions_clinicId_generationJobId_idx";
DROP INDEX "generation_versions_clinicId_id_key";
DROP INDEX "audit_events_clinicId_caseId_occurredAt_idx";
DROP INDEX "audit_events_clinicId_generationJobId_occurredAt_idx";

ALTER TABLE "cases"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ADD CONSTRAINT "cases_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "media_assets"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ADD CONSTRAINT "media_assets_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creation_projects"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ADD CONSTRAINT "creation_projects_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ADD CONSTRAINT "generation_jobs_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_versions"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ADD CONSTRAINT "generation_versions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events"
  ALTER COLUMN "ownerUserId" SET NOT NULL,
  ADD CONSTRAINT "audit_events_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "cases_ownerUserId_id_key" ON "cases"("ownerUserId", "id");
CREATE INDEX "cases_ownerUserId_createdAt_idx" ON "cases"("ownerUserId", "createdAt");
CREATE UNIQUE INDEX "media_assets_ownerUserId_id_key" ON "media_assets"("ownerUserId", "id");
CREATE INDEX "media_assets_ownerUserId_caseId_createdAt_idx" ON "media_assets"("ownerUserId", "caseId", "createdAt");
CREATE INDEX "media_assets_ownerUserId_sha256_idx" ON "media_assets"("ownerUserId", "sha256");
CREATE UNIQUE INDEX "creation_projects_ownerUserId_id_key" ON "creation_projects"("ownerUserId", "id");
CREATE INDEX "creation_projects_ownerUserId_caseId_createdAt_idx" ON "creation_projects"("ownerUserId", "caseId", "createdAt");
CREATE UNIQUE INDEX "generation_jobs_ownerUserId_id_key" ON "generation_jobs"("ownerUserId", "id");
CREATE UNIQUE INDEX "generation_jobs_ownerUserId_projectId_idempotencyKey_key" ON "generation_jobs"("ownerUserId", "projectId", "idempotencyKey");
CREATE INDEX "generation_jobs_ownerUserId_requestFingerprint_idx" ON "generation_jobs"("ownerUserId", "requestFingerprint");
CREATE INDEX "generation_jobs_ownerUserId_caseId_createdAt_idx" ON "generation_jobs"("ownerUserId", "caseId", "createdAt");
CREATE INDEX "generation_jobs_ownerUserId_status_createdAt_idx" ON "generation_jobs"("ownerUserId", "status", "createdAt");
CREATE UNIQUE INDEX "generation_versions_ownerUserId_id_key" ON "generation_versions"("ownerUserId", "id");
CREATE INDEX "generation_versions_ownerUserId_generationJobId_idx" ON "generation_versions"("ownerUserId", "generationJobId");
CREATE INDEX "audit_events_ownerUserId_caseId_occurredAt_idx" ON "audit_events"("ownerUserId", "caseId", "occurredAt");
CREATE INDEX "audit_events_ownerUserId_generationJobId_occurredAt_idx" ON "audit_events"("ownerUserId", "generationJobId", "occurredAt");

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_ownerUserId_caseId_fkey"
    FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "media_assets_ownerUserId_sourceMediaId_fkey"
    FOREIGN KEY ("ownerUserId", "sourceMediaId") REFERENCES "media_assets"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creation_projects"
  ADD CONSTRAINT "creation_projects_ownerUserId_caseId_fkey"
    FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "creation_projects_ownerUserId_sourceMediaId_fkey"
    FOREIGN KEY ("ownerUserId", "sourceMediaId") REFERENCES "media_assets"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_ownerUserId_caseId_fkey"
    FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_jobs_ownerUserId_projectId_fkey"
    FOREIGN KEY ("ownerUserId", "projectId") REFERENCES "creation_projects"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_jobs_ownerUserId_sourceMediaId_fkey"
    FOREIGN KEY ("ownerUserId", "sourceMediaId") REFERENCES "media_assets"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_versions"
  ADD CONSTRAINT "generation_versions_ownerUserId_generationJobId_fkey"
    FOREIGN KEY ("ownerUserId", "generationJobId") REFERENCES "generation_jobs"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_versions_ownerUserId_mediaAssetId_fkey"
    FOREIGN KEY ("ownerUserId", "mediaAssetId") REFERENCES "media_assets"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_versions_ownerUserId_sourceMediaId_fkey"
    FOREIGN KEY ("ownerUserId", "sourceMediaId") REFERENCES "media_assets"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_ownerUserId_caseId_fkey"
    FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_ownerUserId_projectId_fkey"
    FOREIGN KEY ("ownerUserId", "projectId") REFERENCES "creation_projects"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_ownerUserId_generationJobId_fkey"
    FOREIGN KEY ("ownerUserId", "generationJobId") REFERENCES "generation_jobs"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cases" DROP COLUMN "clinicId";
ALTER TABLE "media_assets" DROP COLUMN "clinicId";
ALTER TABLE "creation_projects" DROP COLUMN "clinicId";
ALTER TABLE "generation_jobs" DROP COLUMN "clinicId";
ALTER TABLE "generation_versions" DROP COLUMN "clinicId";
ALTER TABLE "audit_events" DROP COLUMN "clinicId";

DROP TABLE "clinic_memberships";
DROP TABLE "clinics";
DROP TYPE "ClinicRole";
