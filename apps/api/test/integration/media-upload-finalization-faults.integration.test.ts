import { randomUUID } from 'node:crypto';

import { MediaUploadSessionService, type Actor } from '@dentpilot/application';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';
import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';

const suite = describe.skipIf(process.env.DATABASE_URL === undefined);

suite('Media upload finalization deterministic PostgreSQL faults', () => {
  const prisma = new PrismaService();
  const unitOfWork = new PrismaUnitOfWork(prisma);
  const ownerUserId = randomUUID();
  const caseId = randomUUID();
  const actor: Actor = { actorType: 'human', userId: ownerUserId, requestId: randomUUID() };
  const service = new MediaUploadSessionService(unitOfWork, { next: () => randomUUID() }, { now: () => new Date() }, 3600);

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.create({ data: { id: ownerUserId, email: `finalization-fault-${ownerUserId}@example.invalid`, normalizedEmail: `finalization-fault-${ownerUserId}@example.invalid`, displayName: 'Finalization fault user', status: 'active' } });
    await prisma.patientCase.create({ data: { id: caseId, ownerUserId, displayLabel: 'Finalization fault case', status: 'active', createdById: ownerUserId } });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { ownerUserId } });
    await prisma.mediaUploadSession.deleteMany({ where: { ownerUserId } });
    await prisma.mediaAsset.deleteMany({ where: { ownerUserId } });
    await prisma.patientCase.delete({ where: { id: caseId } });
    await prisma.user.delete({ where: { id: ownerUserId } });
    await prisma.onModuleDestroy();
  });

  it.each(['media', 'audit', 'commit'] as const)('rolls back MediaAsset and audit persistence when %s persistence fails', async (boundary) => {
    const created = await service.create(actor, { caseId, idempotencyKey: `finalization-fault-${boundary}-${randomUUID()}` });
    const claim = await service.claimForContent(actor, created.session.id);
    if (!claim.claimed || claim.session.targetMediaId === null) throw new Error('Expected processing claim.');
    const faultingUnitOfWork = {
      ...unitOfWork,
      transaction: async (work: (ports: any) => Promise<unknown>) => unitOfWork.transaction(async (ports) => work({
        ...ports,
        media: boundary === 'media' ? { ...ports.media, create: async () => { throw new Error('injected media persistence failure'); } } : ports.media,
        audits: boundary === 'audit' ? { ...ports.audits, append: async () => { throw new Error('injected audit persistence failure'); } } : ports.audits,
        uploadSessions: boundary === 'commit' ? { ...ports.uploadSessions, markCommitted: async () => { throw new Error('injected terminal transition failure'); } } : ports.uploadSessions,
      })),
    };
    const faultingService = new MediaUploadSessionService(faultingUnitOfWork as never, { next: () => randomUUID() }, { now: () => new Date() }, 3600);
    await expect(faultingService.finalizeSource(actor, {
      uploadSession: claim.session, mimeType: 'image/png', byteSize: 67, width: 1, height: 1, sha256: 'a'.repeat(64),
    })).rejects.toThrow(/injected/);
    expect(await prisma.mediaAsset.count({ where: { id: claim.session.targetMediaId } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { ownerUserId, eventType: 'MediaUploaded' } })).toBe(0);
    expect(await unitOfWork.uploadSessions.findById(ownerUserId, created.session.id)).toMatchObject({ status: 'processing', committedMediaId: null });
    await service.failClaimedProcessing(actor, claim.session, 'PERSISTENCE_FAILED');
    expect(await unitOfWork.uploadSessions.findById(ownerUserId, created.session.id)).toMatchObject({ status: 'failed', storageCleanupPending: true });
  });
});
