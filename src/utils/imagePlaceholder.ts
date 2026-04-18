/**
 * Inline SVG placeholder — не требует внешних запросов, работает везде.
 * Решает проблему DNS блокировки via.placeholder.com.
 */
export function getPlaceholderDataUri(width = 270, height = 360): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect fill="#e2e8f0" width="100%" height="100%"/><text x="50%" y="50%" fill="#94a3b8" font-size="14" text-anchor="middle" dy=".3em" font-family="system-ui,sans-serif">?</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Плейсхолдер 270x360 (карточки видео) */
export const PLACEHOLDER_270x360 = getPlaceholderDataUri(270, 360);
/** Плейсхолдер 200x356 */
export const PLACEHOLDER_200x356 = getPlaceholderDataUri(200, 356);
/** Плейсхолдер 200x267 */
export const PLACEHOLDER_200x267 = getPlaceholderDataUri(200, 267);
/** Плейсхолдер 320x400 */
export const PLACEHOLDER_320x400 = getPlaceholderDataUri(320, 400);
/** Плейсхолдер 320x420 */
export const PLACEHOLDER_320x420 = getPlaceholderDataUri(320, 420);
/** Плейсхолдер 64x96 */
export const PLACEHOLDER_64x96 = getPlaceholderDataUri(64, 96);
/** Плейсхолдер 400x600 */
export const PLACEHOLDER_400x600 = getPlaceholderDataUri(400, 600);

/**
 * Распаковывает wsrv.nl обёртки (в т.ч. двойные) — достаёт оригинальный URL.
 * В БД могли сохраниться wsrv.nl ссылки, которые дают 404.
 */
function unwrapWsrvUrl(url: string): string {
  if (!url?.includes('wsrv.nl')) return url;
  try {
    const match = url.match(/[?&]url=([^&]+)/);
    if (match) {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.includes('wsrv.nl')) return unwrapWsrvUrl(decoded);
      return decoded;
    }
  } catch {
    /* ignore */
  }
  return url;
}

/**
 * URL для отображения изображений.
 * - Распаковывает wsrv.nl (в БД могли остаться битые ссылки)
 * - Прямые URL (Instagram, workers.dev) — запрос с IP пользователя
 * - Если есть shortcode — использует наш умный прокси /api/proxy-image (авто-оживление)
 * - При ошибке onError → refresh → сохранение в Storage
 */
export function proxyImageUrl(url?: string, shortcode?: string, emptyPlaceholder = PLACEHOLDER_270x360): string {
  if (!url) return emptyPlaceholder;
  if (url.startsWith('data:')) return url;
  
  // Если у нас есть shortcode, используем наш прокси, который умеет оживлять ссылки
  if (shortcode && (url.includes('cdninstagram.com') || url.includes('fbcdn.net') || url.includes('workers.dev'))) {
    return `/api/proxy-image?shortcode=${shortcode}`;
  }

  const unwrapped = unwrapWsrvUrl(url);
  if (unwrapped.includes('wsrv.nl')) return emptyPlaceholder;
  return unwrapped;
}
