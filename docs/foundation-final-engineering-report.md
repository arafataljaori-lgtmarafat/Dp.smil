# Foundation Final Engineering Report

**Status:** **FOUNDATION CLOSED — READY FOR PHASE 2.** اجتازت جميع بوابات التحقق المطلوبة في هذا التنفيذ، ولم يبدأ أي عمل من Phase 2.

> **Scope boundary:** This correction enforces durable personal-user graph integrity. It does not begin Phase 2 and does not add authentication, AI, subscriptions, templates, video, or product features.

## Concrete relational defects fixed

| Defect | Structural correction |
|---|---|
| A derived/generated asset could reference a source owned by the same user but stored in another case. | PostgreSQL now enforces `(ownerUserId, caseId, sourceMediaId) → (ownerUserId, caseId, id)` on `media_assets`. |
| An audit could combine individually valid `caseId`, `projectId`, and `generationJobId` from different logical chains. | Composite candidate keys and foreign keys bind audit project references to the case and audit job references to the same case/project graph. |
| CI had a PostgreSQL service but did not make Prisma validation and drift parity explicit mandatory gates. | CI now migrates fresh PostgreSQL, validates Prisma, fails on drift, and executes PostgreSQL integration tests explicitly. |
| Legacy ADRs could be read as active clinic-tenancy architecture. | ADR-005, ADR-011, and ADR-013 are retained as historical records and marked **SUPERSEDED**, with ADR-016 and ADR-017 identifying the active personal-user model. |

## Migration and backfill discipline

The single new migration is `20260826233000_foundation_final_graph_integrity`. It leaves all earlier migrations unchanged. Before stronger constraints are installed, it validates historical media lineage and audit graphs and raises a clear PostgreSQL exception if it encounters a contradiction. No database reset, data rewrite, trigger, or application-only bypass is used.

## PostgreSQL constraints added

| Table | Constraint class | Guarantee |
|---|---|---|
| `media_assets` | composite foreign key | A non-null `sourceMediaId` resolves inside the same `ownerUserId` and `caseId`. |
| `creation_projects` | composite candidate key | Supports case-safe audit project references. |
| `generation_jobs` | composite candidate key | Supports case/project-safe audit job references. |
| `audit_events` | CHECK | A project requires case; a job requires both case and project; case-only events remain valid. |
| `audit_events` | composite foreign keys | Project and job must belong to the exact case/project graph stored by the event. |

## Tests added or updated

The PostgreSQL suite now directly verifies the following against a real `DATABASE_URL`:

| Scenario | Expected database outcome |
|---|---|
| Same user, Case A DERIVED → Case B SOURCE | Rejected. |
| Same user, Case A GENERATED → Case B SOURCE | Rejected. |
| Same user, valid within-case DERIVED lineage | Accepted. |
| Audit Case A + Project B | Rejected. |
| Audit Case A + Project A + unrelated Job B | Rejected. |
| Valid case-only, case/project, and case/project/job audits | Accepted. |

Existing user isolation, idempotency, concurrency, SHA-256, provenance, immutable version, failure classification, object cleanup, TIMESTAMPTZ, CHECK-constraint, and walking-skeleton tests are preserved.

## CI changes

The `verify` job provisions a fresh PostgreSQL 16 service and executes, in order: locked installation, full migration chain, `prisma validate`, Prisma/PostgreSQL drift with `--exit-code`, seed, lint, typecheck, unit/application tests, mandatory PostgreSQL integration tests, and build. Integration tests are not allowed to silently skip in this database job because `DATABASE_URL` is defined at job scope and `pnpm test:integration` is explicit.

## Verification results

| Command or verification | Result actually observed |
|---|---|
| `pnpm lint` | Passed after making lint depend on built workspace dependencies. |
| `pnpm typecheck` | Passed; 8 Turborepo tasks succeeded. |
| `pnpm test` | Passed; unit, application, mobile, and API test tasks succeeded. PostgreSQL suites are intentionally invoked explicitly below because Turbo does not forward the environment to the API subtask. |
| `pnpm test:integration` with real `DATABASE_URL` | Passed; **22 tests in 5 files**. |
| `pnpm build` | Passed; API, packages, and Expo export built. |
| `prisma validate` | Passed. |
| Fresh PostgreSQL migration chain | Passed; all 6 migrations applied to an empty database. |
| Upgrade after existing Phase 1.3 schema | Passed; migration `20260826233000_foundation_final_graph_integrity` applied directly without resetting the Phase 1.3 database. |
| Prisma ↔ PostgreSQL drift | **No difference detected.** |
| Real seeded development walking skeleton | Passed: seed user → case → SOURCE upload → project → generation → mock worker → generated media → immutable version → content/history retrieval. |

## Remaining defects

No concrete Foundation defect is known after the final verification. The in-memory development queue remains intentionally non-durable and is already documented as an operational limitation outside this Foundation correction; it does not weaken relational correctness. The engineering foundation is **FOUNDATION CLOSED — READY FOR PHASE 2**.
