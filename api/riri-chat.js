// Vercel Serverless — RiRi AI Assistant: mem0 + OpenRouter Gemini Flash

import { callOpenRouter, MODELS } from '../lib/openRouter.js';
import { RIRI_SYSTEM_PROMPT } from '../lib/ririKnowledge.js';
import { logApiCall } from '../lib/logApiCall.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MEM0_API_KEY = process.env.MEM0_API_KEY;
const MEM0_BASE = 'https://api.mem0.ai/v1';

async function mem0Search(userId, query) {
  if (!MEM0_API_KEY) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${MEM0_BASE}/memories/search/`, {
      method: 'POST',
      headers: { Authorization: `Token ${MEM0_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_id: String(userId), limit: 5 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || data || []).map(m => m.memory || m.text || '').filter(Boolean);
  } catch { return []; }
}

async function mem0Add(userId, messages) {
  if (!MEM0_API_KEY) return;
  try {
    await fetch(`${MEM0_BASE}/memories/`, {
      method: 'POST',
      headers: { Authorization: `Token ${MEM0_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        user_id: String(userId),
      }),
    });
  } catch { /* не блокируем */ }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userId, message, history = [] } = req.body || {};

  if (!message) return res.status(400).json({ error: 'message is required' });
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  logApiCall({ apiName: 'openrouter', action: 'riri-chat', userId });

  try {
    const memories = await mem0Search(userId, message);

    let systemContent = RIRI_SYSTEM_PROMPT;
    if (memories.length > 0) {
      systemContent += `\n\nЧто ты знаешь об этом пользователе:\n${memories.join('\n')}`;
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    const { text } = await callOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      model: MODELS.FLASH,
      messages,
      temperature: 0.7,
      max_tokens: 1200,
    });

    // Сохраняем в mem0 без ожидания
    mem0Add(userId, [
      { role: 'user', content: message },
      { role: 'assistant', content: text },
    ]);

    return res.status(200).json({ success: true, text });
  } catch (err) {
    console.error('RiRi chat error:', err?.message || err);
    const isKeyMissing = !OPENROUTER_API_KEY;
    const msg = isKeyMissing
      ? 'API ключ не настроен'
      : err?.message?.includes('401') || err?.message?.includes('403')
        ? 'Ошибка авторизации API'
        : 'Что-то пошло не так. Попробуй ещё раз.';
    return res.status(500).json({ error: msg, detail: err?.message?.slice(0, 200) });
  }
}
