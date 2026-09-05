#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "${tmp}"' EXIT
source_file="${tmp}/agent.env"
cat >"${source_file}" <<'ENV'
UNRELATED=do-not-copy
AGENTS_V2_ENABLED=true
AGENT_MODEL_PROVIDER=perplexity
AGENT_FAST_MODEL=fast
AGENT_REASONING_MODEL=reasoning
AGENT_VISION_MODEL=vision
GEMINI_API_KEY=secret-gemini
PERPLEXITY_API_KEY=secret-perplexity
VOYAGE_API_KEY=secret-voyage
ENV
output="$(AGENT_ENV_SOURCE="${source_file}" "${SCRIPT_DIR}/sync-agent-env.sh" --check)"
[[ "${output}" == Agent\ env\ source\ is\ ready\ for\ provider\ perplexity* ]]
[[ "${output}" != *secret-gemini* && "${output}" != *secret-perplexity* && "${output}" != *secret-voyage* ]]
sed -i.bak '/AGENT_VISION_MODEL=/d' "${source_file}"
if AGENT_ENV_SOURCE="${source_file}" "${SCRIPT_DIR}/sync-agent-env.sh" --check >/dev/null 2>&1; then
  echo "missing required role should fail" >&2; exit 1
fi
mv "${source_file}.bak" "${source_file}"
sed -i.bak '/PERPLEXITY_API_KEY=/d' "${source_file}"
if AGENT_ENV_SOURCE="${source_file}" "${SCRIPT_DIR}/sync-agent-env.sh" --check >/dev/null 2>&1; then
  echo "missing selected provider key should fail" >&2; exit 1
fi
mv "${source_file}.bak" "${source_file}"
printf 'AGENT_PROVIDER_BURST=6\n' >>"${source_file}"
output="$(AGENT_ENV_SOURCE="${source_file}" "${SCRIPT_DIR}/sync-agent-env.sh" --check)"
[[ "${output}" == *AGENT_PROVIDER_BURST* ]]
echo "sync-agent-env tests passed"
