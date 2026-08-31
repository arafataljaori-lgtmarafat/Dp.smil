import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAuth } from '../../src/auth/auth-provider';
import { toAuthUiError, type AuthUiError } from '../../src/auth/auth-errors';
import { AuthError, AuthField, AuthScreen, AuthSubmit } from '../../src/auth/auth-ui';

export default function ForgotPasswordScreen(): React.JSX.Element {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthUiError | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSubmitted(true);
    } catch (nextError) {
      setError(toAuthUiError(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthScreen title="Reset your password" detail="Enter your email to receive instructions.">
      {submitted ? <Text>If an account can receive a reset email, instructions have been sent.</Text> : <AuthField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="done" onSubmitEditing={() => void submit()} />}
      <AuthError message={error?.message ?? null} retryAfterSeconds={error?.retryAfterSeconds} />
      {!submitted ? <AuthSubmit label="Send reset instructions" pending={pending} onPress={() => void submit()} testID="forgot-password-submit" /> : null}
      <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')}><Text>Return to sign in</Text></Pressable>
    </AuthScreen>
  );
}
