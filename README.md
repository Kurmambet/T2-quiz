# T2 Quiz Rooms

Realtime веб-приложение для проведения квизов в комнатах: ведущий создаёт комнату и QR-ссылку, игроки подключаются с телефона, отвечают на вопросы, а результаты обновляются по этапам игры.

> **Демо:** [hushme.fun](https://hushme.fun)

## Возможности

- Создание quiz room и QR-ссылки для подключения
- Роли ведущего и игрока
- Создание и выбор quiz templates
- Игровые этапы: lobby → presentation → question → answers closed → answer reveal → scoreboard → finished
- Таймер вопроса, проверяемый на backend
- Подсчёт баллов и leaderboard
- Realtime-обновления lobby, этапов и ответов через WebSocket + Redis Pub/Sub
- Повторный запуск нового квиза в той же room без нового QR и переподключения игроков
- Self-leave и удаление игрока ведущим
- CI checks и автоматический production deploy после push в `main`

## Архитектура

```text
React + TypeScript + Vite
          │ HTTP API / WebSocket
          ▼
       FastAPI
       │      │
       ▼      ▼
PostgreSQL  Redis
```

| Компонент       | Назначение                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| `frontend-vite` | React frontend для ведущего и игроков                                             |
| `backend`       | FastAPI REST API, WebSocket endpoint, game logic                                  |
| PostgreSQL      | Постоянное состояние: rooms, participants, quiz templates, game sessions, answers |
| Redis           | Realtime Pub/Sub events и временный presence WebSocket connections                |
| Docker Compose  | Локальный development stack и production services                                 |
| Nginx           | HTTPS reverse proxy в production                                                  |

### Ключевые сущности

- **Room** — постоянная комната с уникальным QR/code и участниками.
- **GameSession** — один запуск квиза внутри room.
- **Participant** — игрок комнаты; после leave/remove soft-delete’ится, а nickname снова становится доступен.
- **QuizTemplate** — набор вопросов и вариантов ответов.
- **ParticipantAnswer** — выбранный вариант, correctness и начисленные points.

Room и GameSession разделены намеренно: после завершения игры ведущий может выбрать следующий quiz template, а игроки остаются в той же room и не сканируют QR повторно.

## Repository structure

```text
.
├── backend/                    # FastAPI, SQLAlchemy models, Alembic, pytest
├── frontend-vite/              # React + TypeScript + Vite
├── deploy/nginx/               # Production Nginx configuration
├── deploy/scripts/             # Healthcheck and backup scripts
├── compose.dev.yml             # Local development services
├── compose.prod.yml            # Production services
├── Makefile                    # Development, test and migration commands
└── .github/workflows/ci.yml    # CI/CD workflow
```

## Prerequisites

For local development:

- Docker Engine with Docker Compose v2
- GNU Make
- Git
- Node.js 22+ and npm (required for frontend lint/build outside Docker)

Check installed tools:

```bash
docker --version
docker compose version
make --version
node --version
npm --version
```

## Local quick start

### 1. Clone and configure environment

```bash
git clone https://github.com/Kurmambet/T2-quiz.git
cd T2-quiz
```

Create local backend environment file:

```bash
cp backend/.env.example backend/.env
```

Create frontend environment file if the project needs a custom API URL:

```bash
cp frontend-vite/.env.example frontend-vite/.env
```

For the standard Docker development stack, the backend is available at `http://127.0.0.1:8000`.

### 2. Start backend stack

```bash
docker compose -f compose.dev.yml up -d --build
```

Services:

| Service           | Local address                |
| ----------------- | ---------------------------- |
| FastAPI           | `http://127.0.0.1:8000`      |
| Swagger / OpenAPI | `http://127.0.0.1:8000/docs` |
| PostgreSQL        | Docker network only          |
| Redis             | Docker network only          |

Verify dependencies and API readiness:

```bash
curl -fsS http://127.0.0.1:8000/health/ready
```

Expected result:

```json
{ "status": "ready", "database": "ok", "redis": "ok" }
```

### 3. Start frontend

In a second terminal:

```bash
cd frontend-vite
npm ci
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173`.

### 4. Stop local services

```bash
docker compose -f compose.dev.yml down
```

To remove local PostgreSQL and Redis volumes too:

```bash
docker compose -f compose.dev.yml down -v
```

## Development commands

### Backend checks

```bash
make check
```

Runs Ruff linting, Ruff format validation, pytest and Alembic schema-drift checks.

### Frontend checks

```bash
cd frontend-vite
npm run lint
npm run build
```

### Database migrations

Create migrations only through the project Makefile command:

```bash
make migration message="describe_schema_change"
```

Then format and validate the generated migration:

```bash
docker compose -f compose.dev.yml exec api \
  uv run --no-sync ruff check --fix alembic/versions

docker compose -f compose.dev.yml exec api \
  uv run --no-sync ruff format alembic/versions

make upgrade
make check-migrations
make check
make current
```

Never edit an applied production migration by creating a second ad-hoc replacement. Generate migrations from the model change, review them, test locally, then deploy them through the normal CI/CD flow.

## Tests

Run all backend tests:

```bash
make check
```

Run a specific test module:

```bash
docker compose -f compose.dev.yml exec api \
  uv run --no-sync pytest tests/test_gameplay.py -q
```

The gameplay suite covers answer submission, phase rules, late-join policy, leaderboard calculation and repeated quiz runs in the same room.

## Realtime model

WebSocket endpoint:

```text
/ws/rooms/{ROOM_CODE}?role={organizer|participant}&token={SESSION_TOKEN}
```

Redis Pub/Sub channel per room:

```text
t2_quiz:room:{ROOM_CODE}:events
```

Examples of events:

- `room.state_changed`
- `room.lobby_changed`
- `participant.removed`
- `room.answer_submitted`

Redis also holds temporary presence keys for each WebSocket connection. PostgreSQL remains the source of truth for all game data.

## Security notes

- Do not commit `backend/.env`, `backend/.env.prod`, `frontend-vite/.env` or private keys.
- The backend stores HMAC hashes of organizer and participant tokens, not raw token values.
- Production API and frontend ports are bound to `127.0.0.1`; public access goes through host Nginx and HTTPS.
- API authentication tokens are passed through `X-Organizer-Token` or `X-Participant-Token` headers; WebSocket authentication occurs during connection setup.

## CI/CD

GitHub Actions runs:

```text
push to dev
→ backend checks
→ frontend lint/build

push to main
→ backend checks
→ frontend lint/build
→ approved production deployment
```

The production deploy job connects to the server through a dedicated `deploy` user, runs `git pull --ff-only`, builds images, applies Alembic migrations via Compose, waits for API readiness and verifies the public API.

Production setup details are in [manual-production-deploy-ubuntu.md](manual-production-deploy-ubuntu.md).

## Production operations

View production service state on the server:

```bash
sudo -u deploy -H bash -lc '
  cd /opt/t2-quiz/T2-quiz
  docker compose -f compose.prod.yml ps
'
```

View logs:

```bash
sudo -u deploy -H bash -lc '
  cd /opt/t2-quiz/T2-quiz
  docker compose -f compose.prod.yml logs --tail=200 api frontend migrate
'
```

Check deployed commit:

```bash
sudo -u deploy -H git -C /opt/t2-quiz/T2-quiz log -1 --oneline
```

## License

This repository was created as a hackathon project. Add the applicable license before public reuse or distribution.
