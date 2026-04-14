.PHONY: dev dev-frontend install build lint check-env logs help

# Variables
PACKAGE_MANAGER := npm

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	$(PACKAGE_MANAGER) install

check-env: ## Verify that .env.local has all required variables
	@$(PACKAGE_MANAGER) run check:env

dev: check-env ## Run the full app locally (Vite + Vercel Functions)
	vercel dev --listen 3000

dev-frontend: ## Run only the Vite frontend
	$(PACKAGE_MANAGER) run dev

build: ## Build the project
	$(PACKAGE_MANAGER) run build

lint: ## Run linter
	$(PACKAGE_MANAGER) run lint

logs: ## Tail vercel dev output
	vercel dev --debug

docker-dev: check-env ## Run using Docker Compose
	docker-compose -f docker-compose.dev.yml up

docker-build: ## Rebuild Docker containers
	docker-compose -f docker-compose.dev.yml build --no-cache
