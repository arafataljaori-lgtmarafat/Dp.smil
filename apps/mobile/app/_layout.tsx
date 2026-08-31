import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, Stack, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthActionIntentProvider, useAuthActionIntent } from '../src/auth/action-intent';
import { parseAuthActionLink } from '../src/auth/auth-links';
import { AuthProvider, useAuth } from '../src/auth/auth-provider';
import { ErrorState, LoadingState, Screen } from '../src/components/ui';

function AuthNavigationGate(): React.JSX.Element {
  const { state, retryBootstrap } = useAuth();
  const segments = useSegments();
  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    if (state.status === 'authenticated' && inAuthGroup) router.replace('/');
    if (state.status === 'unauthenticated' && !inAuthGroup) router.replace('/sign-in');
  }, [inAuthGroup, state.status]);

  if (state.status === 'bootstrapping') return <LoadingState label="Securing your session…" />;
  if (state.status === 'retryable-network-failure') {
    return <ErrorState title="Connection unavailable" detail="Your saved session remains protected. Retry when the service is reachable." onRetry={() => void retryBootstrap()} />;
  }
  if (state.status === 'secure-storage-failure') {
    return <ErrorState title="Secure session unavailable" detail="This device could not safely store your session. Retry after resolving secure storage access." onRetry={() => void retryBootstrap()} />;
  }

  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#F8F7F3' }, headerTintColor: '#1C2A30' }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="cases/index" options={{ title: 'Cases' }} />
      <Stack.Screen name="cases/new" options={{ title: 'Create case' }} />
      <Stack.Screen name="cases/[caseId]" options={{ title: 'Case workspace' }} />
      <Stack.Screen name="results/[generationJobId]" options={{ title: 'Mock result' }} />
      <Stack.Screen name="creations/[creationId]" options={{ title: 'Creation editor' }} />
      <Stack.Screen name="creations/[creationId]/templates" options={{ title: 'Templates' }} />
      <Stack.Screen name="creations/[creationId]/history" options={{ title: 'Saved versions' }} />
      <Stack.Screen name="creations/[creationId]/history/[revisionId]" options={{ title: 'Saved version' }} />
      <Stack.Screen name="creations/[creationId]/export" options={{ title: 'Export composition' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
    </Stack>
  );
}

function DeepLinkListener(): null {
  const { receive } = useAuthActionIntent();
  useEffect(() => {
    const handle = (url: string) => {
      const action = parseAuthActionLink(url);
      if (!action) return;
      receive(action);
      router.replace('/action');
    };
    void Linking.getInitialURL().then((url) => {
      if (url) handle(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => subscription.remove();
  }, [receive]);
  return null;
}

export default function RootLayout(): React.JSX.Element {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 5_000 }, mutations: { retry: 0 } } }));
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthActionIntentProvider>
              <DeepLinkListener />
              <Screen><AuthNavigationGate /></Screen>
            </AuthActionIntentProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
