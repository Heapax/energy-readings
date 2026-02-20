# Energy Readings - Helm Chart Deployment

## How to validate & deploy

1. Lint — catches YAML and template errors

```sh
helm lint helm/energy-readings
```

2. Dry-run render — inspect all manifests before applying

```sh
helm template energy-readings helm/energy-readings
```

3. Deploy to a local kind/minikube cluster

(build images locally first since no registry is involved)

```sh
kind create cluster --name panoramic
```

Load locally-built images into kind (no registry needed)

```sh
docker build -t ingestion-api:latest ./ingestion-api
docker build -t processing-service:latest ./processing-service
kind load docker-image ingestion-api:latest --name panoramic
kind load docker-image processing-service:latest --name panoramic
```

Install the chart

```sh
helm install energy-readings helm/energy-readings \
  --set ingestionApi.image.pullPolicy=Never \
  --set processingService.image.pullPolicy=Never
```

4. Verify everything is running

```sh
kubectl get pods,svc
```

5. Port-forward to test locally

```sh
kubectl port-forward svc/energy-readings-ingestion-api 3000:3000 &
kubectl port-forward svc/energy-readings-processing-service 3001:3001 &
```

```sh
curl -X POST http://127.0.0.1:3000/readings \
  -H "Content-Type: application/json" \
  -d '{"site_id":"site-001","device_id":"meter-42","power_reading":1500.5,"timestamp":"2024-01-15T10:30:00Z"}'
```

```sh
curl http://127.0.0.1:3001/sites/site-001/readings
```

## Key design decisions

- **`_helpers.tpl` for shared labels** - The `assignment-id` UUID is defined once in the `values.yaml` and stamped on every resource via the `energy-readings.labels` helper. No chance of a typo mismatch across files.

- **Redis hostname via release name** - `{{ .Release.Name }}-redis` means the service name is always consistent with the  release, so you can install the chart multiple times in different namespaces (e.g., staging vs prod) without Redis hostnames colliding.

- **`replicaCount: 1` for processing-service** - Set intentionally low because KEDA will take over autoscaling based on the Redis Stream backlog. Having `replicaCount` in `values.yaml` still lets you override it manually if needed.

- **`pullPolicy: IfNotPresent`** - Safe default for production, use `--set *.image.pullPolicy=Never` for local kind/minikube where images are loaded directly.