import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Screen({ children }: PropsWithChildren): React.JSX.Element {
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.buttonMuted]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function LoadingState({ label = 'Loading…' }: { readonly label?: string }): React.JSX.Element {
  return (
    <View accessibilityLabel={label} style={styles.state}>
      <ActivityIndicator color="#0E6373" />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, detail }: { readonly title: string; readonly detail: string }): React.JSX.Element {
  return (
    <View style={styles.state}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.muted}>{detail}</Text>
    </View>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  detail,
  onRetry,
}: {
  readonly title?: string;
  readonly detail: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <View accessibilityLabel="error-state" style={styles.state}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.muted}>{detail}</Text>
      <PrimaryButton label="Retry" onPress={onRetry} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F3', padding: 20, gap: 16 },
  button: { backgroundColor: '#0E6373', borderRadius: 8, minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
  buttonMuted: { opacity: 0.65 },
  buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  state: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  stateTitle: { color: '#1C2A30', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  errorTitle: { color: '#B42318', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  muted: { color: '#56666D', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  title: { color: '#1C2A30', fontSize: 28, lineHeight: 34, fontWeight: '700' },
  body: { color: '#34454C', fontSize: 16, lineHeight: 24 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#D7DDDD', borderWidth: 1, borderRadius: 10, padding: 16, gap: 8 },
  label: { color: '#0E6373', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  input: { backgroundColor: '#FFFFFF', borderColor: '#9BA8AC', borderWidth: 1, borderRadius: 8, minHeight: 48, paddingHorizontal: 12, color: '#1C2A30' },
});
