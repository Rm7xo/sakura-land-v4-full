import { Markup } from 'telegraf';

export const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback('🎮 المنصات', 'menu:platforms')],
    [Markup.button.callback('✅ تفعيل الطلب', 'menu:activate')],
    [Markup.button.callback('👤 معلوماتي', 'menu:me')],
    [Markup.button.callback('🛟 الدعم الفني', 'menu:support')],
    [Markup.button.callback('⭐ تقييمات العملاء', 'menu:reviews')],
    [Markup.button.callback('📘 طريقة الاستخدام', 'menu:how')],
    [Markup.button.callback('📜 الشروط والأحكام', 'menu:terms')],
    [Markup.button.callback('🕒 أوقات العمل', 'menu:hours')]
  ]);

export const backButton = (to: string) =>
  Markup.inlineKeyboard([[Markup.button.callback('⬅️ رجوع', to)]]);