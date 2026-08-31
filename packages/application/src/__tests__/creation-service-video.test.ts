import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  CreationBindingRequiredError,
  CreationRevisionConflictError,
  IdempotencyConflictError,
  NotFoundError,
  ValidationError,
} from '@dentpilot/domain';
import { canonicalizeVideoCompositionDocument, type CreationDocument } from '@dentpilot/contracts';

import {
  CreationService,
  type Actor,
  type AuditEventRecord,
  type CaseRecord,
  type CreationAssetBindingRecord,
  type CreationDraftRecord,
  type CreationProjectRecord,
  type CreationRevisionAssetRecord,
  type CreationRevisionRecord,
  type MediaAssetRecord,
  type TransactionPorts,
  type UnitOfWorkPort,
  type VideoCreationDetails,
} from '../index.js';

/**
 * Phase 5 Stage 2 — CreationService.createBeforeAfterVideo and the generalized
 * getCreation/replaceBindings/updateDraft/createRevision paths, exercised against an
 * in-memory fake persistence layer built to the exact same optimistic-concurrency and
 * idempotency contracts as PrismaUnitOfWork (packages/application/src/ports.ts):
 *   - every CAS-checked mutation (replaceBindingsIfRevision, updateDraftIfRevision, the
 *     draft-revision claim inside createRevision) performs its "read current state, then
 *     write" step with no `await` in between, so — exactly as under a real `WHERE
 *     revision = expectedRevision` UPDATE — two concurrent callers racing on the same
 *     expected revision can never both win;
 *   - createOrFindByIdempotency performs its lookup-or-insert the same way, so two
 *     concurrent identical creation requests can never both create a project.
 * This lets the concurrency and idempotency tests below observe genuine single-winner
 * races rather than an artifact of sequential test execution.
 */

const clock = { now: () => new Date('2026-08-29T12:00:00.000Z') };
const digest = { sha256: async (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex') };
const ids = (() => {
  let sequence = 1000;
  return { next: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}` };
})();

const ownerA = '00000000-0000-4000-8000-0000000000a1';
const ownerB = '00000000-0000-4000-8000-0000000000b1';
const actorA: Actor = { actorType: 'human', userId: ownerA, requestId: 'req-a' };
const actorB: Actor = { actorType: 'human', userId: ownerB, requestId: 'req-b' };

const maximumDocumentBytes = 256 * 1024;

interface Store {
  cases: Map<string, CaseRecord>;
  media: Map<string, MediaAssetRecord>;
  projects: Map<string, CreationProjectRecord>;
  drafts: Map<string, CreationDraftRecord>;
  bindings: Map<string, CreationAssetBindingRecord[]>;
  revisions: Map<string, CreationRevisionRecord>;
  revisionsByProject: Map<string, string[]>;
  revisionAssets: Map<string, CreationRevisionAssetRecord[]>;
  audits: AuditEventRecord[];
}

type UndoAction = () => void;

/**
 * Per-transaction undo log used instead of whole-store snapshot/restore. A wholesale
 * "snapshot the store, restore it on throw" rollback is wrong for concurrent
 * transactions: transaction B's snapshot is taken before transaction A commits, so
 * restoring it on B's failure would erase A's already-committed writes too — something
 * a real Postgres transaction never does, since each transaction only ever undoes its
 * own writes. Recording one undo closure per mutation, keyed to that mutation's own
 * prior value, and replaying only this transaction's own log in reverse on failure,
 * reproduces that per-transaction isolation.
 */
function mapSet<K, V>(map: Map<K, V>, key: K, value: V, undoLog: UndoAction[]): void {
  const had = map.has(key);
  const previous = map.get(key);
  undoLog.push(() => { if (had) map.set(key, previous as V); else map.delete(key); });
  map.set(key, value);
}

function arrayPush<T>(array: T[], item: T, undoLog: UndoAction[]): void {
  undoLog.push(() => { array.pop(); });
  array.push(item);
}

function newStore(): Store {
  return {
    cases: new Map(),
    media: new Map(),
    projects: new Map(),
    drafts: new Map(),
    bindings: new Map(),
    revisions: new Map(),
    revisionsByProject: new Map(),
    revisionAssets: new Map(),
    audits: [],
  };
}

/**
 * Builds a UnitOfWorkPort backed by `store`. Every mutation inside `transaction` is
 * recorded on a transaction-local undo log (see mapSet/arrayPush above); if the callback
 * throws, only this transaction's own writes are unwound, in reverse order, before
 * rethrowing. This mirrors real per-transaction isolation: transaction B's rollback must
 * never erase a write transaction A already committed, exactly as Postgres guarantees.
 */
function makeUnitOfWork(store: Store): UnitOfWorkPort {
  const buildPorts = (undoLog: UndoAction[]): TransactionPorts => ({
    cases: {
      create: async () => { throw new Error('not used in these tests'); },
      listByOwner: async (ownerUserId) => Array.from(store.cases.values()).filter((c) => c.ownerUserId === ownerUserId),
      findById: async (ownerUserId, caseId) => {
        const found = store.cases.get(caseId);
        return found !== undefined && found.ownerUserId === ownerUserId ? found : null;
      },
    },
    media: {
      create: async () => { throw new Error('not used in these tests'); },
      findById: async (ownerUserId, mediaId) => {
        const found = store.media.get(mediaId);
        return found !== undefined && found.ownerUserId === ownerUserId ? found : null;
      },
      findByStorageKey: async () => null,
      listByCase: async (ownerUserId, caseId) => Array.from(store.media.values()).filter((m) => m.ownerUserId === ownerUserId && m.caseId === caseId),
    },
    projects: {
      create: async (input) => {
        mapSet(store.projects, input.id, input, undoLog);
        return input;
      },
      createOrFindByIdempotency: async (input) => {
        // No `await` between the lookup and the insert: this is the property that makes
        // the concurrency tests below meaningful (see file header).
        // Owner-scoped (not case-scoped): mirrors the corrected UNIQUE(ownerUserId,
        // idempotencyKey) constraint from the Final Integrity corrective migration.
        const existing = Array.from(store.projects.values()).find(
          (p) => p.ownerUserId === input.ownerUserId
            && p.idempotencyKey !== null && p.idempotencyKey === input.idempotencyKey,
        );
        if (existing !== undefined) return { project: existing, created: false };
        mapSet(store.projects, input.id, input, undoLog);
        return { project: input, created: true };
      },
      findById: async (ownerUserId, projectId) => {
        const found = store.projects.get(projectId);
        return found !== undefined && found.ownerUserId === ownerUserId ? found : null;
      },
      listByCase: async (ownerUserId, caseId) => Array.from(store.projects.values()).filter((p) => p.ownerUserId === ownerUserId && p.caseId === caseId),
    },
    creations: {
      createDraft: async (input) => {
        mapSet(store.drafts, input.projectId, input, undoLog);
        return input;
      },
      findDraft: async (ownerUserId, projectId) => {
        const found = store.drafts.get(projectId);
        return found !== undefined && found.ownerUserId === ownerUserId ? found : null;
      },
      updateDraftIfRevision: async (input) => {
        const current = store.drafts.get(input.projectId);
        if (current === undefined || current.ownerUserId !== input.ownerUserId || current.revision !== input.expectedRevision) return null;
        const updated: CreationDraftRecord = { ...current, document: input.document, revision: current.revision + 1, updatedAt: input.updatedAt };
        mapSet(store.drafts, input.projectId, updated, undoLog);
        return updated;
      },
      listBindings: async (ownerUserId, projectId) => (store.bindings.get(projectId) ?? []).filter((b) => b.ownerUserId === ownerUserId),
      replaceBindings: async (input) => {
        mapSet(store.bindings, input.projectId, [...input.bindings], undoLog);
        return input.bindings;
      },
      replaceBindingsIfRevision: async (input) => {
        const current = store.drafts.get(input.projectId);
        if (current === undefined || current.ownerUserId !== input.ownerUserId || current.revision !== input.expectedRevision) return null;
        const updatedDraft: CreationDraftRecord = {
          ...current,
          ...(input.document !== undefined ? { document: input.document } : {}),
          revision: current.revision + 1,
          updatedAt: input.updatedAt,
        };
        mapSet(store.drafts, input.projectId, updatedDraft, undoLog);
        mapSet(store.bindings, input.projectId, [...input.bindings], undoLog);
        return { draft: updatedDraft, bindings: [...input.bindings] };
      },
      createRevision: async (input) => {
        const current = store.drafts.get(input.revision.projectId);
        if (current === undefined || current.ownerUserId !== input.revision.ownerUserId || current.revision !== input.expectedDraftRevision) return null;
        mapSet(store.drafts, input.revision.projectId, { ...current, revision: current.revision + 1, updatedAt: input.revision.createdAt }, undoLog);
        const persistedBindings = (store.bindings.get(input.revision.projectId) ?? []).filter(
          (b) => (input.requiredBindingKeys as readonly string[]).includes(b.bindingKey),
        );
        if (persistedBindings.length !== input.requiredBindingKeys.length) return null;
        mapSet(store.revisions, input.revision.id, input.revision, undoLog);
        const byProject = store.revisionsByProject.get(input.revision.projectId) ?? [];
        mapSet(store.revisionsByProject, input.revision.projectId, [...byProject, input.revision.id], undoLog);
        mapSet(
          store.revisionAssets,
          input.revision.id,
          persistedBindings.map((b) => ({ revisionId: input.revision.id, ownerUserId: b.ownerUserId, caseId: b.caseId, projectId: b.projectId, bindingKey: b.bindingKey, mediaId: b.mediaId })),
          undoLog,
        );
        return input.revision;
      },
      listRevisions: async (ownerUserId, projectId) => (store.revisionsByProject.get(projectId) ?? [])
        .map((id) => store.revisions.get(id))
        .filter((r): r is CreationRevisionRecord => r !== undefined && r.ownerUserId === ownerUserId),
      findRevision: async (ownerUserId, projectId, revisionId) => {
        const found = store.revisions.get(revisionId);
        return found !== undefined && found.ownerUserId === ownerUserId && found.projectId === projectId ? found : null;
      },
      listRevisionAssets: async (ownerUserId, revisionId) => (store.revisionAssets.get(revisionId) ?? []).filter((a) => a.ownerUserId === ownerUserId),
    },
    generations: {
      createOrFindByIdempotency: async () => { throw new Error('not used in these tests'); },
      findById: async () => null,
      listByCase: async () => [],
      claimForProcessing: async () => false,
      complete: async () => null,
      fail: async () => null,
      createVersion: async () => { throw new Error('not used in these tests'); },
      findVersionByJob: async () => null,
    },
    uploadSessions: {
      createOrFindByIdempotency: async () => { throw new Error('not used in these tests'); },
      findById: async () => null,
      claimForProcessing: async () => null,
      markCommitted: async () => null,
      markFailed: async () => null,
      markExpired: async () => null,
      markProcessingTimedOut: async () => null,
      listExpiredCreated: async () => [],
      listTimedOutProcessing: async () => [],
      listCleanupPending: async () => [],
      markStorageCleanupComplete: async () => null,
    },
    audits: {
      append: async (input) => { arrayPush(store.audits, input, undoLog); },
      listByCase: async (ownerUserId, caseId) => store.audits.filter((a) => a.ownerUserId === ownerUserId && a.caseId === caseId),
    },
  });

  return {
    ...buildPorts([]),
    transaction: async (work) => {
      const undoLog: UndoAction[] = [];
      try {
        return await work(buildPorts(undoLog));
      } catch (error) {
        for (let i = undoLog.length - 1; i >= 0; i -= 1) undoLog[i]?.();
        throw error;
      }
    },
  };
}

function mediaFixture(input: { readonly id: string; readonly ownerUserId: string; readonly caseId: string; readonly sha256: string }): MediaAssetRecord {
  return {
    id: input.id,
    ownerUserId: input.ownerUserId,
    caseId: input.caseId,
    kind: 'source',
    purpose: 'source_photo',
    mimeType: 'image/png',
    byteSize: 1024,
    width: 800,
    height: 600,
    sha256: input.sha256,
    storageKey: `store/${input.id}`,
    sourceMediaId: null,
    createdAt: clock.now(),
    createdById: input.ownerUserId,
  };
}

describe('Phase 5 Stage 2 — CreationService before_after_video', () => {
  let store: Store;
  let service: CreationService;
  let caseId: string;
  let beforeMediaId: string;
  let afterMediaId: string;
  let alternateMediaId: string;

  beforeEach(() => {
    store = newStore();
    service = new CreationService(makeUnitOfWork(store), digest, ids, clock, maximumDocumentBytes);
    caseId = ids.next();
    beforeMediaId = ids.next();
    afterMediaId = ids.next();
    alternateMediaId = ids.next();
    store.cases.set(caseId, {
      id: caseId, ownerUserId: ownerA, displayLabel: 'Case', referenceCode: null, status: 'active',
      createdById: ownerA, createdAt: clock.now(), updatedAt: clock.now(),
    });
    store.media.set(beforeMediaId, mediaFixture({ id: beforeMediaId, ownerUserId: ownerA, caseId, sha256: 'a'.repeat(64) }));
    store.media.set(afterMediaId, mediaFixture({ id: afterMediaId, ownerUserId: ownerA, caseId, sha256: 'b'.repeat(64) }));
    store.media.set(alternateMediaId, mediaFixture({ id: alternateMediaId, ownerUserId: ownerA, caseId, sha256: 'c'.repeat(64) }));
  });

  it('creates a video project transactionally with both bindings, an initial document, and one audit event', async () => {
    const result = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-001' });
    expect(result.created).toBe(true);
    expect(result.project.type).toBe('before_after_video');
    expect(result.project.idempotencyKey).toBe('video-key-001');
    expect(result.bindings.map((b) => b.bindingKey).sort()).toEqual(['after', 'before']);
    expect(result.draft.revision).toBe(1);
    const document = result.draft.document as { assetBindings: Record<string, { mediaId: string }> };
    expect(document.assetBindings.before?.mediaId).toBe(beforeMediaId);
    expect(document.assetBindings.after?.mediaId).toBe(afterMediaId);
    expect(store.audits.filter((a) => a.projectId === result.project.id)).toHaveLength(1);
  });

  it('rejects Before/After media that does not belong to the selected case', async () => {
    const otherCaseId = ids.next();
    store.cases.set(otherCaseId, { id: otherCaseId, ownerUserId: ownerA, displayLabel: 'Other', referenceCode: null, status: 'active', createdById: ownerA, createdAt: clock.now(), updatedAt: clock.now() });
    const foreignMediaId = ids.next();
    store.media.set(foreignMediaId, mediaFixture({ id: foreignMediaId, ownerUserId: ownerA, caseId: otherCaseId, sha256: 'd'.repeat(64) }));
    await expect(service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId: foreignMediaId, idempotencyKey: 'video-key-002' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a case that does not belong to the requesting owner', async () => {
    await expect(service.createBeforeAfterVideo(actorB, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-003' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('idempotent replay: identical key and fingerprint returns the original graph without a second audit event', async () => {
    const first = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-004' });
    const second = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-004' });
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);
    expect(second.draft.revision).toBe(first.draft.revision);
    expect(store.audits.filter((a) => a.projectId === first.project.id)).toHaveLength(1);
  });

  it('idempotency conflict: same key with a different request fingerprint is rejected', async () => {
    await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-005' });
    await expect(service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId: alternateMediaId, idempotencyKey: 'video-key-005' }))
      .rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('concurrent identical creation requests produce exactly one graph and exactly one audit event', async () => {
    const [first, second] = await Promise.all([
      service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-006' }),
      service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-006' }),
    ]);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.project.id).toBe(second.project.id);
    expect(store.projects.size).toBe(1);
    expect(store.audits.filter((a) => a.projectId === first.project.id)).toHaveLength(1);
  });

  it('replaces a binding and keeps document.assetBindings synchronized in the same atomic write', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-007' });
    const updated = await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }, { bindingKey: 'after', mediaId: alternateMediaId }],
    });
    expect(updated.draft.revision).toBe(2);
    const document = updated.draft.document as { assetBindings: Record<string, { mediaId: string }> };
    expect(document.assetBindings.after?.mediaId).toBe(alternateMediaId);
    const persistedAfter = updated.bindings.find((b) => b.bindingKey === 'after');
    expect(persistedAfter?.mediaId).toBe(alternateMediaId);
    // Read path re-derives the same invariant and must not throw.
    await expect(service.getCreation(actorA, created.project.id)).resolves.toBeDefined();
  });

  it('rejects a binding replacement that drops a template-required key', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-008' });
    await expect(service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }],
    })).rejects.toBeInstanceOf(CreationBindingRequiredError);
  });

  it('rejects a stale expectedRevision on binding replacement (optimistic concurrency conflict)', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-009' });
    await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }, { bindingKey: 'after', mediaId: alternateMediaId }],
    });
    await expect(service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }, { bindingKey: 'after', mediaId: afterMediaId }],
    })).rejects.toBeInstanceOf(CreationRevisionConflictError);
  });

  it('concurrent binding replacements at the same expected revision: exactly one wins', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-010' });
    const results = await Promise.allSettled([
      service.replaceBindings(actorA, created.project.id, { expectedRevision: 1, bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }, { bindingKey: 'after', mediaId: alternateMediaId }] }),
      service.replaceBindings(actorA, created.project.id, { expectedRevision: 1, bindings: [{ bindingKey: 'before', mediaId: alternateMediaId }, { bindingKey: 'after', mediaId: afterMediaId }] }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CreationRevisionConflictError);
    expect(store.drafts.get(created.project.id)?.revision).toBe(2);
  });

  it('routes by persisted project.type, not by document shape: an image-shaped document is rejected on a video project', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-011' });
    const imageShapedDocument = {
      schemaVersion: 1 as const,
      templateRef: null,
      canvas: { aspectRatioKey: 'portrait_4_5' as const },
      slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
      editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
      styleState: { theme: 'clinical-neutral' as const },
    };
    await expect(service.updateDraft(actorA, created.project.id, { expectedRevision: 1, document: imageShapedDocument }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('routes by persisted project.type, not by document shape: a video-shaped document is rejected on an image project', async () => {
    const created = await service.createBeforeAfterImage(actorA, { caseId, sourceMediaId: beforeMediaId });
    const videoShapedDocument = {
      schemaVersion: 1 as const,
      templateRef: { templateId: 'classic-reveal', templateVersion: 1 },
      canvas: { aspectRatioKey: 'portrait_4_5' as const },
      durationMs: 4500,
      assetBindings: { before: { mediaId: beforeMediaId }, after: { mediaId: afterMediaId } },
      editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
      styleState: { theme: 'clinical-neutral' as const },
      renderProfile: { profileKey: 'preview' as const },
      audioRef: null,
    };
    await expect(service.updateDraft(actorA, created.project.id, { expectedRevision: 1, document: videoShapedDocument }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an unknown video template id/version', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-012' });
    const badTemplateDocument = {
      schemaVersion: 1 as const,
      templateRef: { templateId: 'nonexistent-template', templateVersion: 99 },
      canvas: { aspectRatioKey: 'portrait_4_5' as const },
      durationMs: 4500,
      assetBindings: { before: { mediaId: beforeMediaId }, after: { mediaId: afterMediaId } },
      editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
      styleState: { theme: 'clinical-neutral' as const },
      renderProfile: { profileKey: 'preview' as const },
      audioRef: null,
    };
    await expect(service.updateDraft(actorA, created.project.id, { expectedRevision: 1, document: badTemplateDocument }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an audio reference the resolved template does not accept', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-013' });
    const audioDocument = {
      schemaVersion: 1 as const,
      templateRef: { templateId: 'classic-reveal', templateVersion: 1 },
      canvas: { aspectRatioKey: 'portrait_4_5' as const },
      durationMs: 4500,
      assetBindings: { before: { mediaId: beforeMediaId }, after: { mediaId: afterMediaId } },
      editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
      styleState: { theme: 'clinical-neutral' as const },
      renderProfile: { profileKey: 'preview' as const },
      audioRef: { mediaId: alternateMediaId, startMs: 0, volume: 1 },
    };
    await expect(service.updateDraft(actorA, created.project.id, { expectedRevision: 1, document: audioDocument }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('creates an immutable video revision whose hash matches canonicalizeVideoCompositionDocument and snapshots exactly the required bindings', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-014' });
    const revision = await service.createRevision(actorA, created.project.id, 1);
    const expectedHash = createHash('sha256').update(canonicalizeVideoCompositionDocument(revision.revision.document as never)).digest('hex');
    expect(revision.revision.documentSha256).toBe(expectedHash);
    expect(revision.bindings.map((b) => b.bindingKey).sort()).toEqual(['after', 'before']);
  });

  it('a video revision is immutable: later binding changes do not affect an already-created revision snapshot', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-015' });
    const revision = await service.createRevision(actorA, created.project.id, 1);
    await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 2,
      bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }, { bindingKey: 'after', mediaId: alternateMediaId }],
    });
    const historical = await service.getRevision(actorA, created.project.id, revision.revision.id);
    expect(historical.bindings.find((b) => b.bindingKey === 'after')?.mediaId).toBe(afterMediaId);
  });

  it('rejects revision creation when a persisted binding no longer matches the draft document (binding/document drift)', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-016' });
    // Simulate out-of-band drift: the relational binding no longer agrees with the
    // document's declared assetBindings, bypassing the service's own sync path entirely.
    store.bindings.set(created.project.id, [
      { projectId: created.project.id, ownerUserId: ownerA, caseId, bindingKey: 'before', mediaId: beforeMediaId },
      { projectId: created.project.id, ownerUserId: ownerA, caseId, bindingKey: 'after', mediaId: alternateMediaId },
    ]);
    await expect(service.createRevision(actorA, created.project.id, 1)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getCreation(actorA, created.project.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('cross-owner isolation: another owner cannot read, mutate, or reveal the existence of a video creation', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'video-key-017' });
    await expect(service.getCreation(actorB, created.project.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.replaceBindings(actorB, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: beforeMediaId }, { bindingKey: 'after', mediaId: afterMediaId }],
    })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not regress legacy image creation: it remains non-idempotent and creates a fresh project on every call', async () => {
    const first = await service.createBeforeAfterImage(actorA, { caseId, sourceMediaId: beforeMediaId });
    const second = await service.createBeforeAfterImage(actorA, { caseId, sourceMediaId: beforeMediaId });
    expect(first.project.id).not.toBe(second.project.id);
    expect(first.project.idempotencyKey).toBeNull();
    expect(second.project.idempotencyKey).toBeNull();
  });

  // ─── Final Integrity Closure 1: owner-scoped idempotency ──────────────────

  it('closure-1: same owner + same key + different case → typed conflict (not a second graph)', async () => {
    // The same Idempotency-Key reused against a different case must conflict even though
    // the (ownerUserId, caseId, idempotencyKey) triple would have been unique under the
    // old three-column index. With owner-scoped uniqueness the first claim wins and the
    // second request sees a mismatched fingerprint (the fingerprint encodes caseId).
    const caseId2 = ids.next();
    store.cases.set(caseId2, { id: caseId2, ownerUserId: ownerA, displayLabel: 'Case 2', referenceCode: null, status: 'active', createdById: ownerA, createdAt: clock.now(), updatedAt: clock.now() });
    const before2 = ids.next();
    const after2 = ids.next();
    store.media.set(before2, mediaFixture({ id: before2, ownerUserId: ownerA, caseId: caseId2, sha256: 'e'.repeat(64) }));
    store.media.set(after2, mediaFixture({ id: after2, ownerUserId: ownerA, caseId: caseId2, sha256: 'f'.repeat(64) }));

    await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'owner-scoped-001' });
    // Same key, different case — fingerprint differs → conflict.
    await expect(
      service.createBeforeAfterVideo(actorA, { caseId: caseId2, beforeMediaId: before2, afterMediaId: after2, idempotencyKey: 'owner-scoped-001' }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    // Only one project was ever created.
    expect(Array.from(store.projects.values()).filter((p) => p.idempotencyKey === 'owner-scoped-001')).toHaveLength(1);
  });

  it('closure-1: different owners may independently use the same idempotency key', async () => {
    // Owner B has their own case and media.
    const caseBId = ids.next();
    store.cases.set(caseBId, { id: caseBId, ownerUserId: ownerB, displayLabel: 'Case B', referenceCode: null, status: 'active', createdById: ownerB, createdAt: clock.now(), updatedAt: clock.now() });
    const beforeB = ids.next();
    const afterB = ids.next();
    store.media.set(beforeB, mediaFixture({ id: beforeB, ownerUserId: ownerB, caseId: caseBId, sha256: 'g'.repeat(64) }));
    store.media.set(afterB, mediaFixture({ id: afterB, ownerUserId: ownerB, caseId: caseBId, sha256: 'h'.repeat(64) }));

    const resultA = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'shared-key' });
    const resultB = await service.createBeforeAfterVideo(actorB, { caseId: caseBId, beforeMediaId: beforeB, afterMediaId: afterB, idempotencyKey: 'shared-key' });
    // Both create successfully and produce separate projects.
    expect(resultA.created).toBe(true);
    expect(resultB.created).toBe(true);
    expect(resultA.project.id).not.toBe(resultB.project.id);
    expect(resultA.project.ownerUserId).toBe(ownerA);
    expect(resultB.project.ownerUserId).toBe(ownerB);
  });

  it('closure-1: concurrent same-key requests across different cases → one winner and one conflict, never two graphs', async () => {
    // Two concurrent requests from the same owner with the same key but different cases
    // must produce exactly one graph and one IdempotencyConflictError.
    const caseId3 = ids.next();
    store.cases.set(caseId3, { id: caseId3, ownerUserId: ownerA, displayLabel: 'Case 3', referenceCode: null, status: 'active', createdById: ownerA, createdAt: clock.now(), updatedAt: clock.now() });
    const before3 = ids.next();
    const after3 = ids.next();
    store.media.set(before3, mediaFixture({ id: before3, ownerUserId: ownerA, caseId: caseId3, sha256: 'i'.repeat(64) }));
    store.media.set(after3, mediaFixture({ id: after3, ownerUserId: ownerA, caseId: caseId3, sha256: 'j'.repeat(64) }));

    const [r1, r2] = await Promise.allSettled([
      service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'concurrent-cross-case' }),
      service.createBeforeAfterVideo(actorA, { caseId: caseId3, beforeMediaId: before3, afterMediaId: after3, idempotencyKey: 'concurrent-cross-case' }),
    ]);
    const fulfilled = [r1, r2].filter((r): r is PromiseFulfilledResult<VideoCreationDetails> => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(IdempotencyConflictError);
    // Exactly one project was created.
    expect(Array.from(store.projects.values()).filter((p) => p.idempotencyKey === 'concurrent-cross-case')).toHaveLength(1);
  });

  // ─── Final Integrity Closure 3: revision document validation on read ───────

  it('closure-3: listRevisions rejects a persisted revision document with the wrong type (video project, image-shaped document)', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'rev-read-001' });
    const revision = await service.createRevision(actorA, created.project.id, 1);
    // Inject an image-shaped document directly into the persisted revision, bypassing the
    // service's validation path — simulates bit rot or a bug in a future migration.
    const badDocument: CreationDocument = {
      schemaVersion: 1,
      templateRef: null,
      canvas: { aspectRatioKey: 'portrait_4_5' },
      slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
      editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
      styleState: { theme: 'clinical-neutral' },
    };
    store.revisions.set(revision.revision.id, { ...revision.revision, document: badDocument });
    await expect(service.listRevisions(actorA, created.project.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('closure-3: getRevision rejects a persisted revision document with the wrong type (video project, image-shaped document)', async () => {
    const created = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'rev-read-002' });
    const revision = await service.createRevision(actorA, created.project.id, 1);
    const badDocument: CreationDocument = {
      schemaVersion: 1,
      templateRef: null,
      canvas: { aspectRatioKey: 'portrait_4_5' },
      slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
      editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
      styleState: { theme: 'clinical-neutral' },
    };
    store.revisions.set(revision.revision.id, { ...revision.revision, document: badDocument });
    await expect(service.getRevision(actorA, created.project.id, revision.revision.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('closure-3: listRevisions validates correctly for image projects (video-shaped document is rejected)', async () => {
    const imgCreated = await service.createBeforeAfterImage(actorA, { caseId, sourceMediaId: beforeMediaId });
    const revision = await service.createRevision(actorA, imgCreated.project.id, 1);
    // Inject a video-shaped document into an image project revision.
    // Deliberately incomplete/wrong-shaped document cast to bypass type-checker — this
    // simulates bit rot or a bad migration; the validator must reject it at runtime.
    const badDocument = {
      schemaVersion: 1,
      templateId: 'classic-reveal',
      templateVersion: 1,
      assetBindings: { before: { mediaId: beforeMediaId }, after: { mediaId: afterMediaId } },
      transitions: [],
      audioRef: null,
    } as unknown as CreationRevisionRecord['document'];
    store.revisions.set(revision.revision.id, { ...revision.revision, document: badDocument });
    await expect(service.listRevisions(actorA, imgCreated.project.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it('closure-3: clean revisions pass validation for both image and video projects', async () => {
    // Image project — clean revision passes.
    const imgCreated = await service.createBeforeAfterImage(actorA, { caseId, sourceMediaId: beforeMediaId });
    await service.createRevision(actorA, imgCreated.project.id, 1);
    await expect(service.listRevisions(actorA, imgCreated.project.id)).resolves.toHaveLength(1);
    // Video project — clean revision passes.
    const vidCreated = await service.createBeforeAfterVideo(actorA, { caseId, beforeMediaId, afterMediaId, idempotencyKey: 'rev-read-004' });
    const vidRevision = await service.createRevision(actorA, vidCreated.project.id, 1);
    await expect(service.listRevisions(actorA, vidCreated.project.id)).resolves.toHaveLength(1);
    await expect(service.getRevision(actorA, vidCreated.project.id, vidRevision.revision.id)).resolves.toBeDefined();
  });
});
