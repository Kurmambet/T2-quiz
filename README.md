# T2 Quiz Hub — корпоративная платформа для квизов

## Описание проекта

**T2 Quiz Hub** — это единая веб-платформа для проведения корпоративных квизов и интерактивных активностей в гибридном формате работы (офис + удаленка). 

### Проблема

В условиях гибридного формата работы проведение интерактивных live-активностей существенно усложняется:
- Организаторам требуется значительный объём времени на подготовку и синхронизацию материалов
- Участники сталкиваются с фрагментацией пользовательского пути и разрозненными ссылками/сервисами
- Результаты и коммуникации часто дублируются в мессенджерах
- Снижается темп вовлечения и общий комфорт участия

### Решение

Платформа предоставляет:
- **Быстрый запуск** игры организатором в несколько кликов
- **Единый сценарий подключения** для офлайн- и онлайн-участников
- **Синхронизированный просмотр** контента и результатов в рамках одной системы
- **Отсутствие хранения персональных данных** — используется только username при входе

---

## Технический стек

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Python 3.12+ / FastAPI
- **База данных:** PostgreSQL
- **ORM:** SQLAlchemy 2.0
- **Миграции:** Alembic
- **Кэширование и Realtime:** Redis
- **Управление зависимостями:** uv
- **Линтинг и форматирование:** Ruff
- **Контейнеризация:** Docker, Docker Compose

---

## Быстрый старт

### Требования

- **Docker** и **Docker Compose** (для контейнеризации)
- **Python** 3.12+ (для разработки бэкенда)
- **uv** (менеджер зависимостей Python)

---

### Запуск через Docker Compose

1. **Клонировать репозиторий:**
   ```bash
   git clone https://github.com/Kurmambet/T2-quiz.git
   cd T2-quiz
   ```

2. **Настроить переменные окружения:**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend-vite/.env.example frontend-vite/.env
   ```
   Отредактируйте `backend/.env` при необходимости (секретные ключи, настройки БД).

3. **Запустить все сервисы:**
   ```bash
   docker compose -f compose.dev.yml up --build -d
   ```

4. **Выполнить миграции базы данных:**
   ```bash
   make upgrade
   ```

5. **Проверить работу:**
   - Backend: `http://localhost:8000`
   - Swagger UI: `http://localhost:8000/docs`
   - Frontend: `http://localhost:5174`

---

### Запуск фронтенда для разработки

```bash
cd frontend-vite
npm install
npm run dev
```

Фронтенд будет доступен по адресу `http://localhost:5174`.

---

### Запуск бэкенда для разработки

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API будет доступно по адресу `http://localhost:8000`.

---

## Миграции базы данных (Alembic)

```bash
# Проверить состояние миграций
make check-migrations

# Создать новую миграцию
make migration message="описание изменений"

# Применить миграции
make upgrade

# Проверить текущую версию
make current

# Проверить код миграций линтером
docker compose -f compose.dev.yml exec api \
  uv run --no-sync ruff check --fix alembic/versions
```

---

## Тестирование

### Запуск всех тестов

```bash
make test
```

### Запуск конкретного теста

```bash
docker compose -f compose.dev.yml exec api \
  uv run --no-sync pytest -q tests/test_gameplay.py
```

---

## Линтинг и форматирование

```bash
# Проверить форматирование
make format-check

# Применить форматирование
make format

# Запустить линтер
make lint

# Полная проверка (линтинг + тесты + миграции)
make check
```

---

## Полезные команды Docker

```bash
# Просмотр логов всех сервисов
docker compose -f compose.dev.yml logs -f

# Просмотр логов только API
docker compose -f compose.dev.yml logs -f api

# Остановка контейнеров (данные сохраняются)
docker compose -f compose.dev.yml down

# Остановка и удаление данных (Postgres/Redis)
docker compose -f compose.dev.yml down -v

# Зайти внутрь API-контейнера
docker compose -f compose.dev.yml exec api bash

# Проверить PostgreSQL
docker compose -f compose.dev.yml exec db psql -U t2_quiz -d t2_quiz -c "SELECT current_database(), current_user;"

# Проверить Redis
docker compose -f compose.dev.yml exec redis redis-cli ping
```

---

## API Эндпоинты

### Комнаты

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| `POST` | `/api/v1/rooms` | Создать комнату |
| `GET` | `/api/v1/rooms/{code}/me` | Получить информацию о текущем участнике |
| `POST` | `/api/v1/rooms/{code}/join` | Подключиться к комнате |

### Системные

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| `GET` | `/health` | Проверка живости сервиса |
| `GET` | `/health/ready` | Проверка готовности сервиса (БД + Redis) |

---

## Автодокументация API

После запуска бэкенда документация Swagger UI доступна по адресу:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

---

## Команда и процессы

### Правила работы в команде

Для поддержания чистоты кода и согласованности используйте:

```bash
make format   # Автоматическое форматирование кода
make lint     # Проверка линтером
make test     # Запуск тестов
make check    # Полная проверка (формат + линт + тесты + миграции)
```

### Ветки и коммиты

- `main` — стабильная версия
- `develop` — разработка
- `feature/*` — новые функции
- `fix/*` — исправления

---

## Лицензия

© T2. Все права защищены.