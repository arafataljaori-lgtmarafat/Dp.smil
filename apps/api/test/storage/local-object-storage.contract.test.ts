import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LocalObjectStorageAdapter } from '../../src/infrastructure/storage/local-object-storage.adapter.js';
import { objectStorageContract } from './object-storage.contract.js';

let storageRoot: string | undefined;

objectStorageContract('LocalObjectStorageAdapter', {
  async create() {
    storageRoot = await mkdtemp(join(tmpdir(), 'dentpilot-local-storage-contract-'));
    return new LocalObjectStorageAdapter(storageRoot);
  },
  async dispose() {
    if (storageRoot !== undefined) await rm(storageRoot, { recursive: true, force: true });
  },
});
