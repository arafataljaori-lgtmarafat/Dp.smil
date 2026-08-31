# Transactional Generation Idempotency Fix Report

**Status:** **FOUNDATION VERIFIED — READY FOR PHASE 2.** This correction is limited to the confirmed generation-idempotency defect. No Phase 2 feature was started.

## Exact implementation change

`PrismaPorts.generations.createOrFindByIdempotency()` no longer creates a `GenerationJob` through Prisma and recovers from an expected `P2002`. It now runs one PostgreSQL statement through the active Prisma client or interactive transaction client:

```sql
INSERT INTO "generation_jobs" (...)
ON CONFLICT ("ownerUserId", "projectId", "idempotencyKey") DO NOTHING
RETURNING ...
```

If PostgreSQL returns a row, the request created the job. If it returns no row, the same still-valid transaction client performs a new `SELECT` for the existing row. The unique constraint `(ownerUserId, projectId, idempotencyKey)` remains authoritative; request-fingerprint comparison remains in `GenerationService.request()`.

## Why the old path was unsafe

The previous implementation intentionally executed `INSERT`, caught `P2002`, and then attempted to select the existing row. Inside `GenerationService.request()`, that repository method runs in an interactive PostgreSQL transaction. A unique violation can leave PostgreSQL in an aborted transaction state, where the follow-up query is not a safe recovery mechanism. The new `DO NOTHING` conflict branch is not an error and therefore preserves a usable transaction.

## Real service transaction tests

`apps/api/test/integration/generation-service-idempotency.transaction.test.ts` invokes the real `GenerationService.request()` with `PrismaUnitOfWork` and a real PostgreSQL `DATABASE_URL`. It uses a recording queue solely to count logical submissions.

| Scenario | Verified result |
|---|---|
| Sequential identical retry | One `GenerationJob`; second response returns the original job with `created = false`; one `GenerationRequested` event; one queue submission. |
| Eight concurrent identical retries | Every valid caller resolves to the same job; exactly one job, one audit event, and one queue submission; no transaction-aborted error. |
| Same key with a different fingerprint | `IDEMPOTENCY_CONFLICT`; no additional job, audit event, or queue submission. |

The previous persistence-level concurrency test remains and was updated to supply the full `GenerationJobRecord` contract, so it still exercises concurrent PostgreSQL insertion as a separate regression.

## Commands actually executed

| Command or verification | Result |
|---|---|
| Service transaction test file with real PostgreSQL | Passed: 3 tests. |
| `pnpm test:integration` with real `DATABASE_URL` | Passed: **25 tests in 6 files**. |
| `pnpm lint` | Passed. |
| `pnpm typecheck` | Passed: 8 Turborepo tasks. |
| `pnpm test` | Passed; integration suites are separately run explicitly because the Turbo task does not forward `DATABASE_URL` to the API subprocess. |
| `pnpm build` | Passed; API, shared packages, and Expo export built. |
| Full fresh migration chain | Passed: 6 migrations applied to a new PostgreSQL database. |
| `prisma validate` | Passed. |
| Prisma/PostgreSQL drift check | **No difference detected.** |
| Real HTTP walking skeleton | Passed: seed user → case → SOURCE upload → project → initial generation request → duplicate request using the same key returning the same job with `created = false` → mock processing → generated media → immutable version → result/history retrieval. |

## Remaining concrete defect

No concrete defect is known after this verification. The in-memory development queue remains deliberately non-durable and is documented as an operational limitation outside this correction; it does not weaken idempotency or relational integrity.
