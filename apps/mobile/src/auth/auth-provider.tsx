import type { AccountDto, AuthSessionDto, LoginRequest, RegisterRequest } from '@dentpilot/contracts';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { configureApiTransport, MobileApiError } from '../api/api-transport';
import { clearCompositionExportCache } from '../creation/composition-export';
import { clearPrivateExportSourceCache } from '../creation/protected-export-source';
import { clearPrivatePreviewCache } from '../creation/protected-preview-cache';
import { authApi, type AuthApi } from './auth-api';
import { bootstrapAuthentication } from './auth-bootstrap';
import { initialAuthState, type AuthState } from './auth-state';
import { platformSessionStore, type SecureSessionStore } from './secure-session-store';

type AuthContextValue = {
  readonly state: AuthState;
  readonly account: AccountDto | null;
  readonly signIn: (input: LoginRequest) => Promise<void>;
  readonly register: (input: RegisterRequest) => Promise<{ readonly email: string }>;
  readonly verifyEmail: (token: string) => Promise<void>;
  readonly resendVerification: (email: string) => Promise<void>;
  readonly forgotPassword: (email: string) => Promise<void>;
  readonly resetPassword: (token: string, newPassword: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly signOutAll: () => Promise<void>;
  readonly changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  readonly updateDisplayName: (displayName: string) => Promise<void>;
  readonly listSessions: () => Promise<readonly AuthSessionDto[]>;
  readonly revokeSession: (sessionId: string, currentSession: boolean) => Promise<void>;
  readonly retryBootstrap: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function clearAllPatientDerivedCaches(): Promise<void> {
  clearCompositionExportCache();
  await Promise.all([clearPrivatePreviewCache(), clearPrivateExportSourceCache()]);
}

export function createSessionInvalidator(input: {
  readonly queryClient: QueryClient;
  readonly store: SecureSessionStore;
  readonly tokenReference: { current: string | null };
  readonly setState: (state: AuthState) => void;
  readonly clearPatientDerivedCaches?: () => Promise<void>;
}): () => Promise<void> {
  let inFlight: Promise<void> | null = null;
  return () => {
    if (inFlight) return inFlight;
    if (input.tokenReference.current === null) return Promise.resolve();
    input.tokenReference.current = null;
    input.queryClient.clear();
    const clearCaches = input.clearPatientDerivedCaches ?? clearAllPatientDerivedCaches;
    inFlight = Promise.all([input.store.clear().catch(() => undefined), clearCaches().catch(() => undefined)])
      .then(() => input.setState({ status: 'unauthenticated' }));
    void inFlight.finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function AuthProvider({ children, sessionStore = platformSessionStore, api = authApi }: PropsWithChildren<{ readonly sessionStore?: SecureSessionStore; readonly api?: AuthApi }>): React.JSX.Element {
  const queryClient = useQueryClient();
  const tokenReference = useRef<string | null>(null);
  const invalidatorReference = useRef<(() => Promise<void>) | null>(null);
  const [state, setState] = useState<AuthState>(initialAuthState);
  if (!invalidatorReference.current) {
    invalidatorReference.current = createSessionInvalidator({ queryClient, store: sessionStore, tokenReference, setState, clearPatientDerivedCaches: clearAllPatientDerivedCaches });
  }
  const invalidateSession = useCallback((): Promise<void> => invalidatorReference.current!(), []);

  const runBootstrap = useCallback(async (): Promise<void> => {
    setState({ status: 'bootstrapping' });
    let storedToken: string | null;
    try {
      storedToken = await sessionStore.get();
    } catch {
      tokenReference.current = null;
      queryClient.clear();
      setState({ status: 'secure-storage-failure' });
      return;
    }
    tokenReference.current = storedToken;
    try {
      const result = await bootstrapAuthentication(sessionStore, api);
      if (result.kind === 'authenticated') {
        tokenReference.current = result.token;
        setState({ status: 'authenticated', account: result.account });
        return;
      }
      if (result.kind === 'retryable-network-failure') {
        setState({ status: 'retryable-network-failure' });
        return;
      }
      tokenReference.current = null;
      queryClient.clear();
      setState({ status: 'unauthenticated' });
    } catch {
      tokenReference.current = null;
      queryClient.clear();
      setState({ status: 'secure-storage-failure' });
    }
  }, [api, queryClient, sessionStore]);

  useEffect(() => {
    configureApiTransport({
      readSessionToken: () => tokenReference.current,
      onProtectedAuthenticationFailure: () => {
        void invalidateSession();
      },
    });
    void runBootstrap();
  }, [invalidateSession, runBootstrap]);

  const previewCacheScope = state.status === 'authenticated' ? state.account.id : null;
  useEffect(() => {
    // Every patient-derived temporary namespace is disposable and is cleared on account boundaries.
    void clearAllPatientDerivedCaches();
  }, [previewCacheScope]);

  const signIn = useCallback(async (input: LoginRequest): Promise<void> => {
    const result = await api.login(input);
    try {
      await sessionStore.set(result.token);
    } catch {
      tokenReference.current = result.token;
      try {
        await api.logout();
      } catch {
        // The server cleanup is deliberately best-effort after local storage failure.
      }
      tokenReference.current = null;
      queryClient.clear();
      setState({ status: 'secure-storage-failure' });
      throw new MobileApiError('SECURE_STORAGE_FAILURE', 'The secure session could not be saved.');
    }
    tokenReference.current = result.token;
    try {
      const account = await api.currentAccount();
      setState({ status: 'authenticated', account });
    } catch (error) {
      if (error instanceof MobileApiError && error.code !== 'NETWORK_ERROR') await invalidateSession();
      else setState({ status: 'retryable-network-failure' });
      throw error;
    }
  }, [api, invalidateSession, queryClient, sessionStore]);

  const register = useCallback(async (input: RegisterRequest) => api.register(input), [api]);
  const verifyEmail = useCallback(async (token: string) => api.verifyEmail(token), [api]);
  const resendVerification = useCallback(async (email: string) => api.resendVerification(email), [api]);
  const forgotPassword = useCallback(async (email: string) => api.forgotPassword(email), [api]);

  const resetPassword = useCallback(async (token: string, newPassword: string): Promise<void> => {
    await api.resetPassword(token, newPassword);
    await invalidateSession();
  }, [api, invalidateSession]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch {
      // Local removal is still mandatory when the remote revoke cannot be reached.
    }
    await invalidateSession();
  }, [api, invalidateSession]);

  const signOutAll = useCallback(async (): Promise<void> => {
    try {
      await api.logoutAll();
    } catch {
      // Local removal is still mandatory when the remote revoke cannot be reached.
    }
    await invalidateSession();
  }, [api, invalidateSession]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.changePassword(currentPassword, newPassword);
    await invalidateSession();
  }, [api, invalidateSession]);

  const updateDisplayName = useCallback(async (displayName: string): Promise<void> => {
    const account = await api.updateDisplayName(displayName);
    setState({ status: 'authenticated', account });
  }, [api]);

  const listSessions = useCallback(async () => api.listSessions(), [api]);
  const revokeSession = useCallback(async (sessionId: string, currentSession: boolean): Promise<void> => {
    await api.revokeSession(sessionId);
    if (currentSession) await invalidateSession();
  }, [api, invalidateSession]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    account: state.status === 'authenticated' ? state.account : null,
    signIn,
    register,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    signOut,
    signOutAll,
    changePassword,
    updateDisplayName,
    listSessions,
    revokeSession,
    retryBootstrap: runBootstrap,
  }), [changePassword, forgotPassword, listSessions, register, resendVerification, resetPassword, revokeSession, runBootstrap, signIn, signOut, signOutAll, state, updateDisplayName, verifyEmail]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
