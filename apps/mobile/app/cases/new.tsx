import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../src/components/ui';

export default function CreateCaseScreen(): React.JSX.Element {
  const { state } = useAuth();
  const [displayLabel, setDisplayLabel] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const queryClient = useQueryClient();
  const createCase = useMutation({
    mutationFn: () =>
      dentPilotApi.createCase({
        displayLabel,
        ...(referenceCode.trim().length > 0 ? { referenceCode } : {}),
      }),
    onSuccess: async (caseId) => {
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      router.replace(`/cases/${caseId}`);
    },
  });

  if (state.status !== 'authenticated') return <LoadingState label="Securing your session…" />;

  return (
    <Screen>
      <View style={{ gap: 12 }}>
        <Text style={styles.body}>Use fictional labels only. Do not enter patient-identifying information.</Text>
        <Text style={styles.label}>DISPLAY LABEL</Text>
        <TextInput
          testID="case-label-input"
          value={displayLabel}
          onChangeText={setDisplayLabel}
          style={styles.input}
          placeholder="e.g. Studio case 001"
          returnKeyType="done"
        />
        <Text style={styles.label}>OPTIONAL REFERENCE CODE</Text>
        <TextInput value={referenceCode} onChangeText={setReferenceCode} style={styles.input} returnKeyType="done" />
        <PrimaryButton
          testID="submit-create-case"
          label={createCase.isPending ? 'Creating…' : 'Create case'}
          disabled={createCase.isPending || displayLabel.trim().length < 2}
          onPress={() => createCase.mutate()}
        />
      </View>
      {createCase.isError ? (
        <ErrorState
          detail="The case could not be created. Check the connection and retry."
          onRetry={() => createCase.mutate()}
        />
      ) : null}
    </Screen>
  );
}
