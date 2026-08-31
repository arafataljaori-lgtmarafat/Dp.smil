-- Phase 5 Stage 2: minimal, backwards-compatible migration for database-enforced
-- before_after_video creation idempotency (mission section 7).
--
-- Why this migration is necessary: Stage 1's creation graph (CreationProject,
-- CreationAssetBinding, CreationDraft, CreationRevision, CreationRevisionAsset) has no
-- column anywhere that a client-supplied Idempotency-Key could attach to, and a video
-- creation produces a whole multi-row graph rather than a single row the way
-- GenerationJob/MediaUploadSession do. Reusing GenerationJob was explicitly out of
-- scope. The smallest fix that keeps the existing INSERT ... ON CONFLICT DO NOTHING
-- pattern (see generation_jobs, media_upload_sessions) working is to let the graph's own
-- root row — CreationProject — carry the idempotency claim: the same statement that
-- creates the project atomically claims the idempotency slot, and every other row in the
-- graph (draft, bindings, audit event) is only ever inserted after that project row
-- exists and won the claim.
--
-- Both new columns are nullable and every existing row keeps them NULL. Postgres treats
-- every NULL in a unique index as distinct from every other NULL, so this is fully
-- additive: existing before_after_image / smile_simulation projects (which never supply
-- an idempotency key) can never collide with each other or with anything else under the
-- new unique constraint, and no existing query, index, or constraint is altered.
ALTER TABLE "creation_projects"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestFingerprint" CHAR(64);

-- The actual database-enforced idempotency mechanism: concurrent identical requests race
-- on this constraint, so exactly one INSERT can ever win the (ownerUserId, caseId,
-- idempotencyKey) slot and only the winner proceeds to create the draft/bindings/audit
-- event — see CreationService.createBeforeAfterVideo and
-- PrismaUnitOfWork.projects.createOrFindByIdempotency.
CREATE UNIQUE INDEX "creation_projects_ownerUserId_caseId_idempotencyKey_key" ON "creation_projects"("ownerUserId", "caseId", "idempotencyKey");

-- Durable domain constraint: the two columns are set or absent together. No row can ever
-- carry a fingerprint without the key that scoped it, or a key with no fingerprint to
-- compare a replay against.
ALTER TABLE "creation_projects"
  ADD CONSTRAINT "creation_projects_idempotency_pair_check"
  CHECK (("idempotencyKey" IS NULL) = ("requestFingerprint" IS NULL));
