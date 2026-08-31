import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';

import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { EmptyState, ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../src/components/ui';

export default function CasesScreen(): React.JSX.Element {
  const { state } = useAuth();
  const casesQuery = useQuery({ queryKey: ['cases'], queryFn: () => dentPilotApi.listCases(), enabled: state.status === 'authenticated' });

  if (state.status !== 'authenticated' || casesQuery.isPending) return <LoadingState label="Loading your cases…" />;
  if (casesQuery.isError) {
    return <ErrorState detail="Cases could not be loaded." onRetry={() => void casesQuery.refetch()} />;
  }

  return (
    <Screen>
      <View style={{ gap: 14 }}>
        <Text style={styles.body}>My Cases</Text>
        <PrimaryButton label="Create fictional case" onPress={() => router.push('/cases/new')} testID="create-case" />
      </View>
      {casesQuery.data.length === 0 ? (
        <EmptyState title="No cases yet" detail="Create a fictional development case to start the Phase 1 workflow." />
      ) : (
        <FlatList
          data={casesQuery.data}
          keyExtractor={(patientCase) => patientCase.id}
          contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/cases/${item.id}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.label}>{item.status.toUpperCase()}</Text>
              <Text style={styles.stateTitle}>{item.displayLabel}</Text>
              {item.referenceCode !== null ? <Text style={styles.muted}>{item.referenceCode}</Text> : null}
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}
