/* eslint-disable */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { createRenderPlanForDocument, requireBuiltInTemplate, requireBuiltInVideoTemplate, type CreationRenderAsset, type RenderPlan } from '@dentpilot/application';
import type { CreationBindingKey, VideoCompositionDocument } from '@dentpilot/contracts';

import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { applySavedCreationDraftToCache, creationQueryKey, fetchCoherentCreation, invalidateCreationQuery } from '../../src/creation/creation-query-cache';
import { runWithDurableEditorCheckpoint } from '../../src/creation/editor-binding-checkpoint';
import { CompositionErrorBoundary } from '../../src/creation/composition-error-boundary';
import { applySlotPan, applySlotPinch, applySlotRotation, resetSlotTransform, swapBeforeAfter, updateEditableText, updateTemplateTheme } from '../../src/creation/editor-operations';
import { NativeCompositionPreview } from '../../src/creation/native-composition-preview';
import { NativeVideoPreview } from '../../src/creation/native-video-preview';
import type { EditorGestureCommit } from '../../src/creation/native-composition-preview.types';
import { loadPrivatePreview } from '../../src/creation/protected-preview-cache';
import { useCreationEditor } from '../../src/creation/use-creation-editor';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../src/components/ui';

const transformForNewSlot = { panX: 0, panY: 0, scale: 1, rotation: 0 } as const;

export default function CreationEditorScreen(): React.JSX.Element {
  const { creationId } = useLocalSearchParams<{ creationId: string }>();
  const { account, state: authState } = useAuth();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const dimensions = useWindowDimensions();
  const [previewUris, setPreviewUris] = useState<Readonly<Record<string, string>>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedBindingKey, setSelectedBindingKey] = useState<CreationBindingKey | null>('before');
  const [editorInputError, setEditorInputError] = useState<string | null>(null);
  const creation = useQuery({ queryKey: creationQueryKey(creationId), queryFn: () => fetchCoherentCreation(queryClient, creationId, () => dentPilotApi.getCreation(creationId)), enabled: authState.status === 'authenticated' && creationId.length > 0 });
  const workspace = useQuery({ queryKey: ['workspace', creation.data?.project.caseId], queryFn: () => dentPilotApi.getWorkspace(creation.data!.project.caseId), enabled: creation.data !== undefined && authState.status === 'authenticated' });
  const editor = useCreationEditor({
    creationId,
    initialDocument: creation.data?.draft.document ?? ({ schemaVersion: 1, templateRef: null, canvas: { aspectRatioKey: 'portrait_4_5' }, slotState: { before: transformForNewSlot }, editableTextState: { beforeLabel: 'Before', afterLabel: 'After' }, styleState: { theme: 'clinical-neutral' } }),
    initialRevision: creation.data?.draft.revision ?? 1,
    identityKey: account?.id ?? null,
    onSaved: (saved) => {
      applySavedCreationDraftToCache(queryClient, creationId, saved);
      void invalidateCreationQuery(queryClient, creationId);
    },
  });

  useEffect(() => {
    if (account === null || creation.data === undefined || workspace.data === undefined) return;
    let active = true;
    const mediaById = new Map(workspace.data.media.map((media) => [media.id, media]));
    const uniqueMediaIds = Array.from(new Set(creation.data.bindings.map((b) => b.mediaId)));
    void Promise.all(uniqueMediaIds.map(async (mediaId) => {
      const media = mediaById.get(mediaId);
      if (media === undefined) throw new Error('A creation binding does not resolve to private case media.');
      return [mediaId, await loadPrivatePreview({ accountId: account.id, mediaId })] as const;
    })).then((entries) => {
      if (active) { setPreviewUris(Object.fromEntries(entries)); setPreviewError(null); }
    }).catch(() => { if (active) setPreviewError('Protected preview is unavailable. The original remains private and unchanged.'); });
    return () => { active = false; };
  }, [account, creation.data, workspace.data]);

  const resolvedBindings = useMemo<readonly CreationRenderAsset[] | null>(() => {
    if (creation.data === undefined || workspace.data === undefined) return null;
    const mediaById = new Map(workspace.data.media.map((media) => [media.id, media]));
    const bindings = creation.data.bindings.map((binding): CreationRenderAsset | null => {
      const media = mediaById.get(binding.mediaId);
      const source = previewUris[binding.mediaId];
      return media === undefined || source === undefined ? null : { bindingKey: binding.bindingKey, mediaId: media.id, width: media.width, height: media.height, source };
    });
    if (bindings.some((binding) => binding === null)) return null;
    return bindings as readonly CreationRenderAsset[];
  }, [creation.data, previewUris, workspace.data]);

  const planState = useMemo<{ readonly plan: RenderPlan | null; readonly failed: boolean }>(() => {
    if (creation.data === undefined || editor.document.templateRef === null || resolvedBindings === null) return { plan: null, failed: false };
    if (creation.data.project.type !== 'before_after_image') return { plan: null, failed: false };
    try {
      return { plan: createRenderPlanForDocument({ document: editor.document as any, bindings: resolvedBindings, target: { width: 720, height: 960 } }), failed: false };
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'unknown';
      console.error('composition-plan-failure', { component: 'creation-editor', errorName });
      return { plan: null, failed: true };
    }
  }, [creation.data, editor.document, resolvedBindings]);
  const plan = planState.plan;

  const bindAfter = useMutation({
    mutationFn: async (mediaId: string) => {
      if (creation.data === undefined) throw new Error('Creation is unavailable.');
      await runWithDurableEditorCheckpoint(editor.flush, async (checkpoint) => {
        const result = await dentPilotApi.replaceCreationBindings(creationId, checkpoint.serverRevision, [...creation.data.bindings.filter((binding) => binding.bindingKey !== 'after'), { bindingKey: 'after', mediaId }]);
        const serverDraft = result.data.draft;
        editor.reload(serverDraft.document, serverDraft.revision);
        if ((serverDraft.document as any).slotState?.after === undefined) editor.edit({ ...serverDraft.document, slotState: { ...(serverDraft.document as any).slotState, after: transformForNewSlot } } as any);
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['creation', creationId] }),
  });

  const swap = useMutation({
    mutationFn: async () => {
      if (creation.data === undefined) throw new Error('Creation is unavailable.');
      await runWithDurableEditorCheckpoint(editor.flush, async (checkpoint) => {
        const next = swapBeforeAfter({ document: checkpoint.document as any, bindings: creation.data.bindings });
        const result = await dentPilotApi.replaceCreationBindings(creationId, checkpoint.serverRevision, next.bindings);
        editor.reload(result.data.draft.document, result.data.draft.revision);
        editor.edit(next.document);
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['creation', creationId] }),
  });

  const saveRevision = useMutation({
    mutationFn: async () => {
      const checkpoint = await editor.flush();
      if (checkpoint === null || (checkpoint.phase !== 'saved' && checkpoint.phase !== 'clean')) throw new Error('Resolve the draft save state before creating a version.');
      return dentPilotApi.createCreationRevision(creationId, checkpoint.serverRevision);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['creation-revisions', creationId] });
      const refreshed = await creation.refetch();
      if (refreshed.data !== undefined) editor.reload(refreshed.data.draft.document, refreshed.data.draft.revision);
    },
  });

  const updateDocumentSafely = useCallback((operation: () => typeof editor.document): void => {
    try {
      editor.edit(operation());
      setEditorInputError(null);
    } catch (error) {
      setEditorInputError(error instanceof Error ? error.message : 'The requested editor change is not valid for this template.');
    }
  }, [editor]);

  const onGestureCommit = useCallback((gesture: EditorGestureCommit): void => {
    if (plan === null) return;
    const image = plan.commands.find((command): command is Extract<typeof plan.commands[number], { type: 'image' }> => command.type === 'image' && command.bindingKey === gesture.bindingKey);
    if (image === undefined) return;
    let next = applySlotPan({ document: editor.document as any, bindingKey: gesture.bindingKey, deltaX: gesture.deltaX, deltaY: gesture.deltaY, slotWidth: image.clip.width, slotHeight: image.clip.height });
    next = applySlotPinch(next as any, gesture.bindingKey, gesture.scaleFactor);
    editor.edit(applySlotRotation(next as any, gesture.bindingKey, gesture.rotationDeltaDegrees) as any);
  }, [editor, plan]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!editor.hasUnsavedChanges) return;
      event.preventDefault();
      void editor.flush().then((result) => {
        if (result?.phase === 'saved' || result?.phase === 'clean') navigation.dispatch(event.data.action);
        else Alert.alert('Draft not saved', 'Your latest local edit remains open. Resolve the save state before leaving.');
      });
    });
    return unsubscribe;
  }, [editor, navigation]);

  if (authState.status !== 'authenticated' || creation.isPending) return <LoadingState label="Loading secure creation…" />;
  if (creation.isError || creation.data === undefined) return <ErrorState detail="This creation could not be loaded." onRetry={() => void creation.refetch()} />;
  const beforeId = creation.data.bindings.find((binding) => binding.bindingKey === 'before')?.mediaId;
  const afterId = creation.data.bindings.find((binding) => binding.bindingKey === 'after')?.mediaId;
  const availableAfter = workspace.data?.media.filter((media) => media.kind === 'source' && media.id !== beforeId) ?? [];
  const selectedTemplate = editor.document.templateRef === null ? null : `${editor.document.templateRef.templateId}@${editor.document.templateRef.templateVersion}`;
  const selectedTemplateDefinition = editor.document.templateRef === null ? null : (creation.data.project.type === 'before_after_video' ? requireBuiltInVideoTemplate(editor.document.templateRef.templateId, editor.document.templateRef.templateVersion) : requireBuiltInTemplate(editor.document.templateRef.templateId, editor.document.templateRef.templateVersion)) as any;
  const previewWidth = Math.min(dimensions.width - 40, dimensions.height > dimensions.width ? 360 : 460);
  const previewHeight = Math.min(460, Math.max(280, previewWidth / (plan?.canvas.width ?? 4) * (plan?.canvas.height ?? 5)));

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
          <View style={styles.card}>
            <Text style={styles.label}>CREATION EDITOR · {editor.persistence.phase.toUpperCase()}</Text>
            <Text style={styles.muted}>Draft revision {editor.serverRevision}. Patient media stays in a temporary authenticated cache.</Text>
            {planState.failed ? <ErrorState title="Composition unavailable" detail="The secured draft could not be rendered safely. Reload and try again." onRetry={() => void creation.refetch().then((result) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })} /> : creation.data.project.type === 'before_after_video' && editor.document.templateRef !== null && resolvedBindings !== null ? <CompositionErrorBoundary onRecover={() => void creation.refetch().then((result) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })}><NativeVideoPreview document={editor.document as any} template={selectedTemplateDefinition} assets={resolvedBindings} width={previewWidth} height={previewHeight} /></CompositionErrorBoundary> : plan === null ? <PrimaryButton label={afterId === undefined ? 'Choose after photo first' : 'Choose premium template'} onPress={() => router.push(`/creations/${creationId}/templates`)} /> : <CompositionErrorBoundary onRecover={() => void creation.refetch().then((result) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })}><NativeCompositionPreview plan={plan} width={previewWidth} height={previewHeight} editor={{ selectedBindingKey, onSelectSlot: setSelectedBindingKey, onGestureCommit, onResetSlot: (key) => editor.edit(resetSlotTransform(editor.document as any, key)) }} /></CompositionErrorBoundary>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton label="Templates" onPress={() => router.push(`/creations/${creationId}/templates`)} />
              <PrimaryButton label="History" onPress={() => router.push(`/creations/${creationId}/history`)} />
              <PrimaryButton label="Export" disabled={plan === null && creation.data.project.type !== 'before_after_video'} onPress={() => router.push(`/creations/${creationId}/export`)} />
            </View>
            {previewError !== null ? <Text style={styles.muted}>{previewError}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>PHOTO CONTROLS</Text>
            <Text style={styles.body}>Tap Before or After in the composition. Pan, pinch, rotate where allowed, or double tap to reset. Changes save after the gesture ends.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton label={selectedBindingKey === 'before' ? 'Before selected' : 'Select Before'} onPress={() => setSelectedBindingKey('before')} />
              <PrimaryButton label={selectedBindingKey === 'after' ? 'After selected' : 'Select After'} disabled={afterId === undefined} onPress={() => setSelectedBindingKey('after')} />
              <PrimaryButton label="Swap" disabled={afterId === undefined || swap.isPending} onPress={() => swap.mutate()} />
            </View>
            {afterId === undefined ? availableAfter.map((media) => <PrimaryButton key={media.id} label={bindAfter.isPending ? 'Saving…' : `Use ${media.id.slice(0, 8)} as After`} disabled={bindAfter.isPending} onPress={() => bindAfter.mutate(media.id)} />) : <Text style={styles.muted}>After media bound: {afterId.slice(0, 8)}</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>LABELS AND THEME</Text>
            <TextInput accessibilityLabel="Before label" editable={selectedTemplateDefinition !== null} style={styles.input} value={(editor.document as any).editableTextState?.beforeLabel ?? ''} maxLength={80} onChangeText={(beforeLabel) => updateDocumentSafely(() => updateEditableText(editor.document as any, 'beforeLabel', beforeLabel))} />
            <TextInput accessibilityLabel="After label" editable={selectedTemplateDefinition !== null} style={styles.input} value={(editor.document as any).editableTextState?.afterLabel ?? ''} maxLength={80} onChangeText={(afterLabel) => updateDocumentSafely(() => updateEditableText(editor.document as any, 'afterLabel', afterLabel))} />
            <TextInput accessibilityLabel="Title" editable={selectedTemplateDefinition?.editableLabels.includes('title') === true} style={styles.input} value={(editor.document as any).editableTextState?.title ?? ''} maxLength={80} onChangeText={(title) => updateDocumentSafely(() => updateEditableText(editor.document as any, 'title', title))} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {((selectedTemplateDefinition?.allowedStyleTokens as string[]) ?? []).map((theme: string) => <PrimaryButton key={theme} label={(editor.document as any).styleState?.theme === theme ? `${theme} selected` : theme} disabled={(editor.document as any).styleState?.theme === theme} onPress={() => updateDocumentSafely(() => updateTemplateTheme(editor.document as any, theme as any))} />)}
            </View>
            <Text style={styles.muted}>Template: {selectedTemplate ?? 'not selected'}.</Text>
            {editorInputError !== null ? <ErrorState title="Editor value not accepted" detail={editorInputError} onRetry={() => setEditorInputError(null)} /> : null}
          </View>

          {editor.persistence.phase === 'conflict' ? <ErrorState title="Draft conflict" detail="Another session changed this creation. Reload the server draft; local changes are not overwritten automatically." onRetry={() => void creation.refetch().then((result) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })} /> : null}
          {editor.persistence.phase === 'save-error' ? <ErrorState title="Save pending" detail="Your local edit is still available. Retry the explicit save before leaving." onRetry={() => void editor.retry()} /> : null}
          <PrimaryButton label={saveRevision.isPending ? 'Saving version…' : 'Save version'} disabled={(plan === null && creation.data.project.type !== 'before_after_video') || saveRevision.isPending || editor.persistence.phase === 'conflict'} onPress={() => saveRevision.mutate()} />
          {saveRevision.isSuccess ? <Text style={styles.muted}>Version saved at {saveRevision.data.data.createdAt}.</Text> : null}
          {saveRevision.isError || bindAfter.isError || swap.isError ? <ErrorState detail="The requested server checkpoint was not completed. Refresh and retry deliberately." onRetry={() => void creation.refetch()} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
