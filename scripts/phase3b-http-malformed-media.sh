#!/usr/bin/env bash
set -euo pipefail

base_url="${BASE_URL:-http://127.0.0.1:3101}"
root="$(cd "$(dirname "$0")/.." && pwd)"
spool_root="${MEDIA_TEMP_ROOT:?MEDIA_TEMP_ROOT is required}"
object_root="${LOCAL_OBJECT_STORAGE_ROOT:?LOCAL_OBJECT_STORAGE_ROOT is required}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT
json_field() { sed -n "s/.*\"$1\":\"\([^\"]*\)\".*/\1/p"; }
email="phase3b-malformed-$(date +%s)-$RANDOM@example.invalid"
password='phase3b-malformed-password'
curl --silent --show-error --fail -X POST "$base_url/api/v1/auth/register" -H 'content-type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\",\"displayName\":\"Malformed HTTP user\"}" >/dev/null
outbox="$(find "$root" -path '*/.local/email-outbox/*-verify_email.json' -type f -mmin -2 -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
token="$(sed -n 's/.*token=\([^"&]*\).*/\1/p' "$outbox")"
curl --silent --show-error --fail -X POST "$base_url/api/v1/auth/verify-email" -H 'content-type: application/json' --data "{\"token\":\"$token\"}" >/dev/null
auth="authorization: Bearer $(curl --silent --show-error --fail -X POST "$base_url/api/v1/auth/login" -H 'content-type: application/json' --data "{\"email\":\"$email\",\"password\":\"$password\"}" | json_field token)"
case_id="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/cases" -H "$auth" -H 'content-type: application/json' --data '{"displayLabel":"Malformed media case"}' | json_field id)"
node "$root/apps/api/scripts/create-phase3b-fixtures.mjs" "$work_dir"
head -c "${OVERSIZED_BYTES:-11534336}" /dev/zero > "$work_dir/oversized.bin"

new_session() { curl --silent --show-error --fail -X POST "$base_url/api/v1/cases/$case_id/media-uploads" -H "$auth" -H "idempotency-key: malformed-$1-$(date +%s%N)-$RANDOM" | json_field uploadId; }
object_count() { (find "$object_root" -type f ! -name '*.metadata.json' 2>/dev/null || true) | wc -l | tr -d ' '; }
assert_failed_upload() {
  local name="$1" file="$2" mime="$3" upload_id before status response session
  upload_id="$(new_session "$name")"
  before="$(object_count)"
  status="$(curl --silent --output "$work_dir/response-$name.json" --write-out '%{http_code}' -X POST "$base_url/api/v1/media-uploads/$upload_id/content" -H "$auth" --form "file=@$file;type=$mime")"
  test "$status" -ge 400
  response="$(cat "$work_dir/response-$name.json")"
  printf '%s' "$response" | grep -Eq 'MEDIA_EMPTY|UNSUPPORTED_MEDIA_FORMAT|MEDIA_DECODE_FAILED|MEDIA_TOO_LARGE|MEDIA_DIMENSIONS_INVALID|PERSISTENCE_FAILED'
  session="$(curl --silent --show-error --fail "$base_url/api/v1/media-uploads/$upload_id" -H "$auth")"
  printf '%s' "$session" | grep -q '"status":"failed"'
  ! printf '%s' "$session" | grep -Eq 'processingToken|targetStorageKey|storageKey|mediaId|sha256'
  test "$(object_count)" = "$before"
  test -z "$(find "$spool_root" -type f -name '*.spool' -print -quit 2>/dev/null)"
}
assert_failed_upload empty "$work_dir/empty.bin" application/octet-stream
assert_failed_upload random "$work_dir/random.bin" image/png
assert_failed_upload truncated-png "$work_dir/truncated.png" image/png
assert_failed_upload truncated-jpeg "$work_dir/truncated.jpg" image/jpeg
assert_failed_upload header-only "$work_dir/header-only.png" image/png
assert_failed_upload oversized "$work_dir/oversized.bin" application/octet-stream

duplicate_upload="$(new_session duplicate-files)"
duplicate_status="$(curl --silent --output "$work_dir/duplicate.json" --write-out '%{http_code}' -X POST "$base_url/api/v1/media-uploads/$duplicate_upload/content" -H "$auth" --form "file=@$work_dir/valid.png;type=image/png" --form "second=@$work_dir/valid.jpg;type=image/jpeg")"
test "$duplicate_status" -ge 400
duplicate_session="$(curl --silent --show-error --fail "$base_url/api/v1/media-uploads/$duplicate_upload" -H "$auth")"
printf '%s' "$duplicate_session" | grep -Eq '"status":"(created|failed)"'
! printf '%s' "$duplicate_session" | grep -Eq 'processingToken|targetStorageKey|storageKey|mediaId|sha256'

valid_upload="$(new_session misleading-mime)"
valid_response="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/media-uploads/$valid_upload/content" -H "$auth" --form "file=@$work_dir/valid.png;type=text/plain")"
printf '%s' "$valid_response" | grep -q '"status":"committed"'
chunked_upload="$(new_session unknown-length)"
chunked_response="$(curl --silent --show-error --fail -X POST "$base_url/api/v1/media-uploads/$chunked_upload/content" -H "$auth" -H 'Transfer-Encoding: chunked' --form "file=@$work_dir/valid.png;type=image/png")"
printf '%s' "$chunked_response" | grep -q '"status":"committed"'
missing_upload="$(new_session missing-file)"
missing_status="$(curl --silent --output "$work_dir/missing.json" --write-out '%{http_code}' -X POST "$base_url/api/v1/media-uploads/$missing_upload/content" -H "$auth" -H 'content-type: multipart/form-data; boundary=absent')"
test "$missing_status" -ge 400
! grep -Eq 'processingToken|targetStorageKey|storageKey|mediaId|sha256' "$work_dir/missing.json"
missing_session="$(curl --silent --show-error --fail "$base_url/api/v1/media-uploads/$missing_upload" -H "$auth")"
printf '%s' "$missing_session" | grep -q '"status":"created"'
! printf '%s' "$missing_session" | grep -Eq 'processingToken|targetStorageKey|storageKey|mediaId|sha256'
test -z "$(find "$spool_root" -type f -name '*.spool' -print -quit 2>/dev/null)"
printf '%s\n' 'phase3b-http-malformed-media: PASS'
