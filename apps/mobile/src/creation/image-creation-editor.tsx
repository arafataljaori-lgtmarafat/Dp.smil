import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { createRenderPlanForDocument, requireBuiltInTemplate, type CreationRenderAsset, type RenderPlan } from '@dentpilot/application';
import type { CreationBindingKey } from '@dentpilot/contracts';

import { dentPilotApi } from '../../src/api/client';
import { useAuth } from '../../src/auth/auth-provider';
import { applySavedCreationDraftToCache, creationQueryKey, fetchCoherentCreation, invalidateCreationQuery } from '../../src/creation/creation-query-cache';
import { runWithDurableEditorCheckpoint } from '../../src/creation/editor-binding-checkpoint';
import { CompositionErrorBoundary } from '../../src/creation/composition-error-boundary';
import { applySlotPan, applySlotPinch, applySlotRotation, resetSlotTransform, swapBeforeAfter, updateEditableText, updateTemplateTheme } from '../../src/creation/editor-operations';
import { NativeCompositionPreview } from '../../src/creation/native-composition-preview';
import type { EditorGestureCommit } from '../../src/creation/native-composition-preview.types';
import { loadPrivatePreview } from '../../src/creation/protected-preview-cache';
import { useCreationEditor } from '../../src/creation/use-creation-editor';
import { ErrorState, LoadingState, PrimaryButton, Screen, styles } from '../../src/components/ui';
import { SmileAiStudioModal } from './smile-ai-studio-modal';
import { useAiGeneration } from './use-ai-generation';
import { useCachePrewarmer } from './use-cache-prewarmer';

const transformForNewSlot = { panX: 0, panY: 0, scale: 1, rotation: 0 } as const;

export function ImageCreationEditor({ creationId, creation, workspace }: { creationId: string, creation: any, workspace: any }): React.JSX.Element {
    const { account, state: authState } = useAuth();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const dimensions = useWindowDimensions();
  const [previewUris, setPreviewUris] = useState<Readonly<Record<string, string>>>({});
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedBindingKey, setSelectedBindingKey] = useState<CreationBindingKey | null>('before');
  const [editorInputError, setEditorInputError] = useState<string | null>(null);
  const [isAiStudioOpen, setIsAiStudioOpen] = useState(false);
  const aiGen = useAiGeneration();
  
  
  const editor = useCreationEditor({
    creationId,
    initialDocument: creation?.draft.document ?? ({ schemaVersion: 1, templateRef: null, canvas: { aspectRatioKey: 'portrait_4_5' }, slotState: { before: transformForNewSlot }, editableTextState: { beforeLabel: 'Before', afterLabel: 'After' }, styleState: { theme: 'clinical-neutral' } }),
    initialRevision: creation?.draft.revision ?? 1,
    identityKey: account?.id ?? null,
    onSaved: (saved) => {
      applySavedCreationDraftToCache(queryClient, creationId, saved);
      void invalidateCreationQuery(queryClient, creationId);
    },
  });

  useEffect(() => {
    if (account === null || creation === undefined || workspace === undefined) return;
    let active = true;
    const mediaById = new Map(workspace.media.map((media: any) => [media.id, media]));
    void Promise.all(creation.bindings.map(async (binding: any) => {
      const media = mediaById.get(binding.mediaId);
      if (media === undefined) throw new Error('A creation binding does not resolve to private case media.');
      return [binding.mediaId, await loadPrivatePreview({ accountId: account.id, mediaId: media.id })] as const;
    })).then((entries) => {
      if (active) { setPreviewUris(Object.fromEntries(entries)); setPreviewError(null); }
    }).catch(() => { if (active) setPreviewError('Protected preview is unavailable. The original remains private and unchanged.'); });
    return () => { active = false; };
  }, [account, creation, workspace]);

  const planState = useMemo<{ readonly plan: RenderPlan | null; readonly failed: boolean }>(() => {
    if (creation === undefined || workspace === undefined || editor.document.templateRef === null) return { plan: null, failed: false };
    try {
      const mediaById = new Map(workspace.media.map((media: any) => [media.id, media]));
      const bindings = creation.bindings.map((binding: any): CreationRenderAsset | null => {
        const media = mediaById.get(binding.mediaId);
        const source = previewUris[binding.mediaId];
        return media === undefined || source === undefined ? null : { bindingKey: binding.bindingKey, mediaId: media.id, width: media.width, height: media.height, source };
      });
      if (bindings.some((binding: any) => binding === null)) return { plan: null, failed: false };
      return { plan: createRenderPlanForDocument({ document: editor.document, bindings: bindings.filter((binding: any): binding is CreationRenderAsset => binding !== null), target: { width: 720, height: 960 } }), failed: false };
    } catch (error) {
      const errorName = error instanceof Error ? error.name : 'unknown';
      console.error('composition-plan-failure', { component: 'creation-editor', errorName });
      return { plan: null, failed: true };
    }
  }, [creation, editor.document, previewUris, workspace]);
  const plan = planState.plan;

  const bindAfter = useMutation({
    mutationFn: async (mediaId: string) => {
      if (creation === undefined) throw new Error('Creation is unavailable.');
      await runWithDurableEditorCheckpoint(editor.flush, async (checkpoint) => {
        const result = await dentPilotApi.replaceCreationBindings(creationId, checkpoint.serverRevision, [...creation.bindings.filter((binding: any) => binding.bindingKey !== 'after'), { bindingKey: 'after', mediaId }]);
        const serverDraft = result.data.draft;
        editor.reload(serverDraft.document, serverDraft.revision);
        if (serverDraft.document.slotState.after === undefined) editor.edit({ ...serverDraft.document, slotState: { ...serverDraft.document.slotState, after: transformForNewSlot } });
      });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['creation', creationId] }),
  });

  const swap = useMutation({
    mutationFn: async () => {
      if (creation === undefined) throw new Error('Creation is unavailable.');
      await runWithDurableEditorCheckpoint(editor.flush, async (checkpoint) => {
        const next = swapBeforeAfter({ document: checkpoint.document, bindings: creation.bindings });
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
    let next = applySlotPan({ document: editor.document, bindingKey: gesture.bindingKey, deltaX: gesture.deltaX, deltaY: gesture.deltaY, slotWidth: image.clip.width, slotHeight: image.clip.height });
    next = applySlotPinch(next, gesture.bindingKey, gesture.scaleFactor);
    editor.edit(applySlotRotation(next, gesture.bindingKey, gesture.rotationDeltaDegrees));
  }, [editor, plan]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!editor.hasUnsavedChanges) return;
      event.preventDefault();
      void editor.flush().then((result: any) => {
        if (result?.phase === 'saved' || result?.phase === 'clean') navigation.dispatch(event.data.action);
        else Alert.alert('Draft not saved', 'Your latest local edit remains open. Resolve the save state before leaving.');
      });
    });
    return unsubscribe;
  }, [editor, navigation]);

  if (authState.status !== 'authenticated' || creation.isPending) return <LoadingState label="Loading secure creationâ€¦" />;
    const beforeId = creation.bindings.find((binding: any) => binding.bindingKey === 'before')?.mediaId;
  const afterId = creation.bindings.find((binding: any) => binding.bindingKey === 'after')?.mediaId;
  const availableAfter = workspace?.media.filter((media: any) => media.kind === 'source' && media.id !== beforeId) ?? [];
  const selectedTemplate = editor.document.templateRef === null ? null : `${editor.document.templateRef.templateId}@${editor.document.templateRef.templateVersion}`;
  const selectedTemplateDefinition = editor.document.templateRef === null ? null : requireBuiltInTemplate(editor.document.templateRef.templateId, editor.document.templateRef.templateVersion);
  const previewWidth = Math.min(dimensions.width - 40, dimensions.height > dimensions.width ? 360 : 460);
  const previewHeight = Math.min(460, Math.max(280, previewWidth / (plan?.canvas.width ?? 4) * (plan?.canvas.height ?? 5)));

  // Phase 7: Background Cache Pre-Warming
  useCachePrewarmer([beforeId, afterId]);

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
          <View style={styles.card}>
            <Text style={styles.label}>CREATION EDITOR آ· {editor.persistence.phase.toUpperCase()}</Text>
            <Text style={styles.muted}>Draft revision {editor.serverRevision}. Patient media stays in a temporary authenticated cache.</Text>
            {planState.failed ? <ErrorState title="Composition unavailable" detail="The secured draft could not be rendered safely. Reload and try again." onRetry={() => void creation.refetch().then((result: any) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })} /> : plan === null ? <PrimaryButton label={afterId === undefined ? 'Choose after photo first' : 'Choose premium template'} onPress={() => router.push(`/creations/${creationId}/templates`)} /> : <CompositionErrorBoundary onRecover={() => void creation.refetch().then((result: any) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })}><NativeCompositionPreview plan={plan} width={previewWidth} height={previewHeight} editor={{ selectedBindingKey, onSelectSlot: setSelectedBindingKey, onGestureCommit, onResetSlot: (key) => editor.edit(resetSlotTransform(editor.document, key)) }} /></CompositionErrorBoundary>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton label="Templates" onPress={() => router.push(`/creations/${creationId}/templates`)} />
              <PrimaryButton label="History" onPress={() => router.push(`/creations/${creationId}/history`)} />
              <PrimaryButton label="AI Studio ?" onPress={() => setIsAiStudioOpen(true)} />
              <PrimaryButton label="Export" disabled={plan === null} onPress={() => router.push(`/creations/${creationId}/export`)} />
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
            {afterId === undefined ? availableAfter.map((media: any) => <PrimaryButton key={media.id} label={bindAfter.isPending ? 'Savingâ€¦' : `Use ${media.id.slice(0, 8)} as After`} disabled={bindAfter.isPending} onPress={() => bindAfter.mutate(media.id)} />) : <Text style={styles.muted}>After media bound: {afterId.slice(0, 8)}</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>LABELS AND THEME</Text>
            <TextInput accessibilityLabel="Before label" editable={selectedTemplateDefinition !== null} style={styles.input} value={editor.document.editableTextState.beforeLabel ?? ''} maxLength={80} onChangeText={(beforeLabel) => updateDocumentSafely(() => updateEditableText(editor.document, 'beforeLabel', beforeLabel))} />
            <TextInput accessibilityLabel="After label" editable={selectedTemplateDefinition !== null} style={styles.input} value={editor.document.editableTextState.afterLabel ?? ''} maxLength={80} onChangeText={(afterLabel) => updateDocumentSafely(() => updateEditableText(editor.document, 'afterLabel', afterLabel))} />
            <TextInput accessibilityLabel="Title" editable={selectedTemplateDefinition?.editableLabels.includes('title') === true} style={styles.input} value={editor.document.editableTextState.title ?? ''} maxLength={80} onChangeText={(title) => updateDocumentSafely(() => updateEditableText(editor.document, 'title', title))} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(selectedTemplateDefinition?.allowedStyleTokens ?? []).map((theme) => <PrimaryButton key={theme} label={editor.document.styleState.theme === theme ? `${theme} selected` : theme} disabled={editor.document.styleState.theme === theme} onPress={() => updateDocumentSafely(() => updateTemplateTheme(editor.document, theme))} />)}
            </View>
            <Text style={styles.muted}>Template: {selectedTemplate ?? 'not selected'}.</Text>
            {editorInputError !== null ? <ErrorState title="Editor value not accepted" detail={editorInputError} onRetry={() => setEditorInputError(null)} /> : null}
          </View>

          {editor.persistence.phase === 'conflict' ? <ErrorState title="Draft conflict" detail="Another session changed this creation. Reload the server draft; local changes are not overwritten automatically." onRetry={() => void creation.refetch().then((result: any) => { if (result.data) editor.reload(result.data.draft.document, result.data.draft.revision); })} /> : null}
          {editor.persistence.phase === 'save-error' ? <ErrorState title="Save pending" detail="Your local edit is still available. Retry the explicit save before leaving." onRetry={() => void editor.retry()} /> : null}
          <PrimaryButton label={saveRevision.isPending ? 'Saving versionâ€¦' : 'Save version'} disabled={plan === null || saveRevision.isPending || editor.persistence.phase === 'conflict'} onPress={() => saveRevision.mutate()} />
          {saveRevision.isSuccess ? <Text style={styles.muted}>Version saved at {saveRevision.data.data.createdAt}.</Text> : null}
          {saveRevision.isError || bindAfter.isError || swap.isError ? <ErrorState detail="The requested server checkpoint was not completed. Refresh and retry deliberately." onRetry={() => void creation.refetch()} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Smile AI Integration Phase 6 + Cache Pre-Warming Phase 7 */}
      <SmileAiStudioModal
        isVisible={isAiStudioOpen}
        onClose={() => setIsAiStudioOpen(false)}
        sourceImageUri={previewUris[beforeId ?? ''] ?? ''}
        onTriggerAiSimulation={async (params) => {
          if (!workspace?.id || !beforeId || !account) return null;
          // Trigger generation on backend
          const newMediaId = await aiGen.triggerGeneration(workspace.id, undefined);
          if (newMediaId) {
            // Pre-warm the cache immediately before revealing
            const prewarmedUri = await loadPrivatePreview({ accountId: account.id, mediaId: newMediaId });
            // Apply it as After in the background
            bindAfter.mutate(newMediaId);
            return prewarmedUri;
          }
          return null;
        }}
        onExportVideo={() => router.push(`/creations/${creationId}/export`)}
      />
    </Screen>
  );
}

