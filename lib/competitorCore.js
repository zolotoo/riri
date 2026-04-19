/**
 * Общая логика фичи «Анализ конкурента».
 * Используется /api/competitor-analyze.
 */

import { createClient } from '@supabase/supabase-js';
import { callOpenRouter, MODELS } from './openRouter.js';

export function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env not configured');
  return createClient(url, key);
}

export function getBaseUrl(req) {
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const host =
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    process.env.VERCEL_URL ||
    'localhost:3000';
  return `${protocol}://${host}`.replace(/:\d+$/, (m) =>
    host.includes('localhost') ? m : ''
  );
}

export function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function avg(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function avgBottom3(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b).slice(0, 3);
  return avg(sorted);
}

export async function fetchReels(baseUrl, username, count) {
  const res = await fetch(`${baseUrl}/api/user-reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      count,
      source: 'competitor-analysis',
    }),
  });
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.reels)) {
    throw new Error(data?.message || 'Не получилось забрать ролики');
  }
  // Отфильтровываем trial-ролики — они искажают среднюю
  return data.reels.filter((r) => !r.is_trial);
}

export async function fetchReelInfo(baseUrl, url) {
  const res = await fetch(`${baseUrl}/api/reel-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, source: 'competitor-analysis' }),
  });
  const data = await res.json();
  return data?.video_url || null;
}

export async function startTranscribe(baseUrl, videoUrl) {
  const res = await fetch(`${baseUrl}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioUrl: videoUrl }),
  });
  const data = await res.json();
  return data?.transcriptId || null;
}

export async function checkTranscribe(baseUrl, transcriptId) {
  const res = await fetch(
    `${baseUrl}/api/transcribe?transcriptId=${encodeURIComponent(transcriptId)}`,
    { method: 'GET' }
  );
  const data = await res.json();
  return {
    status: data?.status, // queued | processing | completed | error
    text: data?.text || '',
    error: data?.error || null,
  };
}

export function pickVirals(reels, multiplier = 5) {
  const views = reels.map((r) => r.view_count || 0);
  const bottom3 = avgBottom3(views);
  const medianV = median(views);
  const avgV = avg(views);
  const threshold = bottom3 * multiplier;
  const virals = reels
    .filter((r) => (r.view_count || 0) >= Math.max(threshold, 1))
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  return {
    virals,
    stats: { avg: avgV, median: medianV, avgBottom3: bottom3, threshold },
  };
}

export function pickTopByViews(reels, n = 3) {
  return [...reels]
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
    .slice(0, n);
}

export async function upsertRadarProfile(sb, { projectId, userId, username }) {
  await sb
    .from('radar_profiles')
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        instagram_username: username,
        added_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,user_id,instagram_username' }
    );
}

export async function upsertInstagramProfile(sb, username, stats) {
  await sb.from('instagram_profiles').upsert(
    {
      username,
      avg_views: stats.avg || null,
      median_views: stats.median || null,
      avg_bottom3_views: stats.avgBottom3 || null,
      stats_updated_at: new Date().toISOString(),
    },
    { onConflict: 'username' }
  );
}

// ─── OpenRouter prompts ──────────────────────────────────────────────────────

export async function extractHooksBatch(apiKey, items) {
  // items: [{shortcode, transcript_text, caption, views}, ...]
  if (!items.length) return [];
  const prompt = `Ты — аналитик вирусного контента в Instagram Reels.

Для каждого ролика из списка ниже нужно:
1) Извлечь ХУК (первые 1–3 предложения из транскрипта, без воды — то, что удерживает зрителя в первые 3 секунды).
2) Определить НИШУ одним-двумя словами на русском (например: "финансы", "психология", "фитнес", "саморазвитие", "еда", "отношения", "бизнес", "юмор", "лайфстайл" и т.п.).

Верни СТРОГО JSON:
{"results":[{"shortcode":"...","hook":"...","niche":"..."}]}

Если транскрипт пустой — верни hook как пустую строку и niche "без ниши".

Ролики:
${items
  .map(
    (it, i) =>
      `#${i + 1} shortcode=${it.shortcode} views=${it.view_count}\nCaption: ${(it.caption || '').slice(0, 200)}\nТранскрипт: ${(it.transcript_text || '').slice(0, 2500)}`
  )
  .join('\n\n---\n\n')}`;

  const { text } = await callOpenRouter({
    apiKey,
    model: MODELS.PRO_3,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });
  const json = safeJson(text);
  const results = Array.isArray(json?.results) ? json.results : [];
  return results;
}

export async function analyzeUserTone(apiKey, snapshots, username) {
  if (!snapshots.length) return null;
  const transcripts = snapshots
    .filter((s) => s.transcript_text)
    .map((s, i) => `#${i + 1} (${s.view_count || 0} просм.)\n${s.transcript_text}`)
    .join('\n\n---\n\n');
  if (!transcripts.trim()) return null;

  const prompt = `Ты — аналитик стиля контент-мейкеров. Ниже транскрипты последних роликов @${username}.
Нужно составить профиль ГОЛОСА И СТИЛЯ этого автора.

Верни СТРОГО JSON:
{
  "voice": { "tempo": "быстрый|средний|медленный", "energy": "высокая|средняя|сдержанная", "formality": "разговорный|нейтральный|формальный" },
  "recurring_topics": ["тема1", "тема2", ...],
  "signature_phrases": ["характерные фразы/слова, которые он использует часто"],
  "hook_patterns": ["как он обычно начинает ролики, 2-4 паттерна"],
  "structure": "типичная структура его ролика одним предложением",
  "humor": "описание типа юмора одним-двумя словами или 'без юмора'",
  "stop_words": ["слова-паразиты, которых стоит избегать при имитации"],
  "summary": "короткое саммари стиля 2-3 предложения"
}

Транскрипты:
${transcripts.slice(0, 18000)}`;

  const { text } = await callOpenRouter({
    apiKey,
    model: MODELS.PRO_3,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  });
  return safeJson(text);
}

export async function generateIdeas(apiKey, { competitorHooks, toneProfile, userSnapshots, competitorUsername, userUsername }) {
  const hooksBlock = competitorHooks
    .map(
      (h, i) =>
        `#${i + 1} [${h.view_count || 0} просмотров, мультипликатор x${Number(h.viral_multiplier || 0).toFixed(1)}]
Хук: ${h.hook_text || '—'}
Ниша: ${h.niche || '—'}
Полный сценарий: ${(h.transcript_text || '').slice(0, 1500)}`
    )
    .join('\n\n---\n\n');

  const userExamples = (userSnapshots || [])
    .filter((s) => s.transcript_text)
    .slice(0, 4)
    .map((s, i) => `Пример #${i + 1}: ${s.transcript_text.slice(0, 800)}`)
    .join('\n\n');

  const prompt = `Ты — редактор вирусного контента. Тебе дано:
1) Залётные ролики конкурента @${competitorUsername} — их хуки и полные сценарии.
2) Профиль стиля пользователя @${userUsername} (tone of voice).
3) Пара примеров контента пользователя.

Задача — собрать 10 ИДЕЙ сценариев для пользователя. Каждая идея должна:
- Адаптировать хук одного из залётных роликов конкурента под стиль пользователя (его голос, его темы).
- Переиспользовать структуру лучших сценариев конкурента, но с контентом пользователя.
- Быть реалистичной для пользователя (учитывать его ниши и манеру).

Верни СТРОГО JSON:
{
  "ideas": [
    {
      "title": "короткое рабочее название идеи",
      "adapted_hook": "адаптированный хук голосом пользователя — 1-3 предложения",
      "structure_outline": "3-5 пунктов структуры сценария, каждый пункт — 1 фраза",
      "why_it_works": "1-2 предложения почему это залетит — опираясь на логику конкурента",
      "based_on_competitor_shortcode": "shortcode из списка ниже"
    }
    // ... 10 штук
  ]
}

ЗАЛЁТНЫЕ РОЛИКИ КОНКУРЕНТА (${competitorHooks.length}):
${hooksBlock}

ПРОФИЛЬ СТИЛЯ ПОЛЬЗОВАТЕЛЯ:
${JSON.stringify(toneProfile, null, 2)}

ПРИМЕРЫ КОНТЕНТА ПОЛЬЗОВАТЕЛЯ:
${userExamples || '—'}`;

  const { text } = await callOpenRouter({
    apiKey,
    model: MODELS.PRO_3,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 4500,
    response_format: { type: 'json_object' },
  });
  return safeJson(text);
}

function safeJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
