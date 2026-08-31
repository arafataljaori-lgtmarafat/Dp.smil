import { describe, expect, it } from 'vitest';

import {
  caseIdParamsSchema,
  generationJobIdParamsSchema,
  idempotencyKeySchema,
  mediaIdParamsSchema,
  mediaUploadIdParamsSchema,
  mediaUploadSessionSchema,
  projectIdParamsSchema,
} from '../index.js';

const validUuid = '00000000-0000-4000-8000-000000000001';

describe('Phase 1.1 API boundary contracts', () => {
  it.each([
    ['caseId', caseIdParamsSchema],
    ['mediaId', mediaIdParamsSchema],
    ['projectId', projectIdParamsSchema],
    ['generationJobId', generationJobIdParamsSchema],
    ['uploadId', mediaUploadIdParamsSchema],
  ])('rejects malformed %s before persistence', (_name, schema) => {
    for (const invalid of ['abc', '../', '', 'x'.repeat(512)]) {
      expect(() => schema.parse({ [String(_name)]: invalid })).toThrow();
    }
    expect(schema.parse({ [String(_name)]: validUuid })).toBeTruthy();
  });

  it('accepts only the safe public projection of a media upload session', () => {
    expect(mediaUploadSessionSchema.parse({
      uploadId: validUuid,
      status: 'created',
      expiresAt: '2026-08-27T01:00:00.000Z',
      mediaId: null,
    })).toMatchObject({ uploadId: validUuid, status: 'created', mediaId: null });
    expect(() => mediaUploadSessionSchema.parse({
      uploadId: validUuid,
      status: 'processing',
      expiresAt: '2026-08-27T01:00:00.000Z',
      mediaId: null,
      processingToken: 'must-not-leak',
    })).toThrow();
  });

  it('requires a visible bounded Idempotency-Key without whitespace or control characters', () => {
    for (const invalid of [undefined, '', 'short', 'contains space', `bad\u0000key`, 'x'.repeat(161)]) {
      expect(() => idempotencyKeySchema.parse(invalid)).toThrow();
    }
    expect(idempotencyKeySchema.parse('retry-key-123')).toBe('retry-key-123');
  });
});
