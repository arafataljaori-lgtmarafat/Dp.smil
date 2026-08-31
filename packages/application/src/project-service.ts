import {
  NotFoundError,
  ValidationError,
  actorAuditShape,
  assertHumanActor,
  ownerUserIdForActor,
} from '@dentpilot/domain';

import type { Actor, ClockPort, IdGeneratorPort, UnitOfWorkPort } from './ports.js';

export class ProjectService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
  ) {}

  public async createMockSmileSimulation(
    actor: Actor,
    input: { readonly caseId: string; readonly sourceMediaId: string },
  ): Promise<{ readonly id: string }> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const [patientCase, sourceMedia] = await Promise.all([
      this.unitOfWork.cases.findById(ownerUserId, input.caseId),
      this.unitOfWork.media.findById(ownerUserId, input.sourceMediaId),
    ]);

    if (patientCase === null) {
      throw new NotFoundError(`Case ${input.caseId} was not found for the current user.`);
    }
    if (
      sourceMedia === null ||
      sourceMedia.caseId !== input.caseId ||
      sourceMedia.kind !== 'source' ||
      sourceMedia.purpose !== 'source_photo'
    ) {
      throw new ValidationError('A project must be created from a source photo in the selected case.');
    }

    const projectId = this.ids.next();
    const now = this.clock.now();
    await this.unitOfWork.transaction(async ({ projects, audits }) => {
      await projects.create({
        id: projectId,
        ownerUserId,
        caseId: input.caseId,
        type: 'smile_simulation',
        sourceMediaId: sourceMedia.id,
        createdAt: now,
        createdById: human.userId,
        idempotencyKey: null,
        requestFingerprint: null,
      });
      await audits.append({
        id: this.ids.next(),
        ownerUserId,
        ...actorAuditShape(human),
        eventType: 'CreationProjectCreated',
        caseId: input.caseId,
        projectId,
        generationJobId: null,
        occurredAt: now,
        correlationId: human.requestId,
        metadata: { type: 'smile_simulation', sourceMediaId: sourceMedia.id },
      });
    });

    return { id: projectId };
  }
}
