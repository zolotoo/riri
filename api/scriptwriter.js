// Vercel Serverless — ИИ-сценарист: глубокий анализ структуры, генерация по теме/референсу, чат, проверка схожести.

import { callOpenRouter, MODELS, MODELS_FALLBACK } from '../lib/openRouter.js';
import { logApiCall } from '../lib/logApiCall.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const JINA_API_KEY = process.env.JINA_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Embed текст через Jina API → vector(1024)
async function jinaEmbed(text) {
  if (!JINA_API_KEY) return null;
  try {
    const res = await fetch('https://api.jina.ai/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${JINA_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jina-embeddings-v3', input: [text], task: 'retrieval.query' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// Поиск похожих хуков в Supabase pgvector
async function matchViralHooks(embedding, { niche = null, minViews = 100000, limit = 7 } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !embedding) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_viral_hooks`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: limit,
        filter_niche: niche,
        min_view_count: minViews,
      }),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Поиск похожих фрагментов сценария по part_type ('hook' | 'body' | 'cta').
// Используется для retrieval body/cta при генерации полного сценария — Sonnet получает
// конкретные удачные формулировки тел и концовок виральных видео как fewer-shot examples.
async function matchViralParts(embedding, partType, { niche = null, minViews = 50000, limit = 5 } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !embedding) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_viral_parts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        filter_part_type: partType,
        match_count: limit,
        filter_niche: niche,
        min_view_count: minViews,
      }),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

// Поиск похожих структурных скелетов (Этап 1: video_skeletons)
async function matchSkeletons(embedding, {
  niche = null,
  minViews = 50000,
  minSeconds = null,
  maxSeconds = null,
  formatType = null,
  freshnessDays = null,
  limit = 5,
} = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !embedding) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_skeletons`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_embedding: embedding,
        match_count: limit,
        filter_niche: niche,
        min_view_count: minViews,
        min_total_seconds: minSeconds,
        max_total_seconds: maxSeconds,
        filter_format_type: formatType,
        freshness_days: freshnessDays,
      }),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

const CAROUSEL_ANALYSIS_PROMPT = `Ты дизайн-аналитик. Твоя задача — точно воссоздать слайд карусели в редакторе.

ВАЖНО: Холст редактора = 1080px ширина × 1440px высота (соотношение 3:4, портрет).
Все координаты x, y, width, height — в ПИКСЕЛЯХ на этом холсте.
x=0 — левый край, x=1080 — правый. y=0 — верх, y=1440 — низ.

Верни ТОЛЬКО валидный JSON без markdown:
{
  "background": {
    "type": "solid",
    "color": "#1a1a18"
  },
  "elements": [
    {
      "type": "text",
      "text": "точный текст блока",
      "x": 86, "y": 115,
      "fontSize": 72,
      "fontWeight": 700,
      "color": "#ffffff",
      "textAlign": "left",
      "width": 900,
      "fontFamily": "serif",
      "fontStyle": "normal",
      "rotation": 0,
      "lineHeight": 1.2,
      "letterSpacing": 0,
      "zIndex": 2
    },
    {
      "type": "placeholder",
      "x": 86, "y": 600,
      "width": 450, "height": 400,
      "label": "Фото",
      "borderRadius": 16,
      "zIndex": 1
    }
  ]
}

Правила для background:
- type="solid" ТОЛЬКО если фон — чистый однородный цвет как цифровой прямоугольник (#ffffff, #000000, #3a7bd5). color=точный hex.
- type="gradient" если есть плавный цифровой переход между двумя цветами, без какой-либо физической текстуры. from, to, direction.
- type="image" во ВСЕХ остальных случаях: любое зерно, шум, плёнка, бумага, ткань, стена, бетон, кожа, паттерн, фото, люди, комнаты, природа — любой фон который выглядит как физический материал или реальная фотография. Если сомневаешься — выбирай type="image".

Правила для текстовых элементов:
- Точно скопируй текст (важно!).
- СМЕШАННЫЙ СТИЛЬ В ОДНОЙ СТРОКЕ: если часть текста в строке обычная, а часть курсивная — создай ДВА отдельных элемента с точными x координатами.
- РАЗНЫЕ БЛОКИ: если слова/фразы разного размера или на разных уровнях — каждый = отдельный элемент.
- x, y — координаты верхнего левого угла в ПИКСЕЛЯХ. x: 0=левый, 540=центр, 1080=правый. y: 0=верх, 720=середина, 1440=низ.
- textAlign: ОБЯЗАТЕЛЬНО определяй по визуальному положению. Если текст визуально центрирован на слайде — "center". Если прижат к правому краю — "right". Только если прижат к левому — "left". Большинство заголовков по центру — не ставь всё в "left" автоматически.
- КРИТИЧНО — НЕ ПЕРЕКРЫВАЙ ФОТО: текстовые элементы НЕ должны пересекаться по координатам с placeholder-элементами (фото-блоками). Если текст находится выше фото — его y + высота (fontSize × строки × lineHeight) должны быть меньше y фото. Если текст сбоку от фото — ставь его x за пределами фото-блока. Реальный дизайн всегда разделяет зоны текста и фото.
- ВАЖНО: следи чтобы текстовые элементы не перекрывались между собой по y — учитывай высоту текста (приблизительно: fontSize × количество строк × lineHeight пикселей).
- fontSize — в пикселях при ширине 1080px (диапазон 24-220). Для огромных заголовков используй 120-220.
- fontWeight: 400 (обычный), 700 (жирный), 900 (ультражирный/black).
- fontFamily: "serif" если с засечками, "sans-serif" если без засечек средней толщины, "heavy-sans" если очень толстый sans-serif (Montserrat Black), "display" если декоративный/ALL CAPS (Bebas Neue), "italic-serif" если курсивный с засечками, "monospace" если моноширинный.
- fontStyle: "italic" если курсивный, иначе "normal".
- rotation: угол наклона в градусах (-45 до 45). 0 если прямой.
- lineHeight: межстрочный интервал (1.0-1.8).
- letterSpacing: межбуквенный интервал в em (-0.05 до 0.3).
- width — точная ширина текстового блока в пикселях. ВАЖНО: не делай width больше чем нужно — для короткого слова/фразы (1-3 слова) ставь 150-400px, для средней строки 400-700px, для длинного абзаца/параграфа 700-1000px. Лишняя ширина создаёт пустое пространство и ломает позиционирование.
- zIndex: 1=фон, 2=контент, 3=поверх всего. Фигуры-фоны=1, текст=2-3, текст поверх shape=3.
- Максимум 12 текстовых элементов.

Правила для placeholder:
- Для каждого фото/изображения/скриншота/иконки добавь type="placeholder".
- КРИТИЧНО: если внутри фото/скриншота есть текст (надписи, ники, интерфейс, подписи) — НЕ создавай для этого текста отдельные text-элементы. Весь текст внутри фотографии — часть placeholder, не отдельный элемент.
- Сигналы что это фото а не отдельный текст: текст мелкий/нечёткий, находится внутри прямоугольной области с изображением, выглядит как скриншот интерфейса, телефона, приложения.
- ГРИД ФОТО: если фото в сетке (2x2, 3x2) — точно воспроизведи позиции.
- width и height в ПИКСЕЛЯХ (из пространства 1080×1440).
- borderRadius: 0 если прямоугольник, 16-32 если скруглённые углы, 50 если круг.
- zIndex: обычно 1 для фото/placeholder.

Правила для фигур (shapes):
- КОД-БЛОК: type="shape", shapeType="rect", fill=тёмный цвет + отдельный text поверх с fontFamily="monospace".
- Для линий: type="shape", shapeType="line".
- Для стрелок: type="shape", shapeType="arrow".
- Для прямоугольников/рамок: type="shape", shapeType="rect", borderRadius=0.
- Для овала/pill/кнопки: type="shape", shapeType="rect", borderRadius=999. Добавь text поверх.
- Для кружков: type="shape", shapeType="circle".
- fill — цвет заливки (hex или "transparent"), stroke — цвет обводки, strokeWidth — толщина (1-8).
- width, height shape-элементов — в ПИКСЕЛЯХ.
- zIndex: 1 для фоновых фигур, 3 для pill-кнопок поверх фото.
- Не игнорируй фигуры — стрелки, рамки, кнопки, код-блоки!

Верни ТОЛЬКО JSON, без пояснений, без markdown.`;

const BG_GENERATION_PROMPT = `Я прикрепил тебе фото карусели из Instagram. Твоя задача — извлечь ТОЛЬКО фон, полностью очищенный от любых наложений.

УДАЛИ АБСОЛЮТНО ВСЁ что не является фоном:
- любые тексты, заголовки, подписи — вне зависимости от размера и расположения
- ники, имена пользователей, логины (обычно снизу или в углах) — ОБЯЗАТЕЛЬНО удали
- логотипы, значки, иконки, водяные знаки
- фотографии людей, предметов, скриншоты (если они являются контентом, а не фоном)
- стрелочки, декоративные элементы, рамки, кнопки
- любые UI-элементы

СОХРАНИ ТОЧЬ В ТОЧЬ только фон:
- цвет, текстуру, градиент, паттерн — всё как в оригинале
- если фон — фотография природы/места/абстракция — воссоздай её

Формат результата: изображение размером 3:4 (портрет), только чистый фон без каких-либо надписей или элементов.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = body.action;

  logApiCall({ apiName: 'openrouter', action: `scriptwriter-${action || 'unknown'}`, userId: body.userId, projectId: body.projectId });

  switch (action) {
    case 'analyze-structure':
      return handleAnalyzeStructure(req, res);
    case 'generate-from-topic':
      return handleGenerateFromTopic(req, res);
    case 'generate-from-reference':
      return handleGenerateFromReference(req, res);
    case 'chat':
      return handleChat(req, res);
    case 'check-similarity':
      return handleCheckSimilarity(req, res);
    case 'refine':
      return handleRefine(req, res);
    case 'refine-by-diff':
      return handleRefineByDiff(req, res);
    case 'clarify-topic':
      return handleClarifyTopic(req, res);
    case 'generate-hooks':
      return handleGenerateHooks(req, res);
    case 'generate-body':
      return handleGenerateBody(req, res);
    case 'assemble-script':
      return handleAssembleScript(req, res);
    case 'improve-script':
      return handleImproveScript(req, res);
    case 'quick-generate':
      return handleQuickGenerate(req, res);
    case 'analyze-carousel':
      return handleAnalyzeCarousel(req, res);
    case 'fetch-carousel-slides':
      return handleFetchCarouselSlides(req, res);
    case 'analyze-carousel-from-url':
      return handleAnalyzeCarouselFromUrl(req, res);
    case 'translate-carousel-texts':
      return handleTranslateCarouselTexts(req, res);
    case 'regen-background':
      return handleRegenBackground(req, res);
    case 'refine-carousel':
      return handleRefineCarousel(req, res);
    case 'generate-ai-hook':
      return handleGenerateAiHook(req, res);
    case 'generate-full-script':
      return handleGenerateFullScript(req, res);
    default:
      return res.status(400).json({ error: 'Unknown action' });
  }
}

function parseJsonResponse(rawText) {
  // Вытащить JSON-блок из текста
  let jsonStr = (rawText.match(/\{[\s\S]*\}/) || [null])[0] || rawText;
  // Убрать trailing commas
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

  // Попытка 1: прямой парс
  try {
    return JSON.parse(jsonStr);
  } catch (_) {}

  // Попытка 2: обрезать до последнего полного объекта в массиве elements
  try {
    // Найти "elements": [ и закрыть массив после последнего полного объекта }
    const elemStart = jsonStr.indexOf('"elements"');
    if (elemStart > -1) {
      // Найти все позиции }, внутри массива (грубо — последний } перед концом)
      // Отрезаем незакрытый элемент: ищем последний },\s*{ или },\s*]
      const truncated = jsonStr.slice(0, jsonStr.lastIndexOf('}') + 1);
      // Закрыть незакрытые массивы/объекты
      let fixed = truncated;
      const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
      for (let i = 0; i < openBraces; i++) fixed += '}';
      for (let i = 0; i < openBrackets; i++) fixed += ']';
      fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
      return JSON.parse(fixed);
    }
  } catch (_) {}

  // Попытка 3: грубое закрытие скобок
  try {
    let fixed = jsonStr;
    const openBraces = (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
    for (let i = 0; i < openBraces; i++) fixed += '}';
    for (let i = 0; i < openBrackets; i++) fixed += ']';
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(fixed);
  } catch (finalErr) {
    throw finalErr;
  }
}

async function callWithFallback(models, messages, opts = {}) {
  const { temperature = 0.2, response_format, max_tokens } = opts;
  let rawText = null;
  for (const model of models) {
    try {
      const result = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages,
        temperature,
        ...(max_tokens != null && { max_tokens }),
        ...(response_format && { response_format }),
      });
      rawText = result.text;
      if (rawText) break;
    } catch (err) {
      if (err.message?.includes('429')) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return rawText;
}

// ── Глубокий анализ структуры сценариев ──────────────────────────────────────

async function handleAnalyzeStructure(req, res) {
  const { scripts, training_mode } = req.body;
  if (!Array.isArray(scripts) || scripts.length < 2 || scripts.length > 10) {
    return res.status(400).json({ error: 'scripts: 2–10 items required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const parts = [];
  parts.push(`Задача: глубокий анализ ${scripts.length} сценариев для создания ИИ-сценариста.

Режим обучения: ${training_mode === 'scripts' ? 'пользователь загрузил свои сценарии' : 'сценарии из залётных рилсов (транскрипты)'}

Для каждого сценария ОБЯЗАТЕЛЬНО определи:
1. ХУК — первые 1-3 секунды/предложения. Как цепляет внимание? Сколько длится?
2. ТЕЛО — основная часть. Какие фазы есть (проблема → решение → доказательство → ...)? Сколько длится каждая фаза?
3. CTA / ПЕРЕГОН — есть ли призыв к действию в конце? Какой тип? (подписка, комментарий, сохранение, переход)
4. ОСОБЕННОСТИ — что уникального в стиле: тон, ритм, обращение к зрителю, эмоциональные триггеры, шаблонные фразы

Затем СРАВНИ все сценарии между собой:
— Что общего в структуре?
— Какие паттерны повторяются?
— Какая средняя длина? Разброс?
— Какой стиль подачи?

КРИТИЧНО:
— НЕ запоминай конкретные смыслы/факты — они уникальны для каждого видео
— ВЫЯВИ ПРАВИЛА: как структурировать, какой ритм, как строить хук, тело, CTA
— Промт должен описывать КАК писать сценарии, а не ЧТО писать

Ответ строго в формате JSON без markdown-блоков. Один валидный JSON:
{
  "prompt": "полный текст промта для генерации новых сценариев в этом стиле (на русском)",
  "meta": {
    "rules": ["правило 1", "правило 2", ...],
    "doNot": ["чего избегать 1", ...],
    "summary": "краткое описание стиля в 1–2 предложения"
  },
  "structure_analysis": {
    "hook_description": "описание типичного хука",
    "hook_duration": "примерная длительность хука (в секундах или словах)",
    "body_phases": ["фаза 1: описание", "фаза 2: описание", ...],
    "cta_type": "тип CTA или 'отсутствует'",
    "avg_length_seconds": число (примерная средняя длительность в секундах, 0 если неизвестно),
    "special_features": ["особенность 1", "особенность 2", ...]
  },
  "clarifying_questions": ["Правильно ли я понимаю, что ...?", ...]
}`);

  scripts.forEach((s, i) => {
    parts.push(`\n--- Сценарий ${i + 1} ---`);
    if (s.transcript_text) {
      parts.push(`Транскрипт/текст:\n${s.transcript_text}`);
    }
    if (s.translation_text) {
      parts.push(`Перевод:\n${s.translation_text}`);
    }
    if (s.script_text && s.script_text !== s.transcript_text) {
      parts.push(`Адаптация пользователя:\n${s.script_text}`);
    }
  });

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: parts.join('\n') }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    const promptText = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    if (!promptText) return res.status(502).json({ error: 'Invalid JSON structure' });

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const sa = parsed.structure_analysis && typeof parsed.structure_analysis === 'object' ? parsed.structure_analysis : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];

    return res.status(200).json({
      success: true,
      prompt: promptText,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      structure_analysis: {
        hookDescription: sa.hook_description || '',
        hookDuration: sa.hook_duration || '',
        bodyPhases: Array.isArray(sa.body_phases) ? sa.body_phases : [],
        ctaType: sa.cta_type || '',
        avgLengthSeconds: typeof sa.avg_length_seconds === 'number' ? sa.avg_length_seconds : 0,
        specialFeatures: Array.isArray(sa.special_features) ? sa.special_features : [],
      },
      clarifying_questions: clarifying_questions.slice(0, 6),
    });
  } catch (err) {
    console.error('scriptwriter analyze-structure error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Генерация сценария по теме/идее ──────────────────────────────────────────

async function handleGenerateFromTopic(req, res) {
  const { prompt, topic, structure_analysis } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let systemText = prompt.trim();
  if (structure_analysis) {
    systemText += '\n\n--- СТРУКТУРА СЦЕНАРИЯ ---';
    if (structure_analysis.hookDescription) systemText += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) systemText += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) systemText += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) systemText += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
    if (structure_analysis.specialFeatures?.length) systemText += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const userText = `Тема/идея для сценария:\n${topic.trim()}\n\nНапиши полный сценарий по этой теме, строго следуя стилю и структуре из промта. Выводи только текст сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      { temperature: 0.4 }
    );

    if (!rawText?.trim()) {
      return res.status(502).json({ error: 'OpenRouter returned empty script' });
    }

    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter generate-from-topic error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Генерация сценария по видео-референсу ────────────────────────────────────

async function handleGenerateFromReference(req, res) {
  const { prompt, transcript_text, translation_text, structure_analysis } = req.body;
  if (!prompt?.trim() || !transcript_text?.trim()) {
    return res.status(400).json({ error: 'prompt and transcript_text are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let systemText = prompt.trim();
  if (structure_analysis) {
    systemText += '\n\n--- СТРУКТУРА СЦЕНАРИЯ ---';
    if (structure_analysis.hookDescription) systemText += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) systemText += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) systemText += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) systemText += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
    if (structure_analysis.specialFeatures?.length) systemText += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const userParts = ['Исходный сценарий (оригинал):\n' + transcript_text.trim()];
  if (translation_text?.trim()) {
    userParts.push('\nПеревод на русский:\n' + translation_text.trim());
  }
  userParts.push('\n\nСгенерируй мой сценарий (адаптацию) по этим данным, следуя структуре и стилю. Выводи только текст сценария, без пояснений.');

  let userText = userParts.join('');
  if (userText.length > 100000) {
    userText = userText.slice(0, 100000) + '\n\n[... текст обрезан ...]';
  }

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      { temperature: 0.4 }
    );

    if (!rawText?.trim()) {
      return res.status(502).json({ error: 'OpenRouter returned empty script' });
    }

    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter generate-from-reference error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Чат для итераций над сценарием ───────────────────────────────────────────

async function handleChat(req, res) {
  const { messages, prompt, script_text, structure_analysis } = req.body;
  if (!Array.isArray(messages) || !messages.length || !prompt?.trim()) {
    return res.status(400).json({ error: 'messages[] and prompt are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const systemParts = [
    'Ты ИИ-сценарист. Помогаешь пользователю создавать и дорабатывать сценарии для коротких видео (рилсы, шортсы).',
    '',
    'Стиль/подчерк (промт):',
    '---',
    prompt.trim(),
    '---',
    '',
  ];

  if (structure_analysis) {
    systemParts.push('Структура сценария:');
    if (structure_analysis.hookDescription) systemParts.push(`Хук: ${structure_analysis.hookDescription}`);
    if (structure_analysis.bodyPhases?.length) systemParts.push(`Фазы: ${structure_analysis.bodyPhases.join(' → ')}`);
    if (structure_analysis.ctaType) systemParts.push(`CTA: ${structure_analysis.ctaType}`);
    systemParts.push('');
  }

  if (script_text?.trim()) {
    systemParts.push('Текущий сценарий:');
    systemParts.push(script_text.trim().slice(0, 2000));
    systemParts.push('');
  }

  systemParts.push('Отвечай на русском. Когда предлагаешь новый вариант сценария, оберни его в блок:');
  systemParts.push('___СЦЕНАРИЙ___');
  systemParts.push('(полный текст сценария)');
  systemParts.push('___КОНЕЦ_СЦЕНАРИЯ___');

  const chatMessages = [
    { role: 'system', content: systemParts.join('\n') },
  ];

  for (const m of messages) {
    if ((m.role === 'user' || m.role === 'assistant') && m.content?.trim()) {
      chatMessages.push({ role: m.role, content: String(m.content).trim() });
    }
  }

  try {
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.FLASH_3],
      chatMessages,
      { temperature: 0.5 }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    let suggestedScript = null;
    const match = rawText.match(/___СЦЕНАРИЙ___\s*([\s\S]*?)\s*___КОНЕЦ_СЦЕНАРИЯ___/);
    if (match) {
      suggestedScript = match[1].trim();
    }

    const cleanReply = rawText
      .replace(/___СЦЕНАРИЙ___\s*[\s\S]*?\s*___КОНЕЦ_СЦЕНАРИЯ___/g, '')
      .trim();

    return res.status(200).json({
      success: true,
      reply: cleanReply || rawText.trim(),
      suggested_script: suggestedScript || undefined,
    });
  } catch (err) {
    console.error('scriptwriter chat error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Проверка схожести сценариев ──────────────────────────────────────────────

async function handleCheckSimilarity(req, res) {
  const { scripts } = req.body;
  if (!Array.isArray(scripts) || scripts.length < 2) {
    return res.status(400).json({ error: 'scripts: at least 2 items required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const parts = [`Проанализируй ${scripts.length} сценариев коротких видео и определи:
1. Насколько они СХОЖИ по структуре и формату? (0-100%)
2. Все ли они одного типа/формата?
3. Есть ли аутлайеры (сильно отличающиеся)?
4. Какие длины сценариев? Сильно ли различаются?

Ответ строго в JSON:
{
  "similarity_score": число от 0 до 100,
  "is_same_format": true/false,
  "outlier_indices": [индексы аутлайеров (0-based)] или [],
  "length_category": "same" | "mixed",
  "lengths": [длина каждого сценария в словах],
  "short_indices": [индексы коротких],
  "long_indices": [индексы длинных],
  "notes": "краткий комментарий"
}`];

  scripts.forEach((s, i) => {
    const text = s.transcript_text || s.script_text || '';
    parts.push(`\n--- Сценарий ${i + 1} ---\n${text.slice(0, 3000)}`);
  });

  try {
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.FLASH_3],
      [{ role: 'user', content: parts.join('\n') }],
      { temperature: 0.1, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, ...parsed });
  } catch (err) {
    console.error('scriptwriter check-similarity error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Дообучение (refine) по текстовому фидбеку ───────────────────────────────

async function handleRefine(req, res) {
  const { prompt, script_text, feedback, structure_analysis } = req.body;
  if (!feedback?.trim() || !prompt?.trim()) {
    return res.status(400).json({ error: 'prompt and feedback are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const fb = feedback.trim();
  const isClarifyAnswer = fb.startsWith('Уточняющий вопрос:');
  const isTrainVerify = fb.includes('Ответы на уточняющие вопросы по обучению');

  const clarifyPreamble = isClarifyAnswer
    ? 'Пользователь ответил на твой уточняющий вопрос. Если подтвердил — примени. Если отверг — не меняй. clarifying_questions: []\n\n'
    : isTrainVerify
    ? 'Пользователь ответил на уточняющие вопросы после обучения. Примени изменения. clarifying_questions: []\n\n'
    : '';

  const instructions = isClarifyAnswer || isTrainVerify
    ? 'Примени изменения на основе ответов. clarifying_questions: []'
    : `1. Разбери обратную связь.
2. Если только ДОБАВЛЯЕШЬ правила — добавь и верни обновлённый prompt.
3. Если УДАЛЯЕШЬ/МЕНЯЕШЬ правило — добавь clarifying_questions для верификации и верни prompt БЕЗ изменений.`;

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription}`;
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) structureHint += `\nCTA: ${structure_analysis.ctaType}`;
    structureHint += '\n';
  }

  const userText = `${clarifyPreamble}Ты дообучаешь промт ИИ-сценариста.

ТЕКУЩИЙ ПРОМТ:
---
${prompt.trim()}
---
${structureHint}
${script_text ? `СГЕНЕРИРОВАННЫЙ СЦЕНАРИЙ:\n${script_text.trim()}\n` : ''}
ОБРАТНАЯ СВЯЗЬ:
«${fb}»

ИНСТРУКЦИИ:
${instructions}

Верни только валидный JSON:
{
  "prompt": "обновлённый промт",
  "meta": { "rules": [...], "doNot": [...], "summary": "..." },
  "clarifying_questions": []
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    const newPrompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    if (!newPrompt) return res.status(502).json({ error: 'Invalid JSON structure' });

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];

    return res.status(200).json({
      success: true,
      prompt: newPrompt,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      clarifying_questions: clarifying_questions.slice(0, 3),
    });
  } catch (err) {
    console.error('scriptwriter refine error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Дообучение (refine) по правкам пользователя (diff) ───────────────────────

async function handleRefineByDiff(req, res) {
  const { prompt, script_ai, script_human, feedback, structure_analysis } = req.body;
  if (!prompt?.trim() || script_ai == null || script_human == null) {
    return res.status(400).json({ error: 'prompt, script_ai and script_human are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const a = String(script_ai).trim().split(/\n/).filter(Boolean);
  const b = String(script_human).trim().split(/\n/).filter(Boolean);
  const setA = new Set(a);
  const setB = new Set(b);
  const added = b.filter((line) => !setA.has(line));
  const removed = a.filter((line) => !setB.has(line));

  const diffHint = added.length > 0 || removed.length > 0
    ? `\nПОДСКАЗКА (diff):\nДобавлено: ${added.slice(0, 15).join(' | ') || '—'}\nУбрано: ${removed.slice(0, 15).join(' | ') || '—'}`
    : '';

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription}`;
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы: ${structure_analysis.bodyPhases.join(' → ')}`;
    structureHint += '\n';
  }

  const userText = `Ты дообучаешь промт ИИ-сценариста по правкам.

ТЕКУЩИЙ ПРОМТ (сохрани все правила, добавь только новые):
---
${prompt.trim()}
---
${structureHint}
СЦЕНАРИЙ НЕЙРОСЕТИ:
---
${String(script_ai).trim()}
---

ИДЕАЛЬНЫЙ СЦЕНАРИЙ ПОЛЬЗОВАТЕЛЯ:
---
${String(script_human).trim()}
---
${feedback?.trim() ? `\nКОММЕНТАРИЙ:\n«${feedback.trim()}»\n` : ''}${diffHint}

Верни JSON:
{
  "changes_identified": ["что изменил 1", ...],
  "prompt": "обновлённый промт",
  "meta": { "rules": [...], "doNot": [...], "summary": "..." },
  "clarifying_questions": []
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    const newPrompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    if (!newPrompt) return res.status(502).json({ error: 'Invalid JSON structure' });

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];

    return res.status(200).json({
      success: true,
      prompt: newPrompt,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      clarifying_questions: clarifying_questions.slice(0, 3),
    });
  } catch (err) {
    console.error('scriptwriter refine-by-diff error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 1: Уточнение темы (3 вопроса) ───────────────────────────────────────

async function handleClarifyTopic(req, res) {
  const { prompt, topic, structure_analysis, reference_transcript } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\n\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) structureHint += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) structureHint += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
  }

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ (транскрипт видео, который пользователь хочет адаптировать):\n---\n${reference_transcript.trim().slice(0, 3000)}\n---`
    : '';

  const userText = `Ты ИИ-сценарист. Пользователь хочет создать сценарий короткого видео (рилс/шортс).

ТВОЙ ПОДЧЕРК (промт):
---
${prompt.trim()}
---
${structureHint}${refHint}

ТЕМА ПОЛЬЗОВАТЕЛЯ: «${topic.trim()}»

Задай РОВНО 3 уточняющих вопроса, чтобы лучше понять что он хочет. Вопросы должны касаться:
1. СОДЕРЖАНИЕ — что конкретно будет раскрыто в видео, какой угол подачи
2. СТРУКТУРА — как построить тело сценария, какие повороты/фазы использовать
3. КОНЦОВКА — какой финал/CTA/перегон, какую эмоцию оставить

Каждый вопрос должен предлагать 2-3 варианта ответа, исходя из твоего подчерка.

Ответ строго в JSON:
{
  "questions": [
    { "question": "текст вопроса", "options": ["вариант 1", "вариант 2", "вариант 3"] },
    { "question": "текст вопроса", "options": ["вариант 1", "вариант 2"] },
    { "question": "текст вопроса", "options": ["вариант 1", "вариант 2", "вариант 3"] }
  ]
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.FLASH_3],
      [{ role: 'user', content: userText }],
      { temperature: 0.4, response_format: { type: 'json_object' } }
    );
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, questions: parsed.questions || [] });
  } catch (err) {
    console.error('scriptwriter clarify-topic error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 2: Генерация 5 вариантов хуков (с RAG из вирусных видео) ─────────────

async function handleGenerateHooks(req, res) {
  const { prompt, topic, answers, structure_analysis, reference_transcript, feedback, previous_hooks } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  // RAG: embed тему → ищем похожие хуки из вирусных видео
  let viralHooksHint = '';
  try {
    const embedding = await jinaEmbed(topic.trim());
    if (embedding) {
      const viralHooks = await matchViralHooks(embedding, { minViews: 100000, limit: 7 });
      if (viralHooks?.length) {
        viralHooksHint = '\n\nПРИМЕРЫ РЕАЛЬНЫХ ВИРУСНЫХ ХУКОВ из видео с 100k+ просмотров по похожей теме:\n';
        viralHooks.forEach((h, i) => {
          const views = h.view_count >= 1_000_000
            ? `${(h.view_count / 1_000_000).toFixed(1)}М`
            : `${Math.round(h.view_count / 1000)}К`;
          viralHooksHint += `${i + 1}. [${views} просмотров] ${h.content}\n`;
        });
        viralHooksHint += '\nПроанализируй эти хуки — какие приёмы делают их цепляющими. Используй те же механики в своих хуках, но под тему пользователя.';
      }
    }
  } catch {
    // RAG не критичен — продолжаем без него
  }

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\n\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.specialFeatures?.length) structureHint += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const answersText = Array.isArray(answers) && answers.length
    ? '\n\nОТВЕТЫ ПОЛЬЗОВАТЕЛЯ НА УТОЧНЕНИЯ:\n' + answers.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : '';

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ:\n${reference_transcript.trim().slice(0, 2000)}`
    : '';

  let feedbackHint = '';
  if (feedback?.trim() && Array.isArray(previous_hooks) && previous_hooks.length) {
    feedbackHint = `\n\nПРЕДЫДУЩИЕ ХУКИ (пользователю не понравились):\n${previous_hooks.map((h, i) => `${i + 1}. ${typeof h === 'string' ? h : h.text || ''}`).join('\n')}\n\nОБРАТНАЯ СВЯЗЬ: «${feedback.trim()}»\n\nСгенерируй НОВЫЕ хуки, учитывая фидбек. НЕ повторяй предыдущие.`;
  }

  const userText = `Ты ИИ-сценарист коротких видео (рилсы/шортсы).

ПОДЧЕРК:
---
${prompt.trim()}
---
${structureHint}${viralHooksHint}

ТЕМА: «${topic.trim()}»${answersText}${refHint}${feedbackHint}

Сгенерируй РОВНО 5 разных вариантов ХУКОВ (первые 1-3 предложения сценария, которые цепляют внимание).
Каждый хук должен быть в стиле подчерка, но с разным подходом к привлечению внимания.

Ответ строго в JSON:
{
  "hooks": [
    { "text": "полный текст хука", "approach": "краткое описание подхода в 3-5 слов" },
    ...
  ]
}`;

  try {
    const { text: rawText } = await callOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      model: MODELS.CLAUDE_SONNET_35,
      messages: [{ role: 'user', content: userText }],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, hooks: parsed.hooks || [] });
  } catch (err) {
    console.error('scriptwriter generate-hooks error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 3: Генерация 3 вариантов тела ───────────────────────────────────────

async function handleGenerateBody(req, res) {
  const { prompt, topic, answers, selected_hook, structure_analysis, reference_transcript, feedback, previous_bodies } = req.body;
  if (!prompt?.trim() || !topic?.trim() || !selected_hook?.trim()) {
    return res.status(400).json({ error: 'prompt, topic and selected_hook are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\n\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) structureHint += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) structureHint += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
  }

  const answersText = Array.isArray(answers) && answers.length
    ? '\n\nОТВЕТЫ ПОЛЬЗОВАТЕЛЯ:\n' + answers.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : '';

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ:\n${reference_transcript.trim().slice(0, 2000)}`
    : '';

  let feedbackHint = '';
  if (feedback?.trim() && Array.isArray(previous_bodies) && previous_bodies.length) {
    feedbackHint = `\n\nПРЕДЫДУЩИЕ ВАРИАНТЫ ТЕЛА (не понравились):\n${previous_bodies.map((b, i) => `${i + 1}. ${(typeof b === 'string' ? b : b.text || '').slice(0, 300)}`).join('\n')}\n\nОБРАТНАЯ СВЯЗЬ: «${feedback.trim()}»\n\nСгенерируй НОВЫЕ варианты, учитывая фидбек. НЕ повторяй предыдущие.`;
  }

  const userText = `Ты ИИ-сценарист коротких видео.

ПОДЧЕРК:
---
${prompt.trim()}
---
${structureHint}

ТЕМА: «${topic.trim()}»${answersText}${refHint}${feedbackHint}

ВЫБРАННЫЙ ХУК:
«${selected_hook.trim()}»

Сгенерируй РОВНО 3 разных варианта ТЕЛА сценария (основная часть после хука, включая CTA/концовку если нужно по подчерку).
Каждый вариант должен:
- Начинаться сразу после хука
- Следовать фазам из подчерка
- Иметь разный подход к раскрытию темы
- Включать CTA/перегон если есть в подчерке

Ответ строго в JSON:
{
  "bodies": [
    { "text": "полный текст тела + концовка", "approach": "краткое описание подхода в 3-5 слов" },
    ...
  ]
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.6, response_format: { type: 'json_object' } }
    );
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, bodies: parsed.bodies || [] });
  } catch (err) {
    console.error('scriptwriter generate-body error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 4: Сборка финального сценария ────────────────────────────────────────

async function handleAssembleScript(req, res) {
  const { prompt, topic, answers, selected_hook, selected_body, structure_analysis } = req.body;
  if (!prompt?.trim() || !selected_hook?.trim() || !selected_body?.trim()) {
    return res.status(400).json({ error: 'prompt, selected_hook and selected_body are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\nСТРУКТУРА: ';
    if (structure_analysis.hookDuration) structureHint += `хук ~${structure_analysis.hookDuration}, `;
    if (structure_analysis.bodyPhases?.length) structureHint += `фазы: ${structure_analysis.bodyPhases.join(' → ')}, `;
    if (structure_analysis.ctaType) structureHint += `CTA: ${structure_analysis.ctaType}`;
  }

  const userText = `Ты ИИ-сценарист. Собери финальный сценарий из выбранных частей.

ПОДЧЕРК:
---
${prompt.trim()}
---
${structureHint}

ТЕМА: «${(topic || '').trim()}»

ХУК (выбран пользователем):
${selected_hook.trim()}

ТЕЛО + КОНЦОВКА (выбрано пользователем):
${selected_body.trim()}

Задача: соедини хук и тело в единый гладкий сценарий. Убери швы между частями. Сохрани стиль подчерка. Если нужно — немного отредактируй для плавности, но не меняй смысл и структуру.

Выводи ТОЛЬКО текст финального сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: prompt.trim() },
        { role: 'user', content: userText },
      ],
      { temperature: 0.3 }
    );
    if (!rawText?.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter assemble-script error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 5: Улучшение сценария по комментариям ───────────────────────────────

async function handleImproveScript(req, res) {
  const { prompt, script_text, feedback, structure_analysis } = req.body;
  if (!prompt?.trim() || !script_text?.trim() || !feedback?.trim()) {
    return res.status(400).json({ error: 'prompt, script_text and feedback are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const userText = `Ты ИИ-сценарист. Улучши сценарий по комментариям пользователя.

ПОДЧЕРК:
---
${prompt.trim()}
---

ТЕКУЩИЙ СЦЕНАРИЙ:
---
${script_text.trim()}
---

КОММЕНТАРИЙ ПОЛЬЗОВАТЕЛЯ:
«${feedback.trim()}»

Задача: учти комментарий и выведи УЛУЧШЕННЫЙ сценарий. Сохрани стиль подчерка. Выводи ТОЛЬКО текст сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: prompt.trim() },
        { role: 'user', content: userText },
      ],
      { temperature: 0.4 }
    );
    if (!rawText?.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter improve-script error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Быстрая генерация: тема → сразу полный сценарий ──────────────────────────

async function handleQuickGenerate(req, res) {
  const { prompt, topic, structure_analysis, reference_transcript } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let systemText = prompt.trim();
  if (structure_analysis) {
    systemText += '\n\n--- СТРУКТУРА СЦЕНАРИЯ ---';
    if (structure_analysis.hookDescription) systemText += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) systemText += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) systemText += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) systemText += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
    if (structure_analysis.specialFeatures?.length) systemText += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ (адаптируй под тему):\n${reference_transcript.trim().slice(0, 3000)}`
    : '';

  const userText = `Тема/идея для сценария:\n${topic.trim()}${refHint}\n\nНапиши полный сценарий по этой теме, строго следуя стилю и структуре из промта. Включи яркий хук, основное тело с фазами, и CTA если предусмотрен подчерком. Выводи только текст сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, ...MODELS_FALLBACK],
      [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      { temperature: 0.5 }
    );
    if (!rawText?.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter quick-generate error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ─── analyze-carousel ─────────────────────────────────────────────────────────
// Принимает base64-картинку слайда карусели, возвращает JSON с фоном и элементами.

async function handleAnalyzeCarousel(req, res) {
  const { image_data, mime_type = 'image/jpeg' } = req.body;

  if (!image_data) return res.status(400).json({ error: 'image_data required' });

  const prompt = CAROUSEL_ANALYSIS_PROMPT;

  // Модели с поддержкой vision (по приоритету)
  const VISION_MODELS = [
    'google/gemini-2.5-flash',
    'google/gemini-2.0-flash-001',
    'google/gemini-2.0-flash-lite-001',
  ];

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime_type};base64,${image_data}` } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  // ── Шаг 1: основной анализ ──────────────────────────────────
  let parsed = null;
  let lastErr = null;
  for (const model of VISION_MODELS) {
    try {
      const { text } = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages,
        temperature: 0.1,
        max_tokens: 4000,
      });
      if (!text) continue;
      parsed = parseJsonResponse(text);
      break;
    } catch (err) {
      console.error(`analyze-carousel step1 error with ${model}:`, err.message);
      lastErr = err;
      if (err.message?.includes('429')) await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!parsed) {
    return res.status(502).json({ error: lastErr?.message ?? 'Vision API error' });
  }

  // ── Шаг 2: генерация фона через gemini-2.5-flash-image (до 3 попыток) ───────────────────
  const bgPromise = (async () => {
    const bgBody = JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      modalities: ['image', 'text'],
      stream: true,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime_type};base64,${image_data}` } },
          { type: 'text', text: BG_GENERATION_PROMPT },
        ],
      }],
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://ririrai.vercel.app',
          'X-Title': 'RiRi AI',
        },
        body: bgBody,
      });

      console.log(`Gemini image gen attempt ${attempt} HTTP status:`, genRes.status);
      const rawText = await genRes.text();
      const lines = rawText.split('\n');
      let base64Chunks = [];
      let imageMime = 'image/png';

      for (const line of lines) {
        if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
        try {
          const chunk = JSON.parse(line.slice(6));
          const delta = chunk?.choices?.[0]?.delta;
          if (delta?.images?.length > 0) {
            const url = delta.images[0]?.image_url?.url;
            if (url?.startsWith('data:')) {
              const [meta, b64] = url.split(',');
              const mime = meta.replace('data:', '').replace(';base64', '');
              if (mime) imageMime = mime;
              if (b64) base64Chunks.push(b64);
            }
          }
          if (Array.isArray(delta?.content)) {
            for (const part of delta.content) {
              if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:')) {
                const [meta, b64] = part.image_url.url.split(',');
                const mime = meta.replace('data:', '').replace(';base64', '');
                if (mime) imageMime = mime;
                if (b64) base64Chunks.push(b64);
              }
            }
          }
        } catch {}
      }

      console.log(`Gemini SSE attempt ${attempt}: chunks=${lines.filter(l => l.startsWith('data:')).length} | base64 parts=${base64Chunks.length}`);
      if (base64Chunks.length > 0) {
        parsed.background = { type: 'image', src: `data:${imageMime};base64,${base64Chunks.join('')}` };
        console.log('Gemini: background OK, length:', base64Chunks.join('').length);
        return;
      }
      console.warn(`Gemini image gen attempt ${attempt}: no image. Raw preview:`, rawText.slice(0, 400));
    }
    console.error('Gemini image gen: все 3 попытки вернули пустой ответ');
  })().catch(err => console.error('Gemini image gen error:', err.message));

  await bgPromise;

  return res.status(200).json(parsed);
}

// ─── analyze-carousel-from-url ────────────────────────────────────────────────
// Принимает Instagram URL → достаёт все слайды → анализирует каждый параллельно

const RAPIDAPI_KEY_CONST = process.env.RAPIDAPI_KEY || 'ff21c60e3dmsh5f27d005cc9811dp1d106ejsn8dc341d3ceb2';

const IG_IMAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
  'Referer': 'https://www.instagram.com/',
};

async function fetchImageAsBase64(url) {
  const resp = await fetch(url, { headers: IG_IMAGE_HEADERS });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for image`);
  const buf = await resp.arrayBuffer();
  const base64 = Buffer.from(buf).toString('base64');
  const mimeType = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  return { base64, mimeType };
}

async function analyzeOneSlide(base64, mimeType, prompt, visionModels, { skipBgGen = false } = {}) {
  const messages = [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
      { type: 'text', text: prompt },
    ],
  }];

  let parsed = null;
  for (const model of visionModels) {
    try {
      const { text } = await callOpenRouter({ apiKey: OPENROUTER_API_KEY, model, messages, temperature: 0.1, max_tokens: 4000 });
      if (!text) continue;
      parsed = parseJsonResponse(text);
      if (parsed) break;
    } catch (err) {
      if (err.message?.includes('429')) await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!parsed) return null;

  // Background generation (3 attempts) — пропускаем если skipBgGen=true
  if (!skipBgGen && parsed.background?.type === 'image') {
    const bgBody = JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      modalities: ['image', 'text'],
      stream: true,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
          { type: 'text', text: BG_GENERATION_PROMPT },
        ],
      }],
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://ririrai.vercel.app', 'X-Title': 'RiRi AI' },
          body: bgBody,
        });
        const rawText = await genRes.text();
        const lines = rawText.split('\n');
        const base64Chunks = [];
        let imageMime = 'image/png';
        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            const delta = chunk?.choices?.[0]?.delta;
            if (delta?.images?.length > 0) {
              const url = delta.images[0]?.image_url?.url;
              if (url?.startsWith('data:')) { const [m, b] = url.split(','); if (m) imageMime = m.replace('data:','').replace(';base64',''); if (b) base64Chunks.push(b); }
            }
            if (Array.isArray(delta?.content)) {
              for (const part of delta.content) {
                if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:')) { const [m, b] = part.image_url.url.split(','); if (m) imageMime = m.replace('data:','').replace(';base64',''); if (b) base64Chunks.push(b); }
              }
            }
          } catch {}
        }
        if (base64Chunks.length > 0) {
          parsed.background = { type: 'image', src: `data:${imageMime};base64,${base64Chunks.join('')}` };
          break;
        }
      } catch (err) { console.error(`Slide bg attempt ${attempt} error:`, err.message); }
    }
  }

  return parsed;
}

// ─── Shared: Instagram slide URL extraction ────────────────────────────────────

function extractShortcode(instagram_url, shortcode) {
  if (shortcode) return shortcode;
  if (!instagram_url) return null;
  const match = instagram_url.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function getIgImageUrl(item) {
  return item?.image_versions2?.candidates?.[0]?.url
    || item?.image_versions2?.items?.[0]?.url
    || item?.image_versions?.candidates?.[0]?.url
    || item?.image_versions?.items?.[0]?.url
    || item?.display_url
    || item?.images?.standard_resolution?.url
    || item?.images?.low_resolution?.url
    || item?.thumbnail_src
    || item?.url
    || (item?.video_versions?.[0]?.url ?? null);
}

async function fetchInstagramSlideUrls(code) {
  const apiUrl = `https://instagram-scraper-20251.p.rapidapi.com/postdetail/?code_or_url=${code}`;
  const reelRes = await fetch(apiUrl, {
    headers: { 'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com', 'x-rapidapi-key': RAPIDAPI_KEY_CONST },
  });
  if (!reelRes.ok) throw new Error(`Instagram API ${reelRes.status}`);

  const raw = await reelRes.json();
  console.log('IG API raw keys:', Object.keys(raw).slice(0, 10));
  const media = raw?.data || raw?.items?.[0] || raw;
  console.log('IG media keys:', media ? Object.keys(media).slice(0, 20) : 'null');

  // Попробуем все известные структуры карусели
  let carouselItems = null;
  if (Array.isArray(media?.carousel_media) && media.carousel_media.length > 0) {
    carouselItems = media.carousel_media;
  } else if (Array.isArray(media?.children?.items) && media.children.items.length > 0) {
    carouselItems = media.children.items;
  } else if (Array.isArray(media?.edge_sidecar_to_children?.edges) && media.edge_sidecar_to_children.edges.length > 0) {
    carouselItems = media.edge_sidecar_to_children.edges.map(e => e.node ?? e);
  }

  let slideUrls = [];
  if (carouselItems) {
    slideUrls = carouselItems.map(getIgImageUrl).filter(Boolean);
  }

  // Одиночный пост — одна «карусель»
  if (slideUrls.length === 0) {
    const single = getIgImageUrl(media);
    if (single) slideUrls = [single];
  }

  console.log('Extracted slide URLs:', slideUrls.length, slideUrls[0]?.slice(0, 60));
  return slideUrls;
}

// ─── fetch-carousel-slides ─────────────────────────────────────────────────────
// Быстрый шаг 1: только список URL слайдов, без AI

async function handleFetchCarouselSlides(req, res) {
  const { instagram_url, shortcode } = req.body ?? {};
  const code = extractShortcode(instagram_url, shortcode);
  if (!code) return res.status(400).json({ error: 'Не удалось извлечь shortcode из URL' });

  try {
    const slideUrls = await fetchInstagramSlideUrls(code);
    if (slideUrls.length === 0) return res.status(404).json({ error: 'Слайды не найдены. Проверь ссылку.' });
    return res.status(200).json({ slide_count: slideUrls.length, code, slide_urls: slideUrls });
  } catch (err) {
    return res.status(502).json({ error: 'Ошибка Instagram: ' + err.message });
  }
}

// ─── analyze-carousel-from-url ────────────────────────────────────────────────
// Шаг 2: полный AI-анализ. background_slide_index — слайд-основа фона для всех.

async function handleAnalyzeCarouselFromUrl(req, res) {
  const { instagram_url, shortcode, code: codeParam, background_slide_index = 0, regen_first_bg = false, translate = false } = req.body ?? {};
  const code = codeParam || extractShortcode(instagram_url, shortcode);
  if (!code) return res.status(400).json({ error: 'Не удалось извлечь shortcode из URL' });

  console.log('analyze-carousel-from-url: code =', code, '| bg_slide =', background_slide_index, '| regen_first =', regen_first_bg, '| translate =', translate);

  let slideUrls = [];
  try {
    slideUrls = await fetchInstagramSlideUrls(code);
  } catch (err) {
    return res.status(502).json({ error: 'Ошибка Instagram: ' + err.message });
  }
  if (slideUrls.length === 0) return res.status(404).json({ error: 'Слайды не найдены. Проверь ссылку.' });
  if (slideUrls.length > 15) slideUrls = slideUrls.slice(0, 15);

  const VISION_MODELS = ['google/gemini-2.5-flash', 'google/gemini-2.0-flash-001', 'google/gemini-2.0-flash-lite-001'];
  const bgIdx = Math.min(Number(background_slide_index) || 0, slideUrls.length - 1);

  // ── Шаг 1: скачиваем все слайды параллельно ──────────────────
  console.log(`Downloading ${slideUrls.length} slides...`);
  const downloadedImages = await Promise.all(
    slideUrls.map(async (url, idx) => {
      try { return await fetchImageAsBase64(url); }
      catch (err) { console.error(`Download slide ${idx + 1} error:`, err.message); return null; }
    })
  );

  // ── Шаг 2: vision-анализ всех слайдов параллельно (без bg gen) ──
  console.log(`Vision analysis for ${slideUrls.length} slides in parallel...`);
  const visionResults = await Promise.all(
    downloadedImages.map(async (img, idx) => {
      if (!img) return null;
      console.log(`Analyzing slide ${idx + 1}/${slideUrls.length}`);
      try {
        return await analyzeOneSlide(img.base64, img.mimeType, CAROUSEL_ANALYSIS_PROMPT, VISION_MODELS, { skipBgGen: true });
      } catch (err) {
        console.error(`Slide ${idx + 1} vision error:`, err.message);
        return null;
      }
    })
  );

  // ── Шаг 3: bg gen только для bgIdx + опционально slide 0 ─────
  // Определяем какие слайды нуждаются в генерации фона
  const needsBgGen = new Set([bgIdx]);
  if (regen_first_bg && bgIdx !== 0) needsBgGen.add(0);

  await Promise.all([...needsBgGen].map(async (idx) => {
    const img = downloadedImages[idx];
    const parsed = visionResults[idx];
    if (!img || !parsed) return;
    if (parsed.background?.type !== 'image') return; // CSS-фон — генерация не нужна
    console.log(`Generating background for slide ${idx + 1}...`);
    const bgBody = JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      modalities: ['image', 'text'],
      stream: true,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } },
        { type: 'text', text: BG_GENERATION_PROMPT },
      ]}],
    });
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://ririrai.vercel.app', 'X-Title': 'RiRi AI' },
          body: bgBody,
        });
        const rawText = await genRes.text();
        const base64Chunks = [];
        let imageMime = 'image/png';
        for (const line of rawText.split('\n')) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            const delta = chunk?.choices?.[0]?.delta;
            if (delta?.images?.length > 0) {
              const u = delta.images[0]?.image_url?.url;
              if (u?.startsWith('data:')) { const [m, b] = u.split(','); if (m) imageMime = m.replace('data:','').replace(';base64',''); if (b) base64Chunks.push(b); }
            }
            if (Array.isArray(delta?.content)) {
              for (const part of delta.content) {
                if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:')) { const [m, b] = part.image_url.url.split(','); if (m) imageMime = m.replace('data:','').replace(';base64',''); if (b) base64Chunks.push(b); }
              }
            }
          } catch {}
        }
        if (base64Chunks.length > 0) {
          parsed.background = { type: 'image', src: `data:${imageMime};base64,${base64Chunks.join('')}` };
          console.log(`Bg gen slide ${idx + 1} OK`);
          break;
        }
      } catch (err) { console.error(`Bg gen slide ${idx + 1} attempt ${attempt} error:`, err.message); }
    }
  }));

  // ── Шаг 4: применяем общий фон ко всем остальным слайдам ─────
  const sharedBackground = visionResults[bgIdx]?.background ?? null;
  console.log(`Shared bg type: ${sharedBackground?.type ?? 'none'}`);

  const slides = visionResults.map((parsed, idx) => {
    if (!parsed) return null;
    // Слайды с собственным сгенерированным фоном оставляем как есть
    if (needsBgGen.has(idx)) return parsed;
    // Остальные получают sharedBackground
    if (sharedBackground) parsed.background = sharedBackground;
    return parsed;
  }).filter(Boolean);

  // ── Шаг 5 (опционально): перевод текстов на русский ──────────
  if (translate && slides.length > 0) {
    // Собираем все уникальные тексты со всех слайдов
    const allTexts = [];
    for (const slide of slides) {
      for (const el of slide.elements || []) {
        if (el.type === 'text' && el.text) allTexts.push(el.text);
      }
    }
    if (allTexts.length > 0) {
      try {
        console.log(`Translating ${allTexts.length} text elements...`);
        const translateMessages = [{
          role: 'user',
          content: `Переведи каждую строку на русский язык. Верни ТОЛЬКО JSON-массив строк в том же порядке, без пояснений.\n\n${JSON.stringify(allTexts)}`,
        }];
        const { text: translateRaw } = await callOpenRouter({
          apiKey: OPENROUTER_API_KEY,
          model: 'google/gemini-2.5-flash',
          messages: translateMessages,
          temperature: 0.1,
          max_tokens: 2000,
        });
        // parseJsonResponse ищет только объекты {}, для массива парсим напрямую
        const arrayMatch = translateRaw.match(/\[[\s\S]*\]/);
        const translated = arrayMatch ? JSON.parse(arrayMatch[0]) : null;
        if (Array.isArray(translated) && translated.length === allTexts.length) {
          let idx = 0;
          for (const slide of slides) {
            for (const el of slide.elements || []) {
              if (el.type === 'text' && el.text) {
                el.originalText = el.text;
                el.text = translated[idx] || el.text;
                idx++;
              }
            }
          }
          console.log('Translation done');
        }
      } catch (err) {
        console.error('Translation error (non-fatal):', err.message);
        // Не ломаем ответ — просто оставляем оригинальные тексты
      }
    }
  }

  console.log(`Done: ${slides.length}/${slideUrls.length} slides`);
  if (slides.length === 0) return res.status(502).json({ error: 'Не удалось проанализировать слайды' });
  return res.status(200).json({ slides, slide_count: slides.length, total: slideUrls.length });
}

// ─── translate-carousel-texts ────────────────────────────────────────────────

async function handleTranslateCarouselTexts(req, res) {
  const { texts } = req.body ?? {};
  if (!Array.isArray(texts) || texts.length === 0) return res.status(400).json({ error: 'texts[] required' });

  try {
    const { text: raw } = await callOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      model: 'google/gemini-2.5-flash',
      messages: [{
        role: 'user',
        content: `Переведи каждую строку на русский язык. Верни ТОЛЬКО JSON-массив строк в том же порядке, без пояснений.\n\n${JSON.stringify(texts)}`,
      }],
      temperature: 0.1,
      max_tokens: 2000,
    });
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    const translated = arrayMatch ? JSON.parse(arrayMatch[0]) : null;
    if (!Array.isArray(translated) || translated.length !== texts.length) {
      return res.status(502).json({ error: 'Не удалось разобрать перевод' });
    }
    return res.status(200).json({ translated });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}

// ─── regen-background ─────────────────────────────────────────────────────────
// Только генерация фона — без полного анализа. 3 попытки.

async function handleRegenBackground(req, res) {
  const { image_data, mime_type } = req.body ?? {};
  if (!image_data || !mime_type) return res.status(400).json({ error: 'image_data and mime_type required' });

  const bgBody = JSON.stringify({
    model: 'google/gemini-2.5-flash-image',
    modalities: ['image', 'text'],
    stream: true,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime_type};base64,${image_data}` } },
        { type: 'text', text: BG_GENERATION_PROMPT },
      ],
    }],
  });

  for (let attempt = 1; attempt <= 3; attempt++) {
    const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ririrai.vercel.app',
        'X-Title': 'RiRi AI',
      },
      body: bgBody,
    });

    console.log(`regen-background attempt ${attempt} HTTP:`, genRes.status);
    const rawText = await genRes.text();
    const lines = rawText.split('\n');
    const base64Chunks = [];
    let imageMime = 'image/png';

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const delta = chunk?.choices?.[0]?.delta;
        if (delta?.images?.length > 0) {
          const url = delta.images[0]?.image_url?.url;
          if (url?.startsWith('data:')) {
            const [meta, b64] = url.split(',');
            const mime = meta.replace('data:', '').replace(';base64', '');
            if (mime) imageMime = mime;
            if (b64) base64Chunks.push(b64);
          }
        }
        if (Array.isArray(delta?.content)) {
          for (const part of delta.content) {
            if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:')) {
              const [meta, b64] = part.image_url.url.split(',');
              const mime = meta.replace('data:', '').replace(';base64', '');
              if (mime) imageMime = mime;
              if (b64) base64Chunks.push(b64);
            }
          }
        }
      } catch {}
    }

    console.log(`regen-background attempt ${attempt}: base64 parts=${base64Chunks.length}`);
    if (base64Chunks.length > 0) {
      return res.status(200).json({ background: { type: 'image', src: `data:${imageMime};base64,${base64Chunks.join('')}` } });
    }
    console.warn(`regen-background attempt ${attempt}: no image. Raw:`, rawText.slice(0, 300));
  }

  return res.status(502).json({ error: 'Не удалось сгенерировать фон после 3 попыток' });
}

// ─── refine-carousel ──────────────────────────────────────────────────────────
// Принимает оригинал + скриншот результата, возвращает улучшенный JSON элементов.

async function handleRefineCarousel(req, res) {
  const { original_image, original_mime = 'image/jpeg', rendered_image } = req.body;
  if (!original_image || !rendered_image) {
    return res.status(400).json({ error: 'original_image and rendered_image required' });
  }

  const prompt = `Я воссоздаю слайд карусели Instagram в редакторе.

Изображение 1 — ОРИГИНАЛЬНЫЙ слайд (то, что нужно воссоздать).
Изображение 2 — то, что ПОЛУЧИЛОСЬ в редакторе (текущий результат).

Холст редактора = 1080px ширина × 1440px высота (3:4 портрет).
Все координаты x, y, width, height — в ПИКСЕЛЯХ на этом холсте.

Сравни два изображения и верни УЛУЧШЕННЫЙ JSON со всеми элементами.

Обращай особое внимание на:
1. ПОЗИЦИИ: где именно расположены текстовые блоки, фото, кнопки — сравни точно
2. РАЗМЕРЫ ШРИФТОВ: в оригинале крупнее или мельче?
3. КУРСИВ: какие слова в оригинале курсивные, а в результате нет (или наоборот)
4. ПРОПУЩЕННЫЕ ЭЛЕМЕНТЫ: что есть в оригинале, но отсутствует в результате
5. ЛИШНИЕ ЭЛЕМЕНТЫ: что есть в результате, но не было в оригинале
6. ШРИФТ: serif/sans-serif/heavy-sans/display/italic-serif правильно определён?
7. НАКЛОН (rotation): есть ли повёрнутые элементы в оригинале
8. ПОРЯДОК СЛОЁВ (zIndex): что должно быть поверх чего

Верни ТОЛЬКО валидный JSON без markdown — такой же формат как при первом анализе:
{
  "elements": [
    { "type": "text", "text": "...", "x": 86, "y": 115, "fontSize": 72, "fontWeight": 700, "color": "#ffffff", "textAlign": "left", "width": 900, "fontFamily": "serif", "fontStyle": "normal", "rotation": 0, "lineHeight": 1.2, "letterSpacing": 0, "zIndex": 2 },
    { "type": "placeholder", "x": 86, "y": 600, "width": 450, "height": 400, "label": "Фото", "borderRadius": 16, "zIndex": 1 },
    { "type": "shape", "shapeType": "rect", "x": 200, "y": 1200, "width": 680, "height": 120, "fill": "transparent", "stroke": "#1a1a18", "strokeWidth": 3, "borderRadius": 999, "zIndex": 1 }
  ]
}`;

  const VISION_MODELS = [
    'google/gemini-2.5-pro-preview',
    'google/gemini-2.5-flash-preview',
    'google/gemini-2.0-flash-001',
  ];

  const messages = [{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${original_mime};base64,${original_image}` } },
      { type: 'image_url', image_url: { url: `data:image/png;base64,${rendered_image}` } },
      { type: 'text', text: prompt },
    ],
  }];

  let parsed = null;
  let lastErr = null;
  for (const model of VISION_MODELS) {
    try {
      const { text } = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages,
        temperature: 0.1,
        max_tokens: 2000,
      });
      if (!text) continue;
      parsed = parseJsonResponse(text);
      break;
    } catch (err) {
      console.error(`refine-carousel error with ${model}:`, err.message);
      lastErr = err;
      if (err.message?.includes('429')) await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!parsed) return res.status(502).json({ error: lastErr?.message ?? 'Vision API error' });

  return res.status(200).json(parsed);
}

// ── ИИ-хук: семантический поиск + адаптация топ-10 хуков ─────────────────────

async function handleGenerateAiHook(req, res) {
  const { script, reference_transcript, min_views = 50000 } = req.body;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  // Запрос = свой сценарий (приоритет) или транскрипция конкурента
  const queryText = script?.trim() || reference_transcript?.trim();
  if (!queryText) return res.status(400).json({ error: 'Нет текста для поиска' });

  // 1. Embed запрос через Jina
  const embedding = await jinaEmbed(queryText);
  if (!embedding) return res.status(502).json({ error: 'Embedding failed' });

  // 2. Топ-20 ближайших хуков из базы
  const viralHooks = await matchViralHooks(embedding, { minViews: min_views, limit: 20 });
  if (!viralHooks?.length) {
    return res.status(200).json({ success: true, hooks: [], message: 'Похожих хуков не найдено' });
  }

  // 3. Claude: выбрать топ-10, адаптировать, объяснить
  const hooksListText = viralHooks.map((h, i) => {
    const views = h.view_count >= 1_000_000
      ? `${(h.view_count / 1_000_000).toFixed(1)}М`
      : `${Math.round(h.view_count / 1000)}К`;
    return `${i + 1}. [${views} просмотров | ниша: ${h.niche} | @${h.owner_username || '?'}]\nОРИГИНАЛ: ${h.content}\nURL: ${h.url || '—'}`;
  }).join('\n\n');

  const userText = `Ты эксперт по вирусному контенту. У тебя есть сценарий пользователя и 20 реальных хуков из вирусных видео (100k+ просмотров), подобранных семантически.

СЦЕНАРИЙ ПОЛЬЗОВАТЕЛЯ:
---
${queryText.slice(0, 2000)}
---

НАЙДЕННЫЕ ВИРУСНЫЕ ХУКИ (топ-20 по семантической близости):
${hooksListText}

Твоя задача:
1. Выбери 10 ЛУЧШИХ хуков из списка — те, что наиболее релевантны теме и стилю сценария пользователя
2. Для каждого — адаптируй хук под конкретный сценарий (минимальные изменения, сохрани структуру и технику)
3. Объясни коротко (1-2 предложения) ПОЧЕМУ этот хук цепляет — какую психологическую технику использует

Верни строго JSON:
{
  "hooks": [
    {
      "original": "оригинальный хук как есть",
      "adapted": "адаптированная версия под сценарий пользователя",
      "explanation": "почему этот хук работает",
      "views": "строка вида 1.2М или 340К",
      "niche": "ниша",
      "url": "ссылка или null",
      "owner_username": "ник или null"
    }
  ]
}`;

  try {
    const { text: rawText } = await callOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      model: MODELS.CLAUDE_SONNET_35,
      messages: [{ role: 'user', content: userText }],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, hooks: parsed.hooks || [] });
  } catch (err) {
    console.error('generate-ai-hook error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// Этап 2: полный сценарий за один проход (хук+тело+концовка), 5 вариантов JARVIS-style.
// Каждый вариант = адаптация одного из retrieved скелетов. Хук опционально pinned.
async function handleGenerateFullScript(req, res) {
  const {
    topic,
    reference_transcript,
    hook_text,
    niche = null,
    tone_profile = null,
    length_preference = null, // 15 | 30 | 60 | null
    cta_intent = null,        // 'soft_loop' | 'save_bait' | 'comment_bait' | 'profile_visit' | null
    min_views = 50000,
  } = req.body;

  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  // Запрос: idea > reference_transcript > hook_text
  const queryText = topic?.trim() || reference_transcript?.trim() || hook_text?.trim();
  if (!queryText) return res.status(400).json({ error: 'Нет идеи, референса или хука для генерации' });

  // 1. Embed запрос
  const embedding = await jinaEmbed(queryText);
  if (!embedding) return res.status(502).json({ error: 'Embedding failed' });

  // 2. Фильтр длины (опционально)
  let minSeconds = null;
  let maxSeconds = null;
  if (length_preference === 15) { minSeconds = 10; maxSeconds = 22; }
  else if (length_preference === 30) { minSeconds = 20; maxSeconds = 40; }
  else if (length_preference === 60) { minSeconds = 40; maxSeconds = 90; }

  // 3. Параллельно retrieval всех 4 слоёв (5 скелетов + по 3 inspiration текста)
  const [skeletons, hooks, bodies, ctas] = await Promise.all([
    matchSkeletons(embedding, {
      niche,
      minViews: min_views,
      minSeconds,
      maxSeconds,
      limit: 5,
    }),
    matchViralHooks(embedding, {
      niche,
      minViews: min_views,
      limit: 3,
    }),
    matchViralParts(embedding, 'body', {
      niche,
      minViews: min_views,
      limit: 3,
    }),
    matchViralParts(embedding, 'cta', {
      niche,
      minViews: min_views,
      limit: 3,
    }),
  ]);

  if (!skeletons?.length) {
    return res.status(200).json({
      success: false,
      variants: [],
      message: 'В базе пока нет похожих скелетов. Попробуй другую тему или подожди пока база наполнится.',
    });
  }

  // 4. Сериализация retrieved для промпта
  const formatViews = (vc) => vc >= 1_000_000
    ? `${(vc / 1_000_000).toFixed(1)}М`
    : `${Math.round(vc / 1000)}К`;

  const skeletonsText = skeletons.map((s, i) => {
    const sectionsStr = Array.isArray(s.sections)
      ? s.sections.map(sec => `${sec.start_sec}-${sec.end_sec}s ${sec.type}: ${sec.purpose || ''}`).join(' | ')
      : '';
    const transitionsStr = Array.isArray(s.key_transitions) ? s.key_transitions.join('; ') : '';
    return `СКЕЛЕТ ${i + 1} | ${s.total_seconds}с | ${s.format_type} | хук: ${s.hook_type} | CTA: ${s.cta_type} | темп: ${s.pacing}
Структура: ${s.structure_summary}
Секции: ${sectionsStr}
Переходы: ${transitionsStr}
Источник: @${s.owner_username || '?'} (${formatViews(s.view_count || 0)} views)`;
  }).join('\n\n');

  const hooksText = hooks?.length
    ? hooks.map((h, i) => `${i + 1}. [${formatViews(h.view_count || 0)}] ${h.content}`).join('\n')
    : 'Дополнительных хуков по теме не найдено.';

  const bodiesText = bodies?.length
    ? bodies.map((b, i) => `${i + 1}. [${formatViews(b.view_count || 0)}] ${(b.content || '').slice(0, 280)}`).join('\n')
    : 'Тел виральных видео по теме не найдено.';

  const ctasText = ctas?.length
    ? ctas.map((c, i) => `${i + 1}. [${formatViews(c.view_count || 0)}] ${c.content}`).join('\n')
    : 'Концовок виральных видео по теме не найдено.';

  const toneSection = tone_profile
    ? `ПРОФИЛЬ ГОЛОСА АВТОРА:
${typeof tone_profile === 'string' ? tone_profile : JSON.stringify(tone_profile, null, 2)}

Каждое предложение должно звучать так, как сказал бы именно этот автор. Используй его словарь, темп, типичные обороты.`
    : 'ПРОФИЛЬ ГОЛОСА: не задан, используй живой разговорный русский без канцеляризмов.';

  const ctaSection = cta_intent
    ? `ЦЕЛЬ КОНЦОВКИ (CTA intent): ${cta_intent}
- soft_loop: возврат к хуку с новым смыслом, без явного призыва
- save_bait: ценность которую захочется пересмотреть/сохранить
- comment_bait: вопрос или провокация для комментария
- profile_visit: лёгкий призыв зайти в профиль за продолжением`
    : 'CTA: используй cta_type из каждого скелета.';

  const hookSection = hook_text?.trim()
    ? `ВЫБРАННЫЙ ХУК (используй его в КАЖДОМ варианте без изменений в первой строке):
"""
${hook_text.trim()}
"""`
    : '';

  const userPrompt = `Ты сценарист коротких видео для Instagram Reels / TikTok / YouTube Shorts.
Сгенерируй 3 РАЗНЫХ варианта полного сценария (хук + тело + концовка) на основе идеи автора, используя структурные скелеты вирусных видео и tone профиль.

ИДЕЯ:
"""
${queryText.slice(0, 2500)}
"""

${hookSection}

${toneSection}

СТРУКТУРНЫЕ СКЕЛЕТЫ ИЗ ВИРУСНЫХ ВИДЕО (используй ПЕРВЫЕ ТРИ как каркас, по одному на вариант):

${skeletonsText}

5 ВИРУСНЫХ ХУКОВ ПО ПОХОЖИМ ТЕМАМ (для inspiration языка хука, не копировать):
${hooksText}

5 ВИРУСНЫХ ТЕЛ ПО ПОХОЖИМ ТЕМАМ (как разворачивают тему в нише — формулировки, переходы, ритм):
${bodiesText}

5 ВИРУСНЫХ КОНЦОВОК ПО ПОХОЖИМ ТЕМАМ (как закрывают видео в нише):
${ctasText}

${ctaSection}

ПРАВИЛА:
1. 3 варианта = первые 3 разных скелета выше. Каждый вариант — адаптация ОДНОГО скелета по индексу 1..3.
2. Длина hook+body+ending в словах ≈ total_seconds × 2.5 (±20%).
3. Hook = 1-3 предложения, цепляют с первой секунды.
4. Body = непрерывный текст основной части, разверни идею по структуре скелета.
5. Ending — по cta_type скелета (или по cta_intent если задан). Для soft_loop концовка возвращает к хуку с новым смыслом.
6. Shot list — для каждой секции скелета: что говорится / что показывается в кадре.
7. Запрещены generic-фразы: "в современном мире", "не стоит недооценивать", "интересно но...", "представьте себе", "согласитесь" и подобный AI-канцелярит.
8. Если задан ВЫБРАННЫЙ ХУК — он должен идти первой строкой каждого варианта без изменений.

Верни СТРОГО JSON без markdown:
{
  "variants": [
    {
      "skeleton_index": 1,
      "total_seconds": <число>,
      "format_type": "...",
      "hook": "...",
      "body": "...",
      "ending": "...",
      "shot_list": [
        {"section": "hook", "speech": "...", "on_screen": "..."},
        {"section": "context", "speech": "...", "on_screen": "..."}
      ],
      "source_reference": {
        "owner_username": "...",
        "view_count": <число>,
        "url": "..."
      }
    }
  ]
}`;

  try {
    // Flash primary (быстрее Pro в 3-5×), Pro fallback если Flash облажается.
    // Снизили count с 5 до 3 вариантов чтобы output JSON помещался в 4500 токенов
    // и не обрезался на середине (было: SyntaxError: Unterminated string).
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.PRO_3],
      [{ role: 'user', content: userPrompt }],
      {
        temperature: 0.7,
        max_tokens: 4500,
        response_format: { type: 'json_object' },
      },
    );
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);

    // Дополним source_reference из retrieved-скелетов на случай если модель не вернула
    const variants = Array.isArray(parsed.variants) ? parsed.variants.map((v) => {
      const idx = Number(v.skeleton_index);
      const sk = idx >= 1 && idx <= skeletons.length ? skeletons[idx - 1] : null;
      const ref = v.source_reference || {};
      return {
        ...v,
        source_reference: sk ? {
          owner_username: ref.owner_username || sk.owner_username || null,
          view_count: ref.view_count || sk.view_count || null,
          url: ref.url || sk.url || null,
        } : ref,
      };
    }) : [];

    return res.status(200).json({
      success: true,
      variants,
      retrieved: {
        skeletons_count: skeletons.length,
        hooks_count: hooks?.length || 0,
        bodies_count: bodies?.length || 0,
        ctas_count: ctas?.length || 0,
      },
    });
  } catch (err) {
    console.error('generate-full-script error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}
