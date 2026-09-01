import type {
  SmileSimulationProviderInput,
  SmileSimulationProviderOutput,
  SmileSimulationProviderPort,
  ProvenanceParameters,
} from './ports.js';

export interface HttpSmileSimulationProviderConfig {
  readonly endpointUrl: string;
  readonly apiKey?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly providerKey?: string | undefined;
  readonly providerVersion?: string | undefined;
}

export class HttpSmileSimulationProviderError extends Error {
  public constructor(
    message: string,
    public readonly code: 'TIMEOUT' | 'UNAUTHORIZED' | 'INVALID_IMAGE' | 'PROVIDER_ERROR' | 'UNKNOWN',
    public readonly status?: number | undefined,
  ) {
    super(message);
    this.name = 'HttpSmileSimulationProviderError';
  }
}

export class HttpSmileSimulationProvider implements SmileSimulationProviderPort {
  public readonly key: string;
  private readonly endpointUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly providerVersion: string;

  public constructor(config: HttpSmileSimulationProviderConfig) {
    this.key = config.providerKey ?? 'http-smile-simulation';
    this.endpointUrl = config.endpointUrl;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.providerVersion = config.providerVersion ?? 'v1.0.0';
  }

  public async generate(input: SmileSimulationProviderInput): Promise<SmileSimulationProviderOutput> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-ID': input.correlationId,
      'X-Generation-Contract-Version': input.generationContractVersion,
    };

    if (this.apiKey !== undefined) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const payload = {
      sourceMediaId: input.sourceMediaId,
      sourceSha256: input.sourceSha256,
      sourceMimeType: input.sourceMimeType,
      sourceBase64: Buffer.from(input.sourceBytes).toString('base64'),
    };

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new HttpSmileSimulationProviderError('Provider authorization failed', 'UNAUTHORIZED', response.status);
        }
        if (response.status === 400) {
          throw new HttpSmileSimulationProviderError('Invalid image input provided to AI provider', 'INVALID_IMAGE', response.status);
        }
        throw new HttpSmileSimulationProviderError(`AI Provider returned error status ${response.status}`, 'PROVIDER_ERROR', response.status);
      }

      const responseData = (await response.json()) as {
        readonly imageBase64: string;
        readonly width: number;
        readonly height: number;
        readonly parameters?: ProvenanceParameters | undefined;
        readonly providerVersion?: string | undefined;
      };

      if (!responseData.imageBase64 || typeof responseData.width !== 'number' || typeof responseData.height !== 'number') {
        throw new HttpSmileSimulationProviderError('Malformed response from AI provider', 'PROVIDER_ERROR');
      }

      const imageBytes = new Uint8Array(Buffer.from(responseData.imageBase64, 'base64'));

      const parameters: ProvenanceParameters = responseData.parameters ?? {
        endpoint: this.endpointUrl,
        generationContractVersion: input.generationContractVersion,
      };

      return {
        bytes: imageBytes,
        mimeType: 'image/png',
        width: responseData.width,
        height: responseData.height,
        providerVersion: responseData.providerVersion ?? this.providerVersion,
        parameters,
      };
    } catch (error) {
      if (error instanceof HttpSmileSimulationProviderError) {
        throw error;
      }
      if ((error as { name?: string }).name === 'AbortError') {
        throw new HttpSmileSimulationProviderError(`AI Provider request timed out after ${this.timeoutMs}ms`, 'TIMEOUT');
      }
      throw new HttpSmileSimulationProviderError(
        `Failed to communicate with AI provider: ${(error as Error).message}`,
        'UNKNOWN',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
