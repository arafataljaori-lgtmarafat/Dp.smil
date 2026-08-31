import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '../src/auth/auth-provider';
import type { AuthApi } from '../src/auth/auth-api';
import type { SecureSessionStore } from '../src/auth/secure-session-store';

const account = { id: '00000000-0000-4000-8000-000000000001', email: 'user@example.invalid', displayName: 'User', emailVerified: true, createdAt: '2026-01-01T00:00:00.000Z' };

function apiDouble(): jest.Mocked<AuthApi> {
  return {
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
    login: jest.fn(),
    logout: jest.fn(),
    logoutAll: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    currentAccount: jest.fn(),
    updateDisplayName: jest.fn(),
    changePassword: jest.fn(),
    listSessions: jest.fn(),
    revokeSession: jest.fn(),
  } as jest.Mocked<AuthApi>;
}

function Probe({ onReady }: { readonly onReady: (value: ReturnType<typeof useAuth>) => void }): React.JSX.Element {
  const auth = useAuth();
  onReady(auth);
  return <Text testID="auth-state">{auth.state.status}</Text>;
}

describe('Phase 2B AuthProvider storage failure', () => {
  it('attempts remote logout and never enters authenticated state when SecureStore write fails', async () => {
    const api = apiDouble();
    api.login.mockResolvedValue({ token: 'opaque-session-token-value-which-is-long-enough' });
    api.logout.mockResolvedValue(undefined);
    const store: SecureSessionStore = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockRejectedValue(new Error('secure storage unavailable')), clear: jest.fn().mockResolvedValue(undefined) };
    let current: ReturnType<typeof useAuth> | null = null;
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AuthProvider api={api} sessionStore={store}><Probe onReady={(value) => { current = value; }} /></AuthProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('unauthenticated'));
    await act(async () => {
      await expect(current?.signIn({ email: account.email, password: 'password-value-that-is-long-enough' })).rejects.toMatchObject({ code: 'SECURE_STORAGE_FAILURE' });
    });
    await waitFor(() => expect(screen.getByTestId('auth-state').props.children).toBe('secure-storage-failure'));
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(store.clear).not.toHaveBeenCalled();
  });
});
