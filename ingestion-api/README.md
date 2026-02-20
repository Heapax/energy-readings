# Energy Readings - Ingestion API

## How to run locally (with Docker)

1. Start Redis

```sh
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

2. Install dependencies and run

```sh
cd ingestion-api
npm install
REDIS_HOST=127.0.0.1 node src/index.js
```

3. Test it

```sh
curl -s -X POST http://127.0.0.1:3000/readings \
  -H "Content-Type: application/json" \
  -d '{"site_id":"site-001","device_id":"meter-42","power_reading":1500.5,"timestamp":"2024-01-15T10:30:00Z"}'
```

Expected output: {"status":"accepted","stream_id":"..."}

4. Test validation (mssing field = 422)

```sh
curl -s -X POST http://127.0.0.1:3000/readings \
  -H "Content-Type: application/json" \
  -d '{"site_id":"site-001"}'
```

5. Healtch check

```sh
curl http://127.0.0.1:3000/health
```

## Key design decisions

- **Why Fastify?** Its JSON Schema validation is first-class, invalid payloads are automatically
rejected with proper error details, and we just remap the status code to 422 in the error handler.
No extra validation library needed.

- **Why `@fastify/redis`?** It wraps `ioredis`, decorates the app instance with `app.redis`, and handles -
greaceful shutdown (no boilerplate).

- **Non-root user + multi-stage Dockerfile** - dependencies are installed in a separete stage so the final -
image doesn't include npm/build tools, and the process runs as a non-root user.