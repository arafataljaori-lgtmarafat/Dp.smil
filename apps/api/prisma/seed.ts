import { PrismaClient } from '@prisma/client';

import { developmentIdentity } from '../src/common/development-actor.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.user.upsert({
    where: { id: developmentIdentity.userId },
    update: {
      displayName: 'DentPilot Development User',
      email: 'dev-user@dentpilot.invalid',
      normalizedEmail: 'dev-user@dentpilot.invalid',
      status: 'active',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    create: {
      id: developmentIdentity.userId,
      displayName: 'DentPilot Development User',
      email: 'dev-user@dentpilot.invalid',
      normalizedEmail: 'dev-user@dentpilot.invalid',
      status: 'active',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
