import { ValidationError } from './errors.js';

export const userStatuses = ['pending_verification', 'active', 'disabled'] as const;
export type UserStatus = (typeof userStatuses)[number];

export const accountActionTokenPurposes = ['verify_email', 'reset_password'] as const;
export type AccountActionTokenPurpose = (typeof accountActionTokenPurposes)[number];

export const securityEventTypes = [
  'UserRegistered',
  'EmailVerified',
  'LoginSucceeded',
  'LoginFailed',
  'SessionCreated',
  'SessionRevoked',
  'PasswordResetRequested',
  'PasswordResetCompleted',
  'PasswordChanged',
] as const;
export type SecurityEventType = (typeof securityEventTypes)[number];

export interface HumanActorContext {
  readonly actorType: 'human';
  readonly userId: string;
  readonly sessionId?: string;
  readonly requestId: string;
}

export interface SystemActorContext {
  readonly actorType: 'system';
  readonly systemActorKey: string;
  /** Owner of the personal resource graph being processed. */
  readonly ownerUserId: string;
  readonly requestId: string;
}

export type ActorContext = HumanActorContext | SystemActorContext;

const emailSyntax = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function normalizeEmail(input: string): string {
  const normalized = input.trim().normalize('NFKC').toLowerCase();
  if (normalized.length === 0 || normalized.length > 320 || !emailSyntax.test(normalized)) {
    throw new ValidationError('Email address is not valid.');
  }
  return normalized;
}

export function validatePasswordPolicy(password: string): void {
  const length = Array.from(password).length;
  if (length < 12 || length > 128) {
    throw new ValidationError('Password must contain between 12 and 128 characters.');
  }
}

export function ownerUserIdForActor(actor: ActorContext): string {
  return actor.actorType === 'human' ? actor.userId : actor.ownerUserId;
}

export function assertHumanActor(actor: ActorContext): HumanActorContext {
  if (actor.actorType !== 'human' || actor.userId.length === 0) {
    throw new ValidationError('A human actor with a user ID is required.');
  }
  return actor;
}

export function assertSystemActor(actor: ActorContext): SystemActorContext {
  if (actor.actorType !== 'system' || actor.systemActorKey.trim().length === 0 || actor.ownerUserId.length === 0) {
    throw new ValidationError('A system actor with an owner and actor key is required.');
  }
  return actor;
}

export function actorAuditShape(actor: ActorContext): {
  readonly actorType: 'human' | 'system';
  readonly actorUserId: string | null;
  readonly systemActorKey: string | null;
} {
  if (actor.actorType === 'human') {
    return { actorType: 'human', actorUserId: actor.userId, systemActorKey: null };
  }
  return { actorType: 'system', actorUserId: null, systemActorKey: actor.systemActorKey };
}
