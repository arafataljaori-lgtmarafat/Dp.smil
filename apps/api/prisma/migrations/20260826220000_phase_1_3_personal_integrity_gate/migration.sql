-- Phase 1.3: final personal-ownership integrity gate.
-- Historical development TIMESTAMP(3) values are interpreted as UTC before conversion.

ALTER TABLE "users"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "cases"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
ALTER TABLE "media_assets"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "creation_projects"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "generation_jobs"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "startedAt" TYPE TIMESTAMPTZ(3) USING "startedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "finishedAt" TYPE TIMESTAMPTZ(3) USING "finishedAt" AT TIME ZONE 'UTC';
ALTER TABLE "generation_versions"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "audit_events"
  ALTER COLUMN "occurredAt" TYPE TIMESTAMPTZ(3) USING "occurredAt" AT TIME ZONE 'UTC';

-- Retain immutable graph coordinates on a version so the database can verify its job/source/output lineage.
ALTER TABLE "generation_versions"
  ADD COLUMN "caseId" UUID,
  ADD COLUMN "projectId" UUID;

UPDATE "generation_versions" AS version
SET "caseId" = job."caseId",
    "projectId" = job."projectId"
FROM "generation_jobs" AS job
WHERE job."id" = version."generationJobId"
  AND job."ownerUserId" = version."ownerUserId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "generation_versions"
    WHERE "caseId" IS NULL OR "projectId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Phase 1.3 could not backfill complete generation-version graph coordinates';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "creation_projects" AS project
    JOIN "media_assets" AS source
      ON source."id" = project."sourceMediaId"
     AND source."ownerUserId" = project."ownerUserId"
    WHERE source."caseId" <> project."caseId"
  ) THEN
    RAISE EXCEPTION 'Phase 1.3 found a project source outside its case';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "generation_jobs" AS job
    JOIN "creation_projects" AS project
      ON project."id" = job."projectId"
     AND project."ownerUserId" = job."ownerUserId"
    WHERE project."caseId" <> job."caseId"
       OR project."sourceMediaId" <> job."sourceMediaId"
  ) THEN
    RAISE EXCEPTION 'Phase 1.3 found a generation job outside its project graph';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "generation_versions" AS version
    JOIN "generation_jobs" AS job
      ON job."id" = version."generationJobId"
     AND job."ownerUserId" = version."ownerUserId"
    JOIN "media_assets" AS output
      ON output."id" = version."mediaAssetId"
     AND output."ownerUserId" = version."ownerUserId"
    WHERE version."caseId" <> job."caseId"
       OR version."projectId" <> job."projectId"
       OR version."sourceMediaId" <> job."sourceMediaId"
       OR output."caseId" <> job."caseId"
  ) THEN
    RAISE EXCEPTION 'Phase 1.3 found a generation version outside its job graph';
  END IF;
END $$;

ALTER TABLE "generation_versions"
  ALTER COLUMN "caseId" SET NOT NULL,
  ALTER COLUMN "projectId" SET NOT NULL;

-- Candidate keys retain a complete same-owner and same-case graph.
CREATE UNIQUE INDEX "media_assets_ownerUserId_caseId_id_key"
  ON "media_assets"("ownerUserId", "caseId", "id");
CREATE UNIQUE INDEX "media_assets_ownerUserId_caseId_sourceMediaId_id_key"
  ON "media_assets"("ownerUserId", "caseId", "sourceMediaId", "id");
CREATE UNIQUE INDEX "creation_projects_ownerUserId_caseId_id_sourceMediaId_key"
  ON "creation_projects"("ownerUserId", "caseId", "id", "sourceMediaId");
CREATE UNIQUE INDEX "generation_jobs_ownerUserId_id_caseId_projectId_sourceMediaId_key"
  ON "generation_jobs"("ownerUserId", "id", "caseId", "projectId", "sourceMediaId");

-- A project source belongs to the same personal case as the project.
ALTER TABLE "creation_projects"
  ADD CONSTRAINT "creation_projects_ownerUserId_caseId_sourceMediaId_fkey"
  FOREIGN KEY ("ownerUserId", "caseId", "sourceMediaId")
  REFERENCES "media_assets"("ownerUserId", "caseId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A job references exactly one project/source/case graph.
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_ownerUserId_caseId_projectId_sourceMediaId_fkey"
  FOREIGN KEY ("ownerUserId", "caseId", "projectId", "sourceMediaId")
  REFERENCES "creation_projects"("ownerUserId", "caseId", "id", "sourceMediaId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- A version source, output case, project and job are one logical graph.
ALTER TABLE "generation_versions"
  ADD CONSTRAINT "generation_versions_ownerUserId_generationJobId_caseId_projectId_sourceMediaId_fkey"
  FOREIGN KEY ("ownerUserId", "generationJobId", "caseId", "projectId", "sourceMediaId")
  REFERENCES "generation_jobs"("ownerUserId", "id", "caseId", "projectId", "sourceMediaId")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "generation_versions_ownerUserId_caseId_sourceMediaId_mediaAssetId_fkey"
  FOREIGN KEY ("ownerUserId", "caseId", "sourceMediaId", "mediaAssetId")
  REFERENCES "media_assets"("ownerUserId", "caseId", "sourceMediaId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Durable scalar and state-machine invariants.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_byteSize_positive_check" CHECK ("byteSize" > 0),
  ADD CONSTRAINT "media_assets_width_positive_check" CHECK ("width" > 0),
  ADD CONSTRAINT "media_assets_height_positive_check" CHECK ("height" > 0),
  ADD CONSTRAINT "media_assets_sha256_hex_check" CHECK ("sha256" ~ '^[0-9A-Fa-f]{64}$'),
  ADD CONSTRAINT "media_assets_source_lineage_check" CHECK (
    ("kind" = 'source' AND "sourceMediaId" IS NULL)
    OR ("kind" IN ('derived', 'generated') AND "sourceMediaId" IS NOT NULL)
  );
ALTER TABLE "generation_jobs"
  ADD CONSTRAINT "generation_jobs_requestFingerprint_hex_check" CHECK ("requestFingerprint" ~ '^[0-9A-Fa-f]{64}$'),
  ADD CONSTRAINT "generation_jobs_state_timestamps_check" CHECK (
    ("status" = 'queued' AND "startedAt" IS NULL AND "finishedAt" IS NULL AND "errorCode" IS NULL)
    OR ("status" = 'processing' AND "startedAt" IS NOT NULL AND "finishedAt" IS NULL AND "errorCode" IS NULL)
    OR ("status" = 'succeeded' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "errorCode" IS NULL AND "finishedAt" >= "startedAt")
    OR ("status" = 'failed' AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL AND "errorCode" IS NOT NULL AND "finishedAt" >= "startedAt")
    OR ("status" = 'cancelled' AND "startedAt" IS NULL AND "finishedAt" IS NOT NULL AND "errorCode" IS NULL)
  );
ALTER TABLE "generation_versions"
  ADD CONSTRAINT "generation_versions_versionNumber_positive_check" CHECK ("versionNumber" > 0),
  ADD CONSTRAINT "generation_versions_sourceSha256_hex_check" CHECK ("sourceSha256" ~ '^[0-9A-Fa-f]{64}$');
