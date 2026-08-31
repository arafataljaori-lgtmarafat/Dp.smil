import { describe, expect, it, vi } from 'vitest';

import { AuthenticationGuard, PUBLIC_ROUTE, authenticatedActor } from '../src/common/authentication.guard.js';

function contextFor(request: { headers: Record<string, string | undefined>; id: string }) {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('AuthenticationGuard', () => {
  it('permits an endpoint only when Public metadata is explicitly true', async () => {
    const authenticateBearer = vi.fn();
    const guard = new AuthenticationGuard({ getAllAndOverride: vi.fn().mockReturnValue(true) } as never, { authenticateBearer } as never);
    await expect(guard.canActivate(contextFor({ headers: {}, id: 'public-request' }))).resolves.toBe(true);
    expect(authenticateBearer).not.toHaveBeenCalled();
  });

  it('default-denies missing, wrong-scheme, and empty bearer credentials', async () => {
    const guard = new AuthenticationGuard({ getAllAndOverride: vi.fn().mockReturnValue(false) } as never, { authenticateBearer: vi.fn() } as never);
    for (const authorization of [undefined, 'Basic abc', 'Bearer   ']) {
      await expect(guard.canActivate(contextFor({ headers: { authorization }, id: 'request-id' }))).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('attaches only the authenticated actor returned by AuthService', async () => {
    const request = { headers: { authorization: 'Bearer opaque-token-value' }, id: 'request-id' };
    const authenticateBearer = vi.fn().mockResolvedValue({ userId: 'user-a', sessionId: 'session-a', requestId: 'request-id' });
    const guard = new AuthenticationGuard({ getAllAndOverride: vi.fn().mockReturnValue(false) } as never, { authenticateBearer } as never);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(authenticateBearer).toHaveBeenCalledWith('opaque-token-value', 'request-id');
    expect(authenticatedActor(request as never)).toEqual({ actorType: 'human', userId: 'user-a', sessionId: 'session-a', requestId: 'request-id' });
  });

  it('uses a metadata key that cannot be implied by ordinary route configuration', () => {
    expect(PUBLIC_ROUTE).toBe('dentpilot:public-route');
  });
});
