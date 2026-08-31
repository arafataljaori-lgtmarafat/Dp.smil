import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, ScrollView, Text, View } from 'react-native';

import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../src/components/ui';
import { createPendingPickerResultRecovery, chooseFromLibrary, takePhoto, type PickerOutcome } from '../../src/media/media-picker';
import { createIdempotencyKey, createMediaUploadOrchestrator } from '../../src/media/media-upload-orchestrator';
import { initialMediaUploadState, isActiveMediaUpload, type MediaUploadState } from '../../src/media/media-upload-state';

function newestSourceMedia(media: readonly { readonly id: string; readonly kind: string; readonly createdAt: string }[]) {
  return media.filter((item) => item.kind === 'source').reduce<typeof media[number] | null>((newest, item) => {
    if (newest === null || Date.parse(item.createdAt) > Date.parse(newest.createdAt)) return item;
    return newest;
  }, null);
}

function uploadLabel(state: MediaUploadState): string {
  switch (state.phase) {
    case 'selecting': return 'Preparing image…';
    case 'creating-session': return 'Creating secure upload…';
    case 'uploading': return 'Uploading…';
    case 'recovering-status': return 'Checking upload status…';
    case 'server-processing': return 'Server is processing image…';
    case 'committed': return 'Source photo stored securely.';
    case 'failed': return state.failure.message;
    default: return 'No source photo uploaded.';
  }
}

export default function CaseWorkspaceScreen(): React.JSX.Element {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const { state: authState } = useAuth();
  const queryClient = useQueryClient();
  const [uploadState, setUploadState] = useState<MediaUploadState>(initialMediaUploadState);
  const generationIdempotencyKey = useRef(createIdempotencyKey());
  const pendingRecovery = useRef(createPendingPickerResultRecovery());
  const orchestrator = useRef<ReturnType<typeof createMediaUploadOrchestrator> | null>(null);
  if (orchestrator.current === null) {
    orchestrator.current = createMediaUploadOrchestrator({
      onState: setUploadState,
      onCommitted: async () => queryClient.invalidateQueries({ queryKey: ['workspace', caseId] }),
    });
  }
  const workspace = useQuery({
    queryKey: ['workspace', caseId],
    queryFn: () => dentPilotApi.getWorkspace(caseId),
    enabled: authState.status === 'authenticated' && caseId.length > 0,
  });

  const startOutcome = async (outcome: PickerOutcome): Promise<void> => {
    if (outcome.kind === 'cancelled') {
      orchestrator.current?.reset();
      return;
    }
    if (outcome.kind === 'unsupported-format') {
      setUploadState({ phase: 'failed', failure: { code: 'UNSUPPORTED_MEDIA_FORMAT', message: 'This photo format is not supported. Choose a JPEG, PNG, or WebP image.', retry: 'new-session' } });
      return;
    }
    if (outcome.kind === 'permission-denied') {
      setUploadState({ phase: 'failed', failure: { code: 'CAMERA_PERMISSION_DENIED', message: outcome.canAskAgain ? 'Camera permission was denied. You can try again.' : 'Camera permission is disabled. Enable it in Settings to take a photo.', retry: 'new-session' } });
      return;
    }
    await orchestrator.current?.start(caseId, outcome.asset);
  };

  useEffect(() => {
    void pendingRecovery.current().then((outcome) => {
      if (outcome !== null) return startOutcome(outcome);
      return undefined;
    });
  // The recovery closure is intentionally created once to consume Android pending result once.
  }, []);

  const sourceMedia = newestSourceMedia(workspace.data?.media ?? []);
  const mockProject = workspace.data?.projects.filter((project) => project.type === 'smile_simulation').at(-1) ?? null;
  const creations = useQuery({
    queryKey: ['creations', caseId],
    queryFn: () => dentPilotApi.listCreations(caseId),
    enabled: authState.status === 'authenticated' && caseId.length > 0,
  });
  const latestCreation = creations.data?.data.at(-1) ?? null;
  const createBeforeAfter = useMutation({
    mutationFn: async () => {
      if (sourceMedia === null) throw new Error('Source media is required.');
      return dentPilotApi.createBeforeAfterCreation(caseId, sourceMedia.id);
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['creations', caseId] });
      router.push(`/creations/${created.project.id}`);
    },
  });
  const createProject = useMutation({
    mutationFn: async () => {
      if (sourceMedia === null) throw new Error('Source media is required.');
      return dentPilotApi.createMockProject(caseId, sourceMedia.id);
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['workspace', caseId] }),
  });
  const submitGeneration = useMutation({
    mutationFn: async () => {
      if (mockProject === null) throw new Error('Mock project is required.');
      return dentPilotApi.requestGeneration(mockProject.id, generationIdempotencyKey.current);
    },
    onSuccess: (result) => router.push(`/results/${result.id}`),
  });
  const activeUpload = isActiveMediaUpload(uploadState);

  if (authState.status !== 'authenticated' || workspace.isPending) return <LoadingState label="Loading case workspace…" />;
  if (workspace.isError || workspace.data === undefined) return <ErrorState detail="This case could not be loaded." onRetry={() => void workspace.refetch()} />;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
        <View style={styles.card}>
          <Text style={styles.label}>OVERVIEW</Text>
          <Text style={styles.stateTitle}>{workspace.data.patientCase.displayLabel}</Text>
          <Text style={styles.muted}>Personal creation workspace</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>MEDIA</Text>
          <Text style={styles.body}>{uploadLabel(uploadState)}</Text>
          {sourceMedia !== null && Platform.OS !== 'web' ? (
            <Image
              accessibilityLabel="Committed private source media"
              source={dentPilotApi.authenticatedMediaSource(`/media/${sourceMedia.id}/content`)}
              style={{ width: '100%', height: 180, borderRadius: 12, marginTop: 8 }}
              resizeMode="contain"
            />
          ) : null}
          {sourceMedia !== null && Platform.OS === 'web' ? <Text style={styles.muted}>Source media is protected and available in the native app.</Text> : null}
          <PrimaryButton testID="choose-source-photo" label="Choose from library" disabled={activeUpload} onPress={() => void chooseFromLibrary().then(startOutcome)} />
          <PrimaryButton testID="take-source-photo" label="Take photo" disabled={activeUpload} onPress={() => void takePhoto().then(startOutcome)} />
          {uploadState.phase === 'failed' && uploadState.failure.retry === 'new-session' && uploadState.asset !== undefined ? (
            <PrimaryButton label="Retry upload" disabled={activeUpload} onPress={() => void orchestrator.current?.start(caseId, uploadState.asset!)} />
          ) : null}
          {uploadState.phase === 'failed' && uploadState.failure.retry === 'recheck' && uploadState.asset !== undefined && uploadState.uploadId !== undefined ? (
            <PrimaryButton label="Recheck upload" disabled={activeUpload} onPress={() => void orchestrator.current?.recover(uploadState.uploadId!, uploadState.asset!, createIdempotencyKey())} />
          ) : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>CREATIONS</Text>
          <Text style={styles.body}>{mockProject === null ? 'Create a mock Smile Simulation project.' : 'Mock Smile Simulation project ready.'}</Text>
          {mockProject === null ? (
            <PrimaryButton label={createProject.isPending ? 'Creating…' : 'Create mock Smile Simulation'} disabled={sourceMedia === null || createProject.isPending} onPress={() => createProject.mutate()} />
          ) : (
            <PrimaryButton testID="submit-generation" label={submitGeneration.isPending ? 'Submitting…' : 'Submit mock generation'} disabled={submitGeneration.isPending} onPress={() => submitGeneration.mutate()} />
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>BEFORE / AFTER COMPOSITION</Text>
          <Text style={styles.body}>{latestCreation === null ? 'Create a versioned private composition from this source photo.' : 'Open the saved versioned composition draft.'}</Text>
          {latestCreation === null ? (
            <PrimaryButton testID="create-before-after" label={createBeforeAfter.isPending ? 'Creating…' : 'Create Before / After'} disabled={sourceMedia === null || createBeforeAfter.isPending} onPress={() => createBeforeAfter.mutate()} />
          ) : (
            <PrimaryButton testID="open-before-after" label="Open Before / After" onPress={() => router.push(`/creations/${latestCreation.id}`)} />
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>HISTORY</Text>
          <Text style={styles.body}>{workspace.data.audits.length} recorded audit event(s).</Text>
        </View>
        {uploadState.phase === 'failed' || createProject.isError || createBeforeAfter.isError || submitGeneration.isError ? <ErrorState detail="The action could not be completed. Retry the safe action after checking the network." onRetry={() => void workspace.refetch()} /> : null}
      </ScrollView>
    </Screen>
  );
}
