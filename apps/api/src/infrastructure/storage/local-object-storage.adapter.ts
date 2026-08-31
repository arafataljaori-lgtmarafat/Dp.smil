import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { StorageError, type StorageFailureCode } from '@dentpilot/domain';
import {
  isServerOwnedObjectStorageKey,
  type ObjectStorageHead,
  type ObjectStoragePort,
  type ObjectStoragePutInput,
  type ObjectStorageReadResult,
} from '@dentpilot/application';

interface LocalObjectMetadata {
  readonly contentType: string;
}

function isNotFound(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}

function isAlreadyExists(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'EEXIST';
}

function storageFailure(message: string, failureCode: StorageFailureCode, cause: unknown): StorageError {
  return new StorageError(message, failureCode, {
    reason: cause instanceof Error ? cause.name : 'unknown',
  });
}

export class LocalObjectStorageAdapter implements ObjectStoragePort {
  private readonly root: string;

  public constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  public async putStream(input: ObjectStoragePutInput): Promise<void> {
    const absolutePath = this.resolveKey(input.key);
    const metadataPath = this.metadataPath(absolutePath);
    try {
      await mkdir(resolve(absolutePath, '..'), { recursive: true });
      await pipeline(Readable.from(input.body), createWriteStream(absolutePath, { flags: 'wx' }));
      await writeFile(metadataPath, JSON.stringify({ contentType: input.contentType } satisfies LocalObjectMetadata), {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (cause) {
      if (!isAlreadyExists(cause)) {
        await Promise.all([rm(absolutePath, { force: true }), rm(metadataPath, { force: true })]);
      }
      throw storageFailure('Object storage write failed.', 'STORAGE_WRITE_FAILED', cause);
    }
  }

  public async getStream(key: string): Promise<ObjectStorageReadResult> {
    const absolutePath = this.resolveKey(key);
    try {
      const objectStat = await stat(absolutePath);
      if (!objectStat.isFile()) {
        throw new Error('Stored object is not a regular file.');
      }
      const metadata = await this.readMetadata(absolutePath);
      return {
        contentLength: objectStat.size,
        contentType: metadata?.contentType ?? null,
        etag: null,
        body: createReadStream(absolutePath),
      };
    } catch (cause) {
      if (isNotFound(cause)) {
        throw storageFailure('Object storage object was not found.', 'STORAGE_OBJECT_NOT_FOUND', cause);
      }
      throw storageFailure('Object storage read failed.', 'STORAGE_READ_FAILED', cause);
    }
  }

  public async head(key: string): Promise<ObjectStorageHead> {
    const absolutePath = this.resolveKey(key);
    try {
      const objectStat = await stat(absolutePath);
      if (!objectStat.isFile()) {
        throw new Error('Stored object is not a regular file.');
      }
      const metadata = await this.readMetadata(absolutePath);
      return {
        contentLength: objectStat.size,
        contentType: metadata?.contentType ?? null,
        etag: null,
      };
    } catch (cause) {
      if (isNotFound(cause)) {
        throw storageFailure('Object storage object was not found.', 'STORAGE_OBJECT_NOT_FOUND', cause);
      }
      throw storageFailure('Object storage read failed.', 'STORAGE_READ_FAILED', cause);
    }
  }

  public async delete(key: string): Promise<void> {
    const absolutePath = this.resolveKey(key);
    try {
      await Promise.all([rm(absolutePath, { force: true }), rm(this.metadataPath(absolutePath), { force: true })]);
    } catch (cause) {
      throw storageFailure('Object storage deletion failed.', 'STORAGE_DELETE_FAILED', cause);
    }
  }

  public async probeReadiness(): Promise<void> {
    try {
      await mkdir(this.root, { recursive: true });
      await access(this.root);
    } catch (cause) {
      throw storageFailure('Local object storage is unavailable.', 'STORAGE_UNAVAILABLE', cause);
    }
  }

  private resolveKey(key: string): string {
    if (!isServerOwnedObjectStorageKey(key)) {
      throw new StorageError('Object storage key did not match the server-generated format.', 'STORAGE_CONFIGURATION_INVALID');
    }
    const absolutePath = resolve(this.root, key);
    if (!absolutePath.startsWith(`${this.root}${sep}`)) {
      throw new StorageError('Object storage key attempted to escape the storage root.', 'STORAGE_CONFIGURATION_INVALID');
    }
    return absolutePath;
  }

  private metadataPath(absolutePath: string): string {
    return `${absolutePath}.metadata.json`;
  }

  private async readMetadata(absolutePath: string): Promise<LocalObjectMetadata | null> {
    try {
      const parsed = JSON.parse(await readFile(this.metadataPath(absolutePath), 'utf8')) as Partial<LocalObjectMetadata>;
      return typeof parsed.contentType === 'string' ? { contentType: parsed.contentType } : null;
    } catch (cause) {
      if (isNotFound(cause)) return null;
      throw cause;
    }
  }
}
