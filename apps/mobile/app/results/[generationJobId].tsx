import { useQuery } from '@tanstack/react-query';
import { Image, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { ErrorState, LoadingState, Screen, styles } from '../../src/components/ui';

export default function MockResultScreen(): React.JSX.Element {
  const { generationJobId } = useLocalSearchParams<{ generationJobId: string }>();
  const { state } = useAuth();
  const generation = useQuery({
    queryKey: ['generation', generationJobId],
    queryFn: () => dentPilotApi.getGeneration(generationJobId),
    enabled: state.status === 'authenticated' && generationJobId.length > 0,
    refetchInterval: (query) =>
      query.state.data?.job.status === 'queued' || query.state.data?.job.status === 'processing' ? 500 : false,
  });

  if (state.status !== 'authenticated' || generation.isPending) return <LoadingState label="Submitting generation…" />;
  if (generation.isError || generation.data === undefined) {
    return <ErrorState detail="The generation status could not be retrieved." onRetry={() => void generation.refetch()} />;
  }
  if (generation.data.job.status === 'queued' || generation.data.job.status === 'processing') {
    return <LoadingState label="Mock generation is processing…" />;
  }
  if (generation.data.job.status !== 'succeeded' || generation.data.version === null) {
    return (
      <ErrorState
        title="Mock generation did not complete"
        detail="No clinical result was produced. Retry the workflow from the case workspace."
        onRetry={() => void generation.refetch()}
      />
    );
  }

  return (
    <Screen>
      <View style={{ gap: 14 }}>
        <View style={[styles.card, { borderColor: '#B42318' }]}>
          <Text style={[styles.label, { color: '#B42318' }]}>MOCK OUTPUT</Text>
          <Text style={[styles.errorTitle, { fontSize: 18 }]}>NOT A CLINICAL SIMULATION</Text>
          <Text style={styles.muted}>Architecture validation artifact only. It is not a diagnosis, prediction, or treatment plan.</Text>
        </View>
        <Image
          accessibilityLabel="Mock output image"
          source={dentPilotApi.authenticatedMediaSource(generation.data.version.resultMediaUrl)}
          resizeMode="contain"
          style={{ width: '100%', height: 300, backgroundColor: '#FFFFFF' }}
        />
        <Text style={styles.muted}>Generation version {generation.data.version.versionNumber} is immutable and linked to its source.</Text>
      </View>
    </Screen>
  );
}
