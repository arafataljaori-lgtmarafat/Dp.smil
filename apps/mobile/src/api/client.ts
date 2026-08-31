import {
  caseSchema,
  creationBindingMutationSchema,
  creationDetailsSchema,
  creationDraftSchema,
  creationRevisionSchema,
  generationStatusResponseSchema,
  workspaceSchema,
  type CaseDto,
  type GenerationStatusResponse,
  type WorkspaceDto,
  videoCreationDetailsSchema,
  videoCreationDraftSchema,
  videoCreationRevisionSchema,
} from '@dentpilot/contracts';
import { z } from 'zod';

import { apiRequest, authenticatedMediaSource, type MobileMediaSource, resolveApiUrl } from './api-transport';

export { MobileApiError } from './api-transport';

const caseListSchema = z.object({ cases: z.array(caseSchema) });
const idSchema = z.object({ id: z.string().uuid() });
const generationRequestSchema = z.object({ id: z.string().uuid(), created: z.boolean() });
const creationListSchema = z.object({ data: z.array(creationDetailsSchema.shape.project) });
const creationBindingsResponseSchema = z.object({ data: z.union([creationBindingMutationSchema, z.object({ bindings: z.array(z.any()), draft: videoCreationDraftSchema })]) });
const creationDraftResponseSchema = z.object({ data: z.union([creationDraftSchema, videoCreationDraftSchema]) });
const creationRevisionResponseSchema = z.object({ data: z.union([creationRevisionSchema, videoCreationRevisionSchema]) });
const creationRevisionListSchema = z.object({ data: z.array(z.union([creationRevisionSchema.omit({ bindings: true }), videoCreationRevisionSchema.omit({ bindings: true })])) });

export const dentPilotApi = {
  async listCases(): Promise<readonly CaseDto[]> {
    const response = await apiRequest('/cases', { method: 'GET' }, caseListSchema, { protected: true });
    return response.cases;
  },

  async createCase(input: { readonly displayLabel: string; readonly referenceCode?: string }): Promise<string> {
    const response = await apiRequest(
      '/cases',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      idSchema,
      { protected: true },
    );
    return response.id;
  },

  getWorkspace(caseId: string): Promise<WorkspaceDto> {
    return apiRequest(`/cases/${caseId}`, { method: 'GET' }, workspaceSchema, { protected: true });
  },

  async createMockProject(caseId: string, sourceMediaId: string): Promise<string> {
    const response = await apiRequest(
      `/cases/${caseId}/projects`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceMediaId }),
      },
      idSchema,
      { protected: true },
    );
    return response.id;
  },

  createBeforeAfterCreation(caseId: string, sourceMediaId: string) {
    return apiRequest(
      `/cases/${caseId}/creations`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'before_after_image', sourceMediaId }) },
      creationDetailsSchema,
      { protected: true },
    );
  },

  listCreations(caseId: string) {
    return apiRequest(`/cases/${caseId}/creations`, { method: 'GET' }, creationListSchema, { protected: true });
  },

  getCreation(creationId: string) {
    return apiRequest(`/creations/${creationId}`, { method: 'GET' }, z.union([creationDetailsSchema, videoCreationDetailsSchema]), { protected: true });
  },

  replaceCreationBindings(creationId: string, expectedRevision: number, bindings: readonly { readonly bindingKey: 'before' | 'after'; readonly mediaId: string }[]) {
    return apiRequest(
      `/creations/${creationId}/bindings`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision, bindings }) },
      creationBindingsResponseSchema,
      { protected: true },
    );
  },

  saveCreationDraft(creationId: string, expectedRevision: number, document: unknown) {
    return apiRequest(
      `/creations/${creationId}/draft`,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision, document }) },
      creationDraftResponseSchema,
      { protected: true },
    );
  },

  createCreationRevision(creationId: string, expectedDraftRevision: number) {
    return apiRequest(
      `/creations/${creationId}/revisions`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedDraftRevision }) },
      creationRevisionResponseSchema,
      { protected: true },
    );
  },

  listCreationRevisions(creationId: string) {
    return apiRequest(`/creations/${creationId}/revisions`, { method: 'GET' }, creationRevisionListSchema, { protected: true });
  },

  getCreationRevision(creationId: string, revisionId: string) {
    return apiRequest(`/creations/${creationId}/revisions/${revisionId}`, { method: 'GET' }, creationRevisionResponseSchema, { protected: true });
  },

  requestGeneration(projectId: string, idempotencyKey: string): Promise<{ readonly id: string; readonly created: boolean }> {
    return apiRequest(
      `/projects/${projectId}/generations`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
      },
      generationRequestSchema,
      { protected: true },
    );
  },

  getGeneration(generationJobId: string): Promise<GenerationStatusResponse> {
    return apiRequest(`/generations/${generationJobId}`, { method: 'GET' }, generationStatusResponseSchema, { protected: true });
  },

  resolveMediaUrl(relativePath: string): string {
    return resolveApiUrl(relativePath);
  },

  authenticatedMediaSource(relativePath: string): MobileMediaSource {
    return authenticatedMediaSource(relativePath);
  },
};
