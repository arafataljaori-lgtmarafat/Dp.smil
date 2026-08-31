jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111') }));

import { MobileApiError } from '../src/api/api-transport';
import { createMediaUploadOrchestrator, mediaRecoveryPolicy } from '../src/media/media-upload-orchestrator';
import type { MediaUploadState, NormalizedMediaAsset } from '../src/media/media-upload-state';

const asset: NormalizedMediaAsset = { uri: 'file:///patient-image.png', fileName: 'patient-image.png', mimeType: 'image/png', width: 1, height: 1 };
const session = (status: 'created' | 'processing' | 'committed' | 'failed' | 'expired', mediaId: string | null = null) => ({ uploadId: '22222222-2222-4222-8222-222222222222', status, expiresAt: '2026-12-01T00:00:00.000Z', mediaId });

function setup(overrides: Partial<{ createUploadSession: jest.Mock; uploadContent: jest.Mock; getUploadStatus: jest.Mock }> = {}) {
  const states: MediaUploadState[] = [];
  const onCommitted = jest.fn().mockResolvedValue(undefined);
  const api = {
    createUploadSession: overrides.createUploadSession ?? jest.fn().mockResolvedValue(session('created')),
    uploadContent: overrides.uploadContent ?? jest.fn().mockResolvedValue(session('committed', '33333333-3333-4333-8333-333333333333')),
    getUploadStatus: overrides.getUploadStatus ?? jest.fn(),
  };
  const orchestrator = createMediaUploadOrchestrator({
    api,
    onState: (next) => states.push(next),
    onCommitted,
    newIdempotencyKey: () => '11111111-1111-4111-8111-111111111111',
    wait: async () => undefined,
    now: () => 0,
  });
  return { api, states, onCommitted, orchestrator };
}

describe('Phase 3C media upload orchestrator', () => {
  it('retries uncertain create-session exactly once with the same cryptographic idempotency key', async () => {
    const createUploadSession = jest.fn().mockRejectedValueOnce(new MobileApiError('NETWORK_ERROR', 'offline')).mockResolvedValueOnce(session('created'));
    const { api, orchestrator } = setup({ createUploadSession });
    await orchestrator.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.createUploadSession).toHaveBeenCalledTimes(2);
    expect(api.createUploadSession.mock.calls.map((call) => call[1])).toEqual(['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111']);
    expect(api.uploadContent).toHaveBeenCalledTimes(1);
  });

  it('stops permanent content failures while status remains created at the finite central retry budget', async () => {
    const { api, states, orchestrator } = setup({
      uploadContent: jest.fn().mockRejectedValue(new MobileApiError('NETWORK_ERROR', 'offline')),
      getUploadStatus: jest.fn().mockResolvedValue(session('created')),
    });
    await orchestrator.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.uploadContent).toHaveBeenCalledTimes(mediaRecoveryPolicy.maxContentUploadAttempts);
    expect(api.uploadContent.mock.calls.map((call) => call[0])).toEqual(Array(mediaRecoveryPolicy.maxContentUploadAttempts).fill('22222222-2222-4222-8222-222222222222'));
    expect(api.createUploadSession).toHaveBeenCalledTimes(1);
    expect(orchestrator.isActive()).toBe(false);
    expect(states.at(-1)).toMatchObject({
      phase: 'failed',
      uploadId: '22222222-2222-4222-8222-222222222222',
      failure: { code: 'CONTENT_RETRY_BUDGET_EXHAUSTED', retry: 'new-session' },
    });
  });

  it('does not duplicate content or session when the success response is lost after server commit', async () => {
    const { api, states, onCommitted, orchestrator } = setup({
      uploadContent: jest.fn().mockRejectedValue(new MobileApiError('NETWORK_ERROR', 'response lost')),
      getUploadStatus: jest.fn().mockResolvedValue(session('committed', '33333333-3333-4333-8333-333333333333')),
    });
    await orchestrator.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.createUploadSession).toHaveBeenCalledTimes(1);
    expect(api.uploadContent).toHaveBeenCalledTimes(1);
    expect(api.getUploadStatus).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
    expect(states.at(-1)).toEqual({ phase: 'committed', mediaId: '33333333-3333-4333-8333-333333333333' });
    expect(onCommitted).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  });

  it('retries content on the same upload id only when durable status is created', async () => {
    const { api, orchestrator } = setup({
      uploadContent: jest.fn().mockRejectedValueOnce(new MobileApiError('NETWORK_ERROR', 'response lost')).mockResolvedValueOnce(session('committed', '33333333-3333-4333-8333-333333333333')),
      getUploadStatus: jest.fn().mockResolvedValue(session('created')),
    });
    await orchestrator.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.uploadContent).toHaveBeenCalledTimes(2);
    expect(api.uploadContent.mock.calls.map((call) => call[0])).toEqual(['22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222']);
    expect(api.createUploadSession).toHaveBeenCalledTimes(1);
  });

  it('switches UPLOAD_IN_PROGRESS to bounded status recovery instead of immediate content resend', async () => {
    const { api, states } = setup({
      uploadContent: jest.fn().mockRejectedValue(new MobileApiError('UPLOAD_IN_PROGRESS', 'already claimed')),
      getUploadStatus: jest.fn().mockResolvedValue(session('committed', '33333333-3333-4333-8333-333333333333')),
    });
    let clock = 0;
    const bounded = createMediaUploadOrchestrator({
      api,
      onState: (next) => states.push(next),
      onCommitted: async () => undefined,
      newIdempotencyKey: () => '11111111-1111-4111-8111-111111111111',
      now: () => clock,
      wait: async () => { clock += mediaRecoveryPolicy.initialDelayMs; },
    });
    await bounded.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.uploadContent).toHaveBeenCalledTimes(1);
    expect(api.createUploadSession).toHaveBeenCalledTimes(1);
    expect(states.some((item) => item.phase === 'server-processing')).toBe(true);
    expect(states.at(-1)).toEqual({ phase: 'committed', mediaId: '33333333-3333-4333-8333-333333333333' });
  });

  it('polls processing status with the bounded recovery path and accepts the one committed media id', async () => {
    const { api, states, orchestrator } = setup({
      uploadContent: jest.fn().mockResolvedValue(session('processing')),
      getUploadStatus: jest.fn().mockResolvedValueOnce(session('processing')).mockResolvedValueOnce(session('committed', '33333333-3333-4333-8333-333333333333')),
    });
    let clock = 0;
    const bounded = createMediaUploadOrchestrator({
      api,
      onState: (next) => states.push(next),
      onCommitted: async () => undefined,
      newIdempotencyKey: () => '11111111-1111-4111-8111-111111111111',
      now: () => clock,
      wait: async () => { clock += 250; },
    });
    await bounded.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.getUploadStatus).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ phase: 'committed', mediaId: '33333333-3333-4333-8333-333333333333' });
  });

  it.each(['failed', 'expired'] as const)('requires an explicit new session after durable status %s', async (status) => {
    const { api, states, orchestrator } = setup({ uploadContent: jest.fn().mockResolvedValue(session(status)) });
    await orchestrator.start('44444444-4444-4444-8444-444444444444', asset);
    expect(api.uploadContent).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ phase: 'failed', failure: { retry: 'new-session' } });
  });

  it('propagates protected authentication failure for the centralized transport invalidator', async () => {
    const { orchestrator } = setup({ createUploadSession: jest.fn().mockRejectedValue(new MobileApiError('UNAUTHENTICATED', 'session ended')) });
    await expect(orchestrator.start('44444444-4444-4444-8444-444444444444', asset)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});
