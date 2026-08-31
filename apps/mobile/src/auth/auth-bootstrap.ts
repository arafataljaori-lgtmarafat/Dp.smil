import type { AccountDto } from '@dentpilot/contracts';

import { MobileApiError } from '../api/api-transport';
import type { AuthApi } from './auth-api';
import type { SecureSessionStore } from './secure-session-store';

export type BootstrapResult =
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'authenticated'; readonly token: string; readonly account: AccountDto }
  | { readonly kind: 'retryable-network-failure' };

export async function bootstrapAuthentication(
  store: SecureSessionStore,
  api: Pick<AuthApi, 'currentAccount'>,
): Promise<BootstrapResult> {
  const token = await store.get();
  if (!token) return { kind: 'unauthenticated' };
  try {
    const account = await api.currentAccount();
    return { kind: 'authenticated', token, account };
  } catch (error) {
    if (error instanceof MobileApiError && error.code === 'NETWORK_ERROR') return { kind: 'retryable-network-failure' };
    await store.clear();
    return { kind: 'unauthenticated' };
  }
}
