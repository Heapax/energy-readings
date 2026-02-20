# Energy Readings - Processing Service

## How to run locally (with Docker)

1. Start Redis (if not already running)

```sh
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

2. Terminal 1 — Ingestion API

```sh
cd ingestion-api && npm install
PORT=3000 REDIS_HOST=127.0.0.1 node src/index.js
```

3. Terminal 2 — Processing Service

```sh
cd processing-service && npm install
PORT=3001 REDIS_HOST=127.0.0.1 node src/index.js
```

4. Terminal 3 — Send a reading

```sh
curl -s -X POST http://127.0.0.1:3000/readings \
  -H "Content-Type: application/json" \
  -d '{"site_id":"site-001","device_id":"meter-42","power_reading":1500.5,"timestamp":"2024-01-15T10:30:00Z"}'
```

Wait ~1s for processing, then retrieve

```sh
curl -s http://127.0.0.1:3001/sites/site-001/readings | jq
```

Expected response:

```sh
{
  "site_id": "site-001",
  "count": 1,
  "readings": [
    { "device_id": "meter-42", "power_reading": 1500.5, "timestamp": "...", "stream_id": "..." }
  ]
}
```

5. Healtch check

```sh
curl http://127.0.0.1:3001/health
```

## Key design decisions

- **Sorted Set (`ZADD`) over List (`RPUSH`)** - A Sorted Set scored by a timestamp gives us choronological ordering for free and makes future range queries (e.g., "reading between T1 and T2") a single `ZRANGEBYSCOPE` call with no extra work.

- **`CONSUMER_NAME = hostname()`** - In Kubernetes, each pod gts a unique hostname. This means two replicas of the processing service can consume from the same group in parallel without stealing each other's messages.

- **XACK after write, not before** - If the service crashes after `ZADD` but before `XACK`, the message re-enters the Pending Entries List (PEL) and will be redelivered on restart. The worst case is a duplicate write (idempotent since the data is the same), never data loss.

- **`BLOCK 5000`** - The consumer waits up to 5 seconds for new messages rather than busy-polling. This is what KEDA's `pendingEntriesCount` trigger will react to - when backlog grows, KEDA spinds up more replicas, each claming their share via the consumer group. 