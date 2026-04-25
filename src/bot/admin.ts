import { Telegraf } from 'telegraf';
import { prisma } from '../infra/prisma.js';

const getAdminIds = () =>
  (process.env.ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const isAdmin = (id: number | string) => getAdminIds().includes(String(id));

const logAdmin = async (adminId: number | string, action: string, details?: string) => {
  await prisma.adminLog.create({
    data: {
      adminId: String(adminId),
      action,
      details
    }
  }).catch(() => {});
};

export const registerAdminCommands = (bot: Telegraf) => {
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.reply(
`🛠️ لوحة تحكم Sakura Land

📊 الإحصائيات:
/stats

🎮 المنصات:
/platforms
/addplatform key nameAr nameEn
/toggleplatform key

👤 الحسابات:
/accounts
/addaccount platformKey accountKey displayName sharedSecret dailyLimit
/setsecret accountKey sharedSecret
/setlimit accountKey dailyLimit
/toggleaccount accountKey

🧾 الطلبات:
/bindorder orderNumber telegramId accountId
/unbindorder orderNumber
/orders

👥 المستخدمين:
/users
/block telegramId
/unblock telegramId

📢 إرسال جماعي:
/broadcast رسالتك

🖼️ الصور والإعدادات:
/setmedia key imageUrl
/setsetting key value`
    );
  });

  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const [users, platforms, accounts, orders, tickets, reviews] = await Promise.all([
      prisma.user.count(),
      prisma.platform.count(),
      prisma.account.count(),
      prisma.orderBinding.count(),
      prisma.supportTicket.count(),
      prisma.review.count()
    ]);

    await ctx.reply(
`📊 الإحصائيات

👥 المستخدمين: ${users}
🎮 المنصات: ${platforms}
🔐 الحسابات: ${accounts}
🧾 الطلبات المفعلة: ${orders}
🛟 التذاكر: ${tickets}
⭐ التقييمات: ${reviews}`
    );
  });

  bot.command('platforms', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const platforms = await prisma.platform.findMany({
      include: { accounts: true },
      orderBy: { id: 'asc' }
    });

    if (!platforms.length) return ctx.reply('لا توجد منصات.');

    await ctx.reply(
      platforms.map(p =>
`ID: ${p.id}
Key: ${p.key}
AR: ${p.nameAr}
EN: ${p.nameEn}
Enabled: ${p.enabled ? '✅' : '❌'}
Accounts: ${p.accounts.length}
Image: ${p.imageUrl || '-'}`
      ).join('\n\n')
    );
  });

  bot.command('addplatform', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.split(' ');
    if (parts.length < 4) {
      return ctx.reply('الصيغة:\n/addplatform steam ستيم Steam');
    }

    const [, key, nameAr, nameEn] = parts;

    await prisma.platform.upsert({
      where: { key },
      update: { nameAr, nameEn, enabled: true },
      create: { key, nameAr, nameEn, enabled: true }
    });

    await logAdmin(ctx.from.id, 'addplatform', ctx.message.text);
    await ctx.reply(`✅ تم إضافة/تحديث المنصة: ${key}`);
  });

  bot.command('toggleplatform', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const key = ctx.message.text.split(' ')[1];
    if (!key) return ctx.reply('الصيغة:\n/toggleplatform steam');

    const platform = await prisma.platform.findUnique({ where: { key } });
    if (!platform) return ctx.reply('❌ المنصة غير موجودة.');

    await prisma.platform.update({
      where: { key },
      data: { enabled: !platform.enabled }
    });

    await logAdmin(ctx.from.id, 'toggleplatform', key);
    await ctx.reply(`✅ تم تغيير حالة المنصة إلى: ${!platform.enabled ? 'مفعلة' : 'معطلة'}`);
  });

  bot.command('accounts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const accounts = await prisma.account.findMany({
      include: { platform: true },
      orderBy: { id: 'asc' }
    });

    if (!accounts.length) return ctx.reply('لا توجد حسابات.');

    await ctx.reply(
      accounts.map(a =>
`ID: ${a.id}
Key: ${a.key}
Name: ${a.displayName}
Platform: ${a.platform.nameAr}
Limit: ${a.dailyLimit}
Enabled: ${a.enabled ? '✅' : '❌'}
Status: ${a.status}
Secret: ${a.sharedSecret ? '✅ موجود' : '❌ غير موجود'}`
      ).join('\n\n')
    );
  });

  bot.command('addaccount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 6) {
      return ctx.reply(
        'الصيغة:\n/addaccount platformKey accountKey displayName sharedSecret dailyLimit\n\nمثال:\n/addaccount steam irm7x1 irm7x1 SECRET 3'
      );
    }

    const [, platformKey, accountKey, displayName, sharedSecret, dailyLimitRaw] = parts;
    const dailyLimit = Number(dailyLimitRaw);

    const platform = await prisma.platform.findUnique({ where: { key: platformKey } });
    if (!platform) return ctx.reply('❌ المنصة غير موجودة. أضفها أولًا بـ /addplatform');

    await prisma.account.upsert({
      where: { key: accountKey },
      update: {
        displayName,
        sharedSecret,
        dailyLimit,
        enabled: true,
        status: 'active'
      },
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

    await logAdmin(ctx.from.id, 'addaccount', `account=${accountKey}`);
    await ctx.reply(`✅ تم إضافة/تحديث الحساب: ${displayName}`);
  });

  bot.command('setsecret', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) return ctx.reply('الصيغة:\n/setsecret accountKey sharedSecret');

    const [, key, sharedSecret] = parts;

    await prisma.account.update({
      where: { key },
      data: { sharedSecret }
    });

    await logAdmin(ctx.from.id, 'setsecret', key);
    await ctx.reply('✅ تم تحديث shared secret.');
  });

  bot.command('setlimit', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) return ctx.reply('الصيغة:\n/setlimit accountKey dailyLimit');

    const [, key, limitRaw] = parts;
    const dailyLimit = Number(limitRaw);

    await prisma.account.update({
      where: { key },
      data: { dailyLimit }
    });

    await logAdmin(ctx.from.id, 'setlimit', `${key}=${dailyLimit}`);
    await ctx.reply('✅ تم تحديث الحد اليومي.');
  });

  bot.command('toggleaccount', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const key = ctx.message.text.split(' ')[1];
    if (!key) return ctx.reply('الصيغة:\n/toggleaccount accountKey');

    const account = await prisma.account.findUnique({ where: { key } });
    if (!account) return ctx.reply('❌ الحساب غير موجود.');

    await prisma.account.update({
      where: { key },
      data: { enabled: !account.enabled }
    });

    await logAdmin(ctx.from.id, 'toggleaccount', key);
    await ctx.reply(`✅ الحساب الآن: ${!account.enabled ? 'مفعل' : 'معطل'}`);
  });

  bot.command('bindorder', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 4) {
      return ctx.reply('الصيغة:\n/bindorder orderNumber telegramId accountId');
    }

    const [, orderNumber, telegramId, accountIdRaw] = parts;
    const accountId = Number(accountIdRaw);

    const user = await prisma.user.findUnique({ where: { telegramId } });
    if (!user) return ctx.reply('❌ المستخدم غير موجود. خله يضغط /start أولًا.');

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return ctx.reply('❌ الحساب غير موجود.');

    const existing = await prisma.orderBinding.findUnique({ where: { orderNumber } });

    if (existing && existing.userId !== user.id) {
      return ctx.reply('❌ الطلب مربوط بمستخدم آخر.');
    }

    await prisma.orderBinding.upsert({
      where: { orderNumber },
      update: {
        userId: user.id,
        platformId: account.platformId,
        accountId: account.id,
        source: 'manual_admin',
        isActive: true
      },
      create: {
        orderNumber,
        userId: user.id,
        platformId: account.platformId,
        accountId: account.id,
        source: 'manual_admin',
        isActive: true
      }
    });

    await logAdmin(ctx.from.id, 'bindorder', `${orderNumber} -> ${telegramId}`);

    await ctx.reply('✅ تم ربط الطلب بنجاح.');

    await bot.telegram.sendMessage(
      telegramId,
      `✅ تم تفعيل طلبك بنجاح\n\nرقم الطلب: ${orderNumber}\nالحساب: ${account.displayName}\n\nرقم الطلب صار مرتبط بحسابك فقط.`
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

    await logAdmin(ctx.from.id, 'unbindorder', orderNumber);
    await ctx.reply('✅ تم إلغاء تفعيل الطلب.');

    await bot.telegram.sendMessage(
      binding.user.telegramId,
      `⚠️ تم إلغاء تفعيل طلبك:\n${orderNumber}`
    ).catch(() => {});
  });

  bot.command('orders', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const orders = await prisma.orderBinding.findMany({
      take: 15,
      orderBy: { id: 'desc' },
      include: { user: true, account: true }
    });

    if (!orders.length) return ctx.reply('لا توجد طلبات.');

    await ctx.reply(
      orders.map(o =>
`🧾 ${o.orderNumber}
User: ${o.user.telegramId} @${o.user.username || '-'}
Account: ${o.account.displayName}
Active: ${o.isActive ? '✅' : '❌'}`
      ).join('\n\n')
    );
  });

  bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const users = await prisma.user.findMany({
      take: 15,
      orderBy: { id: 'desc' }
    });

    await ctx.reply(
      users.map(u =>
`ID: ${u.telegramId}
@${u.username || '-'}
Name: ${u.firstName || '-'}
Blocked: ${u.isBlocked ? '✅' : '❌'}`
      ).join('\n\n')
    );
  });

  bot.command('block', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const telegramId = ctx.message.text.split(' ')[1];
    if (!telegramId) return ctx.reply('الصيغة:\n/block telegramId');

    await prisma.user.update({
      where: { telegramId },
      data: { isBlocked: true }
    });

    await logAdmin(ctx.from.id, 'block', telegramId);
    await ctx.reply('✅ تم حظر المستخدم.');
  });

  bot.command('unblock', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const telegramId = ctx.message.text.split(' ')[1];
    if (!telegramId) return ctx.reply('الصيغة:\n/unblock telegramId');

    await prisma.user.update({
      where: { telegramId },
      data: { isBlocked: false }
    });

    await logAdmin(ctx.from.id, 'unblock', telegramId);
    await ctx.reply('✅ تم فك الحظر.');
  });

  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const message = ctx.message.text.replace('/broadcast', '').trim();
    if (!message) return ctx.reply('اكتب الرسالة بعد الأمر.');

    const users = await prisma.user.findMany({
      where: { isBlocked: false }
    });

    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegramId, message);
        sent++;
      } catch {}
    }

    await logAdmin(ctx.from.id, 'broadcast', `sent=${sent}`);
    await ctx.reply(`✅ تم الإرسال إلى ${sent} مستخدم.`);
  });

  bot.command('setsetting', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const raw = ctx.message.text.replace('/setsetting', '').trim();
    const spaceIndex = raw.indexOf(' ');

    if (spaceIndex === -1) {
      return ctx.reply('الصيغة:\n/setsetting welcomeText النص هنا');
    }

    const key = raw.slice(0, spaceIndex).trim();
    const value = raw.slice(spaceIndex + 1).trim();

    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });

    await logAdmin(ctx.from.id, 'setsetting', key);
    await ctx.reply(`✅ تم حفظ الإعداد: ${key}`);
  });

  bot.command('setmedia', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const parts = ctx.message.text.trim().split(/\s+/);
    if (parts.length < 3) {
      return ctx.reply('الصيغة:\n/setmedia welcomeImage https://example.com/image.png');
    }

    const [, key, imageUrl] = parts;

    await prisma.botMedia.upsert({
      where: { key },
      update: { imageUrl },
      create: { key, imageUrl }
    });

    await logAdmin(ctx.from.id, 'setmedia', key);
    await ctx.reply(`✅ تم حفظ الصورة: ${key}`);
  });
};