#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MERGE_SCRIPT="${SCRIPT_DIR}/merge-env-file.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

target="${TEST_DIR}/target.env"
fragment="${TEST_DIR}/fragment.env"
expected="${TEST_DIR}/expected.env"

cat >"${target}" <<'ENV'
KEEP_ME=unchanged
SNAPTRADE_OAUTH_REDIRECT_URI=https://old.example/callback
TAIL=value
ENV

cat >"${fragment}" <<'ENV'
SNAPTRADE_OAUTH_REDIRECT_URI=https://backend.tradstry.com/oauth/snaptrade/callback
SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=https://tradstry.com/dashboard/brokerage/oauth/callback?source=oauth#done
ENV

cat >"${expected}" <<'ENV'
KEEP_ME=unchanged
SNAPTRADE_OAUTH_REDIRECT_URI=https://backend.tradstry.com/oauth/snaptrade/callback
TAIL=value
SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=https://tradstry.com/dashboard/brokerage/oauth/callback?source=oauth#done
ENV

"${MERGE_SCRIPT}" \
  "${target}" \
  "${fragment}" \
  SNAPTRADE_OAUTH_REDIRECT_URI \
  SNAPTRADE_OAUTH_FRONTEND_RETURN_URL

diff -u "${expected}" "${target}"

cp "${target}" "${TEST_DIR}/before-invalid.env"
cat >"${fragment}" <<'ENV'
SNAPTRADE_OAUTH_REDIRECT_URI=https://backend.tradstry.com/oauth/snaptrade/callback
UNAPPROVED_SECRET=must-not-be-written
ENV

if "${MERGE_SCRIPT}" \
  "${target}" \
  "${fragment}" \
  SNAPTRADE_OAUTH_REDIRECT_URI \
  SNAPTRADE_OAUTH_FRONTEND_RETURN_URL; then
  echo "expected unapproved or missing keys to be rejected" >&2
  exit 1
fi

cmp "${TEST_DIR}/before-invalid.env" "${target}"

echo "merge-env-file tests passed"
