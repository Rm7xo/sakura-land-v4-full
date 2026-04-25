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
import { registerAdminCommands } from './admin.js';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN');
}

export const bot = new Telegraf(token);

registerAdminCommands(bot);

type PendingState =
  | { type: 'activation' }
  | { type: 'support' }
  | { type: 'review' }
  | { type: 'generate'; accountDbId: number };

const pendingStates = new Map<number, PendingState>();

const getSetting = async (key: string, fallback: string) => {
  const setting = await prisma.appSetting.findUnique({ where: { key } });
  return setting?.value || fallback;
};

const sendMenuMessage = async (
  ctx: any,
  text: string,
  mediaKey?: string
) => {
  const menu = await mainMenu();

  if (mediaKey) {
    const media = await prisma.botMedia.findUnique({
      where: { key: mediaKey }
    });

    if (media?.imageUrl) {
      await ctx.replyWithPhoto(media.imageUrl, {
        caption: text,
        ...menu
      });
      return;
    }
  }

  await ctx.reply(text, menu);
};

bot.start(async (ctx) => {
  const user = await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  if (user.isBlocked) {
    await ctx.reply('❌ تم تقييد حسابك من استخدام البوت.');
    return;
  }

  const welcomeText = await getSetting(
    'welcomeText',
    'أهلًا بك في Sakura Land Bot 🌸\n\nاختر من القائمة بالأسفل.'
  );

  await sendMenuMessage(ctx, welcomeText, 'welcomeImage');
});

bot.command('myid', async (ctx) => {
  await ctx.reply(
    `معلوماتك:\n\nTelegram ID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\nName: ${ctx.from.first_name || '-'}`
  );
});

bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();

  const welcomeText = await getSetting(
    'welcomeText',
    'أهلًا بك في Sakura Land Bot 🌸\n\nاختر من القائمة بالأسفل.'
  );

  const menu = await mainMenu();

  try {
    await ctx.editMessageText(welcomeText, menu);
  } catch {
    await ctx.reply(welcomeText, menu);
  }
});

bot.action('menu:activate', async (ctx) => {
  pendingStates.set(ctx.from.id, { type: 'activation' });

  await ctx.answerCbQuery();
  await ctx.reply(
    '✅ تفعيل الطلب\n\nأرسل رقم الطلب الآن.\nسيتم إرسال طلبك للإدارة للمراجعة اليدوية.'
  );
});

bot.action('menu:platforms', async (ctx) => {
  await ctx.answerCbQuery();

  const platforms = await prisma.platform.findMany({
    where: { enabled: true },
    include: {
      accounts: {
        where: {
          enabled: true,
          status: 'active'
        }
      }
    },
    orderBy: { sortOrder: 'asc' }
  });

  const buttons = platforms.flatMap((platform) =>
    platform.accounts.map((account) => [
      {
        text: `🎮 ${account.displayName}`,
        callback_data: `account:${account.id}`
      }
    ])
  );

  if (buttons.length === 0) {
    await ctx.reply('❌ لا توجد حسابات متاحة حاليًا.', backButton('menu:main'));
    return;
  }

  const media = await prisma.botMedia.findUnique({
    where: { key: 'platformsImage' }
  });

  if (media?.imageUrl) {
    await ctx.replyWithPhoto(media.imageUrl, {
      caption: '🎮 اختر الحساب:',
      reply_markup: {
        inline_keyboard: [
          ...buttons,
          [{ text: '⬅️ رجوع', callback_data: 'menu:main' }]
        ]
      }
    });
  } else {
    await ctx.reply('🎮 اختر الحساب:', {
      reply_markup: {
        inline_keyboard: [
          ...buttons,
          [{ text: '⬅️ رجوع', callback_data: 'menu:main' }]
        ]
      }
    });
  }
});

bot.action(/^account:(\d+)$/, async (ctx) => {
  const accountId = Number(ctx.match[1]);

  pendingStates.set(ctx.from.id, {
    type: 'generate',
    accountDbId: accountId
  });

  await ctx.answerCbQuery();
  await ctx.reply(
    '📩 أرسل رقم الطلب المفعّل لهذا الحساب الآن.\n\nإذا لم يتم تفعيل طلبك بعد، اضغط ✅ تفعيل الطلب.'
  );
});

bot.action('menu:me', async (ctx) => {
  await ctx.answerCbQuery();

  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from.id) },
    include: {
      bindings: {
        include: { account: true }
      }
    }
  });

  if (!user) {
    await ctx.reply('اضغط /start أولًا.');
    return;
  }

  const bindingsText =
    user.bindings.length > 0
      ? user.bindings
          .map(
            (b) =>
              `• الطلب: ${b.orderNumber}\n  الحساب: ${b.account.displayName}\n  الحالة: ${b.isActive ? 'مفعل ✅' : 'معطل ❌'}`
          )
          .join('\n\n')
      : 'لا يوجد طلب مفعل حتى الآن.';

  await ctx.reply(
    `👤 معلوماتك\n\nID: ${ctx.from.id}\nUsername: @${ctx.from.username || '-'}\n\nالطلبات:\n${bindingsText}\n\nإعادة التصفير بعد: ${getResetText()}`,
    backButton('menu:main')
  );
});

bot.action('menu:support', async (ctx) => {
  pendingStates.set(ctx.from.id, { type: 'support' });

  await ctx.answerCbQuery();
  await ctx.reply('🛟 اكتب رسالتك الآن وسيتم إرسالها للإدارة.');
});

bot.action('menu:reviews', async (ctx) => {
  await ctx.answerCbQuery();

  const reviews = await prisma.review.findMany({
    where: { approved: true },
    include: { user: true },
    take: 10,
    orderBy: { id: 'desc' }
  });

  let text = '⭐ تقييمات العملاء\n\n';

  if (reviews.length === 0) {
    text += 'لا توجد تقييمات حتى الآن.';
  } else {
    text += reviews
      .map(
        (review) =>
          `⭐ ${review.rating}/5\n👤 ${review.user.firstName || review.user.username || 'عميل'}\n💬 ${review.content}`
      )
      .join('\n\n');
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✍️ أضف تقييم', callback_data: 'review:add' }],
        [{ text: '⬅️ رجوع', callback_data: 'menu:main' }]
      ]
    }
  };

  const media = await prisma.botMedia.findUnique({
    where: { key: 'reviewsImage' }
  });

  if (media?.imageUrl) {
    await ctx.replyWithPhoto(media.imageUrl, {
      caption: text,
      ...keyboard
    });
  } else {
    await ctx.reply(text, keyboard);
  }
});

bot.action('review:add', async (ctx) => {
  await ctx.answerCbQuery();

  const user = await prisma.user.findUnique({
    where: { telegramId: String(ctx.from.id) },
    include: {
      bindings: true
    }
  });

  if (!user || user.bindings.filter((b) => b.isActive).length === 0) {
    await ctx.reply('❌ لازم يكون عندك رقم طلب مفعل عشان تقدر تقيّم.');
    return;
  }

  pendingStates.set(ctx.from.id, { type: 'review' });

  await ctx.reply(
    '✍️ اكتب تقييمك بهذا الشكل:\n\n5 الخدمة ممتازة والكود وصل بسرعة\n\nالرقم من 1 إلى 5.'
  );
});

bot.action('menu:how', async (ctx) => {
  await ctx.answerCbQuery();

  const text = await getSetting(
    'howText',
    '📘 طريقة الاستخدام:\n\n1) اضغط ✅ تفعيل الطلب.\n2) أرسل رقم الطلب.\n3) انتظر موافقة الإدارة.\n4) بعد التفعيل اختر الحساب.\n5) أرسل رقم الطلب لتوليد الكود.'
  );

  await ctx.reply(text, backButton('menu:main'));
});

bot.action('menu:terms', async (ctx) => {
  await ctx.answerCbQuery();

  const text = await getSetting(
    'termsText',
    '📜 الشروط والأحكام:\n\n- الخدمة مخصصة لصاحب الطلب فقط.\n- يمنع مشاركة رقم الطلب.\n- رقم الطلب يرتبط بحساب تيليجرام واحد فقط.\n- أي محاولة تلاعب قد تؤدي إلى التقييد.'
  );

  await ctx.reply(text, backButton('menu:main'));
});

bot.action('menu:hours', async (ctx) => {
  await ctx.answerCbQuery();

  const text = await getSetting(
    'hoursText',
    `🕒 أوقات العمل:\nيوميًا من 6:00 م إلى 12:00 ص\n\nإعادة التصفير بعد: ${getResetText()}`
  );

  await ctx.reply(text, backButton('menu:main'));
});

bot.on('text', async (ctx) => {
  const state = pendingStates.get(ctx.from.id);
  if (!state) return;

  const text = ctx.message.text.trim();

  const user = await getOrCreateUser(
    String(ctx.from.id),
    ctx.from.username,
    ctx.from.first_name
  );

  if (user.isBlocked) {
    pendingStates.delete(ctx.from.id);
    await ctx.reply('❌ تم تقييد حسابك من استخدام البوت.');
    return;
  }

  if (state.type === 'activation') {
    const orderNumber = text;

    const existing = await prisma.orderBinding.findUnique({
      where: { orderNumber }
    });

    if (existing && existing.userId !== user.id) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ هذا رقم الطلب مربوط بمستخدم آخر.');
      return;
    }

    await prisma.supportTicket.create({
      data: {
        userId: user.id,
        category: 'activation_request',
        message: `طلب تفعيل رقم الطلب: ${orderNumber}`,
        status: 'open'
      }
    });

    const adminMessage =
      `📩 طلب تفعيل جديد\n\n` +
      `رقم الطلب: ${orderNumber}\n` +
      `Telegram ID: ${ctx.from.id}\n` +
      `Username: @${ctx.from.username || '-'}\n` +
      `Name: ${ctx.from.first_name || '-'}\n\n` +
      `للتفعيل استخدم:\n` +
      `/bindorder ${orderNumber} ${ctx.from.id} 1\n\n` +
      `لعرض الحسابات:\n/accounts`;

    const adminGroupId = process.env.ADMIN_GROUP_ID;

    if (adminGroupId) {
      await bot.telegram.sendMessage(adminGroupId, adminMessage);
    } else {
      const admins = (process.env.ADMIN_IDS || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      for (const admin of admins) {
        await bot.telegram.sendMessage(admin, adminMessage).catch(() => {});
      }
    }

    pendingStates.delete(ctx.from.id);

    await ctx.reply(
      '✅ تم إرسال طلب التفعيل للإدارة.\n\nبعد المراجعة سيصلك تنبيه عند التفعيل.',
      await mainMenu()
    );
    return;
  }

  if (state.type === 'support') {
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

    const adminGroupId = process.env.ADMIN_GROUP_ID;

    if (adminGroupId) {
      await bot.telegram.sendMessage(adminGroupId, supportMessage);
    } else {
      const admins = (process.env.ADMIN_IDS || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

      for (const admin of admins) {
        await bot.telegram.sendMessage(admin, supportMessage).catch(() => {});
      }
    }

    pendingStates.delete(ctx.from.id);

    await ctx.reply('✅ تم إرسال رسالتك للدعم.', await mainMenu());
    return;
  }

  if (state.type === 'review') {
    const parts = text.split(/\s+/);
    const rating = Number(parts[0]);
    const content = parts.slice(1).join(' ').trim();

    if (!rating || rating < 1 || rating > 5 || !content) {
      await ctx.reply('❌ الصيغة غير صحيحة.\nمثال:\n5 ممتاز جدًا');
      return;
    }

    const activeBinding = await prisma.orderBinding.findFirst({
      where: {
        userId: user.id,
        isActive: true
      },
      orderBy: { id: 'desc' }
    });

    if (!activeBinding) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ لازم يكون عندك طلب مفعل عشان تقيّم.');
      return;
    }

    await prisma.review.create({
      data: {
        userId: user.id,
        orderNumber: activeBinding.orderNumber,
        rating,
        content,
        approved: false
      }
    });

    pendingStates.delete(ctx.from.id);

    await ctx.reply('✅ تم إرسال تقييمك للمراجعة. شكرًا لك 🌸', await mainMenu());
    return;
  }

  if (state.type === 'generate') {
    const orderNumber = text;

    const account = await prisma.account.findUnique({
      where: { id: state.accountDbId }
    });

    if (!account || !account.enabled || account.status !== 'active') {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ الحساب غير متاح حاليًا.', await mainMenu());
      return;
    }

    const binding = await prisma.orderBinding.findUnique({
      where: { orderNumber }
    });

    if (!binding || !binding.isActive) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply(
        '❌ رقم الطلب غير مفعل.\n\nاضغط ✅ تفعيل الطلب وأرسله للإدارة أولًا.',
        await mainMenu()
      );
      return;
    }

    if (binding.userId !== user.id) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ هذا رقم الطلب ليس مرتبطًا بحسابك.', await mainMenu());
      return;
    }

    if (binding.accountId !== account.id) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ هذا رقم الطلب غير مفعل لهذا الحساب.', await mainMenu());
      return;
    }

    const usage = await getUsageForToday(user.id, account.id);

    if (usage.count >= account.dailyLimit) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply(
        `⚠️ وصلت الحد اليومي لهذا الحساب.\nإعادة التصفير بعد: ${getResetText()}`,
        await mainMenu()
      );
      return;
    }

    if (!account.sharedSecret) {
      pendingStates.delete(ctx.from.id);
      await ctx.reply('❌ هذا الحساب غير مهيأ. لا يوجد shared secret.', await mainMenu());
      return;
    }

    const code = generateSteamGuardCode(account.sharedSecret);
    const updatedUsage = await incrementUsage(user.id, account.id);
    const remaining = Math.max(0, account.dailyLimit - updatedUsage.count);

    pendingStates.delete(ctx.from.id);

    await ctx.reply(
      `✅ تم التوليد بنجاح\n\nالحساب: ${account.displayName}\nالكود: ${code}\nالمتبقي اليوم: ${remaining}/${account.dailyLimit}\nإعادة التصفير بعد: ${getResetText()}`,
      await mainMenu()
    );
  }
});

export default bot;