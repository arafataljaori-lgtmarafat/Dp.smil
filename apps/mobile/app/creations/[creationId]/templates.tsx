import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { builtInTemplateCatalog, createRenderPlanForDocument, type CreationRenderAsset } from '@dentpilot/application';

import { dentPilotApi } from '../../../src/api/client';
import { useAuth } from '../../../src/auth/auth-provider';
import { applySavedCreationDraftToCache, creationQueryKey, fetchCoherentCreation, invalidateCreationQuery } from '../../../src/creation/creation-query-cache';
import { switchTemplate } from '../../../src/creation/editor-operations';
import { NativeCompositionPreview } from '../../../src/creation/native-composition-preview';
import { loadPrivatePreview } from '../../../src/creation/protected-preview-cache';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../../src/components/ui';

export default function TemplateGalleryScreen(): React.JSX.Element {
  const { creationId } = useLocalSearchParams<{ creationId: string }>();
  const { account, state } = useAuth();
  const queryClient = useQueryClient();
  const [uris, setUris] = useState<Readonly<Record<string, string>>>({});
  const creation = useQuery({ queryKey: creationQueryKey(creationId), queryFn: () => fetchCoherentCreation(queryClient, creationId, () => dentPilotApi.getCreation(creationId)), enabled: state.status === 'authenticated' && Boolean(creationId) });
  const workspace = useQuery({ queryKey: ['workspace', creation.data?.project.caseId], queryFn: () => dentPilotApi.getWorkspace(creation.data!.project.caseId), enabled: creation.data !== undefined });

  useEffect(() => {
    if (account === null || creation.data === undefined) return;
    let mounted = true;
    void Promise.all(creation.data.bindings.map(async (binding) => [binding.mediaId, await loadPrivatePreview({ accountId: account.id, mediaId: binding.mediaId })] as const)).then((values) => { if (mounted) setUris(Object.fromEntries(values)); }).catch(() => undefined);
    return () => { mounted = false; };
  }, [account, creation.data]);

  const select = useMutation({
    mutationFn: async (template: (typeof builtInTemplateCatalog)[number]) => {
      if (creation.data === undefined) throw new Error('Creation is unavailable.');
      const next = switchTemplate(creation.data.draft.document, template);
      return dentPilotApi.saveCreationDraft(creationId, creation.data.draft.revision, next);
    },
    onSuccess: (saved) => {
      applySavedCreationDraftToCache(queryClient, creationId, saved.data);
      void invalidateCreationQuery(queryClient, creationId);
      router.back();
    },
  });

  const assets = useMemo(() => {
    if (creation.data === undefined || workspace.data === undefined) return [] as readonly CreationRenderAsset[];
    const media = new Map(workspace.data.media.map((item) => [item.id, item]));
    return creation.data.bindings.flatMap((binding) => {
      const item = media.get(binding.mediaId); const source = uris[binding.mediaId];
      return item === undefined || source === undefined ? [] : [{ bindingKey: binding.bindingKey, mediaId: item.id, width: item.width, height: item.height, source }];
    });
  }, [creation.data, uris, workspace.data]);

  if (creation.isPending) return <LoadingState label="Loading template gallery…" />;
  if (creation.data === undefined) return <ErrorState detail="This creation is unavailable." onRetry={() => void creation.refetch()} />;
  const selected = creation.data.draft.document.templateRef === null ? null : `${creation.data.draft.document.templateRef.templateId}@${creation.data.draft.document.templateRef.templateVersion}`;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
        <View style={styles.card}><Text style={styles.label}>PREMIUM TEMPLATE GALLERY</Text><Text style={styles.body}>Published versioned compositions only. Choosing a card saves one deliberate draft checkpoint.</Text></View>
        {builtInTemplateCatalog.map((template) => {
          const identity = `${template.id}@${template.version}`;
          const previewDocument = switchTemplate(creation.data.draft.document, template);
          const preview = assets.length === template.slots.length ? createRenderPlanForDocument({ document: previewDocument, bindings: assets, target: { width: 180, height: 225 } }) : null;
          return <View key={identity} style={styles.card}>
            {preview === null ? <View accessibilityLabel={`${template.displayName} preview unavailable until both photos are selected`} style={{ height: 150, backgroundColor: '#EEF1F2', borderRadius: 8, justifyContent: 'center' }}><Text style={styles.muted}>Private thumbnail appears after both photos are selected.</Text></View> : <NativeCompositionPreview plan={preview} width={180} height={150} accessibilityLabel={`${template.displayName} template preview`} />}
            <Text style={styles.stateTitle}>{template.displayName}</Text>
            <Text style={styles.muted}>{template.category} · {template.aspectRatio.replaceAll('_', ':')} · version {template.version}</Text>
            <PrimaryButton label={identity === selected ? 'Selected' : select.isPending ? 'Saving…' : 'Use this template'} disabled={identity === selected || select.isPending} onPress={() => select.mutate(template)} />
          </View>;
        })}
        {select.isError ? <ErrorState detail="The draft changed before this template could be applied. Return to the editor, reload, and select deliberately." onRetry={() => void creation.refetch()} /> : null}
      </ScrollView>
    </Screen>
  );
}
