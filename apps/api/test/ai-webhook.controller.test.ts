import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AiWebhookController } from '../src/controllers/ai-webhook.controller.js';
import type { ApplicationServices } from '../src/modules/application-services.js';

describe('AiWebhookController (Phase 6)', () => {
  const mockServices = {} as ApplicationServices;
  const mockConfig = { AI_WEBHOOK_SECRET: 'test-secret-999' } as any;

  const controller = new AiWebhookController(mockServices, mockConfig);

  it('rejects unauthorized requests with wrong secret', async () => {
    await expect(
      controller.handleAiCallback('wrong-secret', {
        generationJobId: 'job-1',
        status: 'completed',
        resultBase64: 'abc',
        width: 100,
        height: 100,
      }),
    ).rejects.toThrowError(UnauthorizedException);
  });

  it('rejects incomplete completed payloads missing image data', async () => {
    await expect(
      controller.handleAiCallback('test-secret-999', {
        generationJobId: 'job-1',
        status: 'completed',
      }),
    ).rejects.toThrowError(BadRequestException);
  });

  it('accepts valid completed webhook payload', async () => {
    const response = await controller.handleAiCallback('test-secret-999', {
      generationJobId: 'job-100',
      status: 'completed',
      resultBase64: 'aW1hZ2UtYnl0ZXM=',
      width: 1200,
      height: 900,
    });

    expect(response).toEqual({
      status: 'acknowledged',
      generationJobId: 'job-100',
    });
  });

  it('accepts failed webhook payload with reason', async () => {
    const response = await controller.handleAiCallback('test-secret-999', {
      generationJobId: 'job-200',
      status: 'failed',
      errorCode: 'MODEL_TIMEOUT',
      errorMessage: 'Inference exceeded limit',
    });

    expect(response).toEqual({
      status: 'failed_acknowledged',
      generationJobId: 'job-200',
    });
  });
});
