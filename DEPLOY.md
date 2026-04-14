# Деплой RiRi AI

## Инфраструктура
- **Сервер**: 95.182.100.126 (Ubuntu VPS)
- **Панель управления**: [http://95.182.100.126:3000](http://95.182.100.126:3000)
- **Приложения**: 
  - `frontend`: React SPA, работающее в Nginx (порт 80 внутри контейнера).
  - `backend`: Node.js (Express) сервер, проксирующий Vercel-функции (порт 3000 внутри контейнера).

## Автодеплой
- **Триггер**: Любой `push` в ветку `main`.
- **Процесс**:
  1. GitHub Actions собирает фронтенд локально (`npm run build`), вшивая переменные `VITE_`.
  2. Готовый билд (`dist/`) упаковывается и отправляется в CapRover.
  3. Бэкенд упаковывается из исходников и собирается внутри Docker на стороне сервера.
- **Где смотреть статус**: GitHub Repository → Tab **Actions**.

## Ручной деплой (если CI упал)

### Backend
```bash
tar -czf /tmp/backend.tar.gz --exclude='./node_modules' --exclude='./.git' --exclude='./dist' -C . .
# Получите токен через POST /api/v2/login (пароль: captain42)
curl -X POST http://95.182.100.126:3000/api/v2/user/apps/appData/backend \
  -H "x-captain-auth: <TOKEN>" \
  -F "sourceFile=@/tmp/backend.tar.gz"
```

### Frontend
1. Соберите проект локально: `npm run build` (убедитесь, что в .env.local верные ключи).
2. Создайте архив: `tar -czf /tmp/frontend.tar.gz dist/ nginx.conf Dockerfile.frontend.simple captain-definition-frontend`.
3. Отправьте в CapRover:
```bash
curl -X POST http://95.182.100.126:3000/api/v2/user/apps/appData/frontend \
  -H "x-captain-auth: <TOKEN>" \
  -F "sourceFile=@/tmp/frontend.tar.gz"
```

## Переменные окружения

| Переменная | Где используется | Обязательная? |
| :--- | :--- | :--- |
| `CAPROVER_PASSWORD` | CI/CD (GitHub Secrets) | Да |
| `VITE_SUPABASE_URL` | Frontend (Билд) | Да |
| `VITE_SUPABASE_ANON_KEY`| Frontend (Билд) | Да |
| `OPENROUTER_API_KEY` | Backend (Runtime) | Да |
| `SUPABASE_URL` | Backend (Runtime) | Да |
| `SUPABASE_SERVICE_ROLE_KEY`| Backend (Runtime) | Да |
| `TELEGRAM_BOT_TOKEN` | Backend (Runtime) | Да |

**Где хранятся**:
- Для CI/CD: В настройках репозитория GitHub (Settings → Secrets and variables → Actions).
- Локально: В файле `.env.local`.

## Мониторинг и логи
- **Логи**: В панели CapRover выберите приложение → **Deployment** → **View Logs**.
- **Перезапуск**: Приложение → **App Config** → **Save & Restart**.

## Контакты и доступы
- **CapRover Password**: `captain42`
- **Root Domain**: `95.182.100.126.sslip.io`
