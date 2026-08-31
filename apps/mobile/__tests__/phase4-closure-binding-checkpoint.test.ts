import type { CreationDocument } from '@dentpilot/contracts';

import { createEditorAutosave } from '../src/creation/editor-autosave';
import { runWithDurableEditorCheckpoint } from '../src/creation/editor-binding-checkpoint';

const initial: CreationDocument = {
  schemaVersion: 1, templateRef: { templateId: 'premium-split', templateVersion: 1 }, canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 }, after: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After', title: 'Initial title' }, styleState: { theme: 'clinical-neutral' },
};
const edited: CreationDocument = { ...initial, editableTextState: { ...initial.editableTextState, title: 'Unsaved title must remain' } };

function coordinator(saveDraft: (document: CreationDocument) => Promise<{ revision: number; document: CreationDocument; updatedAt: string }>) {
  return createEditorAutosave({
    creationId: '11111111-1111-4111-8111-111111111111', initialDocument: initial, initialRevision: 2,
    api: { saveDraft: async (_id, _expected, document) => saveDraft(document) }, onState: () => undefined, schedule: () => 1, cancel: () => undefined,
  });
}

describe('Phase 4 Closure Stage 1 binding checkpoint serialization', () => {
  it('persists dirty text before binding mutation and retains it through authoritative binding draft reload', async () => {
    const editor = coordinator(async (document) => ({ revision: 3, document, updatedAt: '2026-08-28T00:00:03.000Z' }));
    editor.edit(edited);
    let boundRevision: number | null = null;
    const draftReturnedToEditor: { value: CreationDocument | null } = { value: null };
    await runWithDurableEditorCheckpoint(editor.flush, async (checkpoint) => {
      boundRevision = checkpoint.serverRevision;
      // The binding endpoint returns the current aggregate draft created after checkpoint.
      draftReturnedToEditor.value = checkpoint.document;
      editor.replaceFromServer(checkpoint.document, 4);
    });
    expect(boundRevision).toBe(3);
    expect(draftReturnedToEditor.value?.editableTextState.title).toBe('Unsaved title must remain');
    expect(editor.getDocument().editableTextState.title).toBe('Unsaved title must remain');
  });

  it.each(['network', 'conflict'] as const)('does not execute binding mutation when pre-binding save has %s failure', async (mode) => {
    const editor = coordinator(async () => { if (mode === 'conflict') throw { code: 'CREATION_REVISION_CONFLICT' }; throw new Error('offline'); });
    editor.edit(edited);
    const mutateBinding = jest.fn(async () => undefined);
    await expect(runWithDurableEditorCheckpoint(editor.flush, mutateBinding)).rejects.toThrow(/Resolve the draft save state/i);
    expect(mutateBinding).not.toHaveBeenCalled();
    expect(editor.getDocument().editableTextState.title).toBe('Unsaved title must remain');
  });
});
