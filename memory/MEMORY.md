# Telegram Content CRM — Memory

## Project Overview
**RiRi** — ассистент для креаторов и команд, связанных с контентом. Visual CRM for content creators. React + TypeScript + Vite app, deployed as Telegram Mini App.
Working directory: `/Users/sergeyzolotykh/telegram-content-crm`
Worktrees: `/Users/sergeyzolotykh/telegram-content-crm/.claude/worktrees/`

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui + Framer Motion
- Zustand (canvas state), Context API (global state)
- ReactFlow (canvas/workspace)
- Supabase (DB + real-time)
- @twa-dev/sdk (Telegram Mini App)

## Architecture
- `src/App.tsx` — root, routing between views (dashboard, workspace, canvas, history, profile, scriptwriter, analytics)
- `src/contexts/` — AuthContext, ProjectContext, TokenBalanceContext
- `src/stores/flowStore.ts` — Zustand for ReactFlow canvas state
- `src/hooks/` — 15+ custom hooks (useAuth, useProjects, useInboxVideos, useCarousels, useRadar, useActionHistory, useScriptDrafts, useProjectAnalytics, etc.)
- `src/services/` — videoService, globalVideoService, transcriptionService, profileStatsService
- `src/components/` — page components (Dashboard, Workspace, Analytics, AIScriptwriter, ProfilePage, History, LandingPage)
- `src/components/ui/` — 28+ reusable UI components
- `src/utils/supabase.ts` — DB client
- `src/constants/` — token costs

## Key Features
- Multi-project, multi-folder structure with sharing/invitations
- Incoming videos inbox (from Telegram bot)
- ReactFlow canvas for video references + scripts
- AI script generation (token-based economy)
- Carousels support
- Real-time collaboration (useProjectSync)
- Analytics per project/responsible
- Radar (global search/discovery)
- Action history (undo/redo)
- Mobile-first (sidebar + mobile bottom bar)

## Language
UI is in Russian. Commit messages are in Russian.

## Workflow
- [feedback_commit_and_push.md](feedback_commit_and_push.md) — после каждого изменения коммитить и пушить

---

## 🔑 РАБОЧАЯ ФОРМУЛА: AI Carousel Generator (api/scriptwriter.js)

### Шаг 1 — Анализ изображения (Vision)
```js
const VISION_MODELS = [
  'google/gemini-2.5-flash',          // primary
  'google/gemini-2.0-flash-001',      // fallback 1
  'google/gemini-2.0-flash-lite-001', // fallback 2
];
// Обычный JSON chat completion (НЕ stream), temperature: 0.1, max_tokens: 4000
// Возвращает JSON с background + elements (text, placeholder, shape)
// Координаты в ПИКСЕЛЯХ 1080×1440px (конвертируются в % на фронте)
```

### Шаг 2 — Генерация фона (Image Generation)
```js
// КРИТИЧНО: эти 3 параметра обязательны для работы image generation через OpenRouter
model: 'google/gemini-2.5-flash-image',
modalities: ['image', 'text'],   // ← без этого модель не генерит изображение
stream: true,                     // ← без этого тоже не работает

// Парсинг SSE-ответа:
// lines.split('\n') → фильтровать 'data: ' → JSON.parse(line.slice(6))
// → delta.images[0].image_url.url (data:image/png;base64,...)
// → delta.content[].image_url.url (альтернативный путь)

// 3 попытки (attempt 1-3), при провале — возвращаем карусель без фона
```

### Actions в api/scriptwriter.js
- `analyze-carousel` — полный анализ: Step1 (vision) + Step2 (bg gen, 3 попытки)
- `regen-background` — только Step2 (bg gen, 3 попытки), без re-анализа
- `refine-carousel` — рефайн элементов через vision (не используется автоматически, вручную)

### Фронтенд (CarouselEditor.tsx)
- `px2x/px2y/px2w/px2h` — конвертеры пиксели→проценты (делитель 1080 или 1440)
- FONT_MAP: `'heavy-sans' → 'Montserrat'`, `'display' → 'Bebas Neue'`, `'serif' → 'Playfair Display'`
- fontWeight: 400/700/800/900 (900 = ультражирный)
- fontSize максимум 220px (при ширине 1080)
- zIndex: 1=фон, 2=контент, 3=поверх всего

### SlideCanvas.tsx — Canva-style редактор
- Текст: двойной клик = режим редактирования; innerHTML управляется через ref+useEffect (НЕ dangerouslySetInnerHTML)
- 8 ручек ресайза (4 угла + 4 края), стиль как в Canva (белые квадратики с фиолетовой рамкой)
- Перемещение = drag по телу элемента
- Inline форматирование: document.execCommand('bold'/'italic'/'removeFormat')
- zIndex сортировка перед рендером: `[...slide.elements].sort((a,b) => (a.zIndex??1)-(b.zIndex??1))`

### index.html — шрифты (обязательно все веса)
- Montserrat: wght@400;700;800;900
- Inter: wght@400;500;600;700;800;900
- Playfair Display: 700
- Bebas Neue: 400
