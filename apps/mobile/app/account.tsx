import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useAuth } from '../src/auth/auth-provider';
import { toAuthUiError, type AuthUiError } from '../src/auth/auth-errors';
import { AuthError, AuthField, AuthSubmit } from '../src/auth/auth-ui';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../src/components/ui';

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function AccountScreen(): React.JSX.Element {
  const { state, account, updateDisplayName, listSessions, revokeSession, changePassword, signOut, signOutAll } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(account?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<AuthUiError | null>(null);

  useEffect(() => setDisplayName(account?.displayName ?? ''), [account?.displayName]);
  const sessions = useQuery({ queryKey: ['account', 'sessions'], queryFn: listSessions, enabled: state.status === 'authenticated' });
  const updateProfile = useMutation({ mutationFn: () => updateDisplayName(displayName.trim()), onSuccess: () => setError(null), onError: (nextError) => setError(toAuthUiError(nextError)) });
  const change = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error('PASSWORD_CONFIRMATION_MISMATCH');
      await changePassword(currentPassword, newPassword);
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (nextError) => setError(nextError instanceof Error && nextError.message === 'PASSWORD_CONFIRMATION_MISMATCH' ? { message: 'The new passwords do not match.' } : toAuthUiError(nextError)),
  });
  const revoke = useMutation({ mutationFn: async (input: { readonly sessionId: string; readonly currentSession: boolean }) => revokeSession(input.sessionId, input.currentSession), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['account', 'sessions'] }), onError: (nextError) => setError(toAuthUiError(nextError)) });
  const logout = useMutation({ mutationFn: signOut });
  const logoutAll = useMutation({ mutationFn: signOutAll });

  if (state.status !== 'authenticated' || !account) return <LoadingState label="Securing your account…" />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.label}>PERSONAL ACCOUNT</Text>
          <Text style={styles.stateTitle}>{account.email}</Text>
          <Text style={styles.body}>{account.emailVerified ? 'Email verified' : 'Email verification required'}</Text>
          <Text style={styles.muted}>Account created {formatDate(account.createdAt)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>DISPLAY NAME</Text>
          <TextInput accessibilityLabel="Display name" value={displayName} onChangeText={setDisplayName} style={styles.input} textContentType="name" />
          <PrimaryButton label={updateProfile.isPending ? 'Saving…' : 'Save display name'} disabled={updateProfile.isPending || displayName.trim().length === 0} onPress={() => updateProfile.mutate()} />
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>SESSIONS</Text>
          {sessions.isPending ? <LoadingState label="Loading sessions…" /> : null}
          {sessions.isError ? <ErrorState detail="Sessions could not be loaded." onRetry={() => void sessions.refetch()} /> : null}
          {sessions.data?.map((session) => (
            <View key={session.sessionId} style={{ gap: 6, borderTopWidth: 1, borderTopColor: '#D7DDDD', paddingTop: 12 }}>
              <Text style={styles.body}>{session.currentSession ? 'Current session' : 'Other session'}</Text>
              <Text style={styles.muted}>Created {formatDate(session.createdAt)}</Text>
              <Text style={styles.muted}>Last active {formatDate(session.lastSeenAt)}</Text>
              <Text style={styles.muted}>Expires {formatDate(session.expiresAt)}</Text>
              {!session.currentSession ? <Pressable accessibilityRole="button" disabled={revoke.isPending} onPress={() => revoke.mutate({ sessionId: session.sessionId, currentSession: false })}><Text>Revoke this session</Text></Pressable> : null}
            </View>
          ))}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>CHANGE PASSWORD</Text>
          <AuthField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" />
          <AuthField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" />
          <AuthField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />
          <AuthSubmit label="Change password" pending={change.isPending} onPress={() => { setError(null); change.mutate(); }} testID="change-password-submit" />
        </View>
        <AuthError message={error?.message ?? null} retryAfterSeconds={error?.retryAfterSeconds} />
        <PrimaryButton label={logout.isPending ? 'Signing out…' : 'Sign out'} disabled={logout.isPending || logoutAll.isPending} onPress={() => logout.mutate()} testID="logout" />
        <Pressable accessibilityRole="button" disabled={logoutAll.isPending || logout.isPending} onPress={() => logoutAll.mutate()}><Text>Sign out from all sessions</Text></Pressable>
      </ScrollView>
    </Screen>
  );
}
