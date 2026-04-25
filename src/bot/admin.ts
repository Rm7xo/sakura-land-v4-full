import { Telegraf, Markup } from 'telegraf';
import { prisma } from '../infra/prisma.js';

const getAdminIds = () =>
  (process.env.ADMIN_IDS || '').split(',').map((x) => x.trim()).filter(Boolean);

const isAdmin = (id: number | string) => getAdminIds().includes(String(id));

const adminMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('📊 الإحصائيات', 'admin:stats')],
    [Markup.button.callback('🎮 المنصات', 'admin:platforms'), Markup.button.callback('🔐 الحسابات', 'admin:accounts')],
    [Markup.button.callback('🧾 الطلبات', 'admin:orders'), Markup.button.callback('👥 المستخدمين', 'admin:users')],
    [Markup.button.callback('⭐ التقييمات', 'admin:reviews'), Markup.button.callback('🛟 التذاكر', 'admin:tickets')],
    [Markup.button.callback('🖼️ الصور', 'admin:media'), Markup.button.callback('🔘 الأزرار', 'admin:buttons')],
    [Markup.button.callback('⚙️ الإعدادات', 'admin:settings')]
  ]);

const logAdmin = async (adminId: number | string, action: string, details?: string) => {
  await prisma.adminLog.create({
    data: { adminId: String(adminId), action, details }
  }).catch(() => {});
};

export const registerAdminCommands = (bot: Telegraf) => {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply(
      '🛠️ لوحة تحكم Sakura Land\n\nاختر القسم من الأزرار، أو استخدم الأوامر المباشرة.',
      adminMenu()
    );
  });

  bot.action('admin:stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const [users, platforms, accounts, orders, tickets, reviews, approvedReviews] =
      await Promise.all([
        prisma.user.count(),
        prisma.platform.count(),
        prisma.account.count(),
        prisma.orderBinding.count(),
        prisma.supportTicket.count(),
        prisma.review.count(),
        prisma.review.count({ where: { approved: true } })
      ]);

    await ctx.editMessageText(
      `📊 الإحصائيات\n\n👥 المستخدمين: ${users}\n🎮 المنصات: ${platforms}\n🔐 الحسابات: ${accounts}\n🧾 الطلبات المفعلة: ${orders}\n🛟 التذاكر: ${tickets}\n⭐ التقييمات: ${reviews}\n✅ المعتمدة: ${approvedReviews}`,
      adminMenu()
    );
  });

  bot.action('admin:platforms', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const platforms = await prisma.platform.findMany({
      include: { accounts: true },
      orderBy: { sortOrder: 'asc' }
    });

    const text = platforms.length
      ? platforms.map((p) =>
          `🎮 ${p.nameAr} / ${p.nameEn}\nKey: ${p.key}\nEnabled: ${p.enabled ? '✅' : '❌'}\nAccounts: ${p.accounts.length}\nImage: ${p.imageUrl || '-'}`
        ).join('\n\n')
      : 'لا توجد منصات.';

    await ctx.editMessageText(
      `${text}\n\nأوامر الإدارة:\n/addplatform key nameAr nameEn\n/toggleplatform key\n/setplatformimage key imageUrl`,
      adminMenu()
    );
  });

  bot.action('admin:accounts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const accounts = await prisma.account.findMany({
      include: { platform: true },
      orderBy: { id: 'asc' }
    });

    const text = accounts.length
      ? accounts.map((a) =>
          `ID: ${a.id}\n🔐 ${a.displayName}\nKey: ${a.key}\nPlatform: ${a.platform.nameAr}\nLimit: ${a.dailyLimit}\nEnabled: ${a.enabled ? '✅' : '❌'}\nSecret: ${a.sharedSecret ? '✅' : '❌'}`
        ).join('\n\n')
      : 'لا توجد حسابات.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/addaccount platformKey accountKey displayName sharedSecret dailyLimit\n/setsecret accountKey sharedSecret\n/setlimit accountKey dailyLimit\n/toggleaccount accountKey`,
      adminMenu()
    );
  });

  bot.action('admin:orders', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const orders = await prisma.orderBinding.findMany({
      take: 15,
      orderBy: { id: 'desc' },
      include: { user: true, account: true }
    });

    const text = orders.length
      ? orders.map((o) =>
          `🧾 ${o.orderNumber}\nUser: ${o.user.telegramId} @${o.user.username || '-'}\nAccount: ${o.account.displayName}\nActive: ${o.isActive ? '✅' : '❌'}`
        ).join('\n\n')
      : 'لا توجد طلبات.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/bindorder orderNumber telegramId accountId\n/unbindorder orderNumber`,
      adminMenu()
    );
  });

  bot.action('admin:users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const users = await prisma.user.findMany({
      take: 20,
      orderBy: { id: 'desc' }
    });

    const text = users.map((u) =>
      `ID: ${u.telegramId}\n@${u.username || '-'}\nName: ${u.firstName || '-'}\nBlocked: ${u.isBlocked ? '✅' : '❌'}`
    ).join('\n\n');

    await ctx.editMessageText(
      `${text || 'لا يوجد مستخدمين.'}\n\nأوامر:\n/block telegramId\n/unblock telegramId\n/broadcast الرسالة`,
      adminMenu()
    );
  });

  bot.action('admin:reviews', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const reviews = await prisma.review.findMany({
      take: 15,
      orderBy: { id: 'desc' },
      include: { user: true }
    });

    const text = reviews.length
      ? reviews.map((r) =>
          `ID: ${r.id}\n⭐ ${r.rating}/5\nUser: @${r.user.username || '-'}\nOrder: ${r.orderNumber || '-'}\nApproved: ${r.approved ? '✅' : '❌'}\n${r.content}`
        ).join('\n\n')
      : 'لا توجد تقييمات.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/approvereview reviewId\n/deletereview reviewId`,
      adminMenu()
    );
  });

  bot.action('admin:tickets', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const tickets = await prisma.supportTicket.findMany({
      take: 15,
      orderBy: { id: 'desc' },
      include: { user: true }
    });

    const text = tickets.length
      ? tickets.map((t) =>
          `ID: ${t.id}\nStatus: ${t.status}\nCategory: ${t.category || '-'}\nUser: ${t.user.telegramId} @${t.user.username || '-'}\n${t.message}`
        ).join('\n\n')
      : 'لا توجد تذاكر.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/closeticket ticketId`,
      adminMenu()
    );
  });

  bot.action('admin:media', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const media = await prisma.botMedia.findMany({ orderBy: { id: 'asc' } });

    const text = media.length
      ? media.map((m) => `${m.key}: ${m.imageUrl}`).join('\n\n')
      : 'لا توجد صور.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/setmedia welcomeImage imageUrl\n/setmedia reviewsImage imageUrl\n/setmedia platformsImage imageUrl`,
      adminMenu()
    );
  });

  bot.action('admin:buttons', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const buttons = await prisma.menuItem.findMany({ orderBy: { sortOrder: 'asc' } });

    const text = buttons.length
      ? buttons.map((b) =>
          `${b.sortOrder}. ${b.text}\nKey: ${b.key}\nAction: ${b.actionValue}\nEnabled: ${b.enabled ? '✅' : '❌'}`
        ).join('\n\n')
      : 'لا توجد أزرار.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/setbutton key sort enabled actionValue text\nمثال:\n/setbutton reviews 3 true menu:reviews ⭐ تقييمات العملاء`,
      adminMenu()
    );
  });

  bot.action('admin:settings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.answerCbQuery();

    const settings = await prisma.appSetting.findMany({ take: 20 });

    const text = settings.length
      ? settings.map((s) => `${s.key}: ${s.value}`).join('\n\n')
      : 'لا توجد إعدادات.';

    await ctx.editMessageText(
      `${text}\n\nأوامر:\n/setsetting welcomeText النص\n/setsetting howText النص\n/setsetting termsText النص\n/setsetting hoursText النص`,
      adminMenu()
    );
  });

  bot.command('addplatform', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) return ctx.reply('الصيغة:\n/addplatform steam ستيم Steam');

    const [, key, nameAr, nameEn] = parts;

    await prisma.platform.upsert({
      where: { key },
      update: { nameAr, nameEn, enabled: true },
      create: { key, nameAr, nameEn, enabled: true }
    });

    await logAdmin(ctx.from.id, 'addplatform', key);
    await ctx.reply(`✅ تم إضافة/تحديث المنصة: ${key}`);
  });

  bot.command('setplatformimage', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) return ctx.reply('الصيغة:\n/setplatformimage steam imageUrl');

    const [, key, imageUrl] = parts;
    await prisma.platform.update({ where: { key }, data: { imageUrl } });
    await ctx.reply('✅ تم تحديث صورة المنصة.');
  });

  bot.command('toggleplatform', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.message.text.split(' ')[1];
    if (!key) return ctx.reply('الصيغة:\n/toggleplatform steam');

    const p = await prisma.platform.findUnique({ where: { key } });
    if (!p) return ctx.reply('❌ المنصة غير موجودة.');

    await prisma.platform.update({ where: { key }, data: { enabled: !p.enabled } });
    await ctx.reply(`✅ المنصة الآن: ${!p.enabled ? 'مفعلة' : 'معطلة'}`);
  });

  bot.command('addaccount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 6) {
      return ctx.reply('الصيغة:\n/addaccount platformKey accountKey displayName sharedSecret dailyLimit');
    }

    const [, platformKey, accountKey, displayName, sharedSecret, dailyLimitRaw] = parts;
    const dailyLimit = Number(dailyLimitRaw);

    const platform = await prisma.platform.findUnique({ where: { key: platformKey } });
    if (!platform) return ctx.reply('❌ المنصة غير موجودة.');

    await prisma.account.upsert({
      where: { key: accountKey },
      update: { displayName, sharedSecret, dailyLimit, enabled: true, status: 'active' },
      create: {
        platformId: platform.id,
        key: accountKey,
        displayName,
        type: 'steam_guard',
        sharedSecret,
        dailyLimit,
        enabled: true,
        status: 'active'
      }
    });

    await ctx.reply(`✅ تم إضافة/تحديث الحساب: ${displayName}`);
  });

  bot.command('setsecret', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) return ctx.reply('الصيغة:\n/setsecret accountKey sharedSecret');

    await prisma.account.update({ where: { key: parts[1] }, data: { sharedSecret: parts[2] } });
    await ctx.reply('✅ تم تحديث shared secret.');
  });

  bot.command('setlimit', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) return ctx.reply('الصيغة:\n/setlimit accountKey dailyLimit');

    await prisma.account.update({ where: { key: parts[1] }, data: { dailyLimit: Number(parts[2]) } });
    await ctx.reply('✅ تم تحديث الحد اليومي.');
  });

  bot.command('toggleaccount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const key = ctx.message.text.split(' ')[1];
    if (!key) return ctx.reply('الصيغة:\n/toggleaccount accountKey');

    const a = await prisma.account.findUnique({ where: { key } });
    if (!a) return ctx.reply('❌ الحساب غير موجود.');

    await prisma.account.update({ where: { key }, data: { enabled: !a.enabled } });
    await ctx.reply(`✅ الحساب الآن: ${!a.enabled ? 'مفعل' : 'معطل'}`);
  });

  bot.command('bindorder', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 4) return ctx.reply('الصيغة:\n/bindorder orderNumber telegramId accountId');

    const [, orderNumber, telegramId, accountIdRaw] = parts;
    const accountId = Number(accountIdRaw);

    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return ctx.reply('❌ المستخدم غير موجود. خله يضغط /start أولًا.');

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return ctx.reply('❌ الحساب غير موجود.');

    await prisma.orderBinding.upsert({
      where: { orderNumber },
      update: {
        userId: user.id,
        platformId: account.platformId,
        accountId,
        isActive: true,
        source: 'manual_admin'
      },
      create: {
        orderNumber,
        userId: user.id,
        platformId: account.platformId,
        accountId,
        isActive: true,
        source: 'manual_admin'
      }
    });

    await ctx.reply('✅ تم ربط الطلب.');
    await bot.telegram.sendMessage(
      telegramId,
      `✅ تم تفعيل طلبك بنجاح\n\nرقم الطلب: ${orderNumber}\nالحساب: ${account.displayName}\n\nصار بإمكانك توليد الكود.`
    ).catch(() => {});
  });

  bot.command('unbindorder', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const orderNumber = ctx.message.text.split(' ')[1];
    if (!orderNumber) return ctx.reply('الصيغة:\n/unbindorder orderNumber');

    const binding = await prisma.orderBinding.findUnique({
      where: { orderNumber },
      include: { user: true }
    });

    if (!binding) return ctx.reply('❌ الطلب غير موجود.');

    await prisma.orderBinding.delete({ where: { orderNumber } });
    await ctx.reply('✅ تم إلغاء تفعيل الطلب.');

    await bot.telegram.sendMessage(binding.user.telegramId, `⚠️ تم إلغاء تفعيل طلبك:\n${orderNumber}`).catch(() => {});
  });

  bot.command('approvereview', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('الصيغة:\n/approvereview reviewId');

    await prisma.review.update({ where: { id }, data: { approved: true } });
    await ctx.reply('✅ تم اعتماد التقييم.');
  });

  bot.command('deletereview', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('الصيغة:\n/deletereview reviewId');

    await prisma.review.delete({ where: { id } });
    await ctx.reply('✅ تم حذف التقييم.');
  });

  bot.command('closeticket', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const id = Number(ctx.message.text.split(' ')[1]);
    if (!id) return ctx.reply('الصيغة:\n/closeticket ticketId');

    await prisma.supportTicket.update({ where: { id }, data: { status: 'closed' } });
    await ctx.reply('✅ تم إغلاق التذكرة.');
  });

  bot.command('block', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const telegramId = ctx.message.text.split(' ')[1];
    if (!telegramId) return ctx.reply('الصيغة:\n/block telegramId');

    await prisma.user.update({ where: { telegramId }, data: { isBlocked: true } });
    await ctx.reply('✅ تم حظر المستخدم.');
  });

  bot.command('unblock', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const telegramId = ctx.message.text.split(' ')[1];
    if (!telegramId) return ctx.reply('الصيغة:\n/unblock telegramId');

    await prisma.user.update({ where: { telegramId }, data: { isBlocked: false } });
    await ctx.reply('✅ تم فك الحظر.');
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) return ctx.reply('اكتب الرسالة بعد الأمر.');

    const users = await prisma.user.findMany({ where: { isBlocked: false } });
    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegramId, message);
        sent++;
      } catch {}
    }

    await ctx.reply(`✅ تم الإرسال إلى ${sent} مستخدم.`);
  });

  bot.command('setmedia', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) return ctx.reply('الصيغة:\n/setmedia welcomeImage imageUrl');

    const [, key, imageUrl] = parts;

    await prisma.botMedia.upsert({
      where: { key },
      update: { imageUrl },
      create: { key, imageUrl }
    });

    await ctx.reply(`✅ تم حفظ الصورة: ${key}`);
  });

  bot.command('setsetting', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const raw = ctx.message.text.replace('/setsetting', '').trim();
    const i = raw.indexOf(' ');
    if (i === -1) return ctx.reply('الصيغة:\n/setsetting welcomeText النص');

    const key = raw.slice(0, i).trim();
    const value = raw.slice(i + 1).trim();

    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });

    await ctx.reply(`✅ تم حفظ الإعداد: ${key}`);
  });

  bot.command('setbutton', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const raw = ctx.message.text.replace('/setbutton', '').trim();
    const parts = raw.split(/\s+/);

    if (parts.length < 5) {
      return ctx.reply('الصيغة:\n/setbutton key sort enabled actionValue text\nمثال:\n/setbutton reviews 3 true menu:reviews ⭐ تقييمات العملاء');
    }

    const [key, sortRaw, enabledRaw, actionValue, ...textParts] = parts;
    const sortOrder = Number(sortRaw);
    const enabled = enabledRaw === 'true';
    const text = textParts.join(' ');

    await prisma.menuItem.upsert({
      where: { key },
      update: { text, sortOrder, enabled, actionValue },
      create: { key, text, sortOrder, enabled, actionValue }
    });

    await ctx.reply(`✅ تم حفظ الزر: ${key}`);
  });
};