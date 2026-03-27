// Vercel Serverless — RiRi AI Assistant: streaming SSE + mem0 + OpenRouter Gemini Flash

import { RIRI_SYSTEM_PROMPT } from '../lib/ririKnowledge.js';
import { logApiCall } from '../lib/logApiCall.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MEM0_API_KEY = process.env.MEM0_API_KEY;
const MEM0_BASE = 'https://api.mem0.ai/v1';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function mem0Search(userId, query) {
  if (!MEM0_API_KEY) return [];
  try {
    const res = await fetch(`${MEM0_BASE}/memories/search/`, {
      method: 'POST',
      headers: { Authorization: `Token ${MEM0_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_id: String(userId), limit: 5 }),
    });
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

    const llmMessages = [
      { role: 'system', content: systemContent },
      ...history.slice(-10),
      { role: 'user', content: message },
    ];

    // Streaming SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: llmMessages,
        temperature: 0.7,
        max_tokens: 1200,
        stream: true,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      res.write(`data: ${JSON.stringify({ error: err })}\n\n`);
      res.end();
      return;
    }

    let fullText = '';
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // неполная строка остаётся в буфере

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const chunk = JSON.parse(raw);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
          }
        } catch { /* пропускаем битые чанки */ }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    // Сохраняем в mem0 после завершения
    if (fullText) {
      mem0Add(userId, [
        { role: 'user', content: message },
        { role: 'assistant', content: fullText },
      ]);
    }
  } catch (err) {
    console.error('RiRi chat error:', err);
    try {
      res.write(`data: ${JSON.stringify({ error: 'Что-то пошло не так. Попробуй ещё раз.' })}\n\n`);
      res.end();
    } catch { res.status(500).end(); }
  }
}
