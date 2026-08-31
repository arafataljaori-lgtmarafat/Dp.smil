import { QueryClient } from '@tanstack/react-query';
import type { CreationDetailsDto, CreationDocument } from '@dentpilot/contracts';

import { applySavedCreationDraftToCache, creationQueryKey, fetchCoherentCreation, invalidateCreationQuery } from '../src/creation/creation-query-cache';
import { createEditorAutosave, type SavedDraftAcknowledgement } from '../src/creation/editor-autosave';

const creationId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const caseId = '33333333-3333-4333-8333-333333333333';
const mediaId = '44444444-4444-4444-8444-444444444444';
const at = (revision: number) => `2026-08-28T00:00:0${revision}.000Z`;

const document = (label: string): CreationDocument => ({
  schemaVersion: 1,
  templateRef: { templateId: 'premium-split', templateVersion: 1 },
  canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 }, after: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
  editableTextState: { beforeLabel: label, afterLabel: 'After', title: 'Result' },
  styleState: { theme: 'clinical-neutral' },
});

function details(revision: number, value: CreationDocument): CreationDetailsDto {
  return {
    project: { id: projectId, caseId, type: 'before_after_image', sourceMediaId: mediaId, createdAt: at(1) },
    bindings: [{ bindingKey: 'before', mediaId }, { bindingKey: 'after', mediaId }],
    draft: { projectId, caseId, schemaVersion: 1, document: value, revision, createdAt: at(1), updatedAt: at(revision) },
  };
}
function acknowledgement(revision: number, value: CreationDocument): SavedDraftAcknowledgement {
  return { revision, document: value, updatedAt: at(revision) };
}
type Deferred<T> = { readonly promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}
function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('Phase 4 Stage 1 final micro-closure query-cache coherence', () => {
  it('B1/B2 synchronously exposes the acknowledged N+1 document to both immediate Export and Template Gallery readers before a delayed refetch completes', async () => {
    const queryClient = client();
    const previous = details(7, document('Before save'));
    const acknowledged = acknowledgement(8, document('Acknowledged saved label'));
    queryClient.setQueryData(creationQueryKey(creationId), previous);
    const delayedRefetch = deferred<CreationDetailsDto>();
    const backgroundFetch = fetchCoherentCreation(queryClient, creationId, () => delayedRefetch.promise);
    const savedStates: Array<{ readonly revision: number; readonly cacheRevision: number; readonly cacheLabel: string }> = [];
    const editor = createEditorAutosave({
      creationId,
      initialDocument: previous.draft.document,
      initialRevision: previous.draft.revision,
      api: { saveDraft: async () => acknowledged },
      onAcknowledgedSave: (saved) => {
        applySavedCreationDraftToCache(queryClient, creationId, saved);
        void invalidateCreationQuery(queryClient, creationId);
      },
      onState: (state) => {
        if (state.phase !== 'saved') return;
        const cached = queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId))!;
        savedStates.push({ revision: state.serverRevision, cacheRevision: cached.draft.revision, cacheLabel: cached.draft.document.editableTextState.beforeLabel });
      },
      schedule: () => 1,
      cancel: () => undefined,
    });
    editor.edit(acknowledged.document);
    await expect(editor.flush()).resolves.toMatchObject({ phase: 'saved', serverRevision: 8 });

    const exportReader = queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId));
    const galleryReader = queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId));
    expect(exportReader?.draft).toMatchObject({ revision: 8, document: { editableTextState: { beforeLabel: 'Acknowledged saved label' } }, updatedAt: at(8) });
    expect(galleryReader?.draft).toEqual(exportReader?.draft);
    expect(savedStates).toEqual([{ revision: 8, cacheRevision: 8, cacheLabel: 'Acknowledged saved label' }]);

    delayedRefetch.resolve(previous);
    const protectedResponse = await backgroundFetch;
    queryClient.setQueryData(creationQueryKey(creationId), protectedResponse);
    expect(queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId))?.draft.revision).toBe(8);
  });

  it('B3 permits invalidation/refetch verification after synchronous patch while preserving the acknowledged draft', async () => {
    const queryClient = client();
    queryClient.setQueryData(creationQueryKey(creationId), details(3, document('Old')));
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    applySavedCreationDraftToCache(queryClient, creationId, acknowledgement(4, document('New')));
    await invalidateCreationQuery(queryClient, creationId);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: creationQueryKey(creationId) });
    expect(queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId))?.draft).toMatchObject({ revision: 4, document: { editableTextState: { beforeLabel: 'New' } } });
  });

  it('B4 does not allow an older N+1 fetch response to overwrite an already acknowledged N+2 cache entry', async () => {
    const queryClient = client();
    const newest = details(12, document('N plus 2'));
    queryClient.setQueryData(creationQueryKey(creationId), newest);
    const staleResult = await fetchCoherentCreation(queryClient, creationId, async () => details(11, document('N plus 1 stale')));
    queryClient.setQueryData(creationQueryKey(creationId), staleResult);
    expect(queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId))?.draft).toMatchObject({ revision: 12, document: { editableTextState: { beforeLabel: 'N plus 2' } } });
  });

  it('B5 retains genuine 409 conflict behavior and does not patch the creation cache', async () => {
    const queryClient = client();
    const previous = details(9, document('Server current'));
    queryClient.setQueryData(creationQueryKey(creationId), previous);
    const apply = jest.fn((saved: SavedDraftAcknowledgement) => applySavedCreationDraftToCache(queryClient, creationId, saved));
    const editor = createEditorAutosave({
      creationId,
      initialDocument: previous.draft.document,
      initialRevision: previous.draft.revision,
      api: { saveDraft: async () => { throw { code: 'CREATION_REVISION_CONFLICT' }; } },
      isConflict: (error) => typeof error === 'object' && error !== null && 'code' in error && error.code === 'CREATION_REVISION_CONFLICT',
      onAcknowledgedSave: apply,
      onState: () => undefined,
      schedule: () => 1,
      cancel: () => undefined,
    });
    editor.edit(document('Conflicting local edit'));
    await expect(editor.flush()).resolves.toMatchObject({ phase: 'conflict', serverRevision: 9 });
    expect(apply).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId))?.draft.document.editableTextState.beforeLabel).toBe('Server current');
  });
});
