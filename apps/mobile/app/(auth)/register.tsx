import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { useAuth } from '../../src/auth/auth-provider';
import { toAuthUiError, type AuthUiError } from '../../src/auth/auth-errors';
import { AuthError, AuthField, AuthScreen, AuthSubmit } from '../../src/auth/auth-ui';

export default function RegisterScreen(): React.JSX.Element {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AuthUiError | null>(null);

  const submit = async () => {
    if (pending) return;
    if (password.length < 12 || password.length > 128) {
      setError({ message: 'Use a password between 12 and 128 characters.' });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const registered = await register({ displayName: displayName.trim(), email: email.trim(), password });
      setPassword('');
      router.replace({ pathname: '/verify-email', params: { email: registered.email } });
    } catch (nextError) {
      setError(toAuthUiError(nextError));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthScreen title="Create your account" detail="Verification is required before you can sign in.">
      <AuthField label="Display name" value={displayName} onChangeText={setDisplayName} textContentType="name" autoComplete="name" returnKeyType="next" />
      <AuthField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" returnKeyType="next" />
      <AuthField label="Password" value={password} onChangeText={setPassword} secureTextEntry textContentType="newPassword" autoComplete="new-password" returnKeyType="done" onSubmitEditing={() => void submit()} />
      <Text>Passwords must be 12–128 characters. No extra character rules are required.</Text>
      <AuthError message={error?.message ?? null} retryAfterSeconds={error?.retryAfterSeconds} />
      <AuthSubmit label="Create account" pending={pending} onPress={() => void submit()} testID="register-submit" />
      <Pressable accessibilityRole="link" onPress={() => router.replace('/sign-in')}><Text>Already verified? Sign in</Text></Pressable>
    </AuthScreen>
  );
}
