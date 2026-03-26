// Vercel Serverless — RiRi AI Assistant: чат с памятью (mem0) + OpenRouter (Gemini Flash)

import { callOpenRouter, MODELS } from '../lib/openRouter.js';
import { RIRI_SYSTEM_PROMPT } from '../lib/ririKnowledge.js';
import { logApiCall } from '../lib/logApiCall.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MEM0_API_KEY = process.env.MEM0_API_KEY;
const MEM0_BASE = 'https://api.mem0.ai/v1';

// --- mem0 helpers ---

async function mem0Search(userId, query) {
  if (!MEM0_API_KEY) return [];
  try {
    const res = await fetch(`${MEM0_BASE}/memories/search/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${MEM0_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, user_id: String(userId), limit: 5 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || data || []).map(m => m.memory || m.text || '').filter(Boolean);
  } catch {
    return [];
  }
}

async function mem0Add(userId, messages) {
  if (!MEM0_API_KEY) return;
  try {
    await fetch(`${MEM0_BASE}/memories/`, {
      method: 'POST',
      headers: {
        Authorization: `Token ${MEM0_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        user_id: String(userId),
      }),
    });
  } catch {
    // не блокируем ответ при ошибке записи
  }
}

// --- handler ---

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
    // 1. Поиск релевантных воспоминаний о юзере
    const memories = await mem0Search(userId, message);

    // 2. Собираем system prompt с памятью
    let systemContent = RIRI_SYSTEM_PROMPT;
    if (memories.length > 0) {
      systemContent += `\n\n## Что ты помнишь об этом пользователе:\n${memories.map(m => `- ${m}`).join('\n')}`;
    }

    // 3. Формируем сообщения для LLM
    const messages = [
      { role: 'system', content: systemContent },
      // Последние 10 сообщений из истории для контекста
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    // 4. Вызываем Gemini Flash через OpenRouter
    const { text } = await callOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      model: MODELS.FLASH,
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    // 5. Сохраняем разговор в mem0 (async, не ждём)
    mem0Add(userId, [
      { role: 'user', content: message },
      { role: 'assistant', content: text },
    ]);

    return res.status(200).json({ success: true, text });
  } catch (err) {
    console.error('RiRi chat error:', err);
    return res.status(500).json({ error: 'Ой, что-то пошло не так. Попробуй ещё раз! 💫' });
  }
}
