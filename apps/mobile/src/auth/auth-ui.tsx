import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { PrimaryButton, Screen, styles } from '../components/ui';

export function AuthScreen({ title, detail, children }: { readonly title: string; readonly detail: string; readonly children: ReactNode }): React.JSX.Element {
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={localStyles.content}>
        <View style={localStyles.heading}>
          <Text style={styles.label}>DENTPILOT SMILE STUDIO</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.muted}>{detail}</Text>
        </View>
        <View style={localStyles.form}>{children}</View>
      </ScrollView>
    </Screen>
  );
}

export function AuthField({ label, ...inputProps }: TextInputProps & { readonly label: string }): React.JSX.Element {
  return (
    <View style={localStyles.field}>
      <Text style={localStyles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

export function AuthSubmit({ label, pending, onPress, testID }: { readonly label: string; readonly pending: boolean; readonly onPress: () => void; readonly testID?: string }): React.JSX.Element {
  const props = { label: pending ? 'Please wait…' : label, onPress, disabled: pending };
  return testID === undefined ? <PrimaryButton {...props} /> : <PrimaryButton {...props} testID={testID} />;
}

export function AuthError({ message, retryAfterSeconds }: { readonly message: string | null; readonly retryAfterSeconds?: number | undefined }): React.JSX.Element | null {
  if (!message) return null;
  const suffix = retryAfterSeconds === undefined ? '' : ` Try again in about ${retryAfterSeconds} seconds.`;
  return <Text accessibilityLiveRegion="polite" style={localStyles.error}>{message}{suffix}</Text>;
}

const localStyles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: 30, paddingVertical: 28 },
  heading: { gap: 10 },
  form: { gap: 16 },
  field: { gap: 7 },
  fieldLabel: { color: '#34454C', fontSize: 14, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 14, lineHeight: 20 },
});
