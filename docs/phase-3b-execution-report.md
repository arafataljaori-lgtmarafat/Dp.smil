# DentPilot — Phase 3B Execution Report

## Scope Delivered

Phase 3B replaces the production HTTP path that previously read uploads through `toBuffer()` with a durable upload-session flow. The API now exposes `POST /api/v1/cases/:caseId/media-uploads`, `POST /api/v1/media-uploads/:uploadId/content`, and `GET /api/v1/media-uploads/:uploadId`. The public DTO exposes only `uploadId`, `status`, `expiresAt`, and the committed `mediaId`; it excludes `processingToken`, storage keys, and provider information.

| Area | Implementation |
|---|---|
| Streaming/temp spool | A per-request `dentpilot-upload-<uuid>.spool` file is written under `MEDIA_TEMP_ROOT` with mode `0600`; no client filename is used. |
| Actual byte limit | Fastify enforces `files: 1` and `fileSize`; the spool loop independently counts bytes and checks the multipart truncated flag before storage or commit. |
| MIME/decode validation | `file-type` detects type from staged bytes; only JPEG, PNG, and WebP pass. Sharp performs metadata inspection and a full decode under pixel, dimension, and page limits. |
| SHA-256 | SHA-256 is updated chunk-by-chunk while the request stream is copied to private spool storage. |
| Commit/cleanup | The object is written under a server-generated source key, then `MediaAsset`, audit event, and fenced session commit occur in one PostgreSQL transaction. A catchable failure first marks the fenced session failed, retaining its durable cleanup ledger, then attempts best-effort object deletion and clears that marker only after deletion succeeds. |
| Recovery | Immediate and bounded recurring reconciliation expires only stale `created` sessions; separate `startedAt` timeout handling fences `processing → failed` with `UPLOAD_PROCESSING_TIMEOUT`. It removes only matching old spool files and deletes an object only after finding no committed `MediaAsset` with the ledger key. |
| Authorized reads | The controller authorizes by owner + media id, verifies stored-object length against committed DB size, then streams through `Readable.from` with `private, no-store`, verified content type, content length, and `nosniff`. |
| Migration/indexes | `20260827140000_phase_3b_upload_session_processing_timeout_index` adds the `(status, startedAt)` recovery index, and `20260827150000_phase_3b_closure_durable_orphan_cleanup` adds the durable cleanup marker, guarded constraint, and lookup index. Existing `(status, expiresAt)` continues to support created-session expiry. |

## Tests and Verification Executed

The following commands ran successfully in this delivery workspace: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm build`. A fresh PostgreSQL database applied all 12 migrations successfully; `prisma validate` succeeded and `prisma migrate diff` returned `No difference detected.`

The PostgreSQL upload-session suite passed all 11 tests, including concurrent idempotent creation, `created → expired`, protection of processing sessions from the original `expiresAt`, fenced timeout failure, stale-token rejection, normal commit, and a real timeout-vs-commit terminal-state race. The shared contract suite passed 7 tests. The real authenticated HTTP smoke test registered and verified a user, created a case and upload session, multipart-uploaded a Sharp-generated PNG, confirmed commit, then downloaded byte-identical content with the required private headers. The S3 adapter contract test passed 3 tests against live MinIO.

## Closure Status

This incremental report is superseded by `docs/phase-3b-final-closure-report.md`. The final closure adds recurring bounded reconciliation, real PostgreSQL + MinIO orphan restart recovery, deterministic finalization and spool fault coverage, cross-user HTTP isolation, malformed multipart acceptance, and source-uploaded generation regression. The phase intentionally does not add presigned URLs, resumable multipart uploads, thumbnails, source normalization, or Phase 3C mobile UI.

> The Phase 3B final closure report is the authoritative record for the exhaustive Definition of Done gates.
