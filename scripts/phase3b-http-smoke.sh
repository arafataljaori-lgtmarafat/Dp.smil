#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:3101}"
root="$(cd "$(dirname "$0")/.." && pwd)"
email="phase3b-smoke-$(date +%s)-$RANDOM@example.invalid"
password='phase3b-smoke-password'
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

json_field() {
  local field="$1"
  sed -n "s/.*\"${field}\":\"\([^\"]*\)\".*/\1/p"
}

register="$(curl --silent --show-error --fail --request POST "$base_url/api/v1/auth/register" --header 'content-type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\",\"displayName\":\"Phase 3B smoke\"}")"
test -n "$(printf '%s' "$register" | json_field id)"

outbox="$(find "$root" -path '*/.local/email-outbox/*-verify_email.json' -type f -mmin -2 -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
test -n "$outbox"
verification_token="$(sed -n 's/.*token=\([^"&]*\).*/\1/p' "$outbox")"
test -n "$verification_token"
curl --silent --show-error --fail --request POST "$base_url/api/v1/auth/verify-email" --header 'content-type: application/json' --data "{\"token\":\"$verification_token\"}" >/dev/null

login="$(curl --silent --show-error --fail --request POST "$base_url/api/v1/auth/login" --header 'content-type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\"}")"
token="$(printf '%s' "$login" | json_field token)"
test -n "$token"
auth="authorization: Bearer $token"

patient_case="$(curl --silent --show-error --fail --request POST "$base_url/api/v1/cases" --header "$auth" --header 'content-type: application/json' --data '{"displayLabel":"Phase 3B smoke case"}')"
case_id="$(printf '%s' "$patient_case" | json_field id)"
test -n "$case_id"

created="$(curl --silent --show-error --fail --request POST "$base_url/api/v1/cases/$case_id/media-uploads" --header "$auth" --header 'idempotency-key: phase3b-http-smoke-key-0001')"
upload_id="$(printf '%s' "$created" | json_field uploadId)"
test -n "$upload_id"

node "$root/apps/api/scripts/create-phase3b-fixtures.mjs" "$work_dir"
committed="$(curl --silent --show-error --fail --request POST "$base_url/api/v1/media-uploads/$upload_id/content" --header "$auth" --form "file=@$work_dir/valid.png;type=image/png")"
media_id="$(printf '%s' "$committed" | json_field mediaId)"
test -n "$media_id"
printf '%s' "$committed" | grep -q '"status":"committed"'

curl --silent --show-error --fail --dump-header "$work_dir/headers" --output "$work_dir/downloaded.png" --header "$auth" "$base_url/api/v1/media/$media_id/content"
cmp "$work_dir/valid.png" "$work_dir/downloaded.png"
grep -qi '^cache-control: private, no-store' "$work_dir/headers"
grep -qi '^x-content-type-options: nosniff' "$work_dir/headers"
grep -qi '^content-type: image/png' "$work_dir/headers"
printf '%s\n' 'phase3b-http-smoke: PASS'
