# --- Build stage ---
FROM node:25-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ARG VITE_INGESTION_API_URL=http://localhost:3000
ARG VITE_PROCESSING_API_URL=http://localhost:3001
ENV VITE_INGESTION_API_URL=$VITE_INGESTION_API_URL
ENV VITE_PROCESSING_API_URL=$VITE_PROCESSING_API_URL
RUN npm run build

# --- Runtime: nginx serve static ---
FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
