import { randomUUID } from 'node:crypto';

import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe } from 'vitest';

import { sourceMediaStorageKey } from '@dentpilot/application';

import { S3ObjectStorageAdapter } from '../../src/infrastructure/storage/s3-object-storage.adapter.js';
import { objectStorageContract } from './object-storage.contract.js';

const endpoint = process.env.S3_TEST_ENDPOINT;
const required = process.env.S3_TEST_REQUIRED === 'true';
const s3Endpoint = endpoint ?? 'http://127.0.0.1:9000';
const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID ?? 'minioadmin';
const secretAccessKey = process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'minioadmin';
const bucket = `dentpilot-storage-contract-${randomUUID().replaceAll('-', '')}`;
const contractKey = sourceMediaStorageKey(
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',
  '00000000-0000-4000-8000-000000000030',
);

if (required && endpoint === undefined) {
  throw new Error('S3_TEST_ENDPOINT is required when S3_TEST_REQUIRED=true.');
}

const suite = describe.skipIf(endpoint === undefined);

suite('S3ObjectStorageAdapter against MinIO', () => {
  const admin = new S3Client({
    endpoint: s3Endpoint,
    forcePathStyle: true,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
  });

  beforeAll(async () => {
    try {
      await admin.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await admin.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  });

  afterAll(async () => {
    await admin.send(new DeleteObjectCommand({ Bucket: bucket, Key: contractKey })).catch(() => undefined);
    await admin.send(new DeleteBucketCommand({ Bucket: bucket })).catch(() => undefined);
    admin.destroy();
  });

  objectStorageContract('S3ObjectStorageAdapter (MinIO)', {
    async create() {
      return new S3ObjectStorageAdapter({
        bucket,
        region: 'us-east-1',
        endpoint: s3Endpoint,
        forcePathStyle: true,
        accessKeyId,
        secretAccessKey,
      });
    },
    async dispose() {
      await admin.send(new DeleteObjectCommand({ Bucket: bucket, Key: contractKey })).catch(() => undefined);
    },
  });
});
