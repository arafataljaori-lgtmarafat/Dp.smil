-- Phase 1.2: synchronize Prisma's tenant-safe relation model with PostgreSQL
-- and prohibit cross-clinic MediaAsset lineage.

-- Refuse to silently bless an already-corrupt lineage graph.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "media_assets" AS child
    JOIN "media_assets" AS parent ON parent."id" = child."sourceMediaId"
    WHERE child."sourceMediaId" IS NOT NULL
      AND child."clinicId" <> parent."clinicId"
  ) THEN
    RAISE EXCEPTION 'Phase 1.2 cannot migrate cross-clinic media lineage safely';
  END IF;
END $$;

-- The Phase 1 foreign key protects existence only. Replace it with the same
-- tenant-safe composite form already used by projects, jobs, versions, and audit.
ALTER TABLE "media_assets"
  DROP CONSTRAINT "media_assets_sourceMediaId_fkey";

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_clinicId_sourceMediaId_fkey"
  FOREIGN KEY ("clinicId", "sourceMediaId")
  REFERENCES "media_assets"("clinicId", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
