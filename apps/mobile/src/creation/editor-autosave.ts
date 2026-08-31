/* eslint-disable */
import type { CreationDocument, CreationDraftDto, VideoCompositionDocument } from '@dentpilot/contracts';

type AnyDocument = CreationDocument | VideoCompositionDocument;

export type EditorPersistencePhase = 'clean' | 'dirty' | 'saving' | 'saved' | 'save-error' | 'conflict';

export type EditorPersistenceState<T extends AnyDocument = CreationDocument> = {
  readonly phase: EditorPersistencePhase;
  readonly document: T;
  readonly serverRevision: number;
  readonly localVersion: number;
  readonly message?: string;
};

export type SavedDraftAcknowledgement<T extends AnyDocument = CreationDocument> = {
  readonly revision: number;
  readonly document: T;
  readonly updatedAt: string;
};
type SaveResult<T extends AnyDocument> = SavedDraftAcknowledgement<T>;
type AutosaveApi<T extends AnyDocument = CreationDocument> = {
  saveDraft(creationId: string, expectedRevision: number, document: T): Promise<SaveResult<T>>;
};
type ScheduledHandle = ReturnType<typeof setTimeout> | number;
type EditorAutosaveOptions<T extends AnyDocument = CreationDocument> = {
  readonly creationId: string;
  readonly initialDocument: T;
  readonly initialRevision: number;
  readonly api: AutosaveApi<T>;
  readonly onState: (state: EditorPersistenceState<T>) => void;
  /** Runs after acknowledged document/revision are applied, immediately before `saved` is published. */
  readonly onAcknowledgedSave?: (saved: SavedDraftAcknowledgement<T>) => void;
  readonly debounceMs?: number;
  readonly schedule?: (callback: () => void, delayMs: number) => ScheduledHandle;
  readonly cancel?: (handle: ScheduledHandle) => void;
  readonly isConflict?: (error: unknown) => boolean;
};

export const editorAutosavePolicy = {
  debounceMs: 700,
} as const;

/**
 * In-memory editor persistence coordinator. It stores no document or media on disk. A save is
 * serialized against the server's expectedRevision, and completion applies only to the captured
 * local version so a newer gesture/end-edit cannot be marked clean by an older response.
 */
export function createEditorAutosave<T extends AnyDocument = CreationDocument>(options: EditorAutosaveOptions<T>) {
  const debounceMs = options.debounceMs ?? editorAutosavePolicy.debounceMs;
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  const isConflict = options.isConflict ?? ((error) => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'CREATION_REVISION_CONFLICT');
  let document = options.initialDocument;
  let serverRevision = options.initialRevision;
  let localVersion = 0;
  let timer: ScheduledHandle | null = null;
  let disposed = false;
  let generation = 0;
  let flushPromise: Promise<EditorPersistenceState<T>> | null = null;
  let state: EditorPersistenceState<T> = { phase: 'clean', document, serverRevision, localVersion };

  const publish = (phase: EditorPersistencePhase, message?: string): void => {
    if (disposed) return;
    state = message === undefined
      ? { phase, document, serverRevision, localVersion }
      : { phase, document, serverRevision, localVersion, message };
    options.onState(state);
  };
  const clearTimer = (): void => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const scheduleLatest = (): void => {
    if (disposed) return;
    clearTimer();
    timer = schedule(() => {
      timer = null;
      void flush();
    }, debounceMs);
  };

  const flush = (): Promise<EditorPersistenceState<T>> => {
    clearTimer();
    if (disposed || state.phase === 'clean' || state.phase === 'saved' || state.phase === 'conflict') return Promise.resolve(state);
    if (flushPromise !== null) return flushPromise;

    const work = async (): Promise<EditorPersistenceState<T>> => {
      // A local edit arriving during a save is persisted by the next serialized iteration. This
      // means Save Version and binding changes wait for a durable latest-document checkpoint.
      while (!disposed && state.phase !== 'clean' && state.phase !== 'saved' && state.phase !== 'conflict') {
        const versionAtStart = localVersion;
        const documentAtStart = document;
        const revisionAtStart = serverRevision;
        const generationAtStart = generation;
        publish('saving');
        try {
          const saved = await options.api.saveDraft(options.creationId, revisionAtStart, documentAtStart);
          if (disposed || generationAtStart !== generation) return state;
          serverRevision = saved.revision;
          if (versionAtStart === localVersion) {
            document = saved.document as T;
            options.onAcknowledgedSave?.(saved);
            publish('saved');
            return state;
          }
          publish('dirty');
        } catch (error) {
          if (disposed || generationAtStart !== generation) return state;
          if (isConflict(error)) publish('conflict', 'This draft changed on another session. Reload the latest version before saving again.');
          else publish('save-error', 'The latest local edit is still on this screen. Retry saving before leaving.');
          return state;
        }
      }
      return state;
    };

    flushPromise = work().finally(() => { flushPromise = null; });
    return flushPromise;
  };

  const edit = (nextDocument: T): void => {
    if (disposed) return;
    document = nextDocument;
    localVersion += 1;
    publish('dirty');
    if (flushPromise === null) scheduleLatest();
  };

  const replaceFromServer = (nextDocument: T, nextRevision: number): void => {
    if (disposed) return;
    clearTimer();
    generation += 1;
    document = nextDocument;
    serverRevision = nextRevision;
    localVersion += 1;
    publish('clean');
  };

  return {
    edit,
    flush,
    retry: async () => {
      if (state.phase === 'conflict') return state;
      return flush();
    },
    replaceFromServer,
    getState: () => state,
    getDocument: () => document,
    getServerRevision: () => serverRevision,
    hasUnsavedChanges: () => state.phase === 'dirty' || state.phase === 'saving' || state.phase === 'save-error',
    dispose: () => {
      clearTimer();
      generation += 1;
      disposed = true;
    },
  };
}
