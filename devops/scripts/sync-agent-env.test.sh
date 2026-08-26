#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT
source_file="${tmp}/agent.env"
cat >"${source_file}" <<'ENV'
UNRELATED=do-not-copy
AGENTS_V2_ENABLED=true
AGENT_FAST_MODEL=fast
AGENT_REASONING_MODEL=reasoning
AGENT_VISION_MODEL=vision
AGENT_FAST_FALLBACK_MODEL=fast-fallback
AGENT_REASONING_FALLBACK_MODEL=reasoning-fallback
AGENT_VISION_FALLBACK_MODEL=vision-fallback
AGENT_WORKER_CONCURRENCY=2
AGENT_INDEX_WORKER_CONCURRENCY=2
AGENT_RUN_LEASE_SECONDS=120
AGENT_HEARTBEAT_SECONDS=15
GEMINI_API_KEY=secret-gemini
VOYAGE_API_KEY=secret-voyage
VOYAGE_EMBEDDING_MODEL=voyage-3.5
VOYAGE_OUTPUT_DIMENSION=2048
VOYAGE_RERANKER_MODEL=rerank-2.5
ENV
output="$(AGENT_ENV_SOURCE="${source_file}" "${SCRIPT_DIR}/sync-agent-env.sh" --check)"
[[ "${output}" == Agent\ env\ sources\ are\ ready:* ]]
[[ "${output}" != *secret-gemini* && "${output}" != *secret-voyage* ]]
sed -i.bak '/AGENT_VISION_MODEL=/d' "${source_file}"
if AGENT_ENV_SOURCE="${source_file}" "${SCRIPT_DIR}/sync-agent-env.sh" --check >/dev/null 2>&1; then
  echo "missing required role should fail" >&2; exit 1
fi
echo "sync-agent-env tests passed"
