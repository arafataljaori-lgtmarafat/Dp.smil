import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  collectStreamWithinLimit,
  sourceMediaStorageKey,
  type ObjectStoragePort,
} from '@dentpilot/application';

export interface ObjectStorageContractFactory {
  readonly create: () => Promise<ObjectStoragePort>;
  readonly dispose?: () => Promise<void>;
}

const ownerUserId = '00000000-0000-4000-8000-000000000010';
const caseId = '00000000-0000-4000-8000-000000000020';
const mediaId = '00000000-0000-4000-8000-000000000030';
const key = sourceMediaStorageKey(ownerUserId, caseId, mediaId);
const sourceBytes = new Uint8Array([0, 1, 2, 3, 4, 255]);

async function* chunked(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes.subarray(0, 2);
  yield bytes.subarray(2);
}

export function objectStorageContract(name: string, factory: ObjectStorageContractFactory): void {
  describe(`ObjectStoragePort contract: ${name}`, () => {
    let storage: ObjectStoragePort;

    beforeEach(async () => {
      storage = await factory.create();
      await storage.probeReadiness();
    });

    afterEach(async () => {
      await factory.dispose?.();
    });

    it('stores a stream and exposes safe metadata plus an independently readable body', async () => {
      await storage.putStream({
        key,
        body: chunked(sourceBytes),
        contentType: 'image/png',
        contentLength: sourceBytes.byteLength,
      });

      const head = await storage.head(key);
      expect(head.contentLength).toBe(sourceBytes.byteLength);
      expect(head.contentType).toBe('image/png');
      expect(head).not.toHaveProperty('url');
      expect(head).not.toHaveProperty('storageKey');

      const result = await storage.getStream(key);
      expect(result.contentLength).toBe(sourceBytes.byteLength);
      expect(result.contentType).toBe('image/png');
      expect(result).not.toHaveProperty('url');
      expect(result).not.toHaveProperty('storageKey');
      await expect(collectStreamWithinLimit(result.body, 1024)).resolves.toEqual(sourceBytes);
    });

    it('deletes an object and classifies later reads as not found', async () => {
      await storage.putStream({
        key,
        body: chunked(sourceBytes),
        contentType: 'image/png',
        contentLength: sourceBytes.byteLength,
      });
      await storage.delete(key);
      await expect(storage.head(key)).rejects.toMatchObject({ failureCode: 'STORAGE_OBJECT_NOT_FOUND' });
    });

    it('rejects a path traversal key before any provider operation', async () => {
      await expect(storage.putStream({
        key: '../users/00000000-0000-4000-8000-000000000010/cases/00000000-0000-4000-8000-000000000020/source/00000000-0000-4000-8000-000000000030',
        body: chunked(sourceBytes),
        contentType: 'image/png',
      })).rejects.toMatchObject({ failureCode: 'STORAGE_CONFIGURATION_INVALID' });
    });
  });
}
