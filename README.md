# Energy Readings

Ingestion API, processing service, and optional web UI for energy readings. Readings are posted to the Ingestion API, stored in a Redis Stream, consumed by the Processing Service (with optional KEDA autoscaling), and queryable by site. Deployable via Docker Compose locally or Helm on Kubernetes (kind/minikube).

---

## How to build and run locally

### Option 1: Docker Compose (recommended)

Build and run Redis, Ingestion API, and Processing Service:

```sh
docker compose up --build
```

- **Ingestion API:** http://localhost:3000  
- **Processing Service:** http://localhost:3001  
- **Redis:** localhost:6379  

**Web UI (optional):** Run separately so you can point it at the APIs:

```sh
cd ui && npm install && npm run dev
```

Open http://localhost:5173. Leave the API URL fields empty to use the Vite proxy to localhost:3000 and 3001.

**Quick test:**

```sh
curl -s -X POST http://127.0.0.1:3000/readings \
  -H "Content-Type: application/json" \
  -d '{"site_id":"site-001","device_id":"meter-42","power_reading":1500.5,"timestamp":"2024-01-15T10:30:00Z"}'

curl -s http://127.0.0.1:3001/sites/site-001/readings
```

### Option 2: Node.js + Redis

1. Start Redis: `docker run -d --name redis -p 6379:6379 redis:7-alpine`
2. **Ingestion API:** `cd ingestion-api && npm ci && REDIS_HOST=127.0.0.1 node src/index.js`
3. **Processing Service:** `cd processing-service && npm ci && PORT=3001 REDIS_HOST=127.0.0.1 node src/index.js`
4. **UI (optional):** `cd ui && npm ci && npm run dev`

Use the same `curl` commands as above; for the UI, set API URLs to http://localhost:3000 and http://localhost:3001 if needed.

---

## How to deploy on a Kubernetes cluster (kind / minikube)

**Prerequisites:** [kind](https://kind.sigs.k8s.io/) (or minikube), [Helm](https://helm.sh/), [KEDA](https://keda.sh/) (optional, for processing-service autoscaling).

### 1. Create cluster and build images

```sh
kind create cluster --name energy-readings
```

```sh
docker build -t ingestion-api:latest ./ingestion-api
docker build -t processing-service:latest ./processing-service
docker build -t energy-readings-ui:latest ./ui
kind load docker-image ingestion-api:latest --name energy-readings
kind load docker-image processing-service:latest --name energy-readings
kind load docker-image energy-readings-ui:latest --name energy-readings
```

### 2. Install KEDA (optional, for autoscaling)

```sh
helm repo add kedacore https://kedacore.github.io/charts
helm repo update
helm install keda kedacore/keda --namespace keda --create-namespace
```

### 3. Install the Helm chart

```sh
helm install energy-readings helm/energy-readings \
  --set ingestionApi.image.pullPolicy=Never \
  --set processingService.image.pullPolicy=Never \
  --set webUi.image.pullPolicy=Never
```

### 4. Verify and test

```sh
kubectl get pods,svc
```

Port-forward to access from your machine:

```sh
kubectl port-forward svc/energy-readings-ingestion-api 3000:3000 &
kubectl port-forward svc/energy-readings-processing-service 3001:3001 &
kubectl port-forward svc/energy-readings-web-ui 8080:80 &
```

- **Web UI:** http://localhost:8080 (set Ingestion API to http://localhost:3000 and Processing API to http://localhost:3001)
- Use the same `curl` commands as above against localhost:3000 and localhost:3001.

For more detail (lint, template, upgrade, scaling), see [helm/README.md](helm/README.md).

---

## Design decisions and trade-offs

- **Redis Stream + consumer group** – Readings are appended to a stream; the processing service consumes via a consumer group so multiple replicas can share work and KEDA can scale on pending (un-ACKed) entries.
- **No InitContainers for Redis** – The APIs use in-app Redis connection retry with exponential backoff instead of a “wait-for-redis” init container. This keeps startup simple and aligns with “let the app be resilient” rather than blocking pod start. Trade-off: if Redis is down for a long time, the pod may restart until Redis is up.
- **Readiness on `/health` (Redis ping)** – Readiness uses an endpoint that pings Redis. If Redis is unreachable, the pod is not ready and receives no traffic. The processing-service readiness probe uses a 5s timeout so slow Redis responses don’t flip the pod to not ready unnecessarily.
- **KEDA Redis address** – KEDA runs in its own namespace and can’t resolve short names like `energy-readings-redis`. The Redis address used by KEDA is stored in a Secret as a full DNS name (`<release>-redis.<namespace>.svc.cluster.local:6379`) so the ScaledObject works from any namespace.
- **Helm** – Shared labels (e.g. assignment-id) live in `_helpers.tpl` and `values.yaml`; Redis hostname is derived from the release name so the chart can be installed multiple times (e.g. staging/prod) without name clashes.
- **Processing service replica count** – Default is 1; KEDA scales on Redis Stream pending entries. Scale-down uses the default HPA stabilization window (~5 minutes) to avoid thrashing when the backlog fluctuates.
- **Web UI** – Static React/Vite app; API base URLs are configurable in the UI. For Kubernetes with port-forward, users set localhost:3000/3001 in the UI. No backend proxy in the UI image keeps the image and deployment simple.

---

## Repository layout

| Path | Description |
|------|-------------|
| `ingestion-api/` | Fastify API that accepts readings and appends to a Redis Stream |
| `processing-service/` | Fastify service that consumes the stream, stores by site, and serves GET by site |
| `ui/` | React + Vite web UI to send readings and fetch by site |
| `helm/energy-readings/` | Helm chart (Redis, ingestion-api, processing-service, web-ui, KEDA ScaledObject + auth) |
| `docker-compose.yml` | Local run: Redis + ingestion-api + processing-service |
| `.github/workflows/ci.yml` | CI: Node build, Helm lint/template, Docker image build |
