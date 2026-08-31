import { QueryClient } from '@tanstack/react-query';

import { createSessionInvalidator } from '../src/auth/auth-provider';

describe('Phase 4 Closure Stage 1 identity cache invalidation', () => {
  it('clears query, session and all patient-derived caches before publishing unauthenticated state', async () => {
    const queryClient = new QueryClient();
    const clearQueries = jest.spyOn(queryClient, 'clear');
    const store = { get: async () => null, set: async () => undefined, clear: jest.fn(async () => undefined) };
    const tokenReference = { current: 'session-token' as string | null };
    const clearCaches = jest.fn(async () => undefined);
    const states: string[] = [];
    const invalidate = createSessionInvalidator({
      queryClient, store, tokenReference, clearPatientDerivedCaches: clearCaches,
      setState: (state) => states.push(state.status),
    });
    await invalidate();
    expect(clearQueries).toHaveBeenCalledTimes(1);
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(clearCaches).toHaveBeenCalledTimes(1);
    expect(states).toEqual(['unauthenticated']);
    expect(tokenReference.current).toBeNull();
  });
});
