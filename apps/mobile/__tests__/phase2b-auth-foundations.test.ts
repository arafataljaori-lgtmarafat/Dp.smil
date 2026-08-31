import { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-linking', () => ({
  parse: (url: string) => {
    const normalized = url.replace(/^dentpilot:\/\//u, 'https://dentpilot.local/');
    const parsed = new URL(normalized);
    return { path: parsed.pathname.replace(/^\//u, ''), queryParams: Object.fromEntries(parsed.searchParams.entries()) };
  },
}));

import { MobileApiError, apiRequest, configureApiTransport } from '../src/api/api-transport';
import { bootstrapAuthentication } from '../src/auth/auth-bootstrap';
import { parseAuthActionLink } from '../src/auth/auth-links';
import { createSessionInvalidator } from '../src/auth/auth-provider';
import type { SecureSessionStore } from '../src/auth/secure-session-store';

const account = { id: '00000000-0000-4000-8000-000000000001', email: 'user@example.invalid', displayName: 'User', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z' };

function storeWith(token: string | null): jest.Mocked<SecureSessionStore> {
  return { get: jest.fn().mockResolvedValue(token), set: jest.fn().mockResolvedValue(undefined), clear: jest.fn().mockResolvedValue(undefined) };
}

describe('Phase 2B authentication foundations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bootstraps no token as unauthenticated', async () => {
    const store = storeWith(null);
    const api = { currentAccount: jest.fn() };
    await expect(bootstrapAuthentication(store, api as never)).resolves.toEqual({ kind: 'unauthenticated' });
    expect(api.currentAccount).not.toHaveBeenCalled();
  });

  it('retains a valid stored token only after account validation succeeds', async () => {
    const store = storeWith('opaque-session-token-value-which-is-long-enough');
    const api = { currentAccount: jest.fn().mockResolvedValue(account) };
    await expect(bootstrapAuthentication(store, api as never)).resolves.toEqual({ kind: 'authenticated', token: 'opaque-session-token-value-which-is-long-enough', account });
    expect(store.clear).not.toHaveBeenCalled();
  });

  it('clears an invalid stored token but preserves it during a temporary network failure', async () => {
    const invalidStore = storeWith('opaque-session-token-value-which-is-long-enough');
    await expect(bootstrapAuthentication(invalidStore, { currentAccount: jest.fn().mockRejectedValue(new MobileApiError('SESSION_REVOKED', 'safe')) } as never)).resolves.toEqual({ kind: 'unauthenticated' });
    expect(invalidStore.clear).toHaveBeenCalledTimes(1);

    const networkStore = storeWith('opaque-session-token-value-which-is-long-enough');
    await expect(bootstrapAuthentication(networkStore, { currentAccount: jest.fn().mockRejectedValue(new MobileApiError('NETWORK_ERROR', 'safe')) } as never)).resolves.toEqual({ kind: 'retryable-network-failure' });
    expect(networkStore.clear).not.toHaveBeenCalled();
  });

  it('performs one cache and storage invalidation for concurrent session-invalid flows', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['cases'], [{ id: 'user-a-case' }]);
    const clearSpy = jest.spyOn(queryClient, 'clear');
    let resolveClear: (() => void) | undefined;
    const store: SecureSessionStore = { get: jest.fn(), set: jest.fn(), clear: jest.fn().mockImplementation(() => new Promise<void>((resolve) => { resolveClear = resolve; })) };
    const tokenReference = { current: 'opaque-session-token-value-which-is-long-enough' };
    const setState = jest.fn();
    const invalidate = createSessionInvalidator({ queryClient, store, tokenReference, setState });
    const attempts = [invalidate(), invalidate(), invalidate(), invalidate(), invalidate()];
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(tokenReference.current).toBeNull();
    resolveClear?.();
    await Promise.all(attempts);
    expect(queryClient.getQueryData(['cases'])).toBeUndefined();
    queryClient.setQueryData(['cases'], [{ id: 'user-b-case' }]);
    expect(queryClient.getQueryData(['cases'])).toEqual([{ id: 'user-b-case' }]);
    expect(JSON.stringify(queryClient.getQueryData(['cases']))).not.toContain('user-a-case');
    expect(setState).toHaveBeenCalledWith({ status: 'unauthenticated' });
  });

  it('routes protected 401 responses through the centralized invalidation callback', async () => {
    const onProtectedAuthenticationFailure = jest.fn();
    configureApiTransport({ readSessionToken: () => 'opaque-session-token-value-which-is-long-enough', onProtectedAuthenticationFailure });
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'SESSION_REVOKED', message: 'safe', requestId: 'request-id' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => apiRequest('/cases', { method: 'GET' }, z.unknown(), { protected: true })));
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(onProtectedAuthenticationFailure).toHaveBeenCalledTimes(5);
  });

  it('treats concurrent disabled-account failures as one centralized session invalidation', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['cases'], [{ id: 'protected-case' }]);
    const store = storeWith('opaque-session-token-value-which-is-long-enough');
    const tokenReference = { current: 'opaque-session-token-value-which-is-long-enough' };
    const setState = jest.fn();
    const invalidate = createSessionInvalidator({ queryClient, store, tokenReference, setState });
    configureApiTransport({
      readSessionToken: () => tokenReference.current,
      onProtectedAuthenticationFailure: () => { void invalidate(); },
    });
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'ACCOUNT_DISABLED', message: 'safe', requestId: 'request-id' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => apiRequest('/cases', { method: 'GET' }, z.unknown(), { protected: true })));
    await invalidate();
    expect(results.every((result) => result.status === 'rejected')).toBe(true);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['cases'])).toBeUndefined();
    expect(tokenReference.current).toBeNull();
    expect(setState).toHaveBeenCalledWith({ status: 'unauthenticated' });
  });

  it('parses only valid immediate verify/reset action links without retaining the URL', () => {
    expect(parseAuthActionLink('dentpilot://auth/action?purpose=verify_email&token=abcdefghijklmnopqrstuvwxyzABCDEF012345')).toEqual({ kind: 'verify-email', token: 'abcdefghijklmnopqrstuvwxyzABCDEF012345' });
    expect(parseAuthActionLink('dentpilot://auth/action?purpose=reset_password&token=abcdefghijklmnopqrstuvwxyzABCDEF012345')).toEqual({ kind: 'reset-password', token: 'abcdefghijklmnopqrstuvwxyzABCDEF012345' });
    expect(parseAuthActionLink('dentpilot://auth/action?purpose=verify_email&token=short')).toBeNull();
    expect(parseAuthActionLink('dentpilot://auth/action?purpose=unknown&token=abcdefghijklmnopqrstuvwxyzABCDEF012345')).toBeNull();
  });
});
