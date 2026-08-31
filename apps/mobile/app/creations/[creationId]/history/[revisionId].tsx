/* eslint-disable */
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';

import { createRenderPlanForDocument, requireBuiltInTemplate, requireBuiltInVideoTemplate, type CreationRenderAsset } from '@dentpilot/application';

import { dentPilotApi } from '../../../../src/api/client';
import { useAuth } from '../../../../src/auth/auth-provider';
import { NativeCompositionPreview } from '../../../../src/creation/native-composition-preview';
import { NativeVideoPreview } from '../../../../src/creation/native-video-preview';
import { loadPrivatePreview } from '../../../../src/creation/protected-preview-cache';
import { ErrorState, LoadingState, Screen, styles } from '../../../../src/components/ui';

export default function RevisionReadOnlyScreen(): React.JSX.Element {
  const { creationId, revisionId } = useLocalSearchParams<{ creationId: string; revisionId: string }>();
  const { account } = useAuth();
  const dimensions = useWindowDimensions();
  const [uris, setUris] = useState<Readonly<Record<string, string>>>({});
  const revision = useQuery({ queryKey: ['creation-revision', creationId, revisionId], queryFn: () => dentPilotApi.getCreationRevision(creationId, revisionId), enabled: Boolean(creationId && revisionId) });
  const creation = useQuery({ queryKey: ['creation', creationId], queryFn: () => dentPilotApi.getCreation(creationId), enabled: Boolean(creationId) });
  const workspace = useQuery({ queryKey: ['workspace', revision.data?.data.caseId], queryFn: () => dentPilotApi.getWorkspace(revision.data!.data.caseId), enabled: revision.data !== undefined });
  useEffect(() => {
    if (account === null || revision.data === undefined) return;
    let alive = true;
    const uniqueMediaIds = Array.from(new Set(revision.data.data.bindings.map((b) => b.mediaId)));
    void Promise.all(uniqueMediaIds.map(async (mediaId) => [mediaId, await loadPrivatePreview({ accountId: account.id, mediaId })] as const)).then((next) => { if (alive) setUris(Object.fromEntries(next)); }).catch(() => undefined);
    return () => { alive = false; };
  }, [account, revision.data]);
  const plan = useMemo(() => {
    if (revision.data === undefined || workspace.data === undefined || revision.data.data.document.templateRef === null || creation.data === undefined) return null;
    if (creation.data.project.type === 'before_after_video') return null; // We don't render plans for videos
    const mediaById = new Map(workspace.data.media.map((media) => [media.id, media]));
    const assets = revision.data.data.bindings.flatMap((binding): readonly CreationRenderAsset[] => {
      const media = mediaById.get(binding.mediaId); const source = uris[binding.mediaId];
      return media === undefined || source === undefined ? [] : [{ bindingKey: binding.bindingKey, mediaId: media.id, width: media.width, height: media.height, source }];
    });
    return assets.length !== revision.data.data.bindings.length ? null : createRenderPlanForDocument({ document: revision.data.data.document as any, bindings: assets, target: { width: 720, height: 960 } });
  }, [revision.data, uris, workspace.data, creation.data]);

  const videoAssets = useMemo(() => {
    if (revision.data === undefined || workspace.data === undefined || revision.data.data.document.templateRef === null || creation.data === undefined) return null;
    if (creation.data.project.type !== 'before_after_video') return null;
    const mediaById = new Map(workspace.data.media.map((media) => [media.id, media]));
    const assets = revision.data.data.bindings.flatMap((binding): readonly CreationRenderAsset[] => {
      const media = mediaById.get(binding.mediaId); const source = uris[binding.mediaId];
      return media === undefined || source === undefined ? [] : [{ bindingKey: binding.bindingKey, mediaId: media.id, width: media.width, height: media.height, source }];
    });
    return assets.length !== revision.data.data.bindings.length ? null : assets;
  }, [revision.data, uris, workspace.data, creation.data]);

  if (revision.isPending || creation.isPending) return <LoadingState label="Loading immutable version…" />;
  if (revision.data === undefined || workspace.data === undefined || creation.data === undefined) return <ErrorState detail="This read-only version could not be loaded." onRetry={() => void revision.refetch()} />;
  const current = revision.data.data;
  const width = Math.min(dimensions.width - 40, 360);
  const selectedTemplateDefinition = current.document.templateRef === null ? null : (creation.data.project.type === 'before_after_video' ? requireBuiltInVideoTemplate(current.document.templateRef.templateId, current.document.templateRef.templateVersion) : requireBuiltInTemplate(current.document.templateRef.templateId, current.document.templateRef.templateVersion)) as any;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
        <View style={styles.card}>
          <Text style={styles.label}>READ-ONLY VERSION {current.revisionNumber}</Text>
          <Text style={styles.body}>Saved {new Date(current.createdAt).toLocaleString()}. This immutable historical document cannot be edited or replaced.</Text>
          {creation.data.project.type === 'before_after_video' ? (
            videoAssets === null || selectedTemplateDefinition === null ? <LoadingState label="Preparing protected historical preview…" /> : <NativeVideoPreview document={current.document as any} template={selectedTemplateDefinition} assets={videoAssets} width={width} height={Math.round(width * 16 / 9)} accessibilityLabel={`Read-only video version ${current.revisionNumber}`} />
          ) : (
            plan === null ? <LoadingState label="Preparing protected historical preview…" /> : <NativeCompositionPreview plan={plan} width={width} height={Math.round(width * plan.canvas.height / plan.canvas.width)} accessibilityLabel={`Read-only composition version ${current.revisionNumber}`} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
