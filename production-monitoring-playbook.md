# Production Monitoring Playbook (Prometheus + Grafana)

Основано на реальном внедрении в проекте **T2-quiz** (FastAPI + PostgreSQL + Redis + Docker Compose, деплой на VPS через GitHub Actions). Репозиторий: `github.com/Kurmambet/T2-quiz`, каталог `monitoring/` (все конфиги смотри там — здесь только код, команды и объяснения, чтобы не дублировать файлы).

Применимо к любому проекту на FastAPI + Docker Compose. Цель — от нуля получить: метрики приложения, системные метрики, метрики контейнеров, дашборды Grafana и алерты, не сломав прод.

---

## 1. Инструментирование приложения (backend)

### 1.1. Добавить зависимости

```bash
cd backend
uv add prometheus-fastapi-instrumentator prometheus-client
```

Это добавит в `pyproject.toml`:

```toml
dependencies = [
    ...
    "prometheus-client>=0.26.0",
    "prometheus-fastapi-instrumentator>=8.1.0",
]
```

если не в devdependencies, то так действуй:

```bash
cd backend
uv remove pytest ruff
uv add --dev pytest ruff pytest-asyncio
uv lock
cd ..
docker compose -f compose.dev.yml up -d --build api
make check
```

### 1.2. Подключить автоматические HTTP-метрики в `main.py`

`prometheus-fastapi-instrumentator` из коробки даёт счётчик `http_requests_total` с лейблами `method`, `status`, `handler` — именно то, что видно в `/metrics`.

```python
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(...)
...
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

Важно: `expose(app, endpoint="/metrics")` — без этого эндпоинт не появится вообще. `include_in_schema=False` убирает его из OpenAPI/Swagger.

### 1.3. Добавить кастомную бизнес-метрику (пример: WebSocket-соединения)

Файл `app/realtime/presence.py`:

```python
from prometheus_client import Counter

websocket_connections_total = Counter(
    "websocket_connections_total",
    "WebSocket connect/disconnect events",
    ["event"],
)
```

Инкрементируй в местах реального connect/disconnect (например, в обработчике WebSocket-эндпоинта):

```python
websocket_connections_total.labels(event="connect").inc()
...
websocket_connections_total.labels(event="disconnect").inc()
```

Правило: заводи **свою** бизнес-метрику для каждого критичного пути в приложении (не только HTTP) — WebSocket, очереди, воркеры, платежи и т.д. Стандартные HTTP-метрики покрывают только REST.

### 1.4. Проверка локально

```bash
curl -s http://127.0.0.1:8000/metrics | grep http_requests_total
curl -s http://127.0.0.1:8000/metrics | grep websocket_connections_total
```

Если пусто — проверь, что `expose()` вызван **после** регистрации всех роутов, и что порт правильный.

---

## 2. Структура docker-compose для мониторинга

Файл: `monitoring/compose.monitoring.yml` (полный код — смотри в репозитории). Сервисы:

- `prometheus` (prom/prometheus) — сбор и хранение метрик
- `grafana` (grafana/grafana) — визуализация
- `alertmanager` (prom/alertmanager) — маршрутизация алертов
- `node_exporter` (prom/node-exporter) — метрики хоста (CPU/RAM/диск ОС)
- `postgres_exporter` (prometheuscommunity/postgres-exporter) — метрики БД
- `redis_exporter` (oliver006/redis_exporter) — метрики Redis
- `cadvisor` (gcr.io/cadvisor/cadvisor) — метрики Docker-контейнеров

### 2.1. КРИТИЧЕСКИ ВАЖНО: общая docker-сеть

Мониторинг-стек и прод-стек — это **два разных `docker compose` проекта**. Чтобы Prometheus мог резолвить `api`, `db`, `redis` по DNS-имени, оба стека обязаны сидеть в одной Docker-сети.

**Ошибка, в которую мы упёрлись:** имя сети, автоматически создаваемой Docker Compose, зависит от имени директории проекта и версии Compose (может быть с подчёркиванием `t2_quiz_default` или с дефисом `t2-quiz_default`, а после явного задания `name:` — вообще произвольным). Полагаться на автоматическое имя нельзя.

**Решение — задать сети явное фиксированное имя в основном `compose.prod.yml`:**

```yaml
networks:
  default:
    name: t2_quiz_prod_net
```

И подключиться к ней как к внешней в `compose.monitoring.yml`:

```yaml
networks:
  monitoring:
  app_net:
    external: true
    name: t2_quiz_prod_net # должно ТОЧНО совпадать с именем выше

services:
  prometheus:
    networks:
      - monitoring
      - app_net
  postgres_exporter:
    networks:
      - monitoring
      - app_net
  redis_exporter:
    networks:
      - monitoring
      - app_net
```

Проверка после `up -d`:

```bash
docker network inspect t2_quiz_prod_net \
  --format '{{range .Containers}}{{.Name}} {{end}}'
```

Должны быть видны **и** прод-контейнеры (`*-api-1`, `*-db-1`, `*-redis-1`), **и** мониторинговые (`monitoring-prometheus-1` и т.д.) в одном списке.

### 2.1.1

monitoring/grafana/dashboards/t2-quiz-app.json изначально - затычка

```json
{
  "title": "T2 Quiz — App metrics (draft)",
  "uid": "t2-quiz-app-draft",
  "schemaVersion": 39,
  "panels": [],
  "time": { "from": "now-6h", "to": "now" }
}
```

```bash
openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32

# Найти реальную рабочую директорию
docker inspect "$(docker compose -f /opt/t2-quiz/T2-quiz/compose.prod.yml ps -q db)" \
  --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'


docker compose -f compose.prod.yml exec db \
  psql -U "$(grep '^POSTGRES_USER=' backend/.env.prod | cut -d= -f2)" \
  -d "$(grep '^POSTGRES_DB=' backend/.env.prod | cut -d= -f2)"




CREATE USER monitoring_readonly WITH PASSWORD 'результат 1 openssl rand';
GRANT pg_monitor TO monitoring_readonly;
\q


# /opt/t2-quiz/T2-quiz/monitoring/.env
MONITORING_DB_USER=monitoring_readonly
MONITORING_DB_PASSWORD=результат 1 openssl rand
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=результат 2 openssl rand


chown -R deploy:deploy /opt/t2-quiz/T2-quiz/monitoring
chmod 600 .env

# с локальной машины чтобы зайти в прометеус
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 deploy@<SERVER_IP>
```

сгенерировать траффик:

```bash
for i in $(seq 1 10); do
  curl -s https://hushme.fun/api/v1/quiz-templates > /dev/null
  curl -s https://hushme.fun/health > /dev/null
  sleep 1
done
```

если добавишь nginx location на сервере надо вручную ее тоже добавить т.к. не деплоится nginx.conf:

```bash
sudo nano /etc/nginx/sites-available/hushme.fun
# location из репо бери

sudo nginx -t
sudo systemctl reload nginx

# Создай .htpasswd на сервере:
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
sudo nginx -t && sudo systemctl reload nginx
# сюда можно другой пароль писать, не связанные с 'результат 2 openssl rand'


# проверить
curl -I https://hushme.fun/grafana/
```

```




```

Проверь, какой файл активен:

```bash
sudo nginx -T 2>/dev/null | grep -A 3 "location /grafana/"
```

Если команда ничего не находит — значит правка не попала в реально используемый конфиг. Найди актуальный путь:

```bash
ls -la /etc/nginx/sites-enabled/
cat /etc/nginx/sites-enabled/hushme.fun 2>/dev/null | grep -n "location"
```

Внеси location именно в этот файл, затем:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Проверка после reload

```bash
curl -I https://hushme.fun/grafana/
```

Ожидаемо:

```
text
HTTP/2 401
www-authenticate: Basic realm="Monitoring"
```

### 2.2. cAdvisor (он у меня какого-то хрена не работает. хз почему, так что тут гугли я хз что еще тут делать) — для метрик контейнеров нужен доступ к Docker

```yaml
cadvisor:
  image: gcr.io/cadvisor/cadvisor:v0.49.1
  volumes:
    - /:/rootfs:ro
    - /var/run:/var/run:ro
    - /sys:/sys:ro
    - /var/lib/docker/:/var/lib/docker:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - /dev/disk/:/dev/disk:ro
```

Без `docker.sock` cAdvisor не резолвит человекочитаемые имена контейнеров в лейбл `name` — он либо пуст, либо содержит cgroup ID. Перед тем как строить дашборд с фильтром `name=~"..."`, **обязательно проверь реальные лейблы** через Prometheus Explore:

```promql
count(container_cpu_usage_seconds_total) by (name)
count(container_cpu_usage_seconds_total) by (id, image)
```

Если `name` всё равно пуст даже с примонтированным сокетом — переключайся на фильтрацию по `image` или `container_label_com_docker_compose_service`, это надёжнее версии cAdvisor к версии.

### 2.3. Запуск

```bash
cd monitoring
docker compose -f compose.monitoring.yml --env-file .env up -d
```

Порты наружу пробрасывай только там, где действительно нужен внешний доступ (в T2-quiz это `127.0.0.1:9090` для Prometheus, `127.0.0.1:3000` для Grafana, `127.0.0.1:9093` для Alertmanager — все забиндены на loopback, наружу — только через nginx/SSH-туннель). Exporter'ы (`postgres_exporter`, `redis_exporter`, `cadvisor`, `node_exporter`) портов наружу не публикуют вообще — они видны только Prometheus внутри docker-сети.

---

## 3. Конфигурация Prometheus

Файл: `monitoring/prometheus/prometheus.yml` — scrape configs для каждого job (`t2-quiz-api`, `node`, `postgres`, `redis`, `cadvisor`), с `job_name`, соответствующим тому, что видно в лейблах метрик (`job="t2-quiz-api"`).

Файл: `monitoring/prometheus/alerts.yml` — правила алертов. Ключевые примеры из проекта:

```yaml
groups:
  - name: t2-quiz
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{job="t2-quiz-api", status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total{job="t2-quiz-api"}[5m])) > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "5xx error rate above 5% for 5 minutes"

      - alert: WebSocketConnectionsDrop
        expr: |
          rate(websocket_connections_total{job="t2-quiz-api", event="disconnect"}[5m])
          > rate(websocket_connections_total{job="t2-quiz-api", event="connect"}[5m]) * 3
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Disconnect rate 3x higher than connect rate"
```

После правки — обязательно перезагрузи Prometheus (или `docker compose up -d --force-recreate prometheus`), проверь в `http://127.0.0.1:9090/rules`, что правило загрузилось без синтаксических ошибок.

---

## 4. Дашборды Grafana

Файлы: `monitoring/grafana/dashboards/*.json` (стандартный дашборд + `t2-quiz-app.json` — кастомный под приложение).

### 4.1. Provisioning (датасорсы и дашборды подключаются автоматически при старте)

`monitoring/grafana/provisioning/datasources/datasource.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

`monitoring/grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1
providers:
  - name: default
    folder: ""
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

### 4.2. Панели, требующие "ловушек" при построении запросов

**Error rate (5xx / всего):** если 5xx ещё ни разу не случились, ряд для `status=~"5.."` вообще не существует (Prometheus не хранит нулевые counter'ы для комбинаций лейблов, которых не было). Деление пустого вектора даёт "No data", а не `0`. Исправление — форсировать ноль:

```promql
(
  sum(rate(http_requests_total{job="t2-quiz-api", status=~"5.."}[5m]))
  or vector(0)
)
/
(
  sum(rate(http_requests_total{job="t2-quiz-api"}[5m]))
  or vector(0.0001)
)
```

**Redis hit ratio:** `redis_keyspace_hits_total`/`redis_keyspace_misses_total` растут только от команд чтения по ключу (`GET`, `EXISTS`). Если Redis используется как pub/sub + presence-store (`SET`/`EXPIRE`/`PUBLISH`), эти счётчики так и останутся на нуле — это не баг, а неподходящая метрика для такой архитектуры. Замени на:

```promql
rate(redis_commands_processed_total[5m])
redis_connected_clients
```

**cAdvisor CPU/Memory:** имя контейнера в лейбле `name` — это буквально `docker ps` `NAMES`, включая дефисы/подчёркивания в том виде, как их сгенерировал Docker Compose. Перед написанием regex — свериться командой из п. 2.2, а не гадать по аналогии с именем репозитория.

### 4.3. Экспорт правок дашборда

Каждый раз после ручной правки панели в UI: **Dashboard settings → JSON Model → Copy**, вставить в файл в репозитории **локально**, закоммитить и запушить (см. раздел 6 — почему это критично).

---

## 5. Тестирование алертов безопасным способом

Не нужно ломать код ради теста 500-й ошибки. Используй `docker pause` — замораживает процесс контейнера (`SIGSTOP`) без потери данных volume, `unpause` мгновенно восстанавливает:

```bash
docker pause t2-quiz-redis-1

curl -i -X POST http://127.0.0.1:8000/api/v1/rooms \
  -H "Content-Type: application/json" \
  -d '{"title": "test"}'

docker unpause t2-quiz-redis-1
```

Делай это только когда нет активных пользователей — на время паузы все запросы, зависящие от этого сервиса, будут висеть/падать по таймауту.

---

## 6. CI/CD и дисциплина работы с сервером

### 6.1. Как устроен деплой (`.github/workflows/ci.yml`)

```yaml
deploy:
  needs: [backend, frontend]
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  steps:
    - name: Configure SSH
      ...
    - name: Deploy with Docker Compose
      run: |
        ssh -i ~/.ssh/id_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=yes \
          -p "$DEPLOY_PORT" "$DEPLOY_USER@$DEPLOY_HOST" bash -s <<'EOF'
          set -Eeuo pipefail
          cd /opt/t2-quiz/T2-quiz
          git fetch origin main
          git checkout main
          git pull --ff-only origin main
          docker compose -f compose.prod.yml build
          docker compose -f compose.prod.yml up -d --remove-orphans
        EOF
```

Мониторинг-стек в этот пайплайн **не включён** — `compose.monitoring.yml` поднимается вручную по SSH. Это осознанный компромисс для небольшого проекта; для более серьёзного стоит добавить отдельный шаг деплоя мониторинга в тот же workflow (тот же `git pull` + `docker compose -f monitoring/compose.monitoring.yml up -d`), чтобы не разъезжаться вручную.

### 6.2. Золотое правило — из-за чего был реальный инцидент с деплоем

`git pull --ff-only` **упадёт**, если в рабочем каталоге на сервере есть незакоммиченные локальные изменения — а именно так и случилось: правка `compose.monitoring.yml` (сеть) и дашборда через `nano` прямо на сервере привела к:

```text
error: Your local changes to the following files would be overwritten by merge
```

**Правило:** каталог деплоя (`/opt/.../T2-quiz`) — это исключительно read-only слепок git, управляемый только через `push → CI → git pull` на сервере. Никогда не редактируй файлы там напрямую. Если нужно экстренно поправить что-то на сервере:

1. внеси такую же правку сразу в репозиторий (commit + push с локальной машины);
2. либо, если правка уже сделана на сервере вручную — сразу перенеси её в git, не откладывая.

Восстановление после конфликта (если он всё же случился):

```bash
sudo -u deploy -H bash -lc '
  cd /opt/t2-quiz/T2-quiz
  git status
  git checkout -- <файлы с конфликтом>
  git pull --ff-only origin main
'
```

Работай под пользователем, от имени которого реально бежит CI (обычно `deploy`, не `root`) — иначе получишь не относящуюся к делу ошибку `dubious ownership`.

---

## 7. Чек-лист для нового проекта

1. Добавить `prometheus-fastapi-instrumentator` + `expose(app, endpoint="/metrics")`.
2. Завести `Counter`/`Gauge`/`Histogram` для каждой критичной бизнес-операции (не только HTTP).
3. Зафиксировать явное имя docker-сети в `compose.prod.yml` (`networks.default.name`).
4. Поднять `compose.monitoring.yml` с `app_net: external: true, name: <то же имя>`.
5. Смонтировать `docker.sock` в cAdvisor и проверить реальные лейблы перед написанием запросов.
6. Настроить `prometheus.yml` (scrape configs) и `alerts.yml` (правила) под реальные job/label имена.
7. Настроить Grafana provisioning (datasource + dashboards автозагрузка).
8. В панелях с редкими событиями (ошибки, ratio) всегда добавлять `or vector(0)` fallback.
9. Тестировать алерты через `docker pause`/`unpause`, не через порчу кода.
10. Никогда не редактировать файлы в git-деплойном каталоге на сервере вручную — только через commit+push+CI.

Полные YAML/JSON-файлы (compose.monitoring.yml, prometheus.yml, alerts.yml, grafana dashboards, provisioning) — в репозитории: `github.com/Kurmambet/T2-quiz/tree/main/monitoring`.
