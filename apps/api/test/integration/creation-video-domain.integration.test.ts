import { randomUUID } from 'node:crypto';

import { CreationRevisionConflictError, IdempotencyConflictError, NotFoundError } from '@dentpilot/domain';
import { CreationService } from '@dentpilot/application';
import { canonicalizeVideoCompositionDocument } from '@dentpilot/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NodeSha256Adapter } from '../../src/infrastructure/media/media-inspector.adapter.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';

/**
 * Phase 5 Stage 2 — before_after_video persistence/integration coverage against real
 * PostgreSQL, mirroring creation-domain.integration.test.ts's existing pattern for the
 * image path. Requires DATABASE_URL (see mission section 12/13); this file is one of the
 * artifacts required by that section even where the sandbox that authored it could not
 * itself run `prisma generate` (see the Stage 2 execution report's ENVIRONMENTAL BLOCKER
 * section) — it is written to run unmodified the moment that generation step succeeds.
 */
const canRun = process.env.DATABASE_URL !== undefined;
const ownerA = randomUUID();
const ownerB = randomUUID();
const caseA = randomUUID();
const caseAOther = randomUUID();
const caseB = randomUUID();
const mediaBefore = randomUUID();
const mediaAfter = randomUUID();
const mediaAlternate = randomUUID();
const mediaOtherCase = randomUUID();
const mediaB = randomUUID();
const actorA = { actorType: 'human' as const, userId: ownerA, requestId: `creation-video-${randomUUID()}` };
const actorB = { actorType: 'human' as const, userId: ownerB, requestId: `creation-video-${randomUUID()}` };

function freshKey(): string {
  return `video-key-${randomUUID()}`;
}

describe.skipIf(!canRun)('Phase 5 Stage 2 before_after_video PostgreSQL persistence', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const service = new CreationService(
    unitOfWork,
    new NodeSha256Adapter(),
    { next: randomUUID },
    { now: () => new Date() },
    16_384,
  );

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.createMany({ data: [ownerA, ownerB].map((id) => ({
      id,
      email: `creation-video-${id}@example.invalid`,
      normalizedEmail: `creation-video-${id}@example.invalid`,
      displayName: 'Creation video integration user',
      status: 'active' as const,
    })) });
    await prisma.patientCase.createMany({ data: [
      { id: caseA, ownerUserId: ownerA, displayLabel: 'A', status: 'active', createdById: ownerA },
      { id: caseAOther, ownerUserId: ownerA, displayLabel: 'A other', status: 'active', createdById: ownerA },
      { id: caseB, ownerUserId: ownerB, displayLabel: 'B', status: 'active', createdById: ownerB },
    ] });
    await prisma.mediaAsset.createMany({ data: [
      [mediaBefore, ownerA, caseA], [mediaAfter, ownerA, caseA], [mediaAlternate, ownerA, caseA],
      [mediaOtherCase, ownerA, caseAOther], [mediaB, ownerB, caseB],
    ].map(([id, ownerUserId, caseId]) => ({
      id, ownerUserId, caseId, kind: 'source' as const, purpose: 'source_photo' as const,
      mimeType: 'image/png', byteSize: 1, width: 1, height: 1, sha256: 'a'.repeat(64),
      storageKey: `test/creation-video/${id}`, createdById: ownerUserId,
    })) });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('creates one authoritative video draft with both bindings synced into document.assetBindings', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() });
    expect(created.created).toBe(true);
    expect(created.project.type).toBe('before_after_video');
    expect(created.draft.revision).toBe(1);
    const document = created.draft.document as { assetBindings: Record<string, { mediaId: string }> };
    expect(document.assetBindings.before?.mediaId).toBe(mediaBefore);
    expect(document.assetBindings.after?.mediaId).toBe(mediaAfter);
    const row = await prisma.creationProject.findUniqueOrThrow({ where: { id: created.project.id } });
    expect(row.idempotencyKey).not.toBeNull();
    expect(row.requestFingerprint).not.toBeNull();
  });

  it('replays an idempotent retry as the original graph with no duplicate audit event', async () => {
    const key = freshKey();
    const first = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key });
    const second = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key });
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    expect(await prisma.auditEvent.count({ where: { ownerUserId: ownerA, projectId: first.project.id, eventType: 'CreationProjectCreated' } })).toBe(1);
  });

  it('rejects a replayed idempotency key whose request fingerprint has changed', async () => {
    const key = freshKey();
    await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key });
    await expect(service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAlternate, idempotencyKey: key }))
      .rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('database-enforced idempotency: concurrent identical creation requests produce exactly one project row and one audit event', async () => {
    const key = freshKey();
    const results = await Promise.allSettled([
      service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key }),
      service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key }),
    ]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof service.createBeforeAfterVideo>>> => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(2);
    const projectIds = new Set(fulfilled.map((r) => r.value.project.id));
    expect(projectIds.size).toBe(1);
    expect(fulfilled.filter((r) => r.value.created).length).toBe(1);
    const [projectId] = Array.from(projectIds);
    expect(await prisma.creationProject.count({ where: { ownerUserId: ownerA, caseId: caseA, idempotencyKey: key } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { ownerUserId: ownerA, projectId, eventType: 'CreationProjectCreated' } })).toBe(1);
  });

  it('rejects Before/After media outside the selected case and a case that is not the owner\'s', async () => {
    await expect(service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaOtherCase, idempotencyKey: freshKey() }))
      .rejects.toThrow();
    await expect(service.createBeforeAfterVideo(actorB, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('binding/document single-truth invariant: a binding replacement updates the relational row and document.assetBindings atomically', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() });
    const updated = await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: mediaBefore }, { bindingKey: 'after', mediaId: mediaAlternate }],
    });
    const draftRow = await prisma.creationDraft.findUniqueOrThrow({ where: { projectId: created.project.id } });
    const document = draftRow.document as unknown as { assetBindings: Record<string, { mediaId: string }> };
    const persistedAfter = updated.bindings.find((b) => b.bindingKey === 'after');
    expect(document.assetBindings.after?.mediaId).toBe(persistedAfter?.mediaId);
    expect(persistedAfter?.mediaId).toBe(mediaAlternate);
  });

  it('gives exactly one binding-replacement CAS winner under concurrency, with the document staying in sync with whichever binding set won', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() });
    const results = await Promise.allSettled([
      service.replaceBindings(actorA, created.project.id, { expectedRevision: 1, bindings: [{ bindingKey: 'before', mediaId: mediaBefore }, { bindingKey: 'after', mediaId: mediaAlternate }] }),
      service.replaceBindings(actorA, created.project.id, { expectedRevision: 1, bindings: [{ bindingKey: 'before', mediaId: mediaAlternate }, { bindingKey: 'after', mediaId: mediaAfter }] }),
    ]);
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof service.replaceBindings>>> => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(CreationRevisionConflictError);
    const draftRow = await prisma.creationDraft.findUniqueOrThrow({ where: { projectId: created.project.id } });
    expect(draftRow.revision).toBe(2);
    const document = draftRow.document as unknown as { assetBindings: Record<string, { mediaId: string }> };
    const persistedBindings = await prisma.creationAssetBinding.findMany({ where: { ownerUserId: ownerA, projectId: created.project.id } });
    const persistedAfter = persistedBindings.find((b) => b.bindingKey === 'after');
    expect(document.assetBindings.after?.mediaId).toBe(persistedAfter?.mediaId);
  });

  it('creates an immutable video revision matching canonicalizeVideoCompositionDocument, and the persisted hash cannot be tampered with after the fact', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() });
    const revision = await service.createRevision(actorA, created.project.id, 1);
    const expectedHash = await new NodeSha256Adapter().sha256(new TextEncoder().encode(canonicalizeVideoCompositionDocument(revision.revision.document as never)));
    expect(revision.revision.documentSha256).toBe(expectedHash);
    expect(revision.bindings.map((b) => b.bindingKey).sort()).toEqual(['after', 'before']);
    await expect(prisma.creationRevision.update({ where: { id: revision.revision.id }, data: { documentSha256: 'b'.repeat(64) } })).rejects.toThrow();
  });

  it('a video revision remains readable and unchanged after later binding mutations on the same project', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() });
    const revision = await service.createRevision(actorA, created.project.id, 1);
    await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 2,
      bindings: [{ bindingKey: 'before', mediaId: mediaBefore }, { bindingKey: 'after', mediaId: mediaAlternate }],
    });
    const historical = await service.getRevision(actorA, created.project.id, revision.revision.id);
    expect(historical.bindings.find((b) => b.bindingKey === 'after')?.mediaId).toBe(mediaAfter);
    await expect(service.getRevision(actorB, created.project.id, revision.revision.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not weaken image creation: image projects still never receive an idempotency key', async () => {
    const created = await service.createBeforeAfterImage(actorA, { caseId: caseA, sourceMediaId: mediaBefore });
    const row = await prisma.creationProject.findUniqueOrThrow({ where: { id: created.project.id } });
    expect(row.idempotencyKey).toBeNull();
    expect(row.requestFingerprint).toBeNull();
  });

  // ─── Final Integrity Closure 1: owner-scoped idempotency (DB-level) ───────

  it('closure-1 DB: same owner + same key + different case → IdempotencyConflictError, only one project row created', async () => {
    const key = freshKey();
    await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key });
    // Reuse the same key against the other case — fingerprint differs (caseId is encoded
    // in the fingerprint). mediaOtherCase belongs to caseAOther so media validation passes;
    // the owner-scoped unique index collision triggers IdempotencyConflictError in the
    // service's fingerprint comparison before any new graph is written.
    await expect(
      service.createBeforeAfterVideo(actorA, { caseId: caseAOther, beforeMediaId: mediaOtherCase, afterMediaId: mediaOtherCase, idempotencyKey: key }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    const count = await prisma.creationProject.count({ where: { ownerUserId: ownerA, idempotencyKey: key } });
    expect(count).toBe(1);
  });

  it('closure-1 DB: different owners may independently claim the same idempotency key', async () => {
    const key = freshKey();
    const rA = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: key });
    const rB = await service.createBeforeAfterVideo(actorB, { caseId: caseB, beforeMediaId: mediaB, afterMediaId: mediaB, idempotencyKey: key });
    expect(rA.created).toBe(true);
    expect(rB.created).toBe(true);
    expect(rA.project.id).not.toBe(rB.project.id);
  });

  // ─── Final Integrity Closure 2: type/idempotency CHECK constraint (DB) ────

  it('closure-2 DB: before_after_video row with NULL idempotencyKey is rejected by the type/idempotency CHECK constraint', async () => {
    // The new CHECK ensures (type = 'before_after_video') = (idempotencyKey IS NOT NULL).
    // A before_after_video row with NULL key must violate it.
    await expect(
      prisma.$executeRaw`
        INSERT INTO "creation_projects"
          ("id", "ownerUserId", "caseId", "type", "sourceMediaId", "createdAt", "createdById")
        VALUES (
          gen_random_uuid(), ${ownerA}::uuid, ${caseA}::uuid,
          'before_after_video'::"CreationProjectType",
          ${mediaBefore}::uuid, NOW(), ${ownerA}::uuid
        )
      `,
    ).rejects.toThrow();
  });

  it('closure-2 DB: before_after_image row with non-NULL idempotencyKey is rejected by the type/idempotency CHECK constraint', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO "creation_projects"
          ("id", "ownerUserId", "caseId", "type", "sourceMediaId", "createdAt", "createdById",
           "idempotencyKey", "requestFingerprint")
        VALUES (
          gen_random_uuid(), ${ownerA}::uuid, ${caseA}::uuid,
          'before_after_image'::"CreationProjectType",
          ${mediaBefore}::uuid, NOW(), ${ownerA}::uuid,
          'should-be-null', ${'a'.repeat(64)}
        )
      `,
    ).rejects.toThrow();
  });

  it('closure-2 DB: valid legacy before_after_image rows (null idempotency) are accepted without error', async () => {
    const id = randomUUID();
    await expect(
      prisma.$executeRaw`
        INSERT INTO "creation_projects"
          ("id", "ownerUserId", "caseId", "type", "sourceMediaId", "createdAt", "createdById")
        VALUES (
          ${id}::uuid, ${ownerA}::uuid, ${caseA}::uuid,
          'before_after_image'::"CreationProjectType",
          ${mediaBefore}::uuid, NOW(), ${ownerA}::uuid
        )
      `,
    ).resolves.toBeDefined();
  });

  // ─── Final Integrity Closure 3: revision document validation on read (DB) ─

  it('defensive read validation against DB-inserted wrong-type revision state', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId: caseA, beforeMediaId: mediaBefore, afterMediaId: mediaAfter, idempotencyKey: freshKey() });
    
    // Insert a malformed revision directly to bypass application-level creation logic,
    // explicitly avoiding immutable updates while testing the read path's structural validation.
    const malformedRevisionId = randomUUID();
    await prisma.creationRevision.create({
      data: {
        id: malformedRevisionId,
        ownerUserId: ownerA,
        caseId: caseA,
        projectId: created.project.id,
        revisionNumber: 999,
        documentSchemaVersion: 1,
        documentSha256: 'a'.repeat(64),
        document: {
          schemaVersion: 1, templateRef: null,
          canvas: { aspectRatioKey: 'portrait_4_5' },
          slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
          editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
          styleState: { theme: 'clinical-neutral' },
        },
        createdAt: new Date(),
      },
    });

    await expect(service.listRevisions(actorA, created.project.id)).rejects.toThrow();
    await expect(service.getRevision(actorA, created.project.id, malformedRevisionId)).rejects.toThrow();
  });
});
