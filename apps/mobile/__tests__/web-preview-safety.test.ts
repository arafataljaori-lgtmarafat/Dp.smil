import { createInMemorySessionStore } from '../src/auth/secure-session-store';

describe('Web preview safety', () => {
  const initialApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  afterEach(() => {
    if (initialApiBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = initialApiBaseUrl;
    jest.resetModules();
  });

  it('keeps Web sessions in memory only', async () => {
    const firstPageStore = createInMemorySessionStore();
    await firstPageStore.set('opaque-session-token-value-which-is-long-enough');
    await expect(firstPageStore.get()).resolves.toBe('opaque-session-token-value-which-is-long-enough');

    const simulatedPageReloadStore = createInMemorySessionStore();
    await expect(simulatedPageReloadStore.get()).resolves.toBeNull();
  });

  it('rejects an API operation with a clear configuration error when no public API URL was built in', async () => {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    let request: ((path: string, init: RequestInit, schema: never, options: { readonly protected: boolean }) => Promise<unknown>) | undefined;
    jest.isolateModules(() => {
      request = require('../src/api/api-transport').apiRequest as typeof request;
    });
    global.fetch = jest.fn();

    await expect(request!('/auth/login', { method: 'POST' }, { parse: (value: unknown) => value } as never, { protected: false }))
      .rejects.toMatchObject({ code: 'API_NOT_CONFIGURED' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
