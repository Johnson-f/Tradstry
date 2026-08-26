#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DEPLOY_DIR="${DEPLOY_DIR:-/opt/tradstry}"
PAYLOAD_DIR="${PAYLOAD_DIR:?PAYLOAD_DIR is required}"
BACKUP_ROOT="${BACKUP_ROOT:-${DEPLOY_DIR}/backups}"
ENV_OWNER="${ENV_OWNER:-tradstry-deploy}"
ENV_GROUP="${ENV_GROUP:-tradstry-deploy}"
backend_env="${DEPLOY_DIR}/backend/.env"
fragment="${PAYLOAD_DIR}/backend.env"
merge_script="${PAYLOAD_DIR}/merge-env-file.sh"

for file in "${backend_env}" "${fragment}" "${merge_script}"; do
  [[ -f "${file}" && ! -L "${file}" ]] || { echo "Required agent env sync file is missing or unsafe." >&2; exit 65; }
done
mkdir -p "${BACKUP_ROOT}"
backup_dir="${BACKUP_ROOT}/agent-env-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -m 700 "${backup_dir}"
cp -p "${backend_env}" "${backup_dir}/backend.env"

compose() { docker compose --project-name tradstry --env-file "${DEPLOY_DIR}/devops/.env" --env-file "${DEPLOY_DIR}/devops/deploy.env" -f "${DEPLOY_DIR}/devops/compose.yml" "$@"; }
rollback() {
  code=$?; trap - ERR
  echo "Agent env sync failed; restoring the previous production environment." >&2
  cp -p "${backup_dir}/backend.env" "${backend_env}" || true
  chown "${ENV_OWNER}:${ENV_GROUP}" "${backend_env}" || true; chmod 600 "${backend_env}" || true
  compose up -d --force-recreate backend >/dev/null 2>&1 || true
  exit "${code}"
}
trap rollback ERR

keys=(AGENTS_V2_ENABLED AGENT_FAST_MODEL AGENT_REASONING_MODEL AGENT_VISION_MODEL
  AGENT_FAST_FALLBACK_MODEL AGENT_REASONING_FALLBACK_MODEL AGENT_VISION_FALLBACK_MODEL
  AGENT_WORKER_CONCURRENCY AGENT_INDEX_WORKER_CONCURRENCY AGENT_RUN_LEASE_SECONDS
  AGENT_HEARTBEAT_SECONDS GEMINI_API_KEY VOYAGE_API_KEY VOYAGE_EMBEDDING_MODEL
  VOYAGE_OUTPUT_DIMENSION VOYAGE_RERANKER_MODEL)
bash "${merge_script}" "${backend_env}" "${fragment}" "${keys[@]}"
chown "${ENV_OWNER}:${ENV_GROUP}" "${backend_env}"; chmod 600 "${backend_env}"
compose config --quiet
compose up -d --force-recreate --wait --wait-timeout 180 backend
compose exec -T backend curl -fsS -o /dev/null --max-time 8 http://localhost:7899/health
trap - ERR
echo "Production agent environment updated successfully."
echo "Backup retained at ${backup_dir}."
