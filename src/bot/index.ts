import { Telegraf } from 'telegraf';
import { prisma } from '../infra/prisma.js';
import { generateSteamGuardCode } from '../core/steam.js';
import {
  getOrCreateUser,
  getUsageForToday,
  incrementUsage,
  getResetText
} from '../core/usage.js';
import { mainMenu } from './keyboards.js';
import { registerAdminCommands } from './admin.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN');
}

export const bot = new Telegraf(token);

// 🔥 ربط لوحة الأدمن
registerAdminCommands(bot);

// 🧠 حالات المستخدم
const pendingStates = new Map<
  number,
  { type: 'activation' } | { type: 'generate'; accountDbId: number }
>();

// 🟢 رسالة الترحيب
const welcomeText =
  'أهلًا بك في Sakura Land Bot 🌸\n\n' +
  'لتفعيل الخدمة:\n\n' +
  '1) اضغط تفعيل الطلب\n' +
  '2) أرسل رقم الطلب\n' +
  '3) انتظر موافقة الأدمن\n' +
  '4) بعدها تقدر تولد الأكواد 🔥';

// 🚀 START
bot.start(async (ctx) => {
  await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  await ctx.reply(welcomeText, mainMenu());
});

// 🟢 تفعيل الطلب
bot.action('menu:activate', async (ctx) => {
  pendingStates.set(ctx.from.id, { type: 'activation' });

  await ctx.answerCbQuery();
  await ctx.reply('📩 أرسل رقم الطلب الآن.');
});

// 🎮 اختيار الحساب
bot.action(/account:(\d+)/, async (ctx) => {
  const accountId = Number(ctx.match[1]);

  pendingStates.set(ctx.from.id, {
    type: 'generate',
    accountDbId: accountId
  });

  await ctx.answerCbQuery();
  await ctx.reply('📩 أرسل رقم الطلب لتوليد الكود.');
});

// 📩 استقبال النص
bot.on('text', async (ctx) => {
  const state = pendingStates.get(ctx.from.id);
  if (!state) return;

  const text = ctx.message.text.trim();

  const user = await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  // 🟡 طلب تفعيل
  if (state.type === 'activation') {
    await ctx.reply('⏳ تم إرسال طلبك للإدارة، انتظر الموافقة.');

    const adminIds = (process.env.ADMIN_IDS || '').split(',');

    const msg =
      `📩 طلب تفعيل جديد\n\n` +
      `Order: ${text}\n` +
      `User ID: ${ctx.from.id}\n` +
      `Username: @${ctx.from.username || '-'}`;

    for (const id of adminIds) {
      if (!id) continue;
      await bot.telegram.sendMessage(id, msg);
    }

    pendingStates.delete(ctx.from.id);
    return;
  }

  // 🔥 توليد الكود
  if (state.type === 'generate') {
    const account = await prisma.account.findUnique({
      where: { id: state.accountDbId }
    });

    if (!account) {
      pendingStates.delete(ctx.from.id);
      return ctx.reply('❌ الحساب غير موجود.');
    }

    const binding = await prisma.orderBinding.findUnique({
      where: { orderNumber: text }
    });

    if (!binding) {
      pendingStates.delete(ctx.from.id);
      return ctx.reply('❌ الطلب غير مفعل.');
    }

    if (binding.userId !== user.id) {
      pendingStates.delete(ctx.from.id);
      return ctx.reply('❌ هذا الطلب ليس لك.');
    }

    const usage = await getUsageForToday(user.id, account.id);

    if (usage.count >= account.dailyLimit) {
      pendingStates.delete(ctx.from.id);
      return ctx.reply(
        `⚠️ وصلت الحد اليومي.\n${getResetText()}`
      );
    }

    // 🔥 حل المشكلة هنا
    if (!account.sharedSecret) {
      pendingStates.delete(ctx.from.id);
      return ctx.reply('❌ هذا الحساب غير مهيأ (no secret).');
    }

    const code = generateSteamGuardCode(account.sharedSecret);

    await incrementUsage(user.id, account.id);

    pendingStates.delete(ctx.from.id);

    const remaining = account.dailyLimit - usage.count - 1;

    await ctx.reply(
      `✅ الكود:\n${code}\n\nالمتبقي اليوم: ${remaining}`
    );
  }
});