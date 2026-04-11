import { Telegraf } from 'telegraf';
import { prisma } from '../infra/prisma.js';
import { generateSteamGuardCode } from '../core/steam.js';
import {
  getOrCreateUser,
  getUsageForToday,
  incrementUsage,
  getResetText
} from '../core/usage.js';
import { mainMenu, backButton } from './keyboards.js';
import { fetchSallaOrderByReference } from '../modules/salla.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
}

export const bot = new Telegraf(token);

const pendingOrders = new Map<number, { accountDbId: number }>();

bot.start(async (ctx) => {
  await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  await ctx.reply(
    'أهلًا بك في Sakura Land Bot 🌸\n\nمن هنا تقدر تختار المنصة، تطلب التحقق، وتتابع معلوماتك.',
    mainMenu()
  );
});

bot.action('menu:platforms', async (ctx) => {
  const platform = await prisma.platform.findUnique({
    where: { key: 'steam' },
    include: { accounts: true }
  });

  if (!platform || platform.accounts.length === 0) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'لا توجد منصات أو حسابات متاحة الآن.',
      backButton('menu:main')
    );
    return;
  }

  await ctx.answerCbQuery();

  await ctx.editMessageText('اختر الحساب:', {
    reply_markup: {
      inline_keyboard: [
        ...platform.accounts
          .filter((a) => a.enabled && a.status === 'active')
          .map((a) => [
            {
              text: `🔹 ${a.displayName}`,
              callback_data: `account:${a.id}`
            }
          ]),
        [{ text: '⬅️ رجوع', callback_data: 'menu:main' }]
      ]
    }
  });
});

bot.action('menu:me', async (ctx) => {
  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from.id) }
  });

  await ctx.answerCbQuery();

  await ctx.editMessageText(
    `معلوماتك:\n\nID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nاللغة: ${user?.language || 'ar'}`,
    backButton('menu:main')
  );
});

bot.action('menu:support', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'الدعم الفني سيكون داخل البوت في الخطوة القادمة.',
    backButton('menu:main')
  );
});

bot.action('menu:reviews', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'التقييمات ستكون مربوطة بالطلبات في الخطوة القادمة.',
    backButton('menu:main')
  );
});

bot.action('menu:how', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '1) اختر المنصة.\n2) اختر الحساب.\n3) أدخل رقم الطلب.\n4) بعد التحقق يظهر لك الكود والمتبقي اليوم.',
    backButton('menu:main')
  );
});

bot.action('menu:terms', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'الخدمة مخصصة لصاحب الطلب فقط. يمنع مشاركة الطلب. أي محاولة عبث قد تؤدي إلى التقييد.',
    backButton('menu:main')
  );
});

bot.action('menu:hours', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `أوقات العمل الحالية:\nيوميًا من 6:00 م إلى 12:00 ص\n\nإعادة التصفير بعد: ${getResetText()}`,
    backButton('menu:main')
  );
});

bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    'أهلًا بك في Sakura Land Bot 🌸\n\nمن هنا تقدر تختار المنصة، تطلب التحقق، وتتابع معلوماتك.',
    mainMenu()
  );
});

bot.action(/^account:(\d+)$/, async (ctx) => {
  const accountId = Number(ctx.match[1]);

  pendingOrders.set(ctx.from.id, { accountDbId: accountId });

  await ctx.answerCbQuery();
  await ctx.reply('أرسل رقم الطلب لهذا الحساب الآن.');
});

bot.on('text', async (ctx) => {
  const pending = pendingOrders.get(ctx.from.id);
  if (!pending) return;

  const orderNumber = ctx.message.text.trim();

  const user = await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  const account = await prisma.account.findUnique({
    where: { id: pending.accountDbId }
  });

  if (!account || !account.enabled || account.status !== 'active') {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('الحساب غير متاح حاليًا.', mainMenu());
    return;
  }

  let sallaPayload: any;

  try {
    sallaPayload = await fetchSallaOrderByReference(orderNumber);
  } catch (error) {
    console.error(error);
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('❌ رقم الطلب غير صحيح أو تعذر التحقق منه من سلة.', mainMenu());
    return;
  }

  const order =
    sallaPayload?.data?.[0] ||
    sallaPayload?.data ||
    null;

  if (!order) {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('❌ لم يتم العثور على الطلب في سلة.', mainMenu());
    return;
  }

  const orderStatus = String(
    order?.status?.slug ||
      order?.status ||
      order?.payment_status ||
      ''
  ).toLowerCase();

  const acceptableStatuses = [
    'paid',
    'completed',
    'processing',
    'under_review',
    'delivered'
  ];

  if (!acceptableStatuses.includes(orderStatus)) {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('❌ الطلب غير مكتمل أو غير مدفوع حاليًا.', mainMenu());
    return;
  }

  let binding = await prisma.orderBinding.findUnique({
    where: { orderNumber }
  });

  if (binding && binding.userId !== user.id) {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('❌ هذا الطلب مرتبط بمستخدم آخر.', mainMenu());
    return;
  }

  if (!binding) {
    binding = await prisma.orderBinding.create({
      data: {
        orderNumber,
        userId: user.id,
        platformId: account.platformId,
        accountId: account.id,
        source: 'salla'
      }
    });
  }

  const usage = await getUsageForToday(user.id, account.id);

  if (usage.count >= account.dailyLimit) {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply(
      `⚠️ وصلت الحد اليومي لهذا الحساب.\nإعادة التصفير بعد: ${getResetText()}`,
      mainMenu()
    );
    return;
  }

  if (!account.sharedSecret) {
    pendingOrders.delete(ctx.from.id);
    await ctx.reply('❌ لا يوجد shared secret لهذا الحساب.', mainMenu());
    return;
  }

  const code = generateSteamGuardCode(account.sharedSecret);
  const updatedUsage = await incrementUsage(user.id, account.id);
  const remaining = Math.max(0, account.dailyLimit - updatedUsage.count);

  pendingOrders.delete(ctx.from.id);

  await ctx.reply(
    `✅ تم التحقق بنجاح\nالحساب: ${account.displayName}\nالكود: ${code}\nالمتبقي اليوم: ${remaining}/${account.dailyLimit}\nإعادة التصفير بعد: ${getResetText()}`,
    mainMenu()
  );
});