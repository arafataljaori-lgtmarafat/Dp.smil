import type { SystemActorContext } from '@dentpilot/domain';

export const generationWorkerActorKey = 'generation-worker';

export function resolveGenerationWorkerActor(ownerUserId: string, requestId: string): SystemActorContext {
  return { actorType: 'system', systemActorKey: generationWorkerActorKey, ownerUserId, requestId };
}
