import { createHash, randomUUID } from 'node:crypto';

import { CreationBindingRequiredError, CreationRevisionConflictError, NotFoundError, ValidationError } from '@dentpilot/domain';
import { CreationService, createRenderPlanForDocument } from '@dentpilot/application';
import { canonicalizeCreationDocument } from '@dentpilot/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NodeSha256Adapter } from '../../src/infrastructure/media/media-inspector.adapter.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';

const canRun = process.env.DATABASE_URL !== undefined;
const ownerA = randomUUID();
const ownerB = randomUUID();
const caseA = randomUUID();
const caseAOther = randomUUID();
const caseB = randomUUID();
const mediaA = randomUUID();
const mediaAAfter = randomUUID();
const mediaAAlternate = randomUUID();
const mediaAOtherCase = randomUUID();
const mediaB = randomUUID();
const actorA = { actorType: 'human' as const, userId: ownerA, requestId: `creation-${randomUUID()}` };
const actorB = { actorType: 'human' as const, userId: ownerB, requestId: `creation-${randomUUID()}` };

function documentWithSlots(slotKeys: readonly ('before' | 'after')[], beforeLabel = 'Before', afterLabel = 'After') {
  return {
    schemaVersion: 1 as const,
    templateRef: null,
    canvas: { aspectRatioKey: 'portrait_4_5' as const },
    slotState: Object.fromEntries(slotKeys.map((key) => [key, { panX: 0, panY: 0, scale: 1, rotation: 0 }])) as {
      readonly before?: { readonly panX: number; readonly panY: number; readonly scale: number; readonly rotation: number };
      readonly after?: { readonly panX: number; readonly panY: number; readonly scale: number; readonly rotation: number };
    },
    editableTextState: { beforeLabel, afterLabel },
    styleState: { theme: 'clinical-neutral' as const },
  };
}

describe.skipIf(!canRun)('Phase 4A Creation aggregate PostgreSQL persistence', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const service = new CreationService(
    unitOfWork,
    new NodeSha256Adapter(),
    { next: randomUUID },
    { now: () => new Date() },
    16_384,
  );

  async function newCreation() {
    return service.createBeforeAfterImage(actorA, { caseId: caseA, sourceMediaId: mediaA });
  }

  async function configureBeforeAfter(creationId: string) {
    const current = await service.getCreation(actorA, creationId);
    return service.replaceBindings(actorA, creationId, {
      expectedRevision: current.draft.revision,
      bindings: [
        { bindingKey: 'before', mediaId: mediaA },
        { bindingKey: 'after', mediaId: mediaAAfter },
      ],
    });
  }

  async function configureDocumentWithBothSlots(creationId: string) {
    const current = await service.getCreation(actorA, creationId);
    return service.updateDraft(actorA, creationId, {
      expectedRevision: current.draft.revision,
      document: documentWithSlots(['before', 'after']),
    });
  }

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.createMany({ data: [ownerA, ownerB].map((id) => ({
      id,
      email: `creation-aggregate-${id}@example.invalid`,
      normalizedEmail: `creation-aggregate-${id}@example.invalid`,
      displayName: 'Creation aggregate integration user',
      status: 'active' as const,
    })) });
    await prisma.patientCase.createMany({ data: [
      { id: caseA, ownerUserId: ownerA, displayLabel: 'A', status: 'active', createdById: ownerA },
      { id: caseAOther, ownerUserId: ownerA, displayLabel: 'A other', status: 'active', createdById: ownerA },
      { id: caseB, ownerUserId: ownerB, displayLabel: 'B', status: 'active', createdById: ownerB },
    ] });
    await prisma.mediaAsset.createMany({ data: [
      [mediaA, ownerA, caseA], [mediaAAfter, ownerA, caseA], [mediaAAlternate, ownerA, caseA], [mediaAOtherCase, ownerA, caseAOther], [mediaB, ownerB, caseB],
    ].map(([id, ownerUserId, caseId]) => ({
      id, ownerUserId, caseId, kind: 'source' as const, purpose: 'source_photo' as const,
      mimeType: 'image/png', byteSize: 1, width: 1, height: 1, sha256: 'a'.repeat(64),
      storageKey: `test/creation-aggregate/${id}`, createdById: ownerUserId,
    })) });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('creates one authoritative draft whose initial document-required before binding exists', async () => {
    const created = await newCreation();
    const aggregate = await service.getCreation(actorA, created.project.id);
    expect(aggregate.project.type).toBe('before_after_image');
    expect(aggregate.draft.revision).toBe(1);
    expect(aggregate.bindings).toEqual([{ projectId: created.project.id, ownerUserId: ownerA, caseId: caseA, bindingKey: 'before', mediaId: mediaA }]);
  });

  it('requires the shared draft revision for bindings and preserves owner/case protections', async () => {
    const created = await newCreation();
    await expect(service.replaceBindings(actorB, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'before', mediaId: mediaB }],
    })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.replaceBindings(actorA, created.project.id, {
      expectedRevision: 1,
      bindings: [{ bindingKey: 'after', mediaId: mediaAOtherCase }],
    })).rejects.toBeInstanceOf(ValidationError);
    const updated = await configureBeforeAfter(created.project.id);
    expect(updated.draft.revision).toBe(2);
    expect(updated.bindings.map((binding) => binding.bindingKey).sort()).toEqual(['after', 'before']);
  });

  it('gives exactly one binding-vs-binding CAS winner and no successful audit for the loser', async () => {
    const created = await newCreation();
    const configured = await configureBeforeAfter(created.project.id);
    const beforeAuditCount = await prisma.auditEvent.count({ where: { ownerUserId: ownerA, projectId: created.project.id, eventType: 'CreationBindingChanged' } });
    const expectedRevision = configured.draft.revision;
    const results = await Promise.allSettled([
      service.replaceBindings(actorA, created.project.id, {
        expectedRevision,
        bindings: [{ bindingKey: 'before', mediaId: mediaA }, { bindingKey: 'after', mediaId: mediaAAlternate }],
      }),
      service.replaceBindings(actorA, created.project.id, {
        expectedRevision,
        bindings: [{ bindingKey: 'before', mediaId: mediaA }, { bindingKey: 'after', mediaId: mediaA }],
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(loser?.reason).toBeInstanceOf(CreationRevisionConflictError);
    const aggregate = await service.getCreation(actorA, created.project.id);
    expect(aggregate.draft.revision).toBe(expectedRevision + 1);
    expect(aggregate.bindings).toHaveLength(2);
    expect(await prisma.auditEvent.count({ where: { ownerUserId: ownerA, projectId: created.project.id, eventType: 'CreationBindingChanged' } })).toBe(beforeAuditCount + 1);
  });

  it('gives exactly one draft-vs-binding CAS winner without a lost update', async () => {
    const created = await newCreation();
    const results = await Promise.allSettled([
      service.updateDraft(actorA, created.project.id, {
        expectedRevision: 1,
        document: documentWithSlots(['before'], 'Draft winner candidate'),
      }),
      service.replaceBindings(actorA, created.project.id, {
        expectedRevision: 1,
        bindings: [{ bindingKey: 'before', mediaId: mediaAAlternate }],
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(loser?.reason).toBeInstanceOf(CreationRevisionConflictError);
    const aggregate = await service.getCreation(actorA, created.project.id);
    expect(aggregate.draft.revision).toBe(2);
    expect(aggregate.bindings).toHaveLength(1);
  });

  it('preserves the same invariant when binding and draft race in reverse dispatch order', async () => {
    const created = await newCreation();
    const results = await Promise.allSettled([
      service.replaceBindings(actorA, created.project.id, {
        expectedRevision: 1,
        bindings: [{ bindingKey: 'before', mediaId: mediaAAlternate }],
      }),
      service.updateDraft(actorA, created.project.id, {
        expectedRevision: 1,
        document: documentWithSlots(['before'], 'Reverse draft winner candidate'),
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const loser = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(loser?.reason).toBeInstanceOf(CreationRevisionConflictError);
    expect((await service.getCreation(actorA, created.project.id)).draft.revision).toBe(2);
  });

  it('rejects removal of a document-required binding atomically without revision or binding changes', async () => {
    const created = await newCreation();
    await configureBeforeAfter(created.project.id);
    const savedDraft = await configureDocumentWithBothSlots(created.project.id);
    const before = await service.getCreation(actorA, created.project.id);
    await expect(service.replaceBindings(actorA, created.project.id, {
      expectedRevision: savedDraft.revision,
      bindings: [{ bindingKey: 'before', mediaId: mediaA }],
    })).rejects.toBeInstanceOf(CreationBindingRequiredError);
    const after = await service.getCreation(actorA, created.project.id);
    expect(after.draft.revision).toBe(before.draft.revision);
    expect(after.bindings).toEqual(before.bindings);
  });

  it('allows same-key after rebind to valid same-case media and advances the shared revision', async () => {
    const created = await newCreation();
    await configureBeforeAfter(created.project.id);
    const draft = await configureDocumentWithBothSlots(created.project.id);
    const rebound = await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: draft.revision,
      bindings: [{ bindingKey: 'before', mediaId: mediaA }, { bindingKey: 'after', mediaId: mediaAAlternate }],
    });
    expect(rebound.draft.revision).toBe(draft.revision + 1);
    expect(rebound.bindings.find((binding) => binding.bindingKey === 'after')?.mediaId).toBe(mediaAAlternate);
    expect((await service.getCreation(actorA, created.project.id)).draft.document.slotState.after).toBeDefined();
  });

  it('creates exactly one immutable revision from a valid aggregate and snapshots exactly required bindings', async () => {
    const created = await newCreation();
    await configureBeforeAfter(created.project.id);
    const draft = await configureDocumentWithBothSlots(created.project.id);
    const results = await Promise.allSettled([
      service.createRevision(actorA, created.project.id, draft.revision),
      service.createRevision(actorA, created.project.id, draft.revision),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const winner = results.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof service.createRevision>>> => result.status === 'fulfilled');
    if (winner === undefined) throw new Error('Expected one revision winner.');
    expect(winner.value.revision.documentSha256).toBe(createHash('sha256').update(canonicalizeCreationDocument(winner.value.revision.document)).digest('hex'));
    expect(winner.value.bindings.map((binding) => binding.bindingKey).sort()).toEqual(['after', 'before']);
    await service.replaceBindings(actorA, created.project.id, {
      expectedRevision: draft.revision + 1,
      bindings: [{ bindingKey: 'before', mediaId: mediaA }, { bindingKey: 'after', mediaId: mediaAAlternate }],
    });
    const historical = await service.getRevision(actorA, created.project.id, winner.value.revision.id);
    expect(historical.bindings.find((binding) => binding.bindingKey === 'after')?.mediaId).toBe(mediaAAfter);
    await expect(prisma.creationRevision.update({ where: { id: winner.value.revision.id }, data: { documentSha256: 'b'.repeat(64) } })).rejects.toThrow();
    await expect(service.getRevision(actorB, created.project.id, winner.value.revision.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reproduces an immutable revision against its exact built-in template version', async () => {
    const created = await newCreation();
    await configureBeforeAfter(created.project.id);
    const selectedDocument = {
      ...documentWithSlots(['before', 'after']),
      templateRef: { templateId: 'premium-split', templateVersion: 1 },
      canvas: { aspectRatioKey: 'portrait_4_5' as const },
    };
    const savedDraft = await service.updateDraft(actorA, created.project.id, { expectedRevision: 2, document: selectedDocument });
    const committed = await service.createRevision(actorA, created.project.id, savedDraft.revision);
    const plan = createRenderPlanForDocument({
      document: committed.revision.document,
      bindings: committed.bindings.map((binding) => ({
        bindingKey: binding.bindingKey,
        mediaId: binding.mediaId,
        width: 1,
        height: 1,
        source: `dentpilot-private://${binding.mediaId}`,
      })),
      target: { width: 800, height: 1000 },
    });
    expect(plan.template).toEqual({ id: 'premium-split', version: 1, aspectRatio: 'portrait_4_5' });
    expect(plan.commands.filter((command) => command.type === 'image')).toHaveLength(2);
  });

  it('revalidates aggregate consistency before an immutable revision is committed', async () => {
    const created = await newCreation();
    await configureBeforeAfter(created.project.id);
    const draft = await configureDocumentWithBothSlots(created.project.id);
    await prisma.creationAssetBinding.delete({
      where: { projectId_bindingKey: { projectId: created.project.id, bindingKey: 'after' } },
    });
    await expect(service.createRevision(actorA, created.project.id, draft.revision)).rejects.toBeInstanceOf(CreationBindingRequiredError);
    expect((await prisma.creationDraft.findUniqueOrThrow({ where: { projectId: created.project.id } })).revision).toBe(draft.revision);
    expect(await prisma.creationRevision.count({ where: { projectId: created.project.id } })).toBe(0);
  });

  it('enforces cross-owner/case graph constraints and binding/revision immutability in PostgreSQL', async () => {
    const created = await newCreation();
    const immutableRevisionId = randomUUID();
    await prisma.creationRevision.create({
      data: {
        id: immutableRevisionId, ownerUserId: ownerA, caseId: caseA, projectId: created.project.id,
        revisionNumber: 996, documentSchemaVersion: 1, document: documentWithSlots(['before']), documentSha256: 'd'.repeat(64),
      },
    });
    await prisma.creationRevisionAsset.create({
      data: { revisionId: immutableRevisionId, ownerUserId: ownerA, caseId: caseA, projectId: created.project.id, bindingKey: 'before', mediaId: mediaA },
    });
    await expect(prisma.creationAssetBinding.create({
      data: { projectId: created.project.id, ownerUserId: ownerA, caseId: caseA, bindingKey: 'unexpected', mediaId: mediaA },
    })).rejects.toThrow();
    await expect(prisma.creationAssetBinding.create({
      data: { projectId: created.project.id, ownerUserId: ownerA, caseId: caseA, bindingKey: 'after', mediaId: mediaAOtherCase },
    })).rejects.toThrow();
    await expect(prisma.creationAssetBinding.create({
      data: { projectId: created.project.id, ownerUserId: ownerB, caseId: caseB, bindingKey: 'after', mediaId: mediaB },
    })).rejects.toThrow();
    await expect(prisma.creationRevision.create({
      data: { id: randomUUID(), ownerUserId: ownerA, caseId: caseA, projectId: created.project.id, revisionNumber: 0, documentSchemaVersion: 1, document: documentWithSlots(['before']), documentSha256: 'c'.repeat(64) },
    })).rejects.toThrow();
    await expect(prisma.creationRevision.update({ where: { id: immutableRevisionId }, data: { documentSha256: 'e'.repeat(64) } })).rejects.toThrow();
    await expect(prisma.creationRevisionAsset.delete({
      where: { revisionId_bindingKey: { revisionId: immutableRevisionId, bindingKey: 'before' } },
    })).rejects.toThrow();
  });
});
