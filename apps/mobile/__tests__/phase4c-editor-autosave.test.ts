import type { CreationDocument } from '@dentpilot/contracts';

import { createEditorAutosave, type EditorPersistenceState, type SavedDraftAcknowledgement } from '../src/creation/editor-autosave';

const document = (label: string): CreationDocument => ({
  schemaVersion: 1,
  templateRef: { templateId: 'premium-split', templateVersion: 1 },
  canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: {
    before: { panX: 0, panY: 0, scale: 1, rotation: 0 },
    after: { panX: 0, panY: 0, scale: 1, rotation: 0 },
  },
  editableTextState: { beforeLabel: label, afterLabel: 'After' },
  styleState: { theme: 'clinical-neutral' },
});

const acknowledgement = (revision: number, next: CreationDocument): SavedDraftAcknowledgement => ({ revision, document: next, updatedAt: `2026-08-28T00:00:0${revision}.000Z` });

type Deferred<T> = { readonly promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
  return { promise, resolve, reject };
}

describe('Phase 4C editor autosave state machine', () => {
  it('marks a gesture-end edit dirty and saves only through the scheduled checkpoint', async () => {
    const scheduled: Array<() => void> = [];
    const events: EditorPersistenceState[] = [];
    const saves: CreationDocument[] = [];
    const autosave = createEditorAutosave({
      creationId: '11111111-1111-4111-8111-111111111111', initialDocument: document('Before'), initialRevision: 2,
      api: { saveDraft: async (_id, _revision, next) => { saves.push(next); return acknowledgement(3, next); } },
      onState: (state) => events.push(state), schedule: (callback) => { scheduled.push(callback); return 1; }, cancel: () => undefined,
    });
    autosave.edit(document('Gesture saved'));
    expect(autosave.getState().phase).toBe('dirty');
    expect(saves).toHaveLength(0);
    scheduled.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(saves).toHaveLength(1);
    expect(autosave.getState()).toMatchObject({ phase: 'saved', serverRevision: 3, document: { editableTextState: { beforeLabel: 'Gesture saved' } } });
    expect(events.map((event) => event.phase)).toEqual(['dirty', 'saving', 'saved']);
  });

  it('never lets an older save response mark a newer local edit clean and coalesces the latest document', async () => {
    const scheduled: Array<() => void> = [];
    const first = deferred<SavedDraftAcknowledgement>();
    const saves: CreationDocument[] = [];
    const autosave = createEditorAutosave({
      creationId: '11111111-1111-4111-8111-111111111111', initialDocument: document('Before'), initialRevision: 2,
      api: { saveDraft: async (_id, _revision, next) => { saves.push(next); return saves.length === 1 ? first.promise : acknowledgement(4, next); } },
      onState: () => undefined, schedule: (callback) => { scheduled.push(callback); return 1; }, cancel: () => undefined,
    });
    autosave.edit(document('First'));
    scheduled.shift()!();
    await Promise.resolve();
    autosave.edit(document('Second'));
    first.resolve(acknowledgement(3, document('First')));
    await Promise.resolve();
    await Promise.resolve();
    expect(autosave.getState()).toMatchObject({ serverRevision: 3, document: { editableTextState: { beforeLabel: 'Second' } } });
    await autosave.flush();
    expect(saves.map((entry) => entry.editableTextState.beforeLabel)).toEqual(['First', 'Second']);
    expect(autosave.getState()).toMatchObject({ phase: 'saved', serverRevision: 4, document: { editableTextState: { beforeLabel: 'Second' } } });
  });

  it('uses the reloaded authoritative revision after Save Version, while a genuine remote conflict remains a conflict', async () => {
    const expectedRevisions: number[] = [];
    const autosave = createEditorAutosave({
      creationId: '11111111-1111-4111-8111-111111111111', initialDocument: document('Before'), initialRevision: 2,
      api: { saveDraft: async (_id, expectedRevision, next) => { expectedRevisions.push(expectedRevision); if (expectedRevision !== 3) throw { code: 'CREATION_REVISION_CONFLICT' }; return acknowledgement(4, next); } },
      onState: () => undefined, schedule: () => 1, cancel: () => undefined,
    });
    // UI Save Version has completed and refetched draft revision 3 rather than inferring it locally.
    autosave.replaceFromServer(document('Version checkpoint'), 3);
    autosave.edit(document('Next edit'));
    await expect(autosave.flush()).resolves.toMatchObject({ phase: 'saved', serverRevision: 4 });
    expect(expectedRevisions).toEqual([3]);
    autosave.replaceFromServer(document('Remote checkpoint'), 5);
    autosave.edit(document('True remote conflict'));
    await expect(autosave.flush()).resolves.toMatchObject({ phase: 'conflict', serverRevision: 5 });
  });

  it('cancels scheduled autosave and ignores late async completion after dispose', async () => {
    const scheduled: Array<() => void> = [];
    const states: EditorPersistenceState[] = [];
    const autosave = createEditorAutosave({
      creationId: '11111111-1111-4111-8111-111111111111', initialDocument: document('Before'), initialRevision: 2,
      api: { saveDraft: async () => acknowledgement(3, document('saved')) },
      onState: (state) => states.push(state), schedule: (callback) => { scheduled.push(callback); return 1; }, cancel: () => undefined,
    });
    autosave.edit(document('Dispose before timer'));
    autosave.dispose();
    scheduled.shift()!();
    await Promise.resolve();
    expect(states.map((state) => state.phase)).toEqual(['dirty']);

    const late = deferred<SavedDraftAcknowledgement>();
    const duringSave = createEditorAutosave({
      creationId: '11111111-1111-4111-8111-111111111111', initialDocument: document('Before'), initialRevision: 2,
      api: { saveDraft: async () => late.promise }, onState: (state) => states.push(state), schedule: () => 1, cancel: () => undefined,
    });
    duringSave.edit(document('In flight'));
    const flushing = duringSave.flush();
    duringSave.dispose();
    late.resolve(acknowledgement(3, document('In flight')));
    await flushing;
    expect(duringSave.getState()).toMatchObject({ phase: 'saving', serverRevision: 2 });
  });

  it('preserves dirty local data for a conflict or save failure and requires an explicit reload/retry decision', async () => {
    const scheduled: Array<() => void> = [];
    let mode: 'conflict' | 'failure' = 'conflict';
    const autosave = createEditorAutosave({
      creationId: '11111111-1111-4111-8111-111111111111', initialDocument: document('Before'), initialRevision: 2,
      api: { saveDraft: async () => { if (mode === 'conflict') throw { code: 'CREATION_REVISION_CONFLICT' }; throw new Error('offline'); } },
      onState: () => undefined, schedule: (callback) => { scheduled.push(callback); return 1; }, cancel: () => undefined,
    });
    autosave.edit(document('Local conflict'));
    scheduled.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(autosave.getState()).toMatchObject({ phase: 'conflict', document: { editableTextState: { beforeLabel: 'Local conflict' } } });
    autosave.replaceFromServer(document('Server latest'), 8);
    expect(autosave.getState()).toMatchObject({ phase: 'clean', serverRevision: 8, document: { editableTextState: { beforeLabel: 'Server latest' } } });
    mode = 'failure';
    autosave.edit(document('Retry me'));
    scheduled.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(autosave.getState()).toMatchObject({ phase: 'save-error', document: { editableTextState: { beforeLabel: 'Retry me' } } });
    expect(autosave.hasUnsavedChanges()).toBe(true);
  });
});
