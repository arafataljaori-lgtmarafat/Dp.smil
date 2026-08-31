/**
 * Deterministic local-development identity seeded by Prisma.
 *
 * This identity exists solely for local development and deterministic seed data.
 * Runtime request ownership is always derived from authenticated bearer sessions.
 */
export const developmentIdentity = {
  userId: '00000000-0000-4000-8000-000000000001',
  actorId: '00000000-0000-4000-8000-000000000001',
} as const;
