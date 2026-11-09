#!/usr/bin/env bash
set -euo pipefail

node_version=$(tr -d '\n\r' < .nvmrc)
awk -v version="$node_version" '$1 == "FROM" && $2 == "node:" version "-bookworm-slim" {n++} END {exit n != 2}' Dockerfile.vercel
task_id="pool-smoke-$(date +%s)-$$"
cleanup() {
  docker rm -f "$task_id" >/dev/null 2>&1 || true
  docker image rm "$task_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker build --platform linux/amd64 --target production -f Dockerfile.vercel \
  --build-arg EXPO_PUBLIC_SUPABASE_URL=https://ci-placeholder.invalid \
  --build-arg EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_placeholder \
  -t "$task_id" .
test "$(docker image inspect --format '{{.Architecture}}' "$task_id")" = amd64
docker run --detach --platform linux/amd64 --name "$task_id" \
  --publish 127.0.0.1::3000 "$task_id" >/dev/null
test "$(docker inspect --format '{{len .Mounts}}' "$task_id")" = 0
test "$(docker inspect --format '{{.Config.User}}' "$task_id")" = node
task_port=$(docker port "$task_id" 3000/tcp | sed 's/.*://')
node scripts/smoke.mjs "http://127.0.0.1:$task_port"
