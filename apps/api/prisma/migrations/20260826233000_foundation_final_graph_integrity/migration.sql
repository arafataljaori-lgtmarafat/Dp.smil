-- Final Foundation correction: enforce same-case media lineage and audit graph consistency.
-- Existing records are validated before every stronger relationship is installed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "media_assets" AS child
    JOIN "media_assets" AS source
      ON source."id" = child."sourceMediaId"
     AND source."ownerUserId" = child."ownerUserId"
    WHERE child."sourceMediaId" IS NOT NULL
      AND source."caseId" <> child."caseId"
  ) THEN
    RAISE EXCEPTION 'Foundation graph migration found media lineage that crosses cases within one user';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "audit_events" AS audit
    LEFT JOIN "creation_projects" AS project
      ON project."id" = audit."projectId"
     AND project."ownerUserId" = audit."ownerUserId"
    LEFT JOIN "generation_jobs" AS job
      ON job."id" = audit."generationJobId"
     AND job."ownerUserId" = audit."ownerUserId"
    WHERE (audit."projectId" IS NOT NULL AND (audit."caseId" IS NULL OR project."id" IS NULL OR project."caseId" <> audit."caseId"))
       OR (audit."generationJobId" IS NOT NULL AND (
            audit."caseId" IS NULL
            OR audit."projectId" IS NULL
            OR job."id" IS NULL
            OR job."caseId" <> audit."caseId"
            OR job."projectId" <> audit."projectId"
          ))
  ) THEN
    RAISE EXCEPTION 'Foundation graph migration found audit identifiers outside one logical case/project/job chain';
  END IF;
END $$;

-- A derived/generated asset must resolve its source inside the same user and same case.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_ownerUserId_caseId_sourceMediaId_fkey"
  FOREIGN KEY ("ownerUserId", "caseId", "sourceMediaId")
  REFERENCES "media_assets"("ownerUserId", "caseId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Candidate keys support case-safe references from audit events.
CREATE UNIQUE INDEX "creation_projects_ownerUserId_caseId_id_key"
  ON "creation_projects"("ownerUserId", "caseId", "id");
CREATE UNIQUE INDEX "generation_jobs_ownerUserId_caseId_projectId_id_key"
  ON "generation_jobs"("ownerUserId", "caseId", "projectId", "id");

-- Audit graph policy: a case-only event remains valid; project requires its case;
-- job requires both its case and project, and the job must be in that exact graph.
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_project_job_graph_presence_check" CHECK (
    ("projectId" IS NULL AND "generationJobId" IS NULL)
    OR ("projectId" IS NOT NULL AND "caseId" IS NOT NULL AND "generationJobId" IS NULL)
    OR ("projectId" IS NOT NULL AND "caseId" IS NOT NULL AND "generationJobId" IS NOT NULL)
  ),
  ADD CONSTRAINT "audit_events_ownerUserId_caseId_projectId_fkey"
  FOREIGN KEY ("ownerUserId", "caseId", "projectId")
  REFERENCES "creation_projects"("ownerUserId", "caseId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "audit_events_ownerUserId_caseId_projectId_generationJobId_fkey"
  FOREIGN KEY ("ownerUserId", "caseId", "projectId", "generationJobId")
  REFERENCES "generation_jobs"("ownerUserId", "caseId", "projectId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
