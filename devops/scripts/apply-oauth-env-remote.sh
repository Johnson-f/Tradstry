#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

DEPLOY_DIR="${DEPLOY_DIR:-/opt/tradstry}"
PAYLOAD_DIR="${PAYLOAD_DIR:?PAYLOAD_DIR is required}"
BACKUP_ROOT="${BACKUP_ROOT:-${DEPLOY_DIR}/backups}"
ENV_OWNER="${ENV_OWNER:-tradstry-deploy}"
ENV_GROUP="${ENV_GROUP:-tradstry-deploy}"

backend_env="${DEPLOY_DIR}/backend/.env"
snaptrade_env="${DEPLOY_DIR}/microservice/snaptrade-service/.env"
merge_script="${PAYLOAD_DIR}/merge-env-file.sh"

for required_file in \
  "${backend_env}" \
  "${snaptrade_env}" \
  "${PAYLOAD_DIR}/backend.env" \
  "${PAYLOAD_DIR}/snaptrade.env" \
  "${merge_script}"; do
  if [[ ! -f "${required_file}" || -L "${required_file}" ]]; then
    echo "Required OAuth sync file is missing or unsafe: ${required_file}" >&2
    exit 65
  fi
done

mkdir -p "${BACKUP_ROOT}"
backup_dir="${BACKUP_ROOT}/oauth-env-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 "${backup_dir}"
cp -p "${backend_env}" "${backup_dir}/backend.env"
cp -p "${snaptrade_env}" "${backup_dir}/snaptrade.env"

compose() {
  docker compose \
    --project-name tradstry \
    --env-file "${DEPLOY_DIR}/devops/.env" \
    --env-file "${DEPLOY_DIR}/devops/deploy.env" \
    -f "${DEPLOY_DIR}/devops/compose.yml" \
    "$@"
}

rollback() {
  failure_code=$?
  trap - ERR
  echo "OAuth env sync failed; restoring the previous production env files." >&2
  cp -p "${backup_dir}/backend.env" "${backend_env}" || true
  cp -p "${backup_dir}/snaptrade.env" "${snaptrade_env}" || true
  chown "${ENV_OWNER}:${ENV_GROUP}" "${backend_env}" "${snaptrade_env}" || true
  chmod 600 "${backend_env}" "${snaptrade_env}" || true
  compose up -d --force-recreate snaptrade-service backend >/dev/null 2>&1 || true
  exit "${failure_code}"
}
trap rollback ERR

bash "${merge_script}" \
  "${backend_env}" \
  "${PAYLOAD_DIR}/backend.env" \
  SNAPTRADE_OAUTH_REDIRECT_URI \
  SNAPTRADE_OAUTH_FRONTEND_RETURN_URL

bash "${merge_script}" \
  "${snaptrade_env}" \
  "${PAYLOAD_DIR}/snaptrade.env" \
  SNAPTRADE_OAUTH_CLIENT_ID \
  SNAPTRADE_OAUTH_CLIENT_SECRET

chown "${ENV_OWNER}:${ENV_GROUP}" "${backend_env}" "${snaptrade_env}"
chmod 600 "${backend_env}" "${snaptrade_env}"

echo "Validating production Compose configuration..."
compose config --quiet

echo "Recreating SnapTrade and backend services..."
compose up \
  -d \
  --force-recreate \
  --wait \
  --wait-timeout 180 \
  snaptrade-service backend

echo "Verifying production services..."
compose exec -T backend \
  curl -fsS -o /dev/null --max-time 8 http://localhost:7899/health
compose exec -T snaptrade-service \
  sh -c 'test -S /run/tradstry/snaptrade.sock && kill -0 1'

trap - ERR
echo "Production OAuth environment updated successfully."
echo "Backup retained at ${backup_dir}."
