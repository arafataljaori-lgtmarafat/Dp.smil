-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClinicRole" AS ENUM ('owner', 'clinician', 'staff');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('source', 'derived', 'generated');

-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('source_photo', 'mock_simulation_result');

-- CreateEnum
CREATE TYPE "CreationProjectType" AS ENUM ('smile_simulation', 'before_after_image', 'before_after_video');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('queued', 'processing', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_memberships" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "ClinicRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "referenceCode" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "purpose" "MediaPurpose" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sourceMediaId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creation_projects" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "type" "CreationProjectType" NOT NULL,
    "sourceMediaId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "creation_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "sourceMediaId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorCode" TEXT,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_versions" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "generationJobId" UUID NOT NULL,
    "mediaAssetId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "caseId" UUID,
    "projectId" UUID,
    "generationJobId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_memberships_userId_idx" ON "clinic_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_memberships_clinicId_userId_key" ON "clinic_memberships"("clinicId", "userId");

-- CreateIndex
CREATE INDEX "cases_clinicId_createdAt_idx" ON "cases"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cases_clinicId_id_key" ON "cases"("clinicId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");

-- CreateIndex
CREATE INDEX "media_assets_clinicId_caseId_createdAt_idx" ON "media_assets"("clinicId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "media_assets_clinicId_sha256_idx" ON "media_assets"("clinicId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_clinicId_id_key" ON "media_assets"("clinicId", "id");

-- CreateIndex
CREATE INDEX "creation_projects_clinicId_caseId_createdAt_idx" ON "creation_projects"("clinicId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "creation_projects_clinicId_id_key" ON "creation_projects"("clinicId", "id");

-- CreateIndex
CREATE INDEX "generation_jobs_clinicId_caseId_createdAt_idx" ON "generation_jobs"("clinicId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "generation_jobs_clinicId_status_createdAt_idx" ON "generation_jobs"("clinicId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "generation_jobs_clinicId_idempotencyKey_key" ON "generation_jobs"("clinicId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "generation_jobs_clinicId_id_key" ON "generation_jobs"("clinicId", "id");

-- CreateIndex
CREATE INDEX "generation_versions_clinicId_generationJobId_idx" ON "generation_versions"("clinicId", "generationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "generation_versions_generationJobId_versionNumber_key" ON "generation_versions"("generationJobId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "generation_versions_clinicId_id_key" ON "generation_versions"("clinicId", "id");

-- CreateIndex
CREATE INDEX "audit_events_clinicId_caseId_occurredAt_idx" ON "audit_events"("clinicId", "caseId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_clinicId_generationJobId_occurredAt_idx" ON "audit_events"("clinicId", "generationJobId", "occurredAt");

-- AddForeignKey
ALTER TABLE "clinic_memberships" ADD CONSTRAINT "clinic_memberships_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_memberships" ADD CONSTRAINT "clinic_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_projects" ADD CONSTRAINT "creation_projects_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_projects" ADD CONSTRAINT "creation_projects_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_projects" ADD CONSTRAINT "creation_projects_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creation_projects" ADD CONSTRAINT "creation_projects_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "creation_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_versions" ADD CONSTRAINT "generation_versions_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_versions" ADD CONSTRAINT "generation_versions_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_versions" ADD CONSTRAINT "generation_versions_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "generation_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

