import { prisma } from '../src/infra/prisma.js';

async function main(): Promise<void> {
  const platform = await prisma.platform.upsert({
    where: { key: 'steam' },
    update: {},
    create: {
      key: 'steam',
      nameAr: 'ستيم',
      nameEn: 'Steam',
      enabled: true
    }
  });

  await prisma.account.upsert({
    where: { key: 'irm7x1' },
    update: {
      sharedSecret: '8R+odKzj2IuAgFBRk5SOMXc9fPw=',
      dailyLimit: 3,
      enabled: true,
      status: 'active'
    },
    create: {
      platformId: platform.id,
      key: 'irm7x1',
      displayName: 'irm7x1',
      type: 'steam_guard',
      sharedSecret: '8R+odKzj2IuAgFBRk5SOMXc9fPw=',
      dailyLimit: 3,
      enabled: true,
      status: 'active'
    }
  });

  console.log('Seed completed');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });