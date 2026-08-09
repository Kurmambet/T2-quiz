COMPOSE = docker compose -f compose.dev.yml
API = $(COMPOSE) exec api uv run --no-sync

.PHONY: up down build rebuild logs logs-api ps shell health db-shell redis-shell migration check-migrations upgrade downgrade current lint format-check format test check migrate

up:
	$(COMPOSE) up --build

down:
	$(COMPOSE) down

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) build --no-cache

logs:
	$(COMPOSE) logs -f

logs-api:
	$(COMPOSE) logs -f api

ps:
	$(COMPOSE) ps

shell:
	$(COMPOSE) exec api bash

health:
	curl -i http://127.0.0.1:8000/health/ready

db-shell:
	$(COMPOSE) exec db psql -U t2_quiz -d t2_quiz

redis-shell:
	$(COMPOSE) exec redis redis-cli

migration:
	@test -n "$(message)" || (echo 'Использование: make migration message="create rooms"'; exit 1)
	$(API) alembic revision --autogenerate -m "$(message)"

migrate:
	docker compose -f compose.dev.yml run --rm migrate

check-migrations:
	$(API) alembic check

upgrade:
	$(API) alembic upgrade head

downgrade:
	$(API) alembic downgrade -1

current:
	$(API) alembic current

lint:
	$(API) ruff check app tests alembic

format-check:
	$(API) ruff format --check app tests alembic

format:
	$(API) ruff format app tests alembic
	
test:
	$(API) pytest -q

check: lint format-check test check-migrations
