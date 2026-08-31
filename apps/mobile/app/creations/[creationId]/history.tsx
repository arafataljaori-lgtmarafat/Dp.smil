import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { dentPilotApi } from '../../../src/api/client';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../../src/components/ui';

export default function CreationHistoryScreen(): React.JSX.Element {
  const { creationId } = useLocalSearchParams<{ creationId: string }>();
  const revisions = useQuery({ queryKey: ['creation-revisions', creationId], queryFn: () => dentPilotApi.listCreationRevisions(creationId), enabled: Boolean(creationId) });
  if (revisions.isPending) return <LoadingState label="Loading saved versions…" />;
  if (revisions.data === undefined) return <ErrorState detail="Saved versions could not be loaded." onRetry={() => void revisions.refetch()} />;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
        <View style={styles.card}><Text style={styles.label}>SAVED VERSIONS</Text><Text style={styles.body}>Versions are immutable. Opening one is read-only and never replaces the current draft.</Text></View>
        {revisions.data.data.length === 0 ? <Text style={styles.muted}>No version has been saved yet. Return to the editor to create a deliberate checkpoint.</Text> : revisions.data.data.map((revision) => {
          const template = revision.document.templateRef === null ? 'No template' : `${revision.document.templateRef.templateId} · v${revision.document.templateRef.templateVersion}`;
          return <View key={revision.id} style={styles.card}>
            <Text style={styles.stateTitle}>Version {revision.revisionNumber}</Text>
            <Text style={styles.muted}>{template}</Text>
            <Text style={styles.muted}>{new Date(revision.createdAt).toLocaleString()}</Text>
            <PrimaryButton label="Open read-only preview" onPress={() => router.push(`/creations/${creationId}/history/${revision.id}`)} />
          </View>;
        })}
      </ScrollView>
    </Screen>
  );
}
