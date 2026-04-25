import { Markup } from 'telegraf';
import { prisma } from '../infra/prisma.js';

const defaultButtons = [
  { key: 'platforms', text: '🎮 المنصات', actionValue: 'menu:platforms', sortOrder: 1 },
  { key: 'activate', text: '✅ تفعيل الطلب', actionValue: 'menu:activate', sortOrder: 2 },
  { key: 'reviews', text: '⭐ تقييمات العملاء', actionValue: 'menu:reviews', sortOrder: 3 },
  { key: 'me', text: '👤 معلوماتي', actionValue: 'menu:me', sortOrder: 4 },
  { key: 'support', text: '🛟 الدعم الفني', actionValue: 'menu:support', sortOrder: 5 },
  { key: 'how', text: '📘 طريقة الاستخدام', actionValue: 'menu:how', sortOrder: 6 },
  { key: 'terms', text: '📜 الشروط والأحكام', actionValue: 'menu:terms', sortOrder: 7 },
  { key: 'hours', text: '🕒 أوقات العمل', actionValue: 'menu:hours', sortOrder: 8 }
];

export const ensureDefaultButtons = async () => {
  for (const b of defaultButtons) {
    await prisma.menuItem.upsert({
      where: { key: b.key },
      update: {},
      create: b
    });
  }
};

export const mainMenu = async () => {
  await ensureDefaultButtons();

  const buttons = await prisma.menuItem.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' }
  });

  return Markup.inlineKeyboard(
    buttons.map((b) => [Markup.button.callback(b.text, b.actionValue)])
  );
};

export const backButton = (to: string) =>
  Markup.inlineKeyboard([[Markup.button.callback('⬅️ رجوع', to)]]);