import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';

import { createRenderPlanForDocument, type CreationRenderAsset } from '@dentpilot/application';

import { dentPilotApi } from '../../../src/api/client';
import { useAuth } from '../../../src/auth/auth-provider';
import { renderAuthoritativeCompositionExport } from '../../../src/creation/authoritative-composition-export';
import { creationQueryKey, fetchCoherentCreation } from '../../../src/creation/creation-query-cache';
import { cleanupCompositionExports, presetForAspectRatio, saveCompositionToLibrary, shareComposition, writeCompositionExport } from '../../../src/creation/composition-export';
import { NativeCompositionPreview } from '../../../src/creation/native-composition-preview';
import { loadPrivatePreview } from '../../../src/creation/protected-preview-cache';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../../src/components/ui';

export default function CompositionExportScreen(): React.JSX.Element {
  const { creationId } = useLocalSearchParams<{ creationId: string }>();
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const [previewUris, setPreviewUris] = useState<Readonly<Record<string, string>>>({});
  const [exported, setExported] = useState<{ readonly uri: string; readonly bytes: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const creation = useQuery({ queryKey: creationQueryKey(creationId), queryFn: () => fetchCoherentCreation(queryClient, creationId, () => dentPilotApi.getCreation(creationId)), enabled: Boolean(creationId) });
  const workspace = useQuery({ queryKey: ['workspace', creation.data?.project.caseId], queryFn: () => dentPilotApi.getWorkspace(creation.data!.project.caseId), enabled: creation.data !== undefined });
  useEffect(() => {
    if (account === null || creation.data === undefined) return;
    let alive = true;
    void Promise.all(creation.data.bindings.map(async (binding) => [binding.mediaId, await loadPrivatePreview({ accountId: account.id, mediaId: binding.mediaId })] as const)).then((items) => { if (alive) setPreviewUris(Object.fromEntries(items)); }).catch(() => { if (alive) setMessage('Private media could not be prepared for this export.'); });
    return () => { alive = false; };
  }, [account, creation.data]);
  const plan = useMemo(() => {
    if (creation.data === undefined || workspace.data === undefined || creation.data.draft.document.templateRef === null) return null;
    const mediaById = new Map(workspace.data.media.map((media) => [media.id, media]));
    const assets = creation.data.bindings.flatMap((binding): readonly CreationRenderAsset[] => {
      const media = mediaById.get(binding.mediaId); const source = previewUris[binding.mediaId];
      return media === undefined || source === undefined ? [] : [{ bindingKey: binding.bindingKey, mediaId: media.id, width: media.width, height: media.height, source }];
    });
    const preset = presetForAspectRatio(creation.data.draft.document.canvas.aspectRatioKey);
    return assets.length !== creation.data.bindings.length ? null : createRenderPlanForDocument({ document: creation.data.draft.document, bindings: assets, target: preset });
  }, [creation.data, previewUris, workspace.data]);
  const exportImage = useCallback(async () => {
    if (Platform.OS === 'web') { setMessage('Native image export is unavailable on web. The protected web preview remains read-only.'); return; }
    if (account === null || creation.data === undefined || workspace.data === undefined) { setMessage('The authenticated creation data is still preparing. Try again shortly.'); return; }
    try {
      const jpegBytes = await renderAuthoritativeCompositionExport({
        accountId: account.id,
        document: creation.data.draft.document,
        bindings: creation.data.bindings,
        media: workspace.data.media,
        target: presetForAspectRatio(creation.data.draft.document.canvas.aspectRatioKey),
      });
      const written = await writeCompositionExport(account.id, jpegBytes);
      setExported(written);
      setMessage(`JPEG composition created (${Math.round(written.bytes / 1024)} KB).`);
    } catch {
      setMessage('The composition could not be exported. No source media was modified.');
    }
  }, [account, creation.data, workspace.data]);
  const save = useCallback(async () => { if (exported === null) return; try { await saveCompositionToLibrary(exported.uri); setMessage('Composition saved to your photo library.'); } catch { setMessage('Saving to the photo library was not completed.'); } }, [exported]);
  const share = useCallback(async () => { if (exported === null) return; try { await shareComposition(exported.uri); setMessage('System share sheet opened for the composition JPEG.'); } catch { setMessage('Sharing is unavailable or was not completed.'); } }, [exported]);
  if (creation.isPending) return <LoadingState label="Loading export…" />;
  if (creation.data === undefined) return <ErrorState detail="This creation is unavailable." onRetry={() => void creation.refetch()} />;
  if (plan === null) return <Screen><View style={styles.card}><Text style={styles.label}>EXPORT COMPOSITION</Text><Text style={styles.body}>Choose both photos and a template before export.</Text></View></Screen>;
  const displayWidth = 270; const displayHeight = Math.round(displayWidth * plan.canvas.height / plan.canvas.width);
  return <Screen><ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 32 }}><View style={styles.card}><Text style={styles.label}>COMPOSITION-ONLY EXPORT</Text><Text style={styles.body}>{plan.canvas.width} × {plan.canvas.height} JPEG · no editor controls, selection overlays, source metadata, or patient identifiers.</Text><NativeCompositionPreview plan={plan} width={displayWidth} height={displayHeight} accessibilityLabel="Composition export preview" /><PrimaryButton label={exported === null ? 'Create JPEG export' : 'Create new JPEG export'} onPress={() => void exportImage()} />{exported !== null ? <View style={{ gap: 8 }}><PrimaryButton label="Save to photo library" onPress={() => void save()} /><PrimaryButton label="Share JPEG" onPress={() => void share()} /></View> : null}{message !== null ? <Text style={styles.muted}>{message}</Text> : null}<PrimaryButton label="Clean temporary exports" onPress={() => { if (account !== null) void cleanupCompositionExports(account.id).then(() => setMessage('Old temporary export files were cleaned.')); }} /></View></ScrollView></Screen>;
}
