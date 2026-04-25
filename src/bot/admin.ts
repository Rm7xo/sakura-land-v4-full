import { Telegraf } from 'telegraf';
import { prisma } from '../infra/prisma.js';

const getAdminIds = () =>
  (process.env.ADMIN_IDS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const isAdmin = (id: number | string) =>
  getAdminIds().includes(String(id));

export const registerAdminCommands = (bot: Telegraf) => {

  // 🟣 لوحة الأدمن
  bot.command('admin', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    await ctx.reply(
      `🛠️ لوحة التحكم

الأوامر المتاحة:

/stats - إحصائيات
/accounts - الحسابات
/orders - الطلبات
/users - المستخدمين
/broadcast - رسالة جماعية

/bindorder - ربط طلب`
    );
  });

  // 📊 إحصائيات
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const users = await prisma.user.count();
    const orders = await prisma.orderBinding.count();
    const accounts = await prisma.account.count();

    await ctx.reply(
      `📊 الإحصائيات:

👤 المستخدمين: ${users}
🧾 الطلبات: ${orders}
🎮 الحسابات: ${accounts}`
    );
  });

  // 👥 المستخدمين
  bot.command('users', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const users = await prisma.user.findMany({
      take: 10,
      orderBy: { id: 'desc' }
    });

    const text = users.map(u =>
      `ID: ${u.telegramId} | @${u.username || '-'}`
    ).join('\n');

    await ctx.reply(`👥 آخر المستخدمين:\n\n${text}`);
  });

  // 🧾 الطلبات
  bot.command('orders', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const orders = await prisma.orderBinding.findMany({
      take: 10,
      include: { user: true, account: true }
    });

    const text = orders.map(o =>
      `🧾 ${o.orderNumber}
👤 ${o.user.telegramId}
🎮 ${o.account.displayName}`
    ).join('\n\n');

    await ctx.reply(`آخر الطلبات:\n\n${text}`);
  });

  // 🎮 الحسابات
  bot.command('accounts', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const accounts = await prisma.account.findMany();

    const text = accounts.map(a =>
      `ID: ${a.id}
${a.displayName}
Limit: ${a.dailyLimit}`
    ).join('\n\n');

    await ctx.reply(text);
  });

  // 📢 برودكاست
  bot.command('broadcast', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const msg = ctx.message.text.replace('/broadcast', '').trim();
    if (!msg) return ctx.reply('اكتب الرسالة بعد الأمر');

    const users = await prisma.user.findMany();

    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.telegramId, msg);
        sent++;
      } catch {}
    }

    await ctx.reply(`✅ تم الإرسال إلى ${sent} مستخدم`);
  });

};