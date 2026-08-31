import { router } from 'expo-router';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { useAuthActionIntent } from '../../src/auth/action-intent';
import { AuthScreen } from '../../src/auth/auth-ui';

export default function AuthActionScreen(): React.JSX.Element {
  const { action } = useAuthActionIntent();
  useEffect(() => {
    if (action?.kind === 'verify-email') router.replace('/verify-email');
    if (action?.kind === 'reset-password') router.replace('/reset-password');
  }, [action]);
  if (!action) {
    return <AuthScreen title="Invalid link" detail="This account action link is incomplete or invalid. Request a new email from the relevant screen."><Text>For your security, the link was not processed.</Text></AuthScreen>;
  }
  return <AuthScreen title="Opening secure action" detail="Completing your requested account action."><Text>Please wait…</Text></AuthScreen>;
}
