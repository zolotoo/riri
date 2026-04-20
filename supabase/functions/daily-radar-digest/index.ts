// Supabase Edge Function — Утренний дайджест
// Запускается pg_cron каждый день в 7:00 UTC
// Для каждого пользователя с daily_digest_enabled = true:
//   1. Находит главный проект (больше всего видео)
//   2. Находит самый частый Instagram-аккаунт в этом проекте
//   3. Берёт последние 10 роликов аккаунта через RapidAPI
//   4. Выбирает топ-3 по просмотрам (которых ещё нет в проекте)
//   5. Добавляет в "Все видео" (folder_id = null) проекта
//   6. Отправляет уведомление в Telegram

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY')!;
const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Все пользователи с включённым дайджестом
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('telegram_username, user_id')
    .eq('daily_digest_enabled', true);

  if (usersError) {
    console.error('Failed to fetch users:', usersError);
    return new Response(JSON.stringify({ error: usersError.message }), { status: 500 });
  }

  if (!users || users.length === 0) {
    return new Response(JSON.stringify({ success: true, message: 'Нет пользователей с включённым дайджестом' }));
  }

  console.log(`Обрабатываем ${users.length} пользователей`);
  const results: unknown[] = [];

  for (const user of users) {
    const userId = user.user_id || `tg-${user.telegram_username}`;
    const tgUsername = user.telegram_username;

    try {
      // 2. Находим главный проект (по кол-ву видео)
      const { data: savedVideos } = await supabase
        .from('saved_videos')
        .select('project_id, owner_username')
        .eq('user_id', userId)
        .not('project_id', 'is', null);

      if (!savedVideos || savedVideos.length === 0) {
        console.log(`@${tgUsername}: нет видео, пропускаем`);
        continue;
      }

      // Считаем кол-во видео по проектам
      const projectCount: Record<string, number> = {};
      const usernameByProject: Record<string, Record<string, number>> = {};

      for (const row of savedVideos) {
        if (!row.project_id) continue;
        projectCount[row.project_id] = (projectCount[row.project_id] || 0) + 1;
        if (row.owner_username) {
          if (!usernameByProject[row.project_id]) usernameByProject[row.project_id] = {};
          usernameByProject[row.project_id][row.owner_username] =
            (usernameByProject[row.project_id][row.owner_username] || 0) + 1;
        }
      }

      // Главный проект — с максимумом видео
      const mainProjectId = Object.entries(projectCount)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      if (!mainProjectId) continue;

      // 3. Самый частый Instagram-аккаунт в главном проекте
      const usernameMap = usernameByProject[mainProjectId] || {};
      const topUsername = Object.entries(usernameMap)
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      if (!topUsername) {
        console.log(`@${tgUsername}: нет owner_username, пропускаем`);
        continue;
      }

      console.log(`@${tgUsername}: главный проект ${mainProjectId}, топ аккаунт @${topUsername}`);

      // 4. Берём последние ролики аккаунта через RapidAPI
      const apiUrl = `https://instagram-scraper-20251.p.rapidapi.com/userreels/?username_or_id=${topUsername}&url_embed_safe=true`;
      const apiRes = await fetch(apiUrl, {
        headers: {
          'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
          'x-rapidapi-key': RAPIDAPI_KEY,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!apiRes.ok) {
        console.error(`@${tgUsername}: RapidAPI вернул ${apiRes.status}`);
        continue;
      }

      const apiData = await apiRes.json();
      let items: unknown[] = apiData?.data?.items || apiData?.items || apiData?.data || apiData?.reels || [];
      if (!Array.isArray(items) && apiData?.data?.user?.edge_owner_to_timeline_media?.edges) {
        items = apiData.data.user.edge_owner_to_timeline_media.edges.map((e: { node: unknown }) => e.node);
      }
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`@${tgUsername}: пустой ответ от RapidAPI`);
        continue;
      }

      // Маппим и сортируем по просмотрам (топ-10)
      interface Reel {
        shortcode: string;
        url: string;
        thumbnail_url: string | null;
        caption: string;
        view_count: number;
        like_count: number;
        comment_count: number;
        taken_at: number | null;
        owner_username: string;
      }

      const reels: Reel[] = items
        .filter((item: unknown) => {
          const i = item as Record<string, unknown>;
          return !i.is_pinned && !i.pinned;
        })
        .map((item: unknown): Reel | null => {
          const i = item as Record<string, unknown>;
          const shortcode = (i.code || i.shortcode) as string;
          if (!shortcode) return null;
          const imgVersions = i.image_versions2 as { candidates?: { url: string }[] } | undefined;
          return {
            shortcode,
            url: `https://www.instagram.com/reel/${shortcode}/`,
            thumbnail_url: imgVersions?.candidates?.[0]?.url ||
              (i.thumbnail_url as string) || null,
            caption: ((i.caption as { text?: string })?.text || '').slice(0, 500),
            view_count: (i.play_count || i.view_count || i.video_view_count || 0) as number,
            like_count: (i.like_count || 0) as number,
            comment_count: (i.comment_count || 0) as number,
            taken_at: (i.taken_at || null) as number | null,
            owner_username: topUsername,
          };
        })
        .filter((r): r is Reel => r !== null)
        .sort((a, b) => b.view_count - a.view_count)
        .slice(0, 10);

      if (reels.length === 0) continue;

      // 5. Проверяем какие уже есть в проекте
      const shortcodes = reels.map(r => r.shortcode);
      const { data: existing } = await supabase
        .from('saved_videos')
        .select('shortcode')
        .eq('user_id', userId)
        .eq('project_id', mainProjectId)
        .in('shortcode', shortcodes);

      const existingSet = new Set((existing || []).map((v: { shortcode: string }) => v.shortcode));
      const newReels = reels.filter(r => !existingSet.has(r.shortcode)).slice(0, 3);

      if (newReels.length === 0) {
        console.log(`@${tgUsername}: все топ видео уже есть в проекте`);
        continue;
      }

      // 6. Добавляем в "Все видео" (folder_id = null)
      const toInsert = newReels.map(r => ({
        user_id: userId,
        shortcode: r.shortcode,
        project_id: mainProjectId,
        folder_id: null,
        thumbnail_url: r.thumbnail_url,
        caption: r.caption,
        owner_username: r.owner_username,
        view_count: r.view_count,
        like_count: r.like_count,
        comment_count: r.comment_count,
        taken_at: r.taken_at,
        added_at: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from('saved_videos').insert(toInsert);
      if (insertError) {
        console.error(`@${tgUsername}: ошибка вставки`, insertError);
        continue;
      }

      // 7. Получаем название проекта
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', mainProjectId)
        .single();

      const projectName = project?.name || 'твой проект';

      // 8. Находим chat_id пользователя
      const { data: chatRow } = await supabase
        .from('telegram_chats')
        .select('chat_id')
        .eq('username', tgUsername)
        .maybeSingle();

      if (!chatRow?.chat_id) {
        console.log(`@${tgUsername}: chat_id не найден`);
        results.push({ user: tgUsername, topUsername, addedCount: newReels.length, notified: false });
        continue;
      }

      // 9. Отправляем уведомление
      const videoLinks = newReels
        .map((r, i) => `${i + 1}. ${r.url}`)
        .join('\n');

      const text = `☀️ Доброго утра!\n\nЯ не спала ночь — заметила, что ты часто добавляешь видео из аккаунта @${topUsername} 👀\n\nОтсмотрела его последние ролики сама и вот лучшие из них:\n\n${videoLinks}\n\nДобавила топ ${newReels.length} в папку «Все видео» проекта «${projectName}» ✨`;

      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatRow.chat_id,
          text,
          disable_web_page_preview: true,
        }),
      });

      console.log(`@${tgUsername}: успешно — добавлено ${newReels.length} видео из @${topUsername}`);
      results.push({ user: tgUsername, topUsername, addedCount: newReels.length, notified: true });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`@${tgUsername}: необработанная ошибка`, message);
      results.push({ user: tgUsername, error: message });
    }
  }

  return new Response(
    JSON.stringify({ success: true, processed: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
