import { describe, expect, it } from 'vitest';

import { IdempotencyConflictError } from '@dentpilot/domain';

import {
  GenerationService,
  type Actor,
  type GenerationJobRecord,
  type GenerationQueueMessage,
  type GenerationVersionRecord,
  type MediaAssetRecord,
  type TransactionPorts,
  type UnitOfWorkPort,
} from '../index.js';

const ownerUserId = '00000000-0000-4000-8000-000000000010';
const actor: Actor = { actorType: 'human', userId: ownerUserId, requestId: 'correlation-request-1' };
const project = { id: '00000000-0000-4000-8000-000000000101', ownerUserId, caseId: '00000000-0000-4000-8000-000000000102', type: 'smile_simulation' as const, sourceMediaId: '00000000-0000-4000-8000-000000000103', createdAt: new Date(), createdById: actor.userId };
const source = { id: project.sourceMediaId, ownerUserId, caseId: project.caseId, kind: 'source' as const, purpose: 'source_photo' as const, mimeType: 'image/png', byteSize: 3, width: 1, height: 1, sha256: 'a'.repeat(64), storageKey: 'users/00000000-0000-4000-8000-000000000010/cases/source', sourceMediaId: null, createdAt: new Date(), createdById: actor.userId };
const systemActor: Actor = { actorType: 'system', systemActorKey: 'generation-worker', ownerUserId, requestId: actor.requestId };

function job(overrides: Partial<GenerationJobRecord> = {}): GenerationJobRecord {
  return {
    id: '00000000-0000-4000-8000-000000000104', ownerUserId, caseId: project.caseId, projectId: project.id, sourceMediaId: source.id,
    idempotencyKey: 'same-key-123', requestFingerprint: 'b'.repeat(64), generationContractVersion: 'smile-simulation-v1', correlationId: actor.requestId,
    providerKey: 'mock-smile-simulation', status: 'queued', createdAt: new Date(), startedAt: null, finishedAt: null, errorCode: null,
    ...overrides,
  };
}

type Options = {
  readonly sourceBytes?: Uint8Array;
  readonly sourceReadFails?: boolean;
  readonly providerFails?: boolean;
  readonly invalidOutput?: boolean;
  readonly generatedWriteFails?: boolean;
  readonly persistenceFails?: boolean;
};

async function* asStream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

function dependencies(storedJob: GenerationJobRecord, options: Options = {}) {
  const queued: GenerationQueueMessage[] = [];
  const audits: string[] = [];
  const deleted: string[] = [];
  const stored: string[] = [];
  const failureCodes: string[] = [];
  const createdVersions: string[] = [];
  let transactionCount = 0;
  const ports: TransactionPorts = {
    cases: {} as never,
    media: {
      findById: async () => source,
      create: async (input: Omit<MediaAssetRecord, 'createdAt'>): Promise<MediaAssetRecord> => {
        if (options.persistenceFails) throw new Error('injected media persistence failure');
        return { ...input, createdAt: new Date() };
      },
    } as never,
    projects: { findById: async () => project } as never,
    creations: {} as never,
    uploadSessions: {} as never,
    generations: {
      createOrFindByIdempotency: async () => ({ job: storedJob, created: false }),
      findById: async () => storedJob,
      claimForProcessing: async () => true,
      createVersion: async (input: GenerationVersionRecord): Promise<GenerationVersionRecord> => {
        createdVersions.push(input.id);
        return input;
      },
      complete: async () => ({ ...storedJob, status: 'succeeded' as const }),
      fail: async (
        _ownerUserId: string,
        _jobId: string,
        _finishedAt: Date,
        code: string,
      ): Promise<GenerationJobRecord> => {
        failureCodes.push(code);
        return { ...storedJob, status: 'failed' as const, errorCode: code };
      },
    } as never,
    audits: { append: async (event: { readonly eventType: string }) => { audits.push(event.eventType); }, listByCase: async () => [] },
    videoExports: {} as any as never,
  };
  const uow: UnitOfWorkPort = {
    ...ports,
    transaction: async (work) => {
      transactionCount += 1;
      return work(ports);
    },
  };
  const output = options.invalidOutput
    ? { bytes: new Uint8Array(), mimeType: 'image/png' as const, width: 1, height: 1, providerVersion: 'test', parameters: {} }
    : { bytes: new Uint8Array([7]), mimeType: 'image/png' as const, width: 1, height: 1, providerVersion: 'test', parameters: {} };
  const service = new GenerationService(
    uow,
    {
      getStream: async () => {
        if (options.sourceReadFails) throw new Error('injected source read failure');
        const bytes = options.sourceBytes ?? new Uint8Array([1, 2, 3]);
        return { contentLength: bytes.byteLength, contentType: 'image/png', etag: null, body: asStream(bytes) };
      },
      putStream: async (input) => {
        if (options.generatedWriteFails) throw new Error('injected generated write failure');
        stored.push(input.key);
        for await (const chunk of input.body) {
          // Consume the stream to model a real storage adapter.
          void chunk;
        }
      },
      head: async () => ({ contentLength: 3, contentType: 'image/png', etag: null }),
      delete: async (key) => { deleted.push(key); },
      probeReadiness: async () => undefined,
    },
    { sha256: async (bytes) => bytes[0] === 9 ? 'c'.repeat(64) : source.sha256 },
    { enqueue: async (message) => { queued.push(message); } },
    { key: 'mock-smile-simulation', generate: async () => { if (options.providerFails) throw new Error('injected provider failure'); return output; } },
    { next: (() => { let index = 105; return () => `00000000-0000-4000-8000-${String(index++).padStart(12, '0')}`; })() },
    { now: () => new Date('2026-08-26T00:00:00.000Z') },
    10 * 1024 * 1024,
  );
  return { service, queued, audits, deleted, stored, failureCodes, createdVersions, transactionCount: () => transactionCount };
}

function message(): GenerationQueueMessage {
  return { schemaVersion: 1, jobId: job().id, ownerUserId, correlationId: actor.requestId };
}

describe('Phase 1.2 generation failure safety', () => {
  it('returns a typed conflict when same idempotency key resolves to a different fingerprint', async () => {
    const { service } = dependencies(job({ requestFingerprint: 'f'.repeat(64) }));
    await expect(service.request(actor, { projectId: project.id, idempotencyKey: 'same-key-123' })).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('refuses a mismatched tenant queue message before claiming a job', async () => {
    const { service } = dependencies(job());
    await expect(service.process({ ...message(), ownerUserId: '00000000-0000-4000-8000-000000000099' }, systemActor)).rejects.toThrow('Generation queue message');
  });

  it.each([
    ['STORAGE_READ_FAILED', { sourceReadFails: true }],
    ['PROVIDER_FAILED', { providerFails: true }],
    ['OUTPUT_INVALID', { invalidOutput: true }],
    ['STORAGE_WRITE_FAILED', { generatedWriteFails: true }],
  ] as const)('classifies %s without false success audit', async (expectedCode, options) => {
    const result = dependencies(job(), options);
    await result.service.process(message(), systemActor);
    expect(result.failureCodes).toEqual([expectedCode]);
    expect(result.audits).toContain('GenerationFailed');
    expect(result.audits).not.toContain('GenerationSucceeded');
  });

  it('cleans generated storage and records PERSISTENCE_FAILED when media/version persistence fails after a provider success', async () => {
    const result = dependencies(job(), { persistenceFails: true });
    await result.service.process(message(), systemActor);
    expect(result.stored).toHaveLength(1);
    expect(result.deleted).toEqual(result.stored);
    expect(result.createdVersions).toHaveLength(0);
    expect(result.failureCodes).toEqual(['PERSISTENCE_FAILED']);
    expect(result.audits).toContain('GenerationFailed');
    expect(result.audits).not.toContain('GenerationSucceeded');
  });

  it('keeps successful generated media, version, audit, and job completion together', async () => {
    const result = dependencies(job());
    await result.service.process(message(), systemActor);
    expect(result.stored).toHaveLength(1);
    expect(result.deleted).toHaveLength(0);
    expect(result.createdVersions).toHaveLength(1);
    expect(result.audits).toContain('GenerationSucceeded');
    expect(result.failureCodes).toHaveLength(0);
  });

  it('fails a tampered source before provider output is written', async () => {
    const result = dependencies(job(), { sourceBytes: new Uint8Array([9]) });
    await result.service.process(message(), systemActor);
    expect(result.failureCodes).toEqual(['SOURCE_INTEGRITY_MISMATCH']);
    expect(result.stored).toHaveLength(0);
    expect(result.audits).not.toContain('GenerationSucceeded');
  });
});
