#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SERVER="${SERVER:-myserver}"
REMOTE_DIR="${REMOTE_DIR:-/opt/tradstry}"
BACKEND_ENV_SOURCE="${BACKEND_ENV_SOURCE:-${ROOT}/backend/.env.production}"
SNAPTRADE_ENV_SOURCE="${SNAPTRADE_ENV_SOURCE:-${ROOT}/microservice/snaptrade-service/.env}"
CHECK_ONLY=false

if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
  shift
fi

if (( $# != 0 )); then
  echo "Usage: $0 [--check]" >&2
  exit 64
fi

local_payload="$(mktemp -d)"
remote_payload=""

cleanup() {
  rm -rf "${local_payload}"
  if [[ -n "${remote_payload}" && "${remote_payload}" == "${REMOTE_DIR}/.oauth-env-sync."* ]]; then
    printf -v cleanup_command 'rm -rf -- %q' "${remote_payload}"
    ssh "${SERVER}" "${cleanup_command}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

extract_keys() {
  source_file="$1"
  output_file="$2"
  shift 2
  requested_keys=("$@")

  if [[ ! -f "${source_file}" || -L "${source_file}" ]]; then
    echo "OAuth env source is missing or unsafe: ${source_file}" >&2
    return 1
  fi

  requested_list="${requested_keys[*]}"
  awk -v requested_list="${requested_list}" '
    BEGIN {
      count = split(requested_list, requested, " ")
      for (idx = 1; idx <= count; idx++) wanted[requested[idx]] = 1
    }
    /^[[:space:]]*($|#)/ { next }
    {
      separator = index($0, "=")
      key = separator ? substr($0, 1, separator - 1) : ""
      if (!(key in wanted)) next
      value = substr($0, separator + 1)
      seen[key]++
      if (value == "") {
        printf "OAuth env key is empty: %s\n", key > "/dev/stderr"
        invalid = 1
      }
      print
    }
    END {
      for (key in wanted) {
        if (seen[key] != 1) {
          printf "OAuth env key must appear exactly once: %s\n", key > "/dev/stderr"
          invalid = 1
        }
      }
      exit invalid
    }
  ' "${source_file}" >"${output_file}"
  chmod 600 "${output_file}"
}

extract_keys \
  "${BACKEND_ENV_SOURCE}" \
  "${local_payload}/backend.env" \
  SNAPTRADE_OAUTH_REDIRECT_URI \
  SNAPTRADE_OAUTH_FRONTEND_RETURN_URL

extract_keys \
  "${SNAPTRADE_ENV_SOURCE}" \
  "${local_payload}/snaptrade.env" \
  SNAPTRADE_OAUTH_CLIENT_ID \
  SNAPTRADE_OAUTH_CLIENT_SECRET

for url_key in SNAPTRADE_OAUTH_REDIRECT_URI SNAPTRADE_OAUTH_FRONTEND_RETURN_URL; do
  url_value="$(awk -F= -v key="${url_key}" '$1 == key { print substr($0, index($0, "=") + 1) }' "${local_payload}/backend.env")"
  if [[ "${url_value}" != https://* ]]; then
    echo "Production ${url_key} must use HTTPS." >&2
    exit 65
  fi
done

if "${CHECK_ONLY}"; then
  echo "OAuth env sources are ready."
  exit 0
fi

if [[ ! "${SERVER}" =~ ^[A-Za-z0-9_.@-]+$ ]]; then
  echo "Unsafe SSH server name." >&2
  exit 66
fi

if [[ ! "${REMOTE_DIR}" =~ ^/[A-Za-z0-9_./-]+$ || "${REMOTE_DIR}" == *".."* ]]; then
  echo "Unsafe remote deployment directory." >&2
  exit 67
fi

command -v ssh >/dev/null
command -v scp >/dev/null

printf -v create_command 'umask 077; mktemp -d %q' "${REMOTE_DIR}/.oauth-env-sync.XXXXXX"
remote_payload="$(ssh "${SERVER}" "${create_command}")"
if [[ "${remote_payload}" != "${REMOTE_DIR}/.oauth-env-sync."* ]]; then
  echo "Server returned an unexpected temporary directory." >&2
  remote_payload=""
  exit 68
fi

scp -q \
  "${local_payload}/backend.env" \
  "${local_payload}/snaptrade.env" \
  "${SCRIPT_DIR}/merge-env-file.sh" \
  "${SCRIPT_DIR}/apply-oauth-env-remote.sh" \
  "${SERVER}:${remote_payload}/"

printf -v apply_command \
  'chmod 700 %q/merge-env-file.sh %q/apply-oauth-env-remote.sh && DEPLOY_DIR=%q PAYLOAD_DIR=%q bash %q/apply-oauth-env-remote.sh' \
  "${remote_payload}" \
  "${remote_payload}" \
  "${REMOTE_DIR}" \
  "${remote_payload}" \
  "${remote_payload}"

ssh "${SERVER}" "${apply_command}"
