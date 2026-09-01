import type { CreationDocument } from '@dentpilot/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

import { dentPilotApi, MobileApiError } from '../api/client';
import { createEditorAutosave, type EditorPersistenceState, type SavedDraftAcknowledgement } from './editor-autosave';

type EditorCoordinator = ReturnType<typeof createEditorAutosave>;
type UseCreationEditorInput = {
  readonly creationId: string;
  readonly initialDocument: CreationDocument;
  readonly initialRevision: number;
  /** Account identity that owns this mounted editing session; null disposes all work. */
  readonly identityKey: string | null;
  readonly onSaved?: (saved: SavedDraftAcknowledgement) => void;
};

export function useCreationEditor(input: UseCreationEditorInput) {
  const [persistence, setPersistence] = useState<EditorPersistenceState>({
    phase: 'clean', document: input.initialDocument, serverRevision: input.initialRevision, localVersion: 0,
  });
  const coordinator = useRef<{ readonly creationId: string; readonly value: EditorCoordinator } | null>(null);
  const onSavedRef = useRef(input.onSaved);

  useEffect(() => {
    onSavedRef.current = input.onSaved;
  }, [input.onSaved]);

  const createCoordinator = useCallback((creationId: string, initialDocument: CreationDocument, initialRevision: number): EditorCoordinator => createEditorAutosave({
    creationId,
    initialDocument,
    initialRevision,
    api: {
      saveDraft: async (draftCreationId, expectedRevision, document) => {
        const result = await dentPilotApi.saveCreationDraft(draftCreationId, expectedRevision, document);
        return result.data;
      },
    },
    isConflict: (error) => error instanceof MobileApiError && error.code === 'CREATION_REVISION_CONFLICT',
    onState: (state) => {
      setPersistence(state);
    },
    onAcknowledgedSave: (saved) => onSavedRef.current?.(saved),
  }), []);

  // A mounted editor identity owns exactly one coordinator. Prop-reference changes may hydrate a
  // clean coordinator, but cannot dispose an active session or leave an orphaned debounce timer.
  useEffect(() => {
    coordinator.current?.value.dispose();
    coordinator.current = null;
    if (input.identityKey === null) return undefined;
    const value = createCoordinator(input.creationId, input.initialDocument, input.initialRevision);
    coordinator.current = { creationId: input.creationId, value };
    setPersistence(value.getState());
    return () => {
      if (coordinator.current?.value === value) coordinator.current = null;
      value.dispose();
    };
  }, [createCoordinator, input.creationId, input.identityKey]);

  useEffect(() => {
    const current = coordinator.current;
    if (input.identityKey !== null && current !== null && current.creationId === input.creationId && !current.value.hasUnsavedChanges() && input.initialRevision > current.value.getServerRevision()) {
      current.value.replaceFromServer(input.initialDocument, input.initialRevision);
    }
  }, [input.creationId, input.identityKey, input.initialDocument, input.initialRevision]);

  const current = coordinator.current?.creationId === input.creationId ? coordinator.current.value : null;
  const edit = useCallback((next: CreationDocument): void => {
    const value = coordinator.current?.value;
    if (value === undefined) return;
    value.edit(next);
  }, []);
  const flush = useCallback(async (): Promise<EditorPersistenceState | null> => coordinator.current?.value.flush() ?? null, []);
  const retry = useCallback(async (): Promise<EditorPersistenceState | null> => coordinator.current?.value.retry() ?? null, []);
  const reload = useCallback((document: CreationDocument, revision: number): void => coordinator.current?.value.replaceFromServer(document, revision), []);

  return {
    persistence,
    document: current?.getDocument() ?? input.initialDocument,
    serverRevision: current?.getServerRevision() ?? input.initialRevision,
    edit,
    flush,
    retry,
    reload,
    hasUnsavedChanges: current?.hasUnsavedChanges() ?? false,
  };
}
