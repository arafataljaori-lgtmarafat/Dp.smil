import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAuth } from '../../src/auth/auth-provider';
import { toAuthUiError, type AuthUiError } from '../../src/auth/auth-errors';
import { AuthError, AuthField, AuthScreen, AuthSubmit } from '../../src/auth/auth-ui';

export default function SignInScreen(): React.JSX.Element {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthUiError | null>(null);

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await signIn({ email: email.trim(), password });
      setPassword('');
      router.replace('/');
    } catch (nextError) {
      setError(toAuthUiError(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthScreen title="Sign in" detail="Use your verified personal DentPilot account.">
      <AuthField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
      <AuthField label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" autoComplete="current-password" returnKeyType="done" onSubmitEditing={() => void submit()} />
      <AuthError message={error?.message ?? null} retryAfterSeconds={error?.retryAfterSeconds} />
      <AuthSubmit label="Sign in" pending={pending} onPress={() => void submit()} testID="sign-in-submit" />
      <Pressable accessibilityRole="link" onPress={() => router.push('/forgot-password')}><Text>Forgot password?</Text></Pressable>
      <Pressable accessibilityRole="link" onPress={() => router.push('/register')}><Text>Create a personal account</Text></Pressable>
    </AuthScreen>
  );
}
