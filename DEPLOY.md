# Деплой на GitHub Container Registry (ghcr.io)

## Автоматический деплой через GitHub Actions

Образ автоматически собирается и публикуется на ghcr.io при каждом push в `main`.

### Шаг 1: Первоначальная настройка

1. **Запушьте код в GitHub**:
```bash
git add .
git commit -m "feat: remove hardcoded infrastructure, simplify to universal nodes"
git push origin main
```

2. **GitHub Actions автоматически**:
   - Соберет Docker-образ
   - Запушит его на `ghcr.io/ваш-username/xray-monitor:latest`
   - Добавит теги с SHA коммита и версией

3. **Сделайте образ публичным** (один раз):
   - Зайдите на https://github.com/ваш-username?tab=packages
   - Найдите пакет `xray-monitor`
   - Нажмите на него → Package settings → Change visibility → Public

### Шаг 2: Используйте свой образ

Обновите `docker-compose.yml` на всех нодах:

```yaml
xray-monitor-node:
  container_name: xray-monitor-node
  image: ghcr.io/ваш-username/xray-monitor:latest  # Ваш образ!
  restart: always
  network_mode: host
  mem_limit: 80m
  environment:
    - MONITOR_URL=https://admin.maximvpn.com
    - INGEST_SECRET=ваш_секрет
    - NODE_NAME=NL1                             # Точное имя из Remnawave
    - XRAY_LOG_PATH=/var/log/remnanode/access.log
  volumes:
    - /var/log/remnanode:/var/log/remnanode:ro
```

**Примечание**: `NODE_ROLE` больше не используется, можете удалить эту строку.

### Шаг 3: Деплой на сервер

```bash
# На каждой ноде
docker compose pull xray-monitor-node
docker compose up -d xray-monitor-node
docker logs -f xray-monitor-node
```

## Ручная сборка (опционально)

Если нужно собрать вручную:

```bash
# Локально
docker build -t ghcr.io/ваш-username/xray-monitor:latest .

# Логин в ghcr.io
echo "ваш_github_token" | docker login ghcr.io -u ваш-username --password-stdin

# Push
docker push ghcr.io/ваш-username/xray-monitor:latest
```

## Центральная панель мониторинга

Обновите `docker-compose.yml` центральной панели:

```yaml
version: '3.8'

services:
  xray-monitor:
    image: ghcr.io/ваш-username/xray-monitor:latest  # Ваш образ!
    container_name: xray-monitor
    restart: always
    ports:
      - "9922:9922"
    environment:
      - REMNAWAVE_API_URL=https://admin.maximvpn.com/api
      - REMNAWAVE_API_TOKEN=${REMNAWAVE_API_TOKEN}
      - INGEST_SECRET=${INGEST_SECRET}
      - PORT=9922
    volumes:
      - ./data:/app/data
    mem_limit: 256m
```

Создайте `.env` рядом с `docker-compose.yml`:

```bash
REMNAWAVE_API_TOKEN=ваш_токен_remnawave
INGEST_SECRET=ваш_секретный_ключ_для_агентов
```

Запустите:

```bash
docker compose up -d
docker logs -f xray-monitor
```

## Проверка

1. **Проверьте что образ опубликован**:
   - https://github.com/ваш-username/xray-monitor/pkgs/container/xray-monitor

2. **Проверьте логи агента**:
```bash
docker logs xray-monitor-node
```

Должно быть:
```
[Collector] Dynamic local node set from Remnawave API: NL1 (IP-адрес)
```

3. **Проверьте дашборд**:
   - https://admin.maximvpn.com/api/remna/sessions
   - Статус ноды должен быть ACTIVE, не "Unmonitored"

## Версионирование

Чтобы создать версию с тегом:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Это создаст образы:
- `ghcr.io/ваш-username/xray-monitor:v1.0.0`
- `ghcr.io/ваш-username/xray-monitor:1.0`
- `ghcr.io/ваш-username/xray-monitor:latest`

## Troubleshooting

### Образ не публикуется
- Проверьте что репозиторий на GitHub публичный или у вас есть права на packages
- Проверьте логи Actions: https://github.com/ваш-username/xray-monitor/actions

### "Unmonitored" после обновления
- Проверьте что `NODE_NAME` точно совпадает с именем в Remnawave панели
- Перезапустите агента: `docker compose restart xray-monitor-node`

### Ошибка pull
- Убедитесь что образ публичный в настройках package на GitHub
- Или сделайте `docker login ghcr.io` перед pull
