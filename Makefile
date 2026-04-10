.PHONY: up down test lint gen build

# Запуск локальной среды разработки
up:
	docker-compose -f infra/docker-compose.dev.yml up -d
	@echo "Local environment is up. Frontend: http://localhost:5173 | Backend: http://localhost:8080"

# Остановка локальной среды
down:
	docker-compose -f infra/docker-compose.dev.yml down

# Запуск фронтенда и бэкенда (без докера для быстрой разработки)
dev:
	npm run dev & cd backend && go run cmd/api/main.go

# Линтинг Go и TS
lint:
	npm run lint
	cd backend && golangci-lint run ./...

# Тестирование Go
test:
	cd backend && go test -v -race ./...

# Генерация кода (пример sqlc, если нужно)
gen:
	cd backend && sqlc generate

# Сборка Go бинарника
build-backend:
	cd backend && go build -o bin/api cmd/api/main.go

# Сборка фронтенда
build-frontend:
	npm run build
