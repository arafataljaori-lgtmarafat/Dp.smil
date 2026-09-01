import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HttpSmileSimulationProvider,
  HttpSmileSimulationProviderError,
} from '../http-smile-simulation-provider.js';
import type { SmileSimulationProviderInput } from '../ports.js';

describe('HttpSmileSimulationProvider (Phase 6)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleInput: SmileSimulationProviderInput = {
    sourceBytes: new Uint8Array([1, 2, 3, 4]),
    sourceMimeType: 'image/jpeg',
    sourceSha256: 'abc123sha',
    sourceMediaId: 'media-100',
    generationContractVersion: 'v1',
    correlationId: 'corr-555',
  };

  it('successful generation: parses base64 output, dimensions, and parameters', async () => {
    const fakeOutputBytes = new Uint8Array([10, 20, 30]);
    const fakeBase64 = Buffer.from(fakeOutputBytes).toString('base64');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        imageBase64: fakeBase64,
        width: 1024,
        height: 768,
        providerVersion: 'custom-ai-v2',
        parameters: { toothTone: 'A1' },
      }),
    } as unknown as Response);

    const provider = new HttpSmileSimulationProvider({
      endpointUrl: 'https://ai.dentpilot.com/simulate',
      apiKey: 'secret-key-123',
    });

    const result = await provider.generate(sampleInput);

    expect(result.width).toBe(1024);
    expect(result.height).toBe(768);
    expect(result.mimeType).toBe('image/png');
    expect(result.providerVersion).toBe('custom-ai-v2');
    expect(result.bytes).toEqual(fakeOutputBytes);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://ai.dentpilot.com/simulate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-key-123',
          'X-Correlation-ID': 'corr-555',
        }),
      }),
    );
  });

  it('unauthorized error handling: throws UNAAUTHORIZED code on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response);

    const provider = new HttpSmileSimulationProvider({
      endpointUrl: 'https://ai.dentpilot.com/simulate',
    });

    await expect(provider.generate(sampleInput)).rejects.toThrowError(HttpSmileSimulationProviderError);
    await expect(provider.generate(sampleInput)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      status: 401,
    });
  });

  it('invalid input handling: throws INVALID_IMAGE on 400 status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
    } as unknown as Response);

    const provider = new HttpSmileSimulationProvider({
      endpointUrl: 'https://ai.dentpilot.com/simulate',
    });

    await expect(provider.generate(sampleInput)).rejects.toMatchObject({
      code: 'INVALID_IMAGE',
      status: 400,
    });
  });

  it('malformed response: throws PROVIDER_ERROR when response fields are missing', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        // missing width & height & imageBase64
      }),
    } as unknown as Response);

    const provider = new HttpSmileSimulationProvider({
      endpointUrl: 'https://ai.dentpilot.com/simulate',
    });

    await expect(provider.generate(sampleInput)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });
});
