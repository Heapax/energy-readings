# Energy Readings – Web UI

Simple React + Vite UI for the Energy Readings assignment.

## Features

- **Send a reading** – Form to POST a reading to the Ingestion API (site_id, device_id, power_reading, timestamp).
- **Fetch readings by site** – Enter a site ID and fetch all readings from the Processing Service.

## Local development

```sh
npm install
npm run dev
```

Open http://localhost:5173. The Vite dev server proxies `/api/ingestion` → `http://localhost:3000` and `/api/processing` → `http://localhost:3001`, so run the ingestion API and processing service (e.g. via Docker Compose or port-forward) and use the in-app API URL fields if your APIs run on different ports.

## Build

```sh
npm run build
```

Output is in `dist/`. For production, the app expects `VITE_INGESTION_API_URL` and `VITE_PROCESSING_API_URL` at build time (defaults: `http://localhost:3000`, `http://localhost:3001`). When using the UI in Kubernetes with port-forward, leave these defaults and set the same URLs in the UI after opening it.

## Docker

```sh
docker build -t energy-readings-ui:latest ./ui
```

Optional build args for API base URLs:

```sh
docker build --build-arg VITE_INGESTION_API_URL=http://localhost:3000 --build-arg VITE_PROCESSING_API_URL=http://localhost:3001 -t energy-readings-ui:latest ./ui
```

## Helm

The UI is part of the `energy-readings` Helm chart. See the chart’s [README](../helm/README.md) for build, load (kind), and port-forward steps.
