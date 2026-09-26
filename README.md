# xray-monitor

Infrastructure-agnostic Xray traffic monitoring system with Remnawave integration.

## Архитектура

Это **центральная панель мониторинга** — веб-интерфейс с базой данных, который принимает телеметрию от агентов на нодах.

**Для агентов на нодах используйте оригинальный проект**: https://github.com/oximeter-cloud/xray-monitor-node

## Что изменено

✅ Полностью удалена система ролей tunnel/bridge/outbound  
✅ Убраны все хардкоды стран (Iran/Germany/Finland)  
✅ Убраны хардкоды имён нод (IR1/DE1/FI1)  
✅ Все ноды работают одинаково — просто записывают трафик

## Быстрый старт

### Центральная панель

```yaml
# docker-compose.yml
services:
  xray-monitor:
    image: ghcr.io/mrzalupa-lolz/xray-monitor:latest
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
```

Создайте `.env`:

```bash
REMNAWAVE_API_TOKEN=ваш_токен
INGEST_SECRET=случайная_строка_минимум_32_символа
```

### Агенты на нодах

Используйте **оригинальный агент**: https://github.com/oximeter-cloud/xray-monitor-node

```yaml
# docker-compose.yml на каждой ноде
services:
  xray-monitor-node:
    image: ghcr.io/oximeter-cloud/xray-monitor-node:latest
    container_name: xray-monitor-node
    restart: always
    network_mode: host
    mem_limit: 80m
    environment:
      - MONITOR_URL=https://admin.maximvpn.com
      - INGEST_SECRET=тот_же_секрет_что_на_панели
      - NODE_NAME=NL1                                # Точное имя из Remnawave
      - NODE_ROLE=BRIDGE                             # Игнорируется, оставьте как есть
      - XRAY_LOG_PATH=/var/log/remnanode/access.log
    volumes:
      - /var/log/remnanode:/var/log/remnanode:ro
```

## Деплой на GitHub Container Registry

1. **Создайте репозиторий на GitHub** (Public)

2. **Запушьте код**:
```bash
git init
git add .
git commit -m "feat: infrastructure-agnostic monitoring without hardcoded roles"
git remote add origin https://github.com/ваш-username/xray-monitor.git
git branch -M main
git push -u origin main
```

3. **Дождитесь сборки** (2-3 минуты): https://github.com/ваш-username/xray-monitor/actions

4. **Сделайте образ публичным**: GitHub → Packages → xray-monitor → Settings → Change visibility → Public

5. **Используйте свой образ**: обновите `image:` в docker-compose на `ghcr.io/ваш-username/xray-monitor:latest`

## Проверка

После запуска агента проверьте логи:

```bash
docker logs xray-monitor-node
```

Должно быть:
```
[Agent] Monitoring /var/log/remnanode/access.log -> https://admin.maximvpn.com
[Agent] Node: NL1, Role: BRIDGE
[Agent] Started log streaming
```

Откройте панель и проверьте что нода показывает статус **ACTIVE**.

## Важно

- **NODE_NAME** должен точно совпадать с именем в Remnawave панели
- **INGEST_SECRET** должен быть одинаковым на панели и всех агентах
- **NODE_ROLE** в агентах больше ничего не делает, можете оставить любое значение

## Структура проекта

```
xray-monitor/           # Центральная панель (этот репо)
├── src/
│   ├── index.ts       # HTTP API
│   ├── collector.ts   # Приём телеметрии
│   ├── database.ts    # SQLite запросы
│   └── topology.ts    # Обнаружение нод
├── static/            # Веб-интерфейс
└── Dockerfile

xray-monitor-node/     # Агент (отдельный репо)
└── Читает логи и отправляет на панель
```
