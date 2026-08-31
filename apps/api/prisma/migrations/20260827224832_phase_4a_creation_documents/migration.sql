-- CreateTable
CREATE TABLE "creation_asset_bindings" (
    "projectId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "bindingKey" TEXT NOT NULL,
    "mediaId" UUID NOT NULL,

    CONSTRAINT "creation_asset_bindings_pkey" PRIMARY KEY ("projectId","bindingKey")
);

-- CreateTable
CREATE TABLE "creation_drafts" (
    "projectId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creation_drafts_pkey" PRIMARY KEY ("projectId")
);

-- CreateTable
CREATE TABLE "creation_revisions" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "documentSchemaVersion" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "documentSha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creation_revision_assets" (
    "revisionId" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "bindingKey" TEXT NOT NULL,
    "mediaId" UUID NOT NULL,

    CONSTRAINT "creation_revision_assets_pkey" PRIMARY KEY ("revisionId","bindingKey")
);

-- CreateIndex
CREATE INDEX "creation_asset_bindings_ownerUserId_caseId_mediaId_idx" ON "creation_asset_bindings"("ownerUserId", "caseId", "mediaId");

-- CreateIndex
CREATE INDEX "creation_drafts_ownerUserId_caseId_updatedAt_idx" ON "creation_drafts"("ownerUserId", "caseId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "creation_drafts_ownerUserId_caseId_projectId_key" ON "creation_drafts"("ownerUserId", "caseId", "projectId");

-- CreateIndex
CREATE INDEX "creation_revisions_ownerUserId_caseId_projectId_createdAt_idx" ON "creation_revisions"("ownerUserId", "caseId", "projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "creation_revisions_projectId_revisionNumber_key" ON "creation_revisions"("projectId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "creation_revisions_ownerUserId_caseId_projectId_id_key" ON "creation_revisions"("ownerUserId", "caseId", "projectId", "id");

-- CreateIndex
CREATE INDEX "creation_revision_assets_ownerUserId_caseId_mediaId_idx" ON "creation_revision_assets"("ownerUserId", "caseId", "mediaId");

-- AddForeignKey
ALTER TABLE "creation_asset_bindings" ADD CONSTRAINT "creation_asset_bindings_ownerUserId_caseId_projectId_fkey" FOREIGN KEY ("ownerUserId", "caseId", "projectId") REFERENCES "creation_projects"("ownerUserId", "caseId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_asset_bindings" ADD CONSTRAINT "creation_asset_bindings_ownerUserId_caseId_mediaId_fkey" FOREIGN KEY ("ownerUserId", "caseId", "mediaId") REFERENCES "media_assets"("ownerUserId", "caseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_drafts" ADD CONSTRAINT "creation_drafts_ownerUserId_caseId_projectId_fkey" FOREIGN KEY ("ownerUserId", "caseId", "projectId") REFERENCES "creation_projects"("ownerUserId", "caseId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_drafts" ADD CONSTRAINT "creation_drafts_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_drafts" ADD CONSTRAINT "creation_drafts_ownerUserId_caseId_fkey" FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_revisions" ADD CONSTRAINT "creation_revisions_ownerUserId_caseId_projectId_fkey" FOREIGN KEY ("ownerUserId", "caseId", "projectId") REFERENCES "creation_projects"("ownerUserId", "caseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_revisions" ADD CONSTRAINT "creation_revisions_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_revisions" ADD CONSTRAINT "creation_revisions_ownerUserId_caseId_fkey" FOREIGN KEY ("ownerUserId", "caseId") REFERENCES "cases"("ownerUserId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_revision_assets" ADD CONSTRAINT "creation_revision_assets_ownerUserId_caseId_projectId_revi_fkey" FOREIGN KEY ("ownerUserId", "caseId", "projectId", "revisionId") REFERENCES "creation_revisions"("ownerUserId", "caseId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_revision_assets" ADD CONSTRAINT "creation_revision_assets_ownerUserId_caseId_mediaId_fkey" FOREIGN KEY ("ownerUserId", "caseId", "mediaId") REFERENCES "media_assets"("ownerUserId", "caseId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Phase 4A durable domain constraints.
ALTER TABLE "creation_asset_bindings"
  ADD CONSTRAINT "creation_asset_bindings_key_check" CHECK ("bindingKey" IN ('before', 'after'));

ALTER TABLE "creation_drafts"
  ADD CONSTRAINT "creation_drafts_schema_version_check" CHECK ("schemaVersion" = 1),
  ADD CONSTRAINT "creation_drafts_revision_positive_check" CHECK ("revision" > 0);

ALTER TABLE "creation_revisions"
  ADD CONSTRAINT "creation_revisions_number_positive_check" CHECK ("revisionNumber" > 0),
  ADD CONSTRAINT "creation_revisions_schema_version_check" CHECK ("documentSchemaVersion" = 1),
  ADD CONSTRAINT "creation_revisions_sha256_check" CHECK ("documentSha256" ~ '^[a-f0-9]{64}$');

ALTER TABLE "creation_revision_assets"
  ADD CONSTRAINT "creation_revision_assets_key_check" CHECK ("bindingKey" IN ('before', 'after'));

CREATE FUNCTION "prevent_creation_revision_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Creation revisions and revision assets are immutable.' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "creation_revisions_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "creation_revisions"
  FOR EACH ROW EXECUTE FUNCTION "prevent_creation_revision_mutation"();

CREATE TRIGGER "creation_revision_assets_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "creation_revision_assets"
  FOR EACH ROW EXECUTE FUNCTION "prevent_creation_revision_mutation"();
