import { describe, expect, it } from 'vitest';

import { GenerationService, type Actor, type UnitOfWorkPort } from '../index.js';

const actor: Actor = {
  actorType: 'human',
  userId: '00000000-0000-4000-8000-000000000001',
  requestId: 'test-request',
};

const ids = (() => {
  let sequence = 100;
  return { next: () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}` };
})();
const clock = { now: () => new Date('2026-08-26T12:00:00.000Z') };

describe('Phase 1 application workflows', () => {
  it('enforces idempotent submission for the same project and key', async () => {
    const jobs = new Map<string, { id: string; ownerUserId: string; projectId: string }>();
    const enqueued: string[] = [];
    const project = {
      id: '00000000-0000-4000-8000-000000000201',
      ownerUserId: actor.userId,
      caseId: '00000000-0000-4000-8000-000000000202',
      type: 'smile_simulation' as const,
      sourceMediaId: '00000000-0000-4000-8000-000000000203',
      createdAt: clock.now(),
      createdById: actor.userId,
    };
    const uow = {
      projects: { findById: async () => project },
      media: {
        findById: async () => ({
          id: project.sourceMediaId,
          ownerUserId: actor.userId,
          caseId: project.caseId,
          kind: 'source' as const,
          purpose: 'source_photo' as const,
          mimeType: 'image/png',
          byteSize: 1,
          width: 1,
          height: 1,
          sha256: 'a'.repeat(64),
          storageKey: 'test-source',
          sourceMediaId: null,
          createdAt: clock.now(),
          createdById: actor.userId,
        }),
      },
      transaction: async <T>(work: (ports: unknown) => Promise<T>) =>
        work({
          generations: {
            createOrFindByIdempotency: async (input: { id: string; ownerUserId: string; projectId: string; idempotencyKey: string }) => {
              const existing = jobs.get(input.idempotencyKey);
              if (existing !== undefined) return { job: { ...input, ...existing }, created: false };
              jobs.set(input.idempotencyKey, { id: input.id, ownerUserId: input.ownerUserId, projectId: input.projectId });
              return { job: input, created: true };
            },
          },
          audits: { append: async () => undefined },
        }),
    } as unknown as UnitOfWorkPort;
    const service = new GenerationService(
      uow,
      {} as never,
      { sha256: async () => 'b'.repeat(64) },
      { enqueue: async (message) => { enqueued.push(message.jobId); } },
      { key: 'mock-smile-simulation', generate: async () => { throw new Error('not used'); } },
      ids,
      clock,
      10 * 1024 * 1024,
    );

    const first = await service.request(actor, { projectId: project.id, idempotencyKey: 'same-key-123' });
    const second = await service.request(actor, { projectId: project.id, idempotencyKey: 'same-key-123' });

    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    expect(enqueued).toEqual([first.id]);
  });
});
