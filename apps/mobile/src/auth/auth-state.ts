import type { AccountDto } from '@dentpilot/contracts';

export type AuthState =
  | { readonly status: 'bootstrapping' }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'authenticated'; readonly account: AccountDto }
  | { readonly status: 'retryable-network-failure' }
  | { readonly status: 'secure-storage-failure' };

export const initialAuthState: AuthState = { status: 'bootstrapping' };
