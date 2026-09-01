import type { EditorPersistenceState } from './editor-autosave';

export type DurableEditorCheckpoint = EditorPersistenceState & { readonly phase: 'saved' | 'clean' };

/** Serializes a binding mutation after the latest local document reaches a durable CAS checkpoint. */
export async function runWithDurableEditorCheckpoint<T>(flush: () => Promise<EditorPersistenceState | null>, mutation: (checkpoint: DurableEditorCheckpoint) => Promise<T>): Promise<T> {
  const checkpoint = await flush();
  if (checkpoint === null || (checkpoint.phase !== 'saved' && checkpoint.phase !== 'clean')) {
    throw new Error('Resolve the draft save state before changing media.');
  }
  return mutation(checkpoint as DurableEditorCheckpoint);
}
