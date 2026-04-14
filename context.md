# Project Context: RiRi AI

## One-liner
AI-powered workspace for video content creators to analyze trends, generate scripts, and recreate Instagram carousels.

## Stack
- **Frontend**: React 18, Vite, TS, Zustand, Tailwind, Framer Motion, React Flow.
- **Backend**: Vercel Serverless Functions (Node.js).
- **Database**: Supabase (Auth, Postgres, Realtime, Storage).
- **Sync**: Yjs, WebRTC, IndexedDB (for real-time collaboration).

## External AI APIs
- **OpenRouter**: Primary gateway for LLMs. Models: `google/gemini-2.5-flash`, `google/gemini-3-pro`, `google/gemini-2.0-flash-001`.
- **AssemblyAI**: Video speech-to-text transcription.
- **Mem0**: User-specific memory for AI chat.
- **RapidAPI**: Instagram data scraping (`instagram-scraper-20251`).
- **Resend**: Email delivery.

## Directory Map
- `api/`: Backend endpoints (transcription, script generation, chat, carousel analysis).
- `src/components/`: Core UI modules (AIScriptwriter, CarouselEditor, Workspace, Radar).
- `src/hooks/`: Data fetching and state logic (useAuth, useProjects, useVideoComments).
- `src/services/`: API client abstractions.
- `lib/`: Shared backend utilities (OpenRouter wrapper, logging).
- `supabase/migrations/`: SQL schema and RLS policies.

## Entry Points
- `src/main.tsx`: App initialization and providers.
- `src/App.tsx`: Main routing and view management (`viewMode`).
- `api/*.js`: Serverless entry points for specific features.

## Core Modules
- **Scriptwriter**: Extracts style from references, generates scripts via iterative chat (`api/scriptwriter.js`).
- **Carousel Editor**: Vision-based structural analysis and background regeneration (`api/scriptwriter.js` - `analyze-carousel`).
- **RiRi Chat**: Memory-augmented AI assistant (`api/riri-chat.js`).
- **Transcription**: Video (AssemblyAI) & Carousel (Gemini Vision) processing (`api/transcribe.js`).

## Data Flow
User Input (URL/Prompt) → Frontend Service → Vercel API → OpenRouter/AI Provider → Result Storage (Supabase) → UI Update (Zustand/Realtime).

## Key Conventions
- **API Communication**: All AI logic is hidden behind `api/` endpoints.
- **State Management**: Zustand for global UI state; Supabase for persistence.
- **Styling**: Tailwind CSS with Radix UI primitives.
- **Error Handling**: `logApiCall` utility for tracking backend failures and token usage.

## Testing
- Linting: `npm run lint`.
- Validation: Manual verification of API responses via logs in `api_usage_log` table.

## Known Limitations / TODO
- Token balance tracking is implemented but requires careful sync with provider usage.
- Instagram CDN URLs expire; proxying is implemented in `api/download-video.js`.
