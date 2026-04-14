# Целевая Архитектура RiRi AI

## Обзор
Переход от Vercel Serverless (JS) монолита к микросервисной (в рамках монорепо) архитектуре с использованием Go для высоконагруженных задач, очередей для обработки AI и React/Vite для фронтенда.

## Схема
```text
┌─────────────────────────────────────┐
│             Frontend (TS)           │
│         React 18 + Vite (SPA)       │
│  - UI: Tailwind, Framer Motion      │
│  - State: Zustand                   │
│  - Collab: Yjs (WebRTC/IndexedDB)   │
└──────────────┬──────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼──────────────────────┐
│             Backend (Go)            │
│  - API Framework: Chi / Fiber       │
│  - AI API Gateway: (Retry, Fallback)│
│  - Auth: Supabase Auth Middleware   │
│  - Worker Pool: Asynq (Jobs)        │
└──────┬───────────────┬──────────────┘
       │               │
┌──────▼──────┐  ┌─────▼──────────────┐
│  PostgreSQL │  │    Redis (Asynq)   │
│ (Supabase)  │  │  - Async Queues    │
│ + pgxpool   │  │  - Rate Limiting   │
└─────────────┘  └────────────────────┘
```

## Ключевые паттерны

### 1. AI API Gateway (Internal)
Интеграция с OpenRouter, AssemblyAI и другими провайдерами вынесена в единый Gateway. 
Используются паттерны Circuit Breaker и Retry (через `failsafe-go` или `go-retryablehttp`) для защиты от `HTTP 429` и таймаутов внешних сервисов.

### 2. Async Job Queue
Задачи, превышающие 10 секунд (например, транскрибация видео, генерация сложных фонов, глубокий анализ сценариев), ставятся в очередь через **Asynq (Redis)**. 
Фронтенд поллит статус или получает апдейты через Supabase Realtime / WebSocket.

### 3. Repository Pattern
Вся работа с БД инкапсулирована в интерфейсы (например, `VideoRepository`). SQL-запросы генерируются через `sqlc` для type-safety.

### 4. Configuration
Конфигурация через `cleanenv` или `viper`. Секреты не хардкодятся в коде, только через `env` переменные (`OPENROUTER_API_KEY`, `ASSEMBLYAI_KEY` и т.д.).
