#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYNC_SCRIPT="${SCRIPT_DIR}/sync-oauth-env.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

backend_source="${TEST_DIR}/backend.env"
snaptrade_source="${TEST_DIR}/snaptrade.env"

cat >"${backend_source}" <<'ENV'
UNRELATED_BACKEND_VALUE=preserved
SNAPTRADE_OAUTH_REDIRECT_URI=https://backend.tradstry.com/oauth/snaptrade/callback
SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=https://tradstry.com/dashboard/brokerage/oauth/callback
ENV

cat >"${snaptrade_source}" <<'ENV'
SNAPTRADE_OAUTH_CLIENT_ID=client-id
UNRELATED_ADAPTER_VALUE=preserved
SNAPTRADE_OAUTH_CLIENT_SECRET=secret=with-equals#and-hash
ENV

output="$({
  BACKEND_ENV_SOURCE="${backend_source}" \
    SNAPTRADE_ENV_SOURCE="${snaptrade_source}" \
    "${SYNC_SCRIPT}" --check
} 2>&1)"

if [[ "${output}" != "OAuth env sources are ready." ]]; then
  echo "unexpected check output: ${output}" >&2
  exit 1
fi

sed -i.bak \
  's#https://backend.tradstry.com#http://backend.tradstry.com#' \
  "${backend_source}"

if BACKEND_ENV_SOURCE="${backend_source}" \
  SNAPTRADE_ENV_SOURCE="${snaptrade_source}" \
  "${SYNC_SCRIPT}" --check >/dev/null 2>&1; then
  echo "expected an insecure production OAuth URL to be rejected" >&2
  exit 1
fi

echo "sync-oauth-env tests passed"
