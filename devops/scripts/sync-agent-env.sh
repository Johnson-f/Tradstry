#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SERVER="${SERVER:-myserver}"
REMOTE_DIR="${REMOTE_DIR:-/opt/tradstry}"
SOURCE="${AGENT_ENV_SOURCE:-${ROOT}/backend/.env.production}"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && { CHECK_ONLY=true; shift; }
(( $# == 0 )) || { echo "Usage: $0 [--check]" >&2; exit 64; }
[[ -f "${SOURCE}" && ! -L "${SOURCE}" ]] || { echo "Agent env source is missing or unsafe." >&2; exit 65; }

keys=(AGENTS_V2_ENABLED AGENT_FAST_MODEL AGENT_REASONING_MODEL AGENT_VISION_MODEL
  AGENT_FAST_FALLBACK_MODEL AGENT_REASONING_FALLBACK_MODEL AGENT_VISION_FALLBACK_MODEL
  AGENT_WORKER_CONCURRENCY AGENT_INDEX_WORKER_CONCURRENCY AGENT_RUN_LEASE_SECONDS
  AGENT_HEARTBEAT_SECONDS GEMINI_API_KEY VOYAGE_API_KEY VOYAGE_EMBEDDING_MODEL
  VOYAGE_OUTPUT_DIMENSION VOYAGE_RERANKER_MODEL)
payload="$(mktemp -d)"; remote_payload=""
cleanup() { rm -rf "${payload}"; if [[ -n "${remote_payload}" && "${remote_payload}" == "${REMOTE_DIR}/.agent-env-sync."* ]]; then printf -v cmd 'rm -rf -- %q' "${remote_payload}"; ssh "${SERVER}" "${cmd}" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT
requested="${keys[*]}"
awk -v requested="${requested}" '
BEGIN { n=split(requested,a," "); for(i=1;i<=n;i++) wanted[a[i]]=1 }
/^[[:space:]]*($|#)/ { next }
{ p=index($0,"="); k=p?substr($0,1,p-1):""; if(!(k in wanted)) next; v=substr($0,p+1); seen[k]++; if(v==""){printf "Agent env key is empty: %s\n",k>"/dev/stderr"; bad=1} print }
END { for(k in wanted) if(seen[k]!=1){printf "Agent env key must appear exactly once: %s\n",k>"/dev/stderr";bad=1} exit bad }
' "${SOURCE}" >"${payload}/backend.env"
chmod 600 "${payload}/backend.env"
enabled="$(awk -F= '$1=="AGENTS_V2_ENABLED"{print $2}' "${payload}/backend.env")"
[[ "${enabled}" == "true" || "${enabled}" == "false" ]] || { echo "AGENTS_V2_ENABLED must be true or false." >&2; exit 66; }
if "${CHECK_ONLY}"; then echo "Agent env sources are ready: ${keys[*]}"; exit 0; fi
[[ "${SERVER}" =~ ^[A-Za-z0-9_.@-]+$ ]] || exit 67
[[ "${REMOTE_DIR}" =~ ^/[A-Za-z0-9_./-]+$ && "${REMOTE_DIR}" != *".."* ]] || exit 68
printf -v cmd 'umask 077; mktemp -d %q' "${REMOTE_DIR}/.agent-env-sync.XXXXXX"
remote_payload="$(ssh "${SERVER}" "${cmd}")"
[[ "${remote_payload}" == "${REMOTE_DIR}/.agent-env-sync."* ]] || { remote_payload=""; exit 69; }
scp -q "${payload}/backend.env" "${SCRIPT_DIR}/merge-env-file.sh" "${SCRIPT_DIR}/apply-agent-env-remote.sh" "${SERVER}:${remote_payload}/"
printf -v cmd 'chmod 700 %q/merge-env-file.sh %q/apply-agent-env-remote.sh && DEPLOY_DIR=%q PAYLOAD_DIR=%q bash %q/apply-agent-env-remote.sh' "${remote_payload}" "${remote_payload}" "${REMOTE_DIR}" "${remote_payload}" "${remote_payload}"
ssh "${SERVER}" "${cmd}"
