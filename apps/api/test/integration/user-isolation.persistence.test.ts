import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/infrastructure/persistence/prisma.service.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/persistence/prisma-unit-of-work.js';

const canRun = process.env.DATABASE_URL !== undefined;

describe.skipIf(!canRun)('PostgreSQL personal user isolation', () => {
  const prisma = new PrismaService();
  const uow = new PrismaUnitOfWork(prisma);
  const userA = randomUUID();
  const userB = randomUUID();
  const caseB = randomUUID();

  beforeAll(async () => {
    await prisma.onModuleInit();
    await prisma.user.createMany({
      data: [
        { id: userA, email: `isolation-a-${userA}@example.invalid`, normalizedEmail: `isolation-a-${userA}@example.invalid`, displayName: 'Test user A', status: 'active' },
        { id: userB, email: `isolation-b-${userB}@example.invalid`, normalizedEmail: `isolation-b-${userB}@example.invalid`, displayName: 'Test user B', status: 'active' },
      ],
    });
    await prisma.patientCase.create({
      data: { id: caseB, ownerUserId: userB, displayLabel: 'Fictional user B case', status: 'active', createdById: userB },
    });
  });

  afterAll(async () => {
    await prisma.patientCase.deleteMany({ where: { id: caseB } });
    await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await prisma.onModuleDestroy();
  });

  it('does not allow User A to retrieve User B case through the repository', async () => {
    expect(await uow.cases.findById(userA, caseB)).toBeNull();
    expect(await uow.cases.findById(userB, caseB)).toMatchObject({ id: caseB, ownerUserId: userB });
  });
});
