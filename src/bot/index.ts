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

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
}

export const bot = new Telegraf(token);

type PendingState =
  | { type: 'generate'; accountDbId: number }
  | { type: 'activation_request' }
  | { type: 'support' };

const pendingStates = new Map<number, PendingState>();

const getAdminIds = () =>
  (process.env.ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const isAdmin = (telegramId: number | string) =>
  getAdminIds().includes(String(telegramId));

const adminGroupId = process.env.ADMIN_GROUP_ID || '';

const welcomeText =
  'أهلًا بك في Sakura Land Bot 🌸\n\n' +
  'من هنا تقدر تختار المنصة وتولد أكواد الحسابات بعد تفعيل رقم طلبك.\n\n' +
  'طريقة التفعيل:\n' +
  '1) اضغط زر ✅ تفعيل الطلب\n' +
  '2) أرسل رقم الطلب\n' +
  '3) الإدارة تراجع الطلب وتفعّله لك\n' +
  '4) بعدها تقدر تستخدم رقم الطلب لتوليد الكود حسب الحد اليومي';

bot.start(async (ctx) => {
  await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  await ctx.reply(welcomeText, mainMenu());
});

bot.command('myid', async (ctx) => {
  await ctx.reply(
    `معلوماتك:\n\nTelegram ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nName: ${ctx.from.first_name || '-'}`
  );
});

bot.command('accounts', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const accounts = await prisma.account.findMany({
    include: { platform: true },
    orderBy: { id: 'asc' }
  });

  if (accounts.length === 0) {
    await ctx.reply('لا توجد حسابات.');
    return;
  }

  const text = accounts
    .map(
      (a) =>
        `ID: ${a.id}\nKey: ${a.key}\nName: ${a.displayName}\nPlatform: ${a.platform.nameAr}\nStatus: ${a.status}\nEnabled: ${a.enabled ? 'yes' : 'no'}`
    )
    .join('\n\n');

  await ctx.reply(text);
});

bot.command('bindorder', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const parts = ctx.message.text.trim().split(/\s+/);

  if (parts.length < 4) {
    await ctx.reply(
      'الصيغة:\n/bindorder رقم_الطلب telegramId accountId\n\nمثال:\n/bindorder 123456 1628671884 1\n\nلعرض الحسابات:\n/accounts'
    );
    return;
  }

  const orderNumber = parts[1];
  const telegramId = parts[2];
  const accountId = Number(parts[3]);

  if (!orderNumber || !telegramId || Number.isNaN(accountId)) {
    await ctx.reply('البيانات غير صحيحة. تأكد من رقم الطلب و Telegram ID و accountId.');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { telegramId }
  });

  if (!user) {
    await ctx.reply(
      'المستخدم غير موجود في قاعدة البيانات.\nخله يدخل البوت ويضغط /start أولًا، ثم أعد المحاولة.'
    );
    return;
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId }
  });

  if (!account) {
    await ctx.reply('الحساب غير موجود. استخدم /accounts لمعرفة رقم الحساب الصحيح.');
    return;
  }

  const existing = await prisma.orderBinding.findUnique({
    where: { orderNumber }
  });

  if (existing && existing.userId !== user.id) {
    await ctx.reply('هذا رقم الطلب مربوط مسبقًا بمستخدم آخر ولا يمكن نقله.');
    return;
  }

  const binding = existing
    ? await prisma.orderBinding.update({
        where: { orderNumber },
        data: {
          userId: user.id,
          platformId: account.platformId,
          accountId: account.id,
          source: 'manual_admin'
        }
      })
    : await prisma.orderBinding.create({
        data: {
          orderNumber,
          userId: user.id,
          platformId: account.platformId,
          accountId: account.id,
          source: 'manual_admin'
        }
      });

  await ctx.reply(
    `✅ تم تفعيل الطلب بنجاح\n\nرقم الطلب: ${binding.orderNumber}\nTelegram ID: ${telegramId}\nالحساب: ${account.displayName}`
  );

  try {
    await bot.telegram.sendMessage(
      telegramId,
      `✅ تم تفعيل طلبك بنجاح\n\nرقم الطلب الخاص بك: ${orderNumber}\nالحساب: ${account.displayName}\n\nهذا الرقم مرتبط بحسابك في تيليجرام فقط، ولا يمكن لأي مستخدم آخر استخدامه.\nيمكنك الآن اختيار المنصة والحساب ثم إرسال رقم الطلب لتوليد الكود حسب الحد اليومي.`
    );
  } catch {
    await ctx.reply('تم التفعيل، لكن لم أستطع إرسال تنبيه للمستخدم. غالبًا لم يبدأ البوت أو حظر الرسائل.');
  }
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

bot.action('menu:activate', async (ctx) => {
  await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  pendingStates.set(ctx.from.id, { type: 'activation_request' });

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '✅ تفعيل الطلب\n\nأرسل رقم الطلب الآن.\nسيتم إرسال طلبك للإدارة للمراجعة اليدوية، وبعد الموافقة سيصلك تنبيه بأن الطلب تفعل.',
    backButton('menu:main')
  );
});

bot.action('menu:me', async (ctx) => {
  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from.id) },
    include: {
      bindings: {
        include: { account: true }
      },
      usages: true
    }
  });

  await ctx.answerCbQuery();

  if (!user) {
    await ctx.editMessageText('لم يتم العثور على بياناتك. اضغط /start أولًا.', backButton('menu:main'));
    return;
  }

  const bindingsText =
    user.bindings.length > 0
      ? user.bindings
          .map((b) => `• الطلب: ${b.orderNumber}\n  الحساب: ${b.account.displayName}`)
          .join('\n\n')
      : 'لا يوجد طلب مفعل حتى الآن.';

  await ctx.editMessageText(
    `معلوماتك:\n\nID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nاللغة: ${user.language}\n\nالطلبات المفعلة:\n${bindingsText}\n\nإعادة التصفير بعد: ${getResetText()}`,
    backButton('menu:main')
  );
});

bot.action('menu:support', async (ctx) => {
  pendingStates.set(ctx.from.id, { type: 'support' });

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '🛟 الدعم الفني\n\nاكتب رسالتك الآن، وسيتم إرسالها للإدارة.',
    backButton('menu:main')
  );
});

bot.action('menu:reviews', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '⭐ تقييمات العملاء\n\nسيتم تفعيل نظام التقييمات المرتبطة بالطلبات لاحقًا.',
    backButton('menu:main')
  );
});

bot.action('menu:how', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📘 طريقة الاستخدام:\n\n1) اضغط ✅ تفعيل الطلب.\n2) أرسل رقم الطلب.\n3) انتظر موافقة الإدارة.\n4) بعد التفعيل اختر المنصة والحساب.\n5) أرسل رقم الطلب لتوليد الكود.\n\nملاحظة: رقم الطلب يرتبط بأول مستخدم يتم تفعيله له فقط.',
    backButton('menu:main')
  );
});

bot.action('menu:terms', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📜 الشروط والأحكام:\n\n- الخدمة مخصصة لصاحب الطلب فقط.\n- يمنع مشاركة رقم الطلب مع أي شخص آخر.\n- رقم الطلب بعد تفعيله يرتبط بحساب تيليجرام واحد فقط.\n- أي محاولة استخدام رقم طلب ليس لك قد تؤدي إلى التقييد.\n- الحد اليومي لكل حساب يتم تطبيقه تلقائيًا.',
    backButton('menu:main')
  );
});

bot.action('menu:hours', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🕒 أوقات العمل الحالية:\nيوميًا من 6:00 م إلى 12:00 ص\n\nإعادة التصفير بعد: ${getResetText()}`,
    backButton('menu:main')
  );
});

bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(welcomeText, mainMenu());
});

bot.action(/^account:(\d+)$/, async (ctx) => {
  const accountId = Number(ctx.match[1]);

  pendingStates.set(ctx.from.id, {
    type: 'generate',
    accountDbId: accountId
  });

  await ctx.answerCbQuery();
  await ctx.reply(
    'أرسل رقم الطلب المفعّل لهذا الحساب الآن.\n\nإذا لم يتم تفعيل طلبك بعد، اضغط زر ✅ تفعيل الطلب من القائمة الرئيسية.'
  );
});

bot.on('text', async (ctx) => {
  const pending = pendingStates.get(ctx.from.id);
  if (!pending) return;

  const text = ctx.message.text.trim();

  const user = await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  if (pending.type === 'activation_request') {
    const orderNumber = text;

    const existing = await prisma.orderBinding.findUnique({
      where: { orderNumber }
    });

    if (existing && existing.userId !== user.id) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply(
        '❌ هذا رقم الطلب مربوط بمستخدم آخر ولا يمكن طلب تفعيله.',
        mainMenu()
      );
      return;
    }

    await prisma.supportTicket.create({
      data: {
        userId: user.id,
        category: 'activation_request',
        message: `Activation request for order: ${orderNumber}`,
        status: 'open'
      }
    });

    const adminMessage =
      `✅ طلب تفعيل جديد\n\n` +
      `رقم الطلب: ${orderNumber}\n` +
      `Telegram ID: ${ctx.from.id}\n` +
      `Username: @${ctx.from.username || '-'}\n` +
      `Name: ${ctx.from.first_name || '-'}\n\n` +
      `لتفعيل الطلب استخدم:\n` +
      `/bindorder ${orderNumber} ${ctx.from.id} 1\n\n` +
      `لعرض الحسابات:\n/accounts`;

    if (adminGroupId) {
      await bot.telegram.sendMessage(adminGroupId, adminMessage);
    } else {
      for (const adminId of getAdminIds()) {
        await bot.telegram.sendMessage(adminId, adminMessage);
      }
    }

    pendingStates.delete(ctx.from.id);

    await ctx.reply(
      '✅ تم إرسال طلب التفعيل للإدارة.\n\nبعد مراجعة رقم الطلب، سيصلك تنبيه عند تفعيله.',
      mainMenu()
    );
    return;
  }

  if (pending.type === 'support') {
    await prisma.supportTicket.create({
      data: {
        userId: user.id,
        category: 'support',
        message: text,
        status: 'open'
      }
    });

    const supportMessage =
      `🛟 رسالة دعم جديدة\n\n` +
      `Telegram ID: ${ctx.from.id}\n` +
      `Username: @${ctx.from.username || '-'}\n` +
      `Name: ${ctx.from.first_name || '-'}\n\n` +
      `الرسالة:\n${text}`;

    if (adminGroupId) {
      await bot.telegram.sendMessage(adminGroupId, supportMessage);
    } else {
      for (const adminId of getAdminIds()) {
        await bot.telegram.sendMessage(adminId, supportMessage);
      }
    }

    pendingStates.delete(ctx.from.id);

    await ctx.reply('✅ تم إرسال رسالتك للدعم.', mainMenu());
    return;
  }

  if (pending.type === 'generate') {
    const orderNumber = text;

    const account = await prisma.account.findUnique({
      where: { id: pending.accountDbId }
    });

    if (!account || !account.enabled || account.status !== 'active') {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ الحساب غير متاح حاليًا.', mainMenu());
      return;
    }

    const binding = await prisma.orderBinding.findUnique({
      where: { orderNumber }
    });

    if (!binding) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply(
        '❌ هذا رقم الطلب غير مفعّل بعد.\n\nاضغط زر ✅ تفعيل الطلب وأرسل الرقم للإدارة أولًا.',
        mainMenu()
      );
      return;
    }

    if (binding.userId !== user.id) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ هذا رقم الطلب ليس مرتبطًا بحسابك.', mainMenu());
      return;
    }

    if (binding.accountId !== account.id) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ هذا رقم الطلب غير مفعّل لهذا الحساب.', mainMenu());
      return;
    }

    const usage = await getUsageForToday(user.id, account.id);

    if (usage.count >= account.dailyLimit) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply(
        `⚠️ وصلت الحد اليومي لهذا الحساب.\nإعادة التصفير بعد: ${getResetText()}`,
        mainMenu()
      );
      return;
    }

    if (!account.sharedSecret) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ لا يوجد shared secret لهذا الحساب.', mainMenu());
      return;
    }

    const code = generateSteamGuardCode(account.sharedSecret);
    const updatedUsage = await incrementUsage(user.id, account.id);
    const remaining = Math.max(0, account.dailyLimit - updatedUsage.count);

    pendingStates.delete(ctx.from.id);

    await ctx.reply(
      `✅ تم التوليد بنجاح\n\nالحساب: ${account.displayName}\nالكود: ${code}\nالمتبقي اليوم: ${remaining}/${account.dailyLimit}\nإعادة التصفير بعد: ${getResetText()}`,
      mainMenu()
    );
  }
});