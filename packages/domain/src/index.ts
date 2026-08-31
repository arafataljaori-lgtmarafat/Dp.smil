export * from './errors.js';
export * from './generation.js';
export * from './identity.js';
export * from './media.js';

export const creationProjectTypes = [
  'smile_simulation',
  'before_after_image',
  'before_after_video',
] as const;

export type CreationProjectType = (typeof creationProjectTypes)[number];

export const caseStatuses = ['active', 'archived'] as const;
export type CaseStatus = (typeof caseStatuses)[number];
