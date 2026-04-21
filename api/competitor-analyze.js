// Vercel Serverless Function — оркестратор фичи «Анализ конкурента».
// Actions: start | tick | start-user | force-fallback
//
// start          — создать analysis, забрать 24 ролика конкурента, найти виральные
//                  (x5+ от avg_bottom3), запустить транскрибации. Если виральных нет —
//                  status='no_virals'. Радар + instagram_profiles обновляется сразу.
// tick           — прогрессирует state-machine (вызывается фронтом каждые ~4с во
//                  время загрузки): проверяет транскрипции, извлекает хуки (LLM),
//                  анализирует tone пользователя, генерирует 10 идей.
// start-user     — запустить анализ пользователя (12 последних роликов).
// force-fallback — после no_virals: взять топ-3 по просмотрам и продолжить.

import {
  getSupabase,
  getBaseUrl,
  fetchReels,
  fetchReelInfo,
  startTranscribe,
  checkTranscribe,
  pickVirals,
  pickTopByViews,
  upsertRadarProfile,
  upsertInstagramProfile,
  avg,
  median,
  avgBottom3,
  extractHooksBatch,
  analyzeUserTone,
  generateIdeas,
} from '../lib/competitorCore.js';

const COMPETITOR_REEL_COUNT = 24;
const USER_REEL_COUNT = 12;
const VIRAL_MULTIPLIER = 5;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};
  try {
    if (action === 'start') return await handleStart(req, res);
    if (action === 'tick') return await handleTick(req, res);
    if (action === 'start-user') return await handleStartUser(req, res);
    if (action === 'force-fallback') return await handleForceFallback(req, res);
    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    console.error('[competitor-analyze] error:', e);
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}

// ─── start ───────────────────────────────────────────────────────────────────

async function handleStart(req, res) {
  const { projectId, userId, competitorUsername } = req.body;
  if (!projectId || !userId || !competitorUsername) {
    return res.status(400).json({ error: 'projectId, userId, competitorUsername обязательны' });
  }
  const sb = getSupabase();
  const baseUrl = getBaseUrl(req);

  const { data: analysis, error } = await sb
    .from('competitor_analyses')
    .insert({
      project_id: projectId,
      user_id: userId,
      competitor_username: competitorUsername,
      status: 'fetching_competitor',
      reel_count: COMPETITOR_REEL_COUNT,
      viral_threshold_multiplier: VIRAL_MULTIPLIER,
    })
    .select()
    .single();
  if (error) throw error;

  // Возвращаем analysisId сразу — тяжёлую работу делаем ниже, но тоже синхронно
  // (с небольшим бюджетом). Фронт уже получит ответ и начнёт поллить.
  const analysisId = analysis.id;

  try {
    await updateStatus(sb, analysisId, 'fetching_competitor', 'Листаю ленту конкурента…');

    const reels = await fetchReels(baseUrl, competitorUsername, COMPETITOR_REEL_COUNT);
    if (!reels.length) {
      await updateStatus(sb, analysisId, 'error', null, 'Не получилось забрать ролики. Проверь username.');
      return res.status(200).json({ analysisId, status: 'error' });
    }

    const views = reels.map((r) => r.view_count || 0);
    const stats = { avg: avg(views), median: median(views), avgBottom3: avgBottom3(views) };

    await sb
      .from('competitor_analyses')
      .update({
        competitor_avg_views: stats.avg,
        competitor_median_views: stats.median,
        competitor_avg_bottom3_views: stats.avgBottom3,
      })
      .eq('id', analysisId);

    // Радар + instagram_profiles (не блокируем по ошибке)
    try {
      await upsertRadarProfile(sb, { projectId, userId, username: competitorUsername });
      await upsertInstagramProfile(sb, competitorUsername, stats);
    } catch (e) {
      console.warn('[start] radar/profiles upsert failed', e.message);
    }

    const { virals } = pickVirals(reels, VIRAL_MULTIPLIER);
    if (!virals.length) {
      await updateStatus(sb, analysisId, 'no_virals', 'Нет залётных роликов (x5+ от базовой аудитории).');
      return res.status(200).json({ analysisId, status: 'no_virals' });
    }

    await saveSelectedReels(sb, analysisId, virals, stats.avgBottom3, false);
    await kickoffCompetitorTranscriptions(sb, baseUrl, analysisId);
    await updateStatus(sb, analysisId, 'transcribing_competitor', 'Слушаю виральные ролики…');

    return res.status(200).json({ analysisId, status: 'transcribing_competitor' });
  } catch (e) {
    await updateStatus(sb, analysisId, 'error', null, e.message);
    return res.status(200).json({ analysisId, status: 'error', error: e.message });
  }
}

// ─── force-fallback ──────────────────────────────────────────────────────────

async function handleForceFallback(req, res) {
  const { analysisId } = req.body;
  if (!analysisId) return res.status(400).json({ error: 'analysisId обязателен' });
  const sb = getSupabase();
  const baseUrl = getBaseUrl(req);

  const { data: analysis } = await sb.from('competitor_analyses').select('*').eq('id', analysisId).single();
  if (!analysis) return res.status(404).json({ error: 'analysis not found' });

  await updateStatus(sb, analysisId, 'fetching_competitor', 'Беру топ-3 по просмотрам…');
  const reels = await fetchReels(baseUrl, analysis.competitor_username, COMPETITOR_REEL_COUNT);
  const top3 = pickTopByViews(reels, 3);
  if (!top3.length) {
    await updateStatus(sb, analysisId, 'error', null, 'Не получилось забрать ролики');
    return res.status(200).json({ analysisId, status: 'error' });
  }
  const bottom3 = analysis.competitor_avg_bottom3_views || avgBottom3(reels.map((r) => r.view_count || 0));
  await saveSelectedReels(sb, analysisId, top3, bottom3, true);
  await kickoffCompetitorTranscriptions(sb, baseUrl, analysisId);
  await updateStatus(sb, analysisId, 'transcribing_competitor', 'Слушаю топ-3 ролика…');
  return res.status(200).json({ analysisId, status: 'transcribing_competitor' });
}

// ─── start-user ──────────────────────────────────────────────────────────────

async function handleStartUser(req, res) {
  const { analysisId, userUsername } = req.body;
  if (!analysisId || !userUsername) {
    return res.status(400).json({ error: 'analysisId, userUsername обязательны' });
  }
  const sb = getSupabase();
  const baseUrl = getBaseUrl(req);

  const { data: analysis } = await sb.from('competitor_analyses').select('*').eq('id', analysisId).single();
  if (!analysis) return res.status(404).json({ error: 'analysis not found' });

  await sb
    .from('competitor_analyses')
    .update({ user_username: userUsername, status: 'fetching_user', status_message: 'Смотрю на твой аккаунт…' })
    .eq('id', analysisId);

  try {
    const reels = await fetchReels(baseUrl, userUsername, USER_REEL_COUNT);
    if (!reels.length) {
      await updateStatus(sb, analysisId, 'error', null, 'Не получилось забрать твои ролики. Проверь username.');
      return res.status(200).json({ analysisId, status: 'error' });
    }

    const views = reels.map((r) => r.view_count || 0);
    const stats = { avg: avg(views), median: median(views), avgBottom3: avgBottom3(views) };

    try {
      await upsertRadarProfile(sb, {
        projectId: analysis.project_id,
        userId: analysis.user_id,
        username: userUsername,
      });
      await upsertInstagramProfile(sb, userUsername, stats);
    } catch (e) {
      console.warn('[start-user] radar/profiles failed', e.message);
    }

    // Сохраняем 12 роликов как снэпшоты, стартуем транскрибации последовательно
    for (const r of reels) {
      const { error: upErr } = await sb.from('user_reel_snapshots').upsert(
        {
          analysis_id: analysisId,
          shortcode: sanitizeText(r.shortcode),
          url: sanitizeText(r.url),
          thumbnail_url: sanitizeText(r.thumbnail_url),
          caption: sanitizeText(r.caption),
          view_count: r.view_count,
          like_count: r.like_count,
          taken_at: r.taken_at ? new Date(r.taken_at * 1000).toISOString() : null,
        },
        { onConflict: 'analysis_id,shortcode' }
      );
      if (upErr) console.error('[start-user] user_reel_snapshots upsert failed', upErr, r.shortcode);
    }

    await kickoffUserTranscriptions(sb, baseUrl, analysisId);
    await updateStatus(sb, analysisId, 'transcribing_user', 'Слушаю тебя…');

    return res.status(200).json({ analysisId, status: 'transcribing_user' });
  } catch (e) {
    await updateStatus(sb, analysisId, 'error', null, e.message);
    return res.status(200).json({ analysisId, status: 'error', error: e.message });
  }
}

// ─── tick (state machine advance) ────────────────────────────────────────────

async function handleTick(req, res) {
  const { analysisId } = req.body;
  if (!analysisId) return res.status(400).json({ error: 'analysisId обязателен' });
  const sb = getSupabase();
  const baseUrl = getBaseUrl(req);
  const openrouterKey = process.env.OPENROUTER_API_KEY;

  const { data: analysis } = await sb.from('competitor_analyses').select('*').eq('id', analysisId).single();
  if (!analysis) return res.status(404).json({ error: 'not found' });
  const status = analysis.status;

  // Фаза конкурента: проверяем транскрипции → извлекаем хуки
  if (status === 'transcribing_competitor') {
    await pollAndSaveTranscripts(sb, baseUrl, 'competitor_hooks', analysisId);
    const { data: hooks } = await sb.from('competitor_hooks').select('*').eq('analysis_id', analysisId);
    const pending = hooks.filter((h) => h.transcript_id && !h.transcript_text);
    const ready = hooks.filter((h) => h.transcript_text).length;
    // Идём дальше если все готовы, или если хотя бы 3 хука транскрибированы
    // и зависло мало (max 3 stuck) — не блокируем пайплайн на парочке медленных
    if (pending.length === 0 || (ready >= 3 && pending.length <= 3)) {
      await updateStatus(sb, analysisId, 'extracting_hooks', 'Собираю хуки…');
      await extractHooksForAnalysis(sb, openrouterKey, analysisId, hooks);
      await updateStatus(sb, analysisId, 'fetching_user', 'Готово — ждём твой аккаунт.');
      return res.status(200).json({ status: 'fetching_user' });
    }
    return res.status(200).json({ status, pending: pending.length });
  }

  if (status === 'extracting_hooks') {
    const { data: hooks } = await sb.from('competitor_hooks').select('*').eq('analysis_id', analysisId);
    await extractHooksForAnalysis(sb, openrouterKey, analysisId, hooks);
    await updateStatus(sb, analysisId, 'fetching_user', 'Готово — ждём твой аккаунт.');
    return res.status(200).json({ status: 'fetching_user' });
  }

  // Фаза пользователя: каждый тик делает ОДИН шаг и сразу отдаёт статус.
  // Так снижаем риск словить таймаут Vercel (60s) посреди LLM-вызова и «повиснуть» в
  // analyzing_user / generating_ideas. Если шаг падает — пишем error_message, UI показывает.

  if (status === 'transcribing_user') {
    await pollAndSaveTranscripts(sb, baseUrl, 'user_reel_snapshots', analysisId);
    const { data: snaps } = await sb.from('user_reel_snapshots').select('*').eq('analysis_id', analysisId);
    const pending = (snaps || []).filter((s) => s.transcript_id && !s.transcript_text);
    const ready = (snaps || []).filter((s) => s.transcript_text).length;
    // Идём дальше, если готовы все или минимум 6 транскриптов
    if (pending.length === 0 || ready >= 6) {
      await updateStatus(sb, analysisId, 'analyzing_user', 'Думаю о твоём стиле…');
      return res.status(200).json({ status: 'analyzing_user' });
    }
    return res.status(200).json({ status, pending: pending.length });
  }

  if (status === 'analyzing_user') {
    try {
      const { data: snaps } = await sb.from('user_reel_snapshots').select('*').eq('analysis_id', analysisId);
      const tone = await analyzeUserTone(openrouterKey, snaps || [], analysis.user_username || '');
      await sb.from('competitor_analyses').update({ user_tone_profile: tone || {} }).eq('id', analysisId);
      await updateStatus(sb, analysisId, 'generating_ideas', 'Склеиваю идеи…');
      return res.status(200).json({ status: 'generating_ideas' });
    } catch (e) {
      await updateStatus(sb, analysisId, 'error', null, `Не получилось проанализировать стиль: ${e.message}`);
      return res.status(200).json({ status: 'error', error: e.message });
    }
  }

  if (status === 'generating_ideas') {
    try {
      const { data: snaps } = await sb.from('user_reel_snapshots').select('*').eq('analysis_id', analysisId);
      const { data: hooks } = await sb
        .from('competitor_hooks')
        .select('*')
        .eq('analysis_id', analysisId)
        .order('view_count', { ascending: false });
      const ideas = await generateIdeas(openrouterKey, {
        competitorHooks: hooks || [],
        toneProfile: analysis.user_tone_profile || {},
        userSnapshots: snaps || [],
        competitorUsername: analysis.competitor_username,
        userUsername: analysis.user_username || '',
      });
      await sb
        .from('competitor_analyses')
        .update({ generated_ideas: ideas || { ideas: [] }, status: 'ready', status_message: null, updated_at: new Date().toISOString() })
        .eq('id', analysisId);
      return res.status(200).json({ status: 'ready' });
    } catch (e) {
      await updateStatus(sb, analysisId, 'error', null, `Не получилось собрать идеи: ${e.message}`);
      return res.status(200).json({ status: 'error', error: e.message });
    }
  }

  return res.status(200).json({ status });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function updateStatus(sb, analysisId, status, message, error) {
  const patch = { status, updated_at: new Date().toISOString() };
  if (message !== undefined) patch.status_message = message;
  if (error !== undefined) patch.error_message = error;
  await sb.from('competitor_analyses').update(patch).eq('id', analysisId);
}

// Postgres не принимает \u0000 и суррогатные половинки в JSON — чистим их в тексте
function sanitizeText(s) {
  if (s == null) return s;
  if (typeof s !== 'string') return s;
  return s
    // убираем NULL-байты и прочие управляющие (кроме \t \n \r)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    // убираем незаменённые суррогатные половинки
    .replace(/[\uD800-\uDFFF]/g, '');
}

async function saveSelectedReels(sb, analysisId, reels, bottom3Baseline, isFallback) {
  const rows = reels.map((r, idx) => ({
    analysis_id: analysisId,
    shortcode: sanitizeText(r.shortcode),
    url: sanitizeText(r.url),
    thumbnail_url: sanitizeText(r.thumbnail_url),
    caption: sanitizeText(r.caption),
    view_count: r.view_count,
    like_count: r.like_count,
    comment_count: r.comment_count,
    taken_at: r.taken_at ? new Date(r.taken_at * 1000).toISOString() : null,
    viral_multiplier: bottom3Baseline > 0 ? (r.view_count || 0) / bottom3Baseline : null,
    is_fallback: isFallback,
    rank: idx + 1,
  }));
  if (!rows.length) return;
  const { error } = await sb.from('competitor_hooks').upsert(rows, { onConflict: 'analysis_id,shortcode' });
  if (error) {
    console.error('[saveSelectedReels] upsert failed', { analysisId, count: rows.length, error, sampleRow: rows[0] });
    throw new Error(`competitor_hooks upsert failed: ${error.message}`);
  }
}

async function kickoffCompetitorTranscriptions(sb, baseUrl, analysisId) {
  const { data: hooks } = await sb
    .from('competitor_hooks')
    .select('id, shortcode, url, transcript_id, video_url')
    .eq('analysis_id', analysisId);
  await Promise.all((hooks || []).map((h) => kickoffOne(sb, baseUrl, 'competitor_hooks', h)));
}

async function kickoffUserTranscriptions(sb, baseUrl, analysisId) {
  const { data: snaps } = await sb
    .from('user_reel_snapshots')
    .select('id, shortcode, url, transcript_id, video_url')
    .eq('analysis_id', analysisId);
  await Promise.all((snaps || []).map((s) => kickoffOne(sb, baseUrl, 'user_reel_snapshots', s)));
}

async function kickoffOne(sb, baseUrl, table, row) {
  if (row.transcript_id) return;
  try {
    let videoUrl = row.video_url;
    if (!videoUrl) {
      videoUrl = await fetchReelInfo(baseUrl, row.url);
      if (!videoUrl) return;
      await sb.from(table).update({ video_url: videoUrl }).eq('id', row.id);
    }
    const transcriptId = await startTranscribe(baseUrl, videoUrl);
    if (!transcriptId) return;
    await sb.from(table).update({ transcript_id: transcriptId }).eq('id', row.id);
  } catch (e) {
    console.warn('[kickoff] failed', table, row.shortcode, e.message);
  }
}

async function pollAndSaveTranscripts(sb, baseUrl, table, analysisId) {
  const { data: rows } = await sb
    .from(table)
    .select('id, transcript_id, transcript_text')
    .eq('analysis_id', analysisId);
  const pending = (rows || []).filter((r) => r.transcript_id && !r.transcript_text);
  await Promise.all(
    pending.map(async (r) => {
      try {
        const result = await checkTranscribe(baseUrl, r.transcript_id);
        if (result.status === 'completed' && result.text) {
          await sb.from(table).update({ transcript_text: result.text }).eq('id', r.id);
        } else if (result.status === 'error') {
          // Помечаем пустой строкой, чтобы не зависать на этой записи
          await sb.from(table).update({ transcript_text: '' }).eq('id', r.id);
        }
      } catch (e) {
        console.warn('[poll]', r.transcript_id, e.message);
      }
    })
  );
}

async function extractHooksForAnalysis(sb, openrouterKey, analysisId, hooks) {
  const items = (hooks || [])
    .filter((h) => h.transcript_text && !h.hook_text)
    .map((h) => ({
      shortcode: h.shortcode,
      transcript_text: h.transcript_text,
      caption: h.caption,
      view_count: h.view_count,
    }));
  if (!items.length) return;
  const CHUNK = 5;
  const allResults = [];
  const debug = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    try {
      const results = await extractHooksBatch(openrouterKey, chunk);
      debug.push(`chunk${i / CHUNK + 1}:in=${chunk.length}/out=${results?.length || 0}`);
      if (Array.isArray(results)) allResults.push(...results);
    } catch (e) {
      debug.push(`chunk${i / CHUNK + 1}:ERR=${(e?.message || String(e)).slice(0, 140)}`);
    }
  }
  console.log(`[extractHooksForAnalysis] items=${items.length} total=${allResults.length} analysisId=${analysisId} ${debug.join(' | ')}`);
  for (const r of allResults) {
    if (!r?.shortcode) continue;
    const { error: updErr } = await sb
      .from('competitor_hooks')
      .update({ hook_text: r.hook || '', niche: r.niche || null })
      .eq('analysis_id', analysisId)
      .eq('shortcode', r.shortcode);
    if (updErr) console.error('[extractHooksForAnalysis] update failed', { shortcode: r.shortcode, error: updErr });
  }
}
