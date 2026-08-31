import type { QueryClient } from '@tanstack/react-query';

import type { CreationDetailsDto, CreationDraftDto, VideoCreationDetailsDto, VideoCreationDraftDto } from '@dentpilot/contracts';

export type AnyDetailsDto = CreationDetailsDto | VideoCreationDetailsDto;
export type AnyDraftDto = CreationDraftDto | VideoCreationDraftDto;

export type SavedCreationDraft = Pick<AnyDraftDto, 'document' | 'revision' | 'updatedAt'>;

export function creationQueryKey(creationId: string): readonly ['creation', string] {
  return ['creation', creationId];
}

/**
 * Makes a server-acknowledged editable draft immediately visible to all Creation consumers.
 * A stale refetch must not downgrade an acknowledged newer revision; equal revisions are still
 * replaced from the authoritative save response so document and timestamp remain coherent.
 */
export function preferNewestCreation(existing: AnyDetailsDto | undefined, incoming: AnyDetailsDto): AnyDetailsDto {
  return existing !== undefined && existing.draft.revision > incoming.draft.revision ? existing : incoming;
}

export function applySavedCreationDraftToCache(queryClient: QueryClient, creationId: string, saved: SavedCreationDraft): void {
  queryClient.setQueryData<AnyDetailsDto>(creationQueryKey(creationId), (existing) => {
    if (existing === undefined || existing.draft.revision > saved.revision) return existing;
    return {
      ...existing,
      draft: {
        ...existing.draft,
        document: saved.document,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      },
    } as AnyDetailsDto;
  });
}

/** A stale query response is returned as the cache's newer acknowledged state rather than downgrading it. */
export async function fetchCoherentCreation(
  queryClient: QueryClient,
  creationId: string,
  request: () => Promise<AnyDetailsDto>,
): Promise<AnyDetailsDto> {
  const incoming = await request();
  return preferNewestCreation(queryClient.getQueryData<AnyDetailsDto>(creationQueryKey(creationId)), incoming);
}

/** Background verification remains permitted after synchronous coherence is established. */
export function invalidateCreationQuery(queryClient: QueryClient, creationId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: creationQueryKey(creationId) });
}
