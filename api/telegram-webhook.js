import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!supabaseUrl || !supabaseServiceKey || !botToken) {
    return res.status(500).json({ error: 'Not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const update = req.body;

  // Обработка нажатия inline-кнопки благодарности
  if (update?.callback_query) {
    const cb = update.callback_query;
    const callbackData = cb.data || '';

    if (callbackData.startsWith('thank:')) {
      const responsibleUsername = callbackData.slice('thank:'.length).toLowerCase();
      const fromUsername = cb.from?.username || null;
      const fromName = cb.from?.first_name || (fromUsername ? `@${fromUsername}` : 'Проджект-менеджер');

      // Подтверждаем нажатие кнопки
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id, text: '🌟 Благодарность отправлена!' }),
      });

      // Находим chat_id ответственного
      const { data: respChat } = await supabase
        .from('telegram_chats')
        .select('chat_id')
        .eq('username', responsibleUsername)
        .maybeSingle();

      if (respChat?.chat_id) {
        const thankText = `🌟 <b>Тебя благодарит ${fromUsername ? `@${fromUsername}` : fromName}!</b>\n\nОтличная работа! Так держать 🙏`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: respChat.chat_id, text: thankText, parse_mode: 'HTML' }),
        });
      }

      // Убираем кнопку из оригинального сообщения
      if (cb.message?.message_id && cb.message?.chat?.id) {
        await fetch(`https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cb.message.chat.id,
            message_id: cb.message.message_id,
            reply_markup: { inline_keyboard: [] },
          }),
        });
      }
    }

    return res.status(200).json({ ok: true });
  }

  if (!update || !update.message) {
    return res.status(200).json({ ok: true });
  }

  const { message } = update;
  const from = message.from;

  if (!from) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat?.id || from.id;
  const username = from.username?.toLowerCase();

  if (username) {
    await supabase.from('telegram_chats').upsert({
      username,
      chat_id: chatId,
      first_name: from.first_name || null,
      last_name: from.last_name || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'username' });
  }

  if (message.text === '/start') {
    const name = from.first_name || 'друг';
    const usernameNote = username
      ? `\n\n✅ Теперь я знаю тебя! Можешь войти в приложение через @${from.username}.`
      : '\n\n⚠️ У тебя не задан username в Telegram. Установи его в настройках Telegram, чтобы войти в приложение.';

    const text = `👋 Привет, ${name}!` +
      `\n\nЯ Riri AI — твой помощник для поиска трендового контента.` +
      usernameNote +
      `\n\nОткрой приложение и нажми «Получить код» — я отправлю его сюда.`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }

  return res.status(200).json({ ok: true });
}
