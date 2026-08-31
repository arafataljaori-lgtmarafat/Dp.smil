import { apiErrorSchema } from '@dentpilot/contracts';
import { z } from 'zod';

import { mobileEnvironment } from '../config/environment';

export class MobileApiError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'MobileApiError';
  }
}

type TransportHandlers = {
  readonly readSessionToken: () => string | null;
  readonly onProtectedAuthenticationFailure: () => void;
};

let handlers: TransportHandlers = {
  readSessionToken: () => null,
  onProtectedAuthenticationFailure: () => undefined,
};

export function configureApiTransport(nextHandlers: TransportHandlers): void {
  handlers = nextHandlers;
}

export function isApiConfigured(): boolean {
  return mobileEnvironment.apiConfigured;
}

export function resolveApiUrl(relativePath: string): string {
  const baseUrl = mobileEnvironment.apiBaseUrl;
  if (baseUrl === null) throw new MobileApiError('API_NOT_CONFIGURED', 'The DentPilot API address is not configured.');
  if (relativePath.startsWith('/api/v1/')) {
    return `${baseUrl.replace(/\/api\/v1$/, '')}${relativePath}`;
  }
  return `${baseUrl}${relativePath}`;
}

export type MobileMediaSource = { readonly uri: string; readonly headers: Readonly<Record<string, string>> };

export function authenticatedMediaSource(relativePath: string): MobileMediaSource {
  const token = handlers.readSessionToken();
  if (!token) throw new MobileApiError('UNAUTHENTICATED', 'A session is required.');
  return { uri: resolveApiUrl(relativePath), headers: { Authorization: `Bearer ${token}` } };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  options: { readonly protected: boolean },
): Promise<T> {
  const headers = new Headers(init.headers);
  if (options.protected) {
    const token = handlers.readSessionToken();
    if (!token) throw new MobileApiError('UNAUTHENTICATED', 'A session is required.');
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = resolveApiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new MobileApiError('NETWORK_ERROR', 'Could not reach the DentPilot service. Please retry.');
  }

  const retryAfterHeader = response.headers.get('Retry-After');
  const retryAfterSeconds = retryAfterHeader === null ? undefined : Number.parseInt(retryAfterHeader, 10);
  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => null);
  if (!response.ok) {
    if (options.protected && response.status === 401) handlers.onProtectedAuthenticationFailure();
    const parsed = apiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new MobileApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.requestId,
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined,
      );
    }
    throw new MobileApiError('NETWORK_ERROR', 'The service returned an unexpected response. Please retry.');
  }
  return schema.parse(payload);
}

export async function apiRequestVoid(
  path: string,
  init: RequestInit,
  options: { readonly protected: boolean },
): Promise<void> {
  await apiRequest(path, init, z.undefined(), options);
}
