import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import type { AuthActionLink } from './auth-links';

type AuthActionIntentContextValue = {
  readonly action: AuthActionLink;
  readonly receive: (action: Exclude<AuthActionLink, null>) => void;
  readonly consume: (kind: Exclude<AuthActionLink, null>['kind']) => string | null;
  readonly clear: () => void;
};

const AuthActionIntentContext = createContext<AuthActionIntentContextValue | null>(null);

export function AuthActionIntentProvider({ children }: PropsWithChildren): React.JSX.Element {
  const [action, setAction] = useState<AuthActionLink>(null);
  const receive = useCallback((nextAction: Exclude<AuthActionLink, null>) => setAction(nextAction), []);
  const consume = useCallback((kind: Exclude<AuthActionLink, null>['kind']): string | null => {
    if (!action || action.kind !== kind) return null;
    const token = action.token;
    setAction(null);
    return token;
  }, [action]);
  const clear = useCallback(() => setAction(null), []);
  const value = useMemo(() => ({ action, receive, consume, clear }), [action, clear, consume, receive]);
  return <AuthActionIntentContext.Provider value={value}>{children}</AuthActionIntentContext.Provider>;
}

export function useAuthActionIntent(): AuthActionIntentContextValue {
  const context = useContext(AuthActionIntentContext);
  if (!context) throw new Error('useAuthActionIntent must be used within AuthActionIntentProvider.');
  return context;
}
