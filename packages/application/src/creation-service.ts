import {
  CreationBindingRequiredError,
  CreationRevisionConflictError,
  IdempotencyConflictError,
  NotFoundError,
  ValidationError,
  actorAuditShape,
  assertHumanActor,
  assertIdempotencyKey,
  ownerUserIdForActor,
} from '@dentpilot/domain';
import {
  assertCreationDocumentSize,
  canonicalizeCreationDocument,
  canonicalizeVideoCompositionDocument,
  creationDocumentSchema,
  type CreationBindingKey,
  type CreationDocument,
  type VideoCompositionDocument,
} from '@dentpilot/contracts';

import { requireBuiltInTemplate, templateSupportsStyle } from './template-catalog.js';
import { defaultVideoTemplateRef, requireBuiltInVideoTemplate } from './video-template-catalog.js';
import {
  assertRequiredVideoBindingsPresent,
  assertVideoDocumentBindingsMatchPersisted,
  canonicalVideoCreationRequestPayload,
  initialVideoCompositionDocument,
  requiredVideoBindingKeys,
  syncVideoDocumentBindings,
  validateVideoCreationDocument,
} from './video-creation-document.js';

import type {
  Actor,
  ClockPort,
  CreationAssetBindingRecord,
  CreationDraftRecord,
  CreationProjectRecord,
  CreationRevisionAssetRecord,
  CreationRevisionRecord,
  DigestPort,
  IdGeneratorPort,
  UnitOfWorkPort,
} from './ports.js';

export type CreationDetails = {
  readonly project: CreationProjectRecord;
  readonly bindings: readonly CreationAssetBindingRecord[];
  readonly draft: CreationDraftRecord;
};
export type CreationBindingMutation = {
  readonly bindings: readonly CreationAssetBindingRecord[];
  readonly draft: CreationDraftRecord;
};
export type CreationRevisionDetails = {
  readonly revision: CreationRevisionRecord;
  readonly bindings: readonly CreationRevisionAssetRecord[];
};
export type VideoCreationDetails = CreationDetails & { readonly created: boolean };

const initialDocument: CreationDocument = {
  schemaVersion: 1,
  templateRef: null,
  canvas: { aspectRatioKey: 'portrait_4_5' },
  slotState: { before: { panX: 0, panY: 0, scale: 1, rotation: 0 } },
  editableTextState: { beforeLabel: 'Before', afterLabel: 'After' },
  styleState: { theme: 'clinical-neutral' },
};

/** Creation project types this service manages. `smile_simulation` is owned by ProjectService/GenerationService. */
const creationResourceProjectTypes = ['before_after_image', 'before_after_video'] as const;

export class CreationService {
  public constructor(
    private readonly unitOfWork: UnitOfWorkPort,
    private readonly digest: DigestPort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly maximumDocumentBytes: number,
  ) {}

  public async createBeforeAfterImage(actor: Actor, input: { readonly caseId: string; readonly sourceMediaId: string }): Promise<CreationDetails> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const [patientCase, sourceMedia] = await Promise.all([
      this.unitOfWork.cases.findById(ownerUserId, input.caseId),
      this.unitOfWork.media.findById(ownerUserId, input.sourceMediaId),
    ]);
    if (patientCase === null) throw new NotFoundError(`Case ${input.caseId} was not found for the current user.`);
    if (sourceMedia === null || sourceMedia.caseId !== input.caseId) {
      throw new ValidationError('Creation source media must belong to the selected case.');
    }

    const now = this.clock.now();
    const projectId = this.ids.next();
    const project: CreationProjectRecord = {
      id: projectId,
      ownerUserId,
      caseId: input.caseId,
      type: 'before_after_image',
      sourceMediaId: sourceMedia.id,
      createdAt: now,
      createdById: human.userId,
      idempotencyKey: null,
      requestFingerprint: null,
    };
    const draft: CreationDraftRecord = {
      projectId,
      ownerUserId,
      caseId: input.caseId,
      schemaVersion: 1,
      document: initialDocument,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    const before: CreationAssetBindingRecord = {
      projectId,
      ownerUserId,
      caseId: input.caseId,
      bindingKey: 'before',
      mediaId: sourceMedia.id,
    };

    await this.unitOfWork.transaction(async ({ projects, creations, audits }) => {
      await projects.create(project);
      await creations.createDraft(draft);
      await creations.replaceBindings({ ownerUserId, caseId: input.caseId, projectId, bindings: [before] });
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
        metadata: { type: 'before_after_image', sourceMediaId: sourceMedia.id },
      });
    });
    return { project, bindings: [before], draft };
  }

  /**
   * Video creation transaction (Phase 5 Stage 2, mission section 3). Both Before and
   * After media are validated and bound up front; the built-in default video template is
   * resolved and the whole project/draft/binding/audit graph commits atomically. Section
   * 7 production idempotency: the client-supplied Idempotency-Key is enforced at the
   * database via ProjectRepositoryPort.createOrFindByIdempotency (an INSERT ... ON
   * CONFLICT DO NOTHING against a real unique constraint, not an application-level
   * find-then-insert), so concurrent identical requests create exactly one graph and a
   * lost-response retry replays the original result without duplicating the audit event.
   */
  public async createBeforeAfterVideo(
    actor: Actor,
    input: {
      readonly caseId: string;
      readonly beforeMediaId: string;
      readonly afterMediaId: string;
      readonly idempotencyKey: string;
    },
  ): Promise<VideoCreationDetails> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);

    const [patientCase, beforeMedia, afterMedia] = await Promise.all([
      this.unitOfWork.cases.findById(ownerUserId, input.caseId),
      this.unitOfWork.media.findById(ownerUserId, input.beforeMediaId),
      this.unitOfWork.media.findById(ownerUserId, input.afterMediaId),
    ]);
    if (patientCase === null) throw new NotFoundError(`Case ${input.caseId} was not found for the current user.`);
    if (beforeMedia === null || beforeMedia.caseId !== input.caseId) {
      throw new ValidationError('Video creation Before media must belong to the selected case.');
    }
    if (afterMedia === null || afterMedia.caseId !== input.caseId) {
      throw new ValidationError('Video creation After media must belong to the selected case.');
    }

    const template = requireBuiltInVideoTemplate(defaultVideoTemplateRef.templateId, defaultVideoTemplateRef.templateVersion);
    const candidateDocument = initialVideoCompositionDocument({ beforeMediaId: beforeMedia.id, afterMediaId: afterMedia.id, template });
    // Re-validated through the same choke point every later mutation uses. For the fixed
    // default template this always passes; it guards against future template-catalog drift.
    const { document } = validateVideoCreationDocument({ document: candidateDocument, maximumBytes: this.maximumDocumentBytes });

    const requestFingerprint = await this.digest.sha256(new TextEncoder().encode(canonicalVideoCreationRequestPayload({
      ownerUserId,
      caseId: input.caseId,
      beforeMediaId: beforeMedia.id,
      beforeMediaSha256: beforeMedia.sha256,
      afterMediaId: afterMedia.id,
      afterMediaSha256: afterMedia.sha256,
      templateId: template.id,
      templateVersion: template.version,
    })));

    const now = this.clock.now();
    const candidateProjectId = this.ids.next();

    return this.unitOfWork.transaction(async ({ projects, creations, audits }) => {
      const { project, created } = await projects.createOrFindByIdempotency({
        id: candidateProjectId,
        ownerUserId,
        caseId: input.caseId,
        type: 'before_after_video',
        sourceMediaId: beforeMedia.id,
        createdAt: now,
        createdById: human.userId,
        idempotencyKey,
        requestFingerprint,
      });
      if (project.requestFingerprint !== requestFingerprint) {
        throw new IdempotencyConflictError('Idempotency key was already used for a different video creation request.');
      }
      if (!created) {
        const [existingDraft, existingBindings] = await Promise.all([
          creations.findDraft(ownerUserId, project.id),
          creations.listBindings(ownerUserId, project.id),
        ]);
        if (existingDraft === null) {
          throw new ValidationError('Video creation idempotency record exists without a persisted draft.');
        }
        return { project, bindings: existingBindings, draft: existingDraft, created: false };
      }

      const draft: CreationDraftRecord = {
        projectId: project.id,
        ownerUserId,
        caseId: input.caseId,
        schemaVersion: 1,
        document,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      const before: CreationAssetBindingRecord = { projectId: project.id, ownerUserId, caseId: input.caseId, bindingKey: 'before', mediaId: beforeMedia.id };
      const after: CreationAssetBindingRecord = { projectId: project.id, ownerUserId, caseId: input.caseId, bindingKey: 'after', mediaId: afterMedia.id };

      await creations.createDraft(draft);
      await creations.replaceBindings({ ownerUserId, caseId: input.caseId, projectId: project.id, bindings: [before, after] });
      await audits.append({
        id: this.ids.next(),
        ownerUserId,
        ...actorAuditShape(human),
        eventType: 'CreationProjectCreated',
        caseId: input.caseId,
        projectId: project.id,
        generationJobId: null,
        occurredAt: now,
        correlationId: human.requestId,
        metadata: {
          type: 'before_after_video',
          beforeMediaId: beforeMedia.id,
          afterMediaId: afterMedia.id,
          templateId: template.id,
          templateVersion: template.version,
        },
      });
      return { project, bindings: [before, after], draft, created: true };
    });
  }

  /**
   * Thin, read-only lookup used by the API controller layer to decide which response
   * shape (image vs video) to present for the shared bindings/draft/revision endpoints,
   * without re-deriving the type from document shape. This is purely additive: it wraps
   * the same requireCreationProject lookup every other method already performs and adds
   * no new persistence behavior, so it cannot affect any existing test's outcome.
   */
  public async getCreationProject(actor: Actor, creationId: string): Promise<CreationProjectRecord> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    return this.requireCreationProject(ownerUserId, creationId);
  }

  public async getCreation(actor: Actor, creationId: string): Promise<CreationDetails> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const project = await this.requireCreationProject(ownerUserId, creationId);
    const [draft, bindings] = await Promise.all([
      this.unitOfWork.creations.findDraft(ownerUserId, creationId),
      this.unitOfWork.creations.listBindings(ownerUserId, creationId),
    ]);
    if (draft === null) throw new NotFoundError(`Creation ${creationId} is not available.`);
    if (project.type === 'before_after_video') {
      const { document } = validateVideoCreationDocument({ document: draft.document, maximumBytes: this.maximumDocumentBytes });
      assertVideoDocumentBindingsMatchPersisted(document, bindings);
    } else {
      this.assertImageDocumentBindingReferences(this.validateImageDocument(draft.document as CreationDocument), bindings);
    }
    return { project, draft, bindings };
  }

  public async listCreations(actor: Actor, caseId: string): Promise<readonly CreationProjectRecord[]> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    if (await this.unitOfWork.cases.findById(ownerUserId, caseId) === null) throw new NotFoundError(`Case ${caseId} was not found for the current user.`);
    return (await this.unitOfWork.projects.listByCase(ownerUserId, caseId))
      .filter((project) => (creationResourceProjectTypes as readonly string[]).includes(project.type));
  }

  public async replaceBindings(
    actor: Actor,
    creationId: string,
    input: { readonly expectedRevision: number; readonly bindings: readonly { readonly bindingKey: 'before' | 'after'; readonly mediaId: string }[] },
  ): Promise<CreationBindingMutation> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const project = await this.requireCreationProject(ownerUserId, creationId);
    const uniqueKeys = new Set(input.bindings.map((binding) => binding.bindingKey));
    if (uniqueKeys.size !== input.bindings.length) throw new ValidationError('Creation binding keys must be unique.');
    const records: readonly CreationAssetBindingRecord[] = input.bindings.map((binding) => ({
      projectId: project.id,
      ownerUserId,
      caseId: project.caseId,
      bindingKey: binding.bindingKey,
      mediaId: binding.mediaId,
    }));
    const now = this.clock.now();

    return this.unitOfWork.transaction(async ({ creations, media, audits }) => {
      const currentDraft = await creations.findDraft(ownerUserId, creationId);
      if (currentDraft === null) throw new NotFoundError(`Creation ${creationId} is not available.`);
      if (currentDraft.revision !== input.expectedRevision) {
        throw new CreationRevisionConflictError(`Creation draft ${creationId} changed before binding save.`);
      }
      const requestedMedia = await Promise.all(records.map((binding) => media.findById(ownerUserId, binding.mediaId)));
      if (requestedMedia.some((asset) => asset === null || asset.caseId !== project.caseId)) {
        throw new ValidationError('Creation media bindings must belong to the same case.');
      }

      let documentToPersist: VideoCompositionDocument | undefined;
      if (project.type === 'before_after_video') {
        const { document, template } = validateVideoCreationDocument({ document: currentDraft.document, maximumBytes: this.maximumDocumentBytes });
        assertRequiredVideoBindingsPresent(requiredVideoBindingKeys(template), records);
        // Binding/document single-truth invariant (mission section 4): the video
        // document's assetBindings are rewritten to exactly this new binding set in the
        // very same atomic CAS write below — never left stale relative to the relational
        // rows this transaction is about to replace.
        documentToPersist = syncVideoDocumentBindings(document, records);
      } else {
        const currentDocument = this.validateImageDocument(currentDraft.document as CreationDocument);
        this.assertImageDocumentBindingReferences(currentDocument, records);
      }

      const updated = await creations.replaceBindingsIfRevision({
        ownerUserId,
        caseId: project.caseId,
        projectId: project.id,
        expectedRevision: input.expectedRevision,
        bindings: records,
        updatedAt: now,
        ...(documentToPersist !== undefined ? { document: documentToPersist } : {}),
      });
      if (updated === null) throw new CreationRevisionConflictError(`Creation draft ${creationId} changed before binding save.`);
      await audits.append({
        id: this.ids.next(),
        ownerUserId,
        ...actorAuditShape(human),
        eventType: 'CreationBindingChanged',
        caseId: project.caseId,
        projectId: project.id,
        generationJobId: null,
        occurredAt: now,
        correlationId: human.requestId,
        metadata: { bindingCount: updated.bindings.length, revision: updated.draft.revision },
      });
      return updated;
    });
  }

  public async updateDraft(
    actor: Actor,
    creationId: string,
    input: { readonly expectedRevision: number; readonly document: CreationDocument | VideoCompositionDocument },
  ): Promise<CreationDraftRecord> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const project = await this.requireCreationProject(ownerUserId, creationId);
    const document = project.type === 'before_after_video'
      ? validateVideoCreationDocument({ document: input.document, maximumBytes: this.maximumDocumentBytes }).document
      : this.validateImageDocument(input.document as CreationDocument);
    return this.unitOfWork.transaction(async ({ creations }) => {
      const currentDraft = await creations.findDraft(ownerUserId, creationId);
      if (currentDraft === null) throw new NotFoundError(`Creation ${creationId} is not available.`);
      if (currentDraft.revision !== input.expectedRevision) {
        throw new CreationRevisionConflictError(`Creation draft ${creationId} changed before save.`);
      }
      const bindings = await creations.listBindings(ownerUserId, creationId);
      if (project.type === 'before_after_video') {
        // The draft endpoint may edit any other field, but can never be used to move a
        // binding out from under the bindings endpoint — that would break the
        // binding/document single-truth invariant. A draft submitting a different
        // mediaId for an existing binding key is rejected here.
        assertVideoDocumentBindingsMatchPersisted(document as VideoCompositionDocument, bindings);
      } else {
        this.assertImageDocumentBindingReferences(document as CreationDocument, bindings);
      }
      const updated = await creations.updateDraftIfRevision({
        ownerUserId,
        projectId: creationId,
        expectedRevision: input.expectedRevision,
        document,
        updatedAt: this.clock.now(),
      });
      if (updated === null) throw new CreationRevisionConflictError(`Creation draft ${creationId} changed before save.`);
      return updated;
    });
  }

  public async createRevision(actor: Actor, creationId: string, expectedDraftRevision: number): Promise<CreationRevisionDetails> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const project = await this.requireCreationProject(ownerUserId, creationId);
    const now = this.clock.now();
    const created = await this.unitOfWork.transaction(async ({ creations, audits }) => {
      const draft = await creations.findDraft(ownerUserId, creationId);
      if (draft === null) throw new NotFoundError(`Creation ${creationId} is not available.`);
      if (draft.revision !== expectedDraftRevision) {
        throw new CreationRevisionConflictError(`Creation draft ${creationId} changed before revision.`);
      }
      const bindings = await creations.listBindings(ownerUserId, creationId);

      let document: CreationDocument | VideoCompositionDocument;
      let documentSha256: string;
      let requiredBindingKeys: readonly CreationBindingKey[];
      if (project.type === 'before_after_video') {
        const validated = validateVideoCreationDocument({ document: draft.document, maximumBytes: this.maximumDocumentBytes });
        // Revalidate document<->persisted-binding agreement immediately before snapshotting:
        // a revision must never point to media the document itself does not (still) reference.
        assertVideoDocumentBindingsMatchPersisted(validated.document, bindings);
        document = validated.document;
        documentSha256 = await this.digest.sha256(new TextEncoder().encode(canonicalizeVideoCompositionDocument(validated.document)));
        requiredBindingKeys = requiredVideoBindingKeys(validated.template);
      } else {
        const imageDocument = this.validateImageDocument(draft.document as CreationDocument);
        requiredBindingKeys = this.assertImageDocumentBindingReferences(imageDocument, bindings);
        document = imageDocument;
        documentSha256 = await this.digest.sha256(new TextEncoder().encode(canonicalizeCreationDocument(imageDocument)));
      }

      const revision: CreationRevisionRecord = {
        id: this.ids.next(),
        ownerUserId,
        caseId: project.caseId,
        projectId: project.id,
        revisionNumber: expectedDraftRevision,
        documentSchemaVersion: 1,
        document,
        documentSha256,
        createdAt: now,
      };
      const saved = await creations.createRevision({ revision, expectedDraftRevision, requiredBindingKeys });
      if (saved === null) throw new CreationRevisionConflictError(`Creation draft ${creationId} changed before revision.`);
      await audits.append({
        id: this.ids.next(),
        ownerUserId,
        ...actorAuditShape(human),
        eventType: 'CreationRevisionCreated',
        caseId: project.caseId,
        projectId: project.id,
        generationJobId: null,
        occurredAt: now,
        correlationId: human.requestId,
        metadata: { revisionNumber: saved.revisionNumber, documentSha256: saved.documentSha256 },
      });
      return saved;
    });
    return { revision: created, bindings: await this.unitOfWork.creations.listRevisionAssets(ownerUserId, created.id) };
  }

  public async listRevisions(actor: Actor, creationId: string): Promise<readonly CreationRevisionRecord[]> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const project = await this.requireCreationProject(ownerUserId, creationId);
    const revisions = await this.unitOfWork.creations.listRevisions(ownerUserId, creationId);
    // Document routing invariant on the read path: every persisted revision document is
    // validated by the project's persisted type before emission. A video project whose
    // revision somehow stored a non-video document (or vice versa) surfaces as
    // ValidationError, not a silent pass of corrupted data to the API layer.
    for (const revision of revisions) {
      this.validateRevisionDocument(project, revision);
    }
    return revisions;
  }

  public async getRevision(actor: Actor, creationId: string, revisionId: string): Promise<CreationRevisionDetails> {
    const human = assertHumanActor(actor);
    const ownerUserId = ownerUserIdForActor(human);
    const project = await this.requireCreationProject(ownerUserId, creationId);
    const revision = await this.unitOfWork.creations.findRevision(ownerUserId, creationId, revisionId);
    if (revision === null) throw new NotFoundError(`Creation revision ${revisionId} is not available.`);
    // Document routing invariant on the read path (same rule as listRevisions, applied
    // to the single revision before the bindings query so the ValidationError fires
    // before any additional I/O).
    this.validateRevisionDocument(project, revision);
    return { revision, bindings: await this.unitOfWork.creations.listRevisionAssets(ownerUserId, revisionId) };
  }

  /**
   * Validates a persisted revision's document against the owning project's type.
   * Must only be called after `requireCreationProject` has already established `project`;
   * never called with a project whose type is outside `creationResourceProjectTypes`.
   * Throws ValidationError if the stored document does not parse for this project type —
   * the same error surface `getCreation` uses for corrupted draft documents.
   */
  private validateRevisionDocument(project: CreationProjectRecord, revision: CreationRevisionRecord): void {
    if (project.type === 'before_after_video') {
      validateVideoCreationDocument({ document: revision.document, maximumBytes: this.maximumDocumentBytes });
    } else {
      this.validateImageDocument(revision.document as CreationDocument);
    }
  }

  /**
   * Document routing invariant (mission section 1): the ONLY thing that ever decides
   * whether a creation's document is parsed/validated as CreationDocumentV1 or
   * VideoCompositionDocumentV1 is this project's persisted `type`. Every public method
   * above resolves the project first and branches on `project.type` — never on
   * schemaVersion (identical across both documents) and never by probing document shape.
   * A video project whose stored document fails the image schema (or vice versa) surfaces
   * as ValidationError from validateImageDocument/validateVideoCreationDocument, not as a
   * silent fallback to the other parser.
   */
  private async requireCreationProject(ownerUserId: string, creationId: string): Promise<CreationProjectRecord> {
    const project = await this.unitOfWork.projects.findById(ownerUserId, creationId);
    if (project === null || !(creationResourceProjectTypes as readonly string[]).includes(project.type)) {
      throw new NotFoundError(`Creation ${creationId} is not available.`);
    }
    return project;
  }

  private validateImageDocument(document: CreationDocument): CreationDocument {
    try {
      const parsed = creationDocumentSchema.parse(document);
      if (parsed.templateRef !== null) {
        const template = requireBuiltInTemplate(parsed.templateRef.templateId, parsed.templateRef.templateVersion);
        if (parsed.canvas.aspectRatioKey !== template.aspectRatio) {
          throw new Error('Creation document canvas aspect ratio does not match the selected template.');
        }
        if (!templateSupportsStyle(template, parsed.styleState.theme)) {
          throw new Error('Creation document style is not allowed by the selected template.');
        }
        for (const slot of template.slots) {
          if (parsed.slotState[slot.bindingKey] === undefined) {
            throw new Error(`Creation document is missing state for template binding: ${slot.bindingKey}.`);
          }
        }
      }
      assertCreationDocumentSize(parsed, this.maximumDocumentBytes);
      return parsed;
    } catch (error) {
      throw new ValidationError('Creation document is not valid.', { reason: error instanceof Error ? error.message : 'invalid-document' });
    }
  }

  private assertImageDocumentBindingReferences(
    document: CreationDocument,
    bindings: readonly CreationAssetBindingRecord[],
  ): readonly CreationAssetBindingRecord['bindingKey'][] {
    const available = new Set(bindings.map((binding) => binding.bindingKey));
    const required = Object.keys(document.slotState) as CreationAssetBindingRecord['bindingKey'][];
    for (const bindingKey of required) {
      if (!available.has(bindingKey)) {
        throw new CreationBindingRequiredError(`Creation document requires binding key: ${bindingKey}.`);
      }
    }
    return required;
  }
}
