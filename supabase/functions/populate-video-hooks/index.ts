// Supabase Edge Function — Заполнение video_embeddings хуками из вирусных видео
// Вызывается один раз (или при добавлении новых видео).
// Поддерживает пагинацию: ?offset=0&limit=30
//
// Для каждого видео:
// 1. Берём translation_text (если есть) или transcript_text
// 2. Gemini Flash: извлекает hook_text + определяет niche + длина из кол-ва слов
// 3. Jina API: embed hook_text → vector(1024)
// 4. Сохраняем в video_embeddings

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!;
const JINA_API_KEY = Deno.env.get('JINA_API_KEY')!;

const GEMINI_MODEL = 'google/gemini-2.5-flash';
const JINA_MODEL = 'jina-embeddings-v3';

const NICHES = [
  'fitness', 'nutrition', 'business', 'motivation', 'education',
  'entertainment', 'lifestyle', 'beauty', 'travel', 'tech',
  'finance', 'relationships', 'parenting', 'cooking', 'sport', 'other',
] as const;
type Niche = typeof NICHES[number];

function getTier(viewCount: number): string {
  if (viewCount >= 1_000_000) return '1m+';
  if (viewCount >= 500_000) return '500k+';
  if (viewCount >= 100_000) return '100k+';
  return '50k+';
}

function getScriptLength(text: string): 'short' | 'medium' | 'long' {
  const words = text.trim().split(/\s+/).length;
  if (words < 80) return 'short';
  if (words < 200) return 'medium';
  return 'long';
}

// Gemini: извлечь хук (~первые 20%) и определить нишу
async function parseHookAndNiche(transcript: string): Promise<{ hook: string; niche: Niche } | null> {
  const prompt = `Ты анализируешь транскрипцию короткого видео (рилс/шортс).

ТРАНСКРИПЦИЯ:
---
${transcript.slice(0, 3000)}
---

Задача:
1. Извлеки ХУКА — это первые 1-3 предложения, которые цепляют внимание зрителя. Хук должен заканчиваться там, где заканчивается вводная часть и начинается основное содержание.
2. Определи НИШУ видео — выбери ОДНУ из: ${NICHES.join(', ')}.

Ответ строго в JSON:
{"hook": "текст хука", "niche": "одно_слово_из_списка"}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim() ?? '';

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text);
    const niche = NICHES.includes(parsed.niche as Niche) ? parsed.niche as Niche : 'other';
    const hook = typeof parsed.hook === 'string' && parsed.hook.trim().length > 5
      ? parsed.hook.trim()
      : null;
    if (!hook) return null;
    return { hook, niche };
  } catch {
    return null;
  }
}

// Jina: embed текст → vector(1024)
async function embedText(text: string): Promise<number[] | null> {
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${JINA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      input: [text],
      task: 'retrieval.passage',
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data?.data?.[0]?.embedding ?? null;
}

// Небольшая задержка чтобы не превысить rate limits
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const url = new URL(req.url);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '30', 10), 50);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Берём видео с >=50k просмотров и транскрипцией
  const { data: videos, error } = await supabase
    .from('videos')
    .select('id, url, owner_username, view_count, transcript_text, translation_text')
    .gte('view_count', 50000)
    .not('transcript_text', 'is', null)
    .neq('transcript_text', '')
    .order('view_count', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!videos || videos.length === 0) {
    return new Response(JSON.stringify({ processed: 0, message: 'No more videos' }));
  }

  // Пропускаем видео, которые уже обработаны
  const videoIds = videos.map(v => v.id);
  const { data: existing } = await supabase
    .from('video_embeddings')
    .select('video_id')
    .in('video_id', videoIds)
    .eq('part_type', 'hook');

  const existingIds = new Set((existing ?? []).map(e => e.video_id));
  const toProcess = videos.filter(v => !existingIds.has(v.id));

  const results = { processed: 0, skipped: existingIds.size, errors: 0, total: videos.length };

  for (const video of toProcess) {
    try {
      // Используем русский текст: перевод если есть, иначе оригинал
      const transcript = (video.translation_text?.trim() || video.transcript_text?.trim()) ?? '';
      if (!transcript || transcript.length < 20) {
        results.errors++;
        continue;
      }

      const parsed = await parseHookAndNiche(transcript);
      if (!parsed) {
        results.errors++;
        await sleep(200);
        continue;
      }

      const embedding = await embedText(parsed.hook);
      if (!embedding) {
        results.errors++;
        await sleep(200);
        continue;
      }

      const contentLang = video.translation_text?.trim() ? 'ru' : 'ru';
      const tier = getTier(video.view_count ?? 0);
      const scriptLength = getScriptLength(transcript);

      await supabase.from('video_embeddings').insert({
        video_id: video.id,
        part_type: 'hook',
        content: parsed.hook,
        content_lang: contentLang,
        embedding: JSON.stringify(embedding),
        niche: parsed.niche,
        script_length: scriptLength,
        view_count: video.view_count ?? 0,
        tier,
        url: video.url,
        owner_username: video.owner_username,
      });

      results.processed++;
      // ~300ms между запросами чтобы не спамить Gemini
      await sleep(300);
    } catch {
      results.errors++;
      await sleep(300);
    }
  }

  return new Response(JSON.stringify({
    ...results,
    next_offset: offset + limit,
    message: `Обработано ${results.processed} видео, пропущено ${results.skipped} (уже есть), ошибок ${results.errors}`,
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
