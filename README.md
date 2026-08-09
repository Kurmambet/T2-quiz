### ~/.../T2_quiz$ - тут

чтобы зааботало:

```bash
docker compose -f compose.dev.yml down
docker compose -f compose.dev.yml up --build -d
```

### ~/.../T2_quiz/frontend-vite$ - тут

чтобы зааботало:

```bash
npm install
npm run dev
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort

npm run build
npm run preview
```

# правила для работы в команде !!!

(чтобы хаоса не было)

```bash
make format
make lint
make format-check
make test
make check-migrations
make check
```

### Полезные команды

```bash
# Логи всех сервисов
docker compose -f compose.dev.yml logs -f
docker compose -f compose.dev.yml logs --tail=200 api
# Логи только API
docker compose -f compose.dev.yml logs -f api

# Остановить контейнеры, но оставить данные Postgres/Redis
docker compose -f compose.dev.yml down

# Остановить и удалить вместе с данными БД/Redis
docker compose -f compose.dev.yml down -v

# Зайти внутрь API-контейнера
docker compose -f compose.dev.yml exec api bash

# Проверить Postgres
docker compose -f compose.dev.yml exec db psql -U t2_quiz -d t2_quiz -c "SELECT current_database(), current_user;"

# Проверить Redis
docker compose -f compose.dev.yml exec redis redis-cli ping
```

### инициализация алембика

```bash
docker compose -f compose.dev.yml exec api uv run --no-sync alembic init -t async alembic



sed -i 's#^sqlalchemy.url =.*#sqlalchemy.url =#' alembic.ini
```

# КАК МИГРИРОВАТЬ через alembic

```bash
# Проверить, какую схему Alembic видит

make check-migrations

# ШАГ 1 Сгенерировать миграцию

make migration message="create rooms table"
make migration message="add quiz templates and game sessions"

docker compose -f compose.dev.yml exec api \
  uv run --no-sync ruff check --fix alembic/versions

docker compose -f compose.dev.yml exec api \
  uv run --no-sync ruff format alembic/versions

make upgrade

# Убедиться в текущей версии
make upgrade
make check-migrations
make check
make current
```
