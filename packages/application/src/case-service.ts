import {
  NotFoundError,
  ValidationError,
  actorAuditShape,
  assertHumanActor,
  ownerUserIdForActor,
} from '@dentpilot/domain';

import type { Actor, ClockPort, IdGeneratorPort, UnitOfWorkPort } from './ports.js';

export class CaseService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
  ) {}

  public async create(actor: Actor, input: { readonly displayLabel: string; readonly referenceCode?: string | undefined }): Promise<{ readonly id: string }> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const displayLabel = input.displayLabel.trim();
    const referenceCode = input.referenceCode?.trim() || null;
    if (displayLabel.length < 2 || displayLabel.length > 80) {
      throw new ValidationError('Case display label must contain between 2 and 80 characters.');
    }
    if (referenceCode !== null && referenceCode.length > 64) {
      throw new ValidationError('Case reference code cannot exceed 64 characters.');
    }

    const caseId = this.ids.next();
    const now = this.clock.now();
    await this.unitOfWork.transaction(async ({ cases, audits }) => {
      await cases.create({
        id: caseId,
        ownerUserId,
        displayLabel,
        referenceCode,
        status: 'active',
        createdById: human.userId,
      });
      await audits.append({
        id: this.ids.next(),
        ownerUserId,
        ...actorAuditShape(human),
        eventType: 'CaseCreated',
        caseId,
        projectId: null,
        generationJobId: null,
        occurredAt: now,
        correlationId: human.requestId,
        metadata: { displayLabel },
      });
    });

    return { id: caseId };
  }

  public async list(actor: Actor) {
    return this.unitOfWork.cases.listByOwner(ownerUserIdForActor(actor));
  }

  public async getWorkspace(actor: Actor, caseId: string) {
    const ownerUserId = ownerUserIdForActor(actor);
    const patientCase = await this.unitOfWork.cases.findById(ownerUserId, caseId);
    if (patientCase === null) {
      throw new NotFoundError(`Case ${caseId} was not found for the current user.`);
    }

    const [media, projects, generations, audits] = await Promise.all([
      this.unitOfWork.media.listByCase(ownerUserId, caseId),
      this.unitOfWork.projects.listByCase(ownerUserId, caseId),
      this.unitOfWork.generations.listByCase(ownerUserId, caseId),
      this.unitOfWork.audits.listByCase(ownerUserId, caseId),
    ]);

    return { patientCase, media, projects, generations, audits };
  }
}
