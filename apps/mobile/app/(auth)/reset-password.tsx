import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAuthActionIntent } from '../../src/auth/action-intent';
import { useAuth } from '../../src/auth/auth-provider';
import { toAuthUiError, type AuthUiError } from '../../src/auth/auth-errors';
import { AuthError, AuthField, AuthScreen, AuthSubmit } from '../../src/auth/auth-ui';

export default function ResetPasswordScreen(): React.JSX.Element {
  const { action, consume } = useAuthActionIntent();
  const { resetPassword } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthUiError | null>(null);

  useEffect(() => {
    if (action?.kind !== 'reset-password') return;
    const nextToken = consume('reset-password');
    if (nextToken) setToken(nextToken);
  }, [action, consume]);

  const submit = async () => {
    if (pending || !token) return;
    if (newPassword !== confirmPassword) {
      setError({ message: 'The passwords do not match.' });
      return;
    }
    if (newPassword.length < 12 || newPassword.length > 128) {
      setError({ message: 'Use a password between 12 and 128 characters.' });
      return;
    }
    setPending(true);
    setError(null);
    try {
      await resetPassword(token, newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setToken(null);
      router.replace('/sign-in');
    } catch (nextError) {
      setError(toAuthUiError(nextError));
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return <AuthScreen title="Reset link required" detail="Open the password-reset link from your email to continue."><Pressable accessibilityRole="link" onPress={() => router.replace('/forgot-password')}><Text>Request a new reset email</Text></Pressable></AuthScreen>;
  }
  return (
    <AuthScreen title="Choose a new password" detail="Use 12–128 characters. You will sign in again after resetting it.">
      <AuthField label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="next" />
      <AuthField label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={() => void submit()} />
      <AuthError message={error?.message ?? null} retryAfterSeconds={error?.retryAfterSeconds} />
      <AuthSubmit label="Reset password" pending={pending} onPress={() => void submit()} testID="reset-password-submit" />
    </AuthScreen>
  );
}
