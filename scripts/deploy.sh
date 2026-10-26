#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy .env.example to .env and fill JWT_SECRET, GEMINI_API_KEY, and N8N_API_KEY."
  exit 1
fi

echo "Building and starting backend + MySQL..."
docker compose up --build -d

echo "Waiting for API health..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost:3001/api/health | grep -q '"status":"ok"'; then
    echo "Deployed. API: http://localhost:3001/api"
    echo "Docs: http://localhost:3001/api/docs"
    exit 0
  fi
  sleep 2
done

echo "Backend did not become healthy. Check: docker compose logs backend"
exit 1
