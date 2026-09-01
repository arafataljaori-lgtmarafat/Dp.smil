import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useWindowDimensions } from 'react-native';
import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { creationQueryKey, fetchCoherentCreation } from '../../src/creation/creation-query-cache';
import { ErrorState, LoadingState, Screen } from '../../src/components/ui';

import { ImageCreationEditor } from '../../src/creation/image-creation-editor';
import { VideoCreationPreview } from '../../src/creation/video-creation-preview';

export default function CreationEditorRoute(): React.JSX.Element {
  const { creationId } = useLocalSearchParams<{ creationId: string }>();
  const { account, state: authState } = useAuth();
  const queryClient = useQueryClient();
  const dimensions = useWindowDimensions();

  const creation = useQuery({ 
    queryKey: creationQueryKey(creationId), 
    queryFn: () => fetchCoherentCreation(queryClient, creationId, () => dentPilotApi.getCreation(creationId)), 
    enabled: authState.status === 'authenticated' && creationId.length > 0 
  });

  const workspace = useQuery({ 
    queryKey: ['workspace', creation.data?.project.caseId], 
    queryFn: () => dentPilotApi.getWorkspace(creation.data!.project.caseId), 
    enabled: creation.data !== undefined && authState.status === 'authenticated' 
  });

  if (authState.status !== 'authenticated' || creation.isPending || workspace.isPending) {
    return <LoadingState label="Loading secure creation..." />;
  }

  if (creation.isError || creation.data === undefined || workspace.isError || workspace.data === undefined || !account) {
    return <ErrorState detail="This creation could not be loaded." onRetry={() => void creation.refetch()} />;
  }

  const isVideo = creation.data.project.type === 'before_after_video';

  return (
    <Screen>
      {isVideo ? (
        <VideoCreationPreview 
           accountId={account.id}
           creation={creation.data} 
           workspaceMedia={workspace.data.media}
           width={dimensions.width}
           height={dimensions.height - 100} 
        />
      ) : (
        <ImageCreationEditor 
           creationId={creationId}
           creation={creation.data} 
           workspace={workspace.data} 
        />
      )}
    </Screen>
  );
}
