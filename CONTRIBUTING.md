# Contributing Guidelines

Добро пожаловать в разработку **RiRi AI**. Пожалуйста, следуйте правилам ниже для эффективной командной работы.

## Git Workflow
- Основная ветка: `main` (всегда деплоится в production).
- Ветки для фич: `feature/short-description`.
- Ветки для багов: `fix/bug-name`.
- Релизы или техдолг: `chore/` или `release/`.

## Соглашение о коммитах (Conventional Commits)
- `feat: [описание]` — новая фича
- `fix: [описание]` — исправление бага
- `refactor: [описание]` — переписывание кода без изменения поведения
- `chore: [описание]` — обновление зависимостей, скрипты, инфраструктура

Пример: `feat: add async queue for video transcription`

## Code Review Checklist
Перед созданием Pull Request (PR) проверьте себя:
- [ ] Нет прямых вызовов AI API без обёртки (Gateway).
- [ ] Все новые `env` переменные добавлены в `.env.example` (и не содержат реальных секретов).
- [ ] Добавлена/изменена миграция БД в папку `supabase/migrations` (если применимо).
- [ ] Новые эндпоинты задокументированы или покрыты тестами.
- [ ] Пройден линтер (`make lint`) и тесты (`make test`).

## Секреты (Secrets Management)
- **Локально**: Используйте `.env` или `.env.local` (эти файлы в `.gitignore`).
- **CI/CD**: Для деплоя используйте GitHub Actions Secrets / GitLab Variables.
- **Никогда** не коммитьте ключи OpenRouter, AssemblyAI или Supabase Anon/Service Role ключи в репозиторий.
