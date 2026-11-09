#!/usr/bin/env bash
set -euo pipefail

# Never read or replace the developer's .env.local, or require their network.
task_dir=$(mktemp -d)
trap 'rm -rf "$task_dir"' EXIT
cp compose.yaml "$task_dir/compose.yaml"
cat > "$task_dir/.env.local" <<'ENV'
EXPO_PUBLIC_SUPABASE_URL=https://ci-placeholder.invalid
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ci_placeholder
ENV
docker compose --project-directory "$task_dir" -f "$task_dir/compose.yaml" config --quiet
echo 'Compose configuration: OK (disposable placeholder environment)'
