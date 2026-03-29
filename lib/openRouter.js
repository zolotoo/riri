/**
 * OpenRouter API client — OpenAI-совместимый endpoint.
 * Документация: https://openrouter.ai/docs/api-reference/overview
 *
 * Использует модели Google Gemini через OpenRouter (google/gemini-2.5-flash и др.)
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Модели Gemini в OpenRouter (provider/model) */
export const MODELS = {
  FLASH: 'google/gemini-2.5-flash',
  FLASH_3: 'google/gemini-3-flash-preview',
  PRO_3: 'google/gemini-3-pro-preview',
};

/** Порядок моделей для fallback при 429 */
export const MODELS_FALLBACK = [
  MODELS.FLASH,
  MODELS.FLASH_3,
  MODELS.PRO_3,
];

/**
 * Вызов OpenRouter Chat Completions API
 * @param {Object} opts
 * @param {string} opts.apiKey - OpenRouter API key (sk-or-v1-...)
 * @param {string} [opts.model] - Model ID (default: google/gemini-2.5-flash)
 * @param {Array<{role: string, content: string|Array}>} opts.messages - OpenAI-format messages
 * @param {number} [opts.temperature]
 * @param {number} [opts.max_tokens]
 * @param {Object} [opts.response_format] - { type: 'json_object' } для JSON
 * @returns {Promise<{text: string, usage?: Object}>}
 */
export async function callOpenRouter({
  apiKey,
  model = MODELS.FLASH,
  messages,
  temperature = 0.3,
  max_tokens,
  response_format,
}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const body = {
    model,
    messages,
    temperature,
    ...(max_tokens != null && { max_tokens }),
    ...(response_format && { response_format }),
  };

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const rawBody = await res.text();

  if (!res.ok) {
    throw new Error(`OpenRouter API ${res.status}: ${rawBody.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    // OpenRouter иногда возвращает 200 с plain-text ошибкой ("An error occurred...")
    throw new Error(`OpenRouter non-JSON response: ${rawBody.slice(0, 200)}`);
  }

  const text = data?.choices?.[0]?.message?.content?.trim() ?? '';
  const usage = data?.usage;

  return { text, usage };
}

/**
 * Конвертирует Gemini inlineData (base64) в OpenAI image_url для OpenRouter
 * @param {{inlineData: {mimeType: string, data: string}}} part
 * @returns {{type: 'image_url', image_url: {url: string}}}
 */
export function geminiPartToOpenRouterImage(part) {
  const { mimeType = 'image/jpeg', data } = part.inlineData || {};
  return {
    type: 'image_url',
    image_url: { url: `data:${mimeType};base64,${data}` },
  };
}
