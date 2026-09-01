import type { QueryClient } from '@tanstack/react-query';

import type { CreationDetailsDto, CreationDraftDto } from '@dentpilot/contracts';

export type SavedCreationDraft = Pick<CreationDraftDto, 'document' | 'revision' | 'updatedAt'>;

export function creationQueryKey(creationId: string): readonly ['creation', string] {
  return ['creation', creationId];
}

/**
 * Makes a server-acknowledged editable draft immediately visible to all Creation consumers.
 * A stale refetch must not downgrade an acknowledged newer revision; equal revisions are still
 * replaced from the authoritative save response so document and timestamp remain coherent.
 */
export function preferNewestCreation(existing: CreationDetailsDto | undefined, incoming: CreationDetailsDto): CreationDetailsDto {
  return existing !== undefined && existing.draft.revision > incoming.draft.revision ? existing : incoming;
}

export function applySavedCreationDraftToCache(queryClient: QueryClient, creationId: string, saved: SavedCreationDraft): void {
  queryClient.setQueryData<CreationDetailsDto>(creationQueryKey(creationId), (existing) => {
    if (existing === undefined || existing.draft.revision > saved.revision) return existing;
    return {
      ...existing,
      draft: {
        ...existing.draft,
        document: saved.document,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
      },
    };
  });
}

/** A stale query response is returned as the cache's newer acknowledged state rather than downgrading it. */
export async function fetchCoherentCreation(
  queryClient: QueryClient,
  creationId: string,
  request: () => Promise<CreationDetailsDto>,
): Promise<CreationDetailsDto> {
  const incoming = await request();
  return preferNewestCreation(queryClient.getQueryData<CreationDetailsDto>(creationQueryKey(creationId)), incoming);
}

/** Background verification remains permitted after synchronous coherence is established. */
export function invalidateCreationQuery(queryClient: QueryClient, creationId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: creationQueryKey(creationId) });
}
