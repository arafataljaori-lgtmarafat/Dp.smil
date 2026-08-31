#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

: "${DATABASE_URL:?DATABASE_URL is required}"
base_url="${DATABASE_URL%%\?*}"
admin_url="${base_url%/*}/postgres"
suffix="$(date +%s%N)"
fresh_db="dentpilot_p4a_fresh_${suffix}"
upgrade_db="dentpilot_p4a_upgrade_${suffix}"

cleanup() {
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${fresh_db}\";" >/dev/null 2>&1 || true
  psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${upgrade_db}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fresh_url="${base_url%/*}/${fresh_db}?schema=public"
upgrade_url="${base_url%/*}/${upgrade_db}?schema=public"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${fresh_db}\";" >/dev/null
DATABASE_URL="$fresh_url" pnpm --filter @dentpilot/api exec prisma migrate deploy
DATABASE_URL="$fresh_url" pnpm --filter @dentpilot/api exec prisma validate
DATABASE_URL="$fresh_url" pnpm --dir apps/api exec prisma migrate diff --from-url "$fresh_url" --to-schema-datamodel prisma/schema.prisma --exit-code

psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${upgrade_db}\";" >/dev/null
mapfile -t migrations < <(find apps/api/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
if [ "${#migrations[@]}" -lt 2 ]; then
  printf '%s\n' 'Phase 4A migration verification requires historical migrations plus the Phase 4A migration.' >&2
  exit 1
fi
for migration in "${migrations[@]:0:${#migrations[@]}-1}"; do
  psql "${upgrade_url%%\?*}" -v ON_ERROR_STOP=1 -f "apps/api/prisma/migrations/${migration}/migration.sql" >/dev/null
done
for migration in "${migrations[@]:0:${#migrations[@]}-1}"; do
  DATABASE_URL="$upgrade_url" pnpm --filter @dentpilot/api exec prisma migrate resolve --applied "$migration" >/dev/null
done
DATABASE_URL="$upgrade_url" pnpm --filter @dentpilot/api exec prisma migrate deploy
DATABASE_URL="$upgrade_url" pnpm --filter @dentpilot/api exec prisma validate
DATABASE_URL="$upgrade_url" pnpm --dir apps/api exec prisma migrate diff --from-url "$upgrade_url" --to-schema-datamodel prisma/schema.prisma --exit-code
printf 'phase4a-verify-migrations: PASS (%s migrations)\n' "${#migrations[@]}"
