/**
 * Общая логика фичи «Анализ конкурента».
 * Используется /api/competitor-analyze.
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { callOpenRouter, MODELS } from './openRouter.js';

/**
 * Извлекает аудио из видео (mp4) в WAV mono 16kHz через ffmpeg — это формат,
 * который OpenRouter input_audio принимает без вопросов, и который Gemini
 * 2.5 Flash хорошо транскрибирует.
 * @param {Buffer} mp4Buffer
 * @returns {Promise<Buffer>} WAV data
 */
function extractWavFromVideo(mp4Buffer) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary not found'));
    const proc = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',              // без видео
      '-acodec', 'pcm_s16le',
      '-ar', '16000',     // 16 kHz
      '-ac', '1',         // mono
      '-f', 'wav',
      'pipe:1',
    ]);
    const out = [];
    const err = [];
    proc.stdout.on('data', (c) => out.push(c));
    proc.stderr.on('data', (c) => err.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(out));
      reject(new Error(`ffmpeg exit ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`));
    });
    proc.stdin.on('error', reject);
    proc.stdin.end(mp4Buffer);
  });
}

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

/**
 * Транскрипция видео через Gemini 2.5 Flash (OpenRouter).
 * Синхронно: качаем mp4 → base64 → шлём в Gemini → получаем текст.
 * Плюсы над AssemblyAI: в ~10× дешевле, в ~5× быстрее, не застревает
 * на музыкальных роликах (просто вернёт пустую строку).
 */
export async function transcribeWithGemini(apiKey, videoUrl) {
  if (!videoUrl) return '';

  // Instagram CDN требует User-Agent + Referer, иначе отдаёт 403
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: '*/*',
  };
  const isInstagramCdn =
    videoUrl.includes('cdninstagram.com') ||
    videoUrl.includes('instagram.com') ||
    videoUrl.includes('fbcdn.net') ||
    videoUrl.includes('scontent.');
  if (isInstagramCdn) headers.Referer = 'https://www.instagram.com/';

  const resp = await fetch(videoUrl, { headers });
  if (!resp.ok) throw new Error(`Video fetch ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  // Gemini через OpenRouter принимает до ~20MB. Instagram reels обычно 2-8MB.
  if (buf.byteLength > 18 * 1024 * 1024) {
    console.warn('[transcribeWithGemini] video too big', buf.byteLength);
    return '';
  }
  if (buf.byteLength < 1000) {
    throw new Error(`video too small ${buf.byteLength} bytes (probably error page)`);
  }
  // 1) mp4 → WAV mono 16kHz через ffmpeg (OpenRouter input_audio требует реальный
  //    аудио-формат, mp4-контейнер не поддерживается официально).
  const wav = await extractWavFromVideo(buf);
  if (wav.byteLength < 1000) throw new Error(`ffmpeg output too small ${wav.byteLength}`);
  const base64 = wav.toString('base64');

  // 2) input_audio → Gemini 2.5 Flash
  const { text } = await callOpenRouter({
    apiKey,
    model: MODELS.FLASH,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Расшифруй речь из этого аудио. Верни ТОЛЬКО чистый транскрипт на языке оригинала, без тайм-кодов, без пояснений, без префиксов. Если речи нет (только музыка/тишина) — верни пустую строку.',
          },
          { type: 'input_audio', input_audio: { data: base64, format: 'wav' } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4000,
  });
  return (text || '').trim();
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
    model: MODELS.FLASH, // Flash — быстрее ×3, дешевле ×20, без reasoning-токенов, которые на Pro съедали весь max_tokens
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });
  const json = safeJson(text);
  const results = Array.isArray(json?.results) ? json.results : [];
  if (!results.length) {
    console.warn('[extractHooksBatch] empty results, raw:', (text || '').slice(0, 300));
  }
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
