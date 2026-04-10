import { prisma } from '../infra/prisma.js';
import { getDateKeyRiyadh, getSecondsUntilNextRiyadhDay, formatRemaining } from '../utils/time.js';

export const getOrCreateUser = async (telegramId: string, username?: string, firstName?: string) => {
  return prisma.user.upsert({
    where: { telegramId },
    update: {
      username: username ?? undefined,
      firstName: firstName ?? undefined
    },
    create: {
      telegramId,
      username,
      firstName
    }
  });
};

export const getUsageForToday = async (userId: number, accountId: number) => {
  const dateKey = getDateKeyRiyadh();

  return prisma.dailyUsage.upsert({
    where: {
      userId_accountId_dateKey: {
        userId,
        accountId,
        dateKey
      }
    },
    update: {},
    create: {
      userId,
      accountId,
      dateKey,
      count: 0
    }
  });
};

export const incrementUsage = async (userId: number, accountId: number) => {
  const usage = await getUsageForToday(userId, accountId);

  return prisma.dailyUsage.update({
    where: { id: usage.id },
    data: {
      count: { increment: 1 }
    }
  });
};

export const getResetText = () => {
  return formatRemaining(getSecondsUntilNextRiyadhDay());
};