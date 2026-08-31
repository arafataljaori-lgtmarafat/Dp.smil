import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAuthActionIntent } from '../../src/auth/action-intent';
import { useAuth } from '../../src/auth/auth-provider';
import { toAuthUiError, type AuthUiError } from '../../src/auth/auth-errors';
import { AuthError, AuthScreen, AuthSubmit } from '../../src/auth/auth-ui';

export default function VerifyEmailScreen(): React.JSX.Element {
  const { email } = useLocalSearchParams<{ email?: string }>();
  const { action, consume } = useAuthActionIntent();
  const { verifyEmail, resendVerification } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('Check your email for a verification link.');
  const [error, setError] = useState<AuthUiError | null>(null);

  const completeVerification = async (token: string) => {
    setPending(true);
    setError(null);
    try {
      await verifyEmail(token);
      setMessage('Email verified. You can now sign in.');
    } catch (nextError) {
      setError(toAuthUiError(nextError));
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (action?.kind !== 'verify-email') return;
    const token = consume('verify-email');
    if (token) void completeVerification(token);
  }, [action, consume]);

  const resend = async () => {
    if (pending || !email) return;
    setPending(true);
    setError(null);
    try {
      await resendVerification(email);
      setMessage('If this account is pending verification, a new email has been sent.');
    } catch (nextError) {
      setError(toAuthUiError(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthScreen title="Verify your email" detail="Your account cannot sign in until the server confirms verification.">
      <Text>{message}</Text>
      <AuthError message={error?.message ?? null} retryAfterSeconds={error?.retryAfterSeconds} />
      {email ? <AuthSubmit label="Resend verification email" pending={pending} onPress={() => void resend()} testID="resend-verification" /> : null}
      <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')}><Text>Return to sign in</Text></Pressable>
    </AuthScreen>
  );
}
