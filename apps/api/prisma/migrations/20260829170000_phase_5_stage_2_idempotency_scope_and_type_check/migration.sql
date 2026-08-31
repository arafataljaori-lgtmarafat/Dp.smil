-- Phase 5 Stage 2 — Final Integrity Micro-Closure
--
-- Two corrections to the preceding Stage 2 migration
-- (20260829160000_phase_5_stage_2_video_creation_idempotency):
--
-- 1. Correct idempotency uniqueness scope.
--
--    The delivered constraint was UNIQUE(ownerUserId, caseId, idempotencyKey), which
--    allowed the same owner to reuse the same Idempotency-Key on a different case and
--    produce an independent graph. The Stage 2 spec requires owner-scoped uniqueness:
--    same owner + same key must always replay the SAME graph regardless of which case
--    the key happens to identify (the request fingerprint already encodes caseId, so a
--    key reused against a different case/request deterministically produces
--    IdempotencyConflictError rather than a second graph).
--
--    Replace the three-column index with a two-column one.
--
-- 2. Bind idempotency fields to project type at the database level.
--
--    The existing pair-check guarantees key/fingerprint nullness parity but says
--    nothing about which project types are allowed to carry them. Add a CHECK that
--    enforces: before_after_video rows always have both columns set, every other type
--    always has both columns null. This catches any bug in the application layer
--    (e.g. a future code path that persists a video project without a key, or an image
--    project with one) at the database boundary rather than in production.

-- Drop the three-column unique index introduced by the preceding migration.
DROP INDEX "creation_projects_ownerUserId_caseId_idempotencyKey_key";

-- Create the correct owner-scoped unique index. NULL values in a Postgres unique index
-- are treated as distinct from one another, so the many existing before_after_image and
-- smile_simulation rows — which keep idempotencyKey = NULL — can never collide here.
CREATE UNIQUE INDEX "creation_projects_ownerUserId_idempotencyKey_key"
  ON "creation_projects"("ownerUserId", "idempotencyKey");

-- Bind idempotency fields to project type.
-- before_after_video rows: both columns must be non-null.
-- All other project types: both columns must be null.
-- This is written as a bidirectional equivalence: (type = 'before_after_video') if and
-- only if (idempotencyKey IS NOT NULL). The existing pair-check already guarantees
-- (idempotencyKey IS NULL) = (requestFingerprint IS NULL), so together these two
-- constraints fully specify the allowed combinations.
ALTER TABLE "creation_projects"
  ADD CONSTRAINT "creation_projects_type_idempotency_check"
  CHECK (
    (type = 'before_after_video') = ("idempotencyKey" IS NOT NULL)
  );
