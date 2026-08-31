-- Phase 2 final security closure: password-state compare-and-set and audit human-actor ownership.

ALTER TABLE "password_credentials"
  ADD COLUMN "credentialRevision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "password_credentials"
  ADD CONSTRAINT "password_credentials_credentialRevision_positive_check"
  CHECK ("credentialRevision" > 0);

-- Fail the migration rather than silently accepting a historical personal-data attribution violation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "audit_events"
    WHERE "actorType" = 'human'
      AND "actorUserId" IS DISTINCT FROM "ownerUserId"
  ) THEN
    RAISE EXCEPTION 'Cannot install audit human actor ownership constraint: historical audit_events contains cross-user human attribution.';
  END IF;
END $$;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_human_actor_owns_event_check"
  CHECK (
    "actorType" <> 'human'
    OR "actorUserId" = "ownerUserId"
  );
