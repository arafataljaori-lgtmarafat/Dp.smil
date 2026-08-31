import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type ServerSideEncryption,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import {
  isServerOwnedObjectStorageKey,
  type ObjectStorageHead,
  type ObjectStoragePort,
  type ObjectStoragePutInput,
  type ObjectStorageReadResult,
} from '@dentpilot/application';
import { StorageError, type StorageFailureCode } from '@dentpilot/domain';

export interface S3ObjectStorageOptions {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly forcePathStyle: boolean;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly serverSideEncryption?: ServerSideEncryption;
  readonly sseKmsKeyId?: string;
}

function toStorageError(message: string, fallbackCode: StorageFailureCode, cause: unknown): StorageError {
  if (cause instanceof StorageError) return cause;
  const isMissing = cause instanceof S3ServiceException &&
    (cause.name === 'NoSuchKey' || cause.name === 'NotFound' || cause.$metadata.httpStatusCode === 404);
  const isUnavailable = cause instanceof S3ServiceException &&
    (cause.$metadata.httpStatusCode === 429 || (cause.$metadata.httpStatusCode ?? 0) >= 500);
  return new StorageError(
    message,
    isMissing ? 'STORAGE_OBJECT_NOT_FOUND' : isUnavailable ? 'STORAGE_UNAVAILABLE' : fallbackCode,
    { reason: cause instanceof Error ? cause.name : 'unknown' },
  );
}

function asAsyncIterable(body: unknown): AsyncIterable<Uint8Array> {
  if (body !== null && typeof body === 'object' && Symbol.asyncIterator in body) {
    return body as AsyncIterable<Uint8Array>;
  }
  throw new StorageError('Object storage returned an unsupported response body.', 'STORAGE_READ_FAILED');
}

/**
 * S3-compatible private object storage adapter. Bucket policy, public access block, and
 * encryption-at-rest defaults are infrastructure deployment responsibilities; this adapter
 * never requests public ACLs and never produces object URLs.
 */
export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;

  public constructor(private readonly options: S3ObjectStorageOptions, client?: S3Client) {
    if (options.bucket.trim().length === 0 || options.region.trim().length === 0) {
      throw new StorageError('Object storage configuration is invalid.', 'STORAGE_CONFIGURATION_INVALID');
    }
    const clientConfig: S3ClientConfig = {
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.accessKeyId && options.secretAccessKey
        ? { credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey } }
        : {}),
    };
    this.client = client ?? new S3Client(clientConfig);
  }

  public async putStream(input: ObjectStoragePutInput): Promise<void> {
    this.assertKey(input.key);
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
        Body: Readable.from(input.body),
        ContentType: input.contentType,
        ...(input.contentLength === undefined ? {} : { ContentLength: input.contentLength }),
        ...(this.options.serverSideEncryption === undefined
          ? {}
          : { ServerSideEncryption: this.options.serverSideEncryption }),
        ...(this.options.sseKmsKeyId === undefined ? {} : { SSEKMSKeyId: this.options.sseKmsKeyId }),
      }));
    } catch (cause) {
      throw toStorageError('Object storage write failed.', 'STORAGE_WRITE_FAILED', cause);
    }
  }

  public async getStream(key: string): Promise<ObjectStorageReadResult> {
    this.assertKey(key);
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
        etag: response.ETag ?? null,
        body: asAsyncIterable(response.Body),
      };
    } catch (cause) {
      throw toStorageError('Object storage read failed.', 'STORAGE_READ_FAILED', cause);
    }
  }

  public async head(key: string): Promise<ObjectStorageHead> {
    this.assertKey(key);
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return {
        contentLength: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
        etag: response.ETag ?? null,
      };
    } catch (cause) {
      throw toStorageError('Object storage metadata read failed.', 'STORAGE_READ_FAILED', cause);
    }
  }

  public async delete(key: string): Promise<void> {
    this.assertKey(key);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
    } catch (cause) {
      throw toStorageError('Object storage deletion failed.', 'STORAGE_DELETE_FAILED', cause);
    }
  }

  public async probeReadiness(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.options.bucket }));
    } catch (cause) {
      throw toStorageError('Object storage is unavailable.', 'STORAGE_UNAVAILABLE', cause);
    }
  }

  private assertKey(key: string): void {
    if (!isServerOwnedObjectStorageKey(key)) {
      throw new StorageError('Object storage key did not match the server-generated format.', 'STORAGE_CONFIGURATION_INVALID');
    }
  }
}
