#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:3101}"
root="$(cd "$(dirname "$0")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

json_field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }
register_and_login() {
  local label="$1"
  local slug="$2"
  local email="phase3b-isolation-${slug}-$(date +%s)-$RANDOM@example.invalid"
  local password='phase3b-isolation-password'
  curl --silent --show-error --fail -X POST "$base_url/api/v1/auth/register" -H 'content-type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\",\"displayName\":\"$label\"}" >/dev/null
  local outbox token login
  outbox="$(find "$root" -path '*/.local/email-outbox/*-verify_email.json' -type f -mmin -2 -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
  token="$(sed -n 's/.*token=\([^"&]*\).*/\1/p' "$outbox")"
  curl --silent --show-error --fail -X POST "$base_url/api/v1/auth/verify-email" -H 'content-type: application/json' --data "{\"token\":\"$token\"}" >/dev/null
  login="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/auth/login" -H 'content-type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\"}")"
  printf '%s' "$login" | json_field token
}

user_a_token="$(register_and_login 'User A' 'user-a')"
user_b_token="$(register_and_login 'User B' 'user-b')"
auth_a="authorization: Bearer $user_a_token"
auth_b="authorization: Bearer $user_b_token"
case_a="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/cases" -H "$auth_a" -H 'content-type: application/json' --data '{"displayLabel":"User A isolation case"}' | json_field id)"
upload_a="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/cases/$case_a/media-uploads" -H "$auth_a" -H 'idempotency-key: phase3b-cross-user-0001' | json_field uploadId)"
node "$root/apps/api/scripts/create-phase3b-fixtures.mjs" "$work_dir"
media_a="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/media-uploads/$upload_a/content" -H "$auth_a" --form "file=@$work_dir/valid.png;type=image/png" | json_field mediaId)"

for request in \
  "GET|$base_url/api/v1/media-uploads/$upload_a" \
  "GET|$base_url/api/v1/media/$media_a/content" \
  "POST|$base_url/api/v1/media-uploads/$upload_a/content"; do
  IFS='|' read -r method url <<< "$request"
  if [ "$method" = POST ]; then
    status="$(curl --silent --output "$work_dir/response" --write-out '%{http_code}' -X POST "$url" -H "$auth_b" -H 'X-Owner-User-Id: forged' -H 'ownerUserId: forged' -H 'userId: forged' --form "file=@$work_dir/valid.png;type=image/png")"
  else
    status="$(curl --silent --output "$work_dir/response" --write-out '%{http_code}' -X GET "$url" -H "$auth_b" -H 'X-Owner-User-Id: forged' -H 'ownerUserId: forged' -H 'userId: forged')"
  fi
  test "$status" = 404
  ! grep -Eq 'processingToken|targetStorageKey|storageKey|mediaId|sha256' "$work_dir/response"
done
printf '%s\n' 'phase3b-http-cross-user-isolation: PASS'
