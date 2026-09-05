#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

deploy_dir="${TEST_DIR}/deploy"
payload_dir="${TEST_DIR}/payload"
backup_root="${TEST_DIR}/backups"
fake_bin="${TEST_DIR}/bin"
mkdir -p "${deploy_dir}/backend" "${deploy_dir}/devops" "${payload_dir}" "${fake_bin}"
touch "${deploy_dir}/devops/.env" "${deploy_dir}/devops/deploy.env" "${deploy_dir}/devops/compose.yml"

cat >"${deploy_dir}/backend/.env" <<'ENV'
KEEP_ME=unchanged
AGENTS_V2_ENABLED=false
AGENT_FAST_MODEL=old-fast
GEMINI_API_KEY=existing-provider-key
ENV

cat >"${payload_dir}/backend.env" <<'ENV'
AGENTS_V2_ENABLED=true
AGENT_MODEL_PROVIDER=perplexity
AGENT_FAST_MODEL=fast
AGENT_REASONING_MODEL=reasoning
AGENT_VISION_MODEL=vision
AGENT_PROVIDER_BURST=6
PERPLEXITY_API_KEY=perplexity-secret
VOYAGE_API_KEY=voyage-secret
ENV

cp "${SCRIPT_DIR}/merge-env-file.sh" "${payload_dir}/merge-env-file.sh"
cat >"${fake_bin}/docker" <<'SH'
#!/usr/bin/env bash
exit 0
SH
chmod +x "${fake_bin}/docker"

PATH="${fake_bin}:${PATH}" \
DEPLOY_DIR="${deploy_dir}" PAYLOAD_DIR="${payload_dir}" BACKUP_ROOT="${backup_root}" \
ENV_OWNER="$(id -un)" ENV_GROUP="$(id -gn)" \
  bash "${SCRIPT_DIR}/apply-agent-env-remote.sh" >/dev/null

grep -q '^KEEP_ME=unchanged$' "${deploy_dir}/backend/.env"
grep -q '^AGENTS_V2_ENABLED=true$' "${deploy_dir}/backend/.env"
grep -q '^AGENT_MODEL_PROVIDER=perplexity$' "${deploy_dir}/backend/.env"
grep -q '^AGENT_FAST_MODEL=fast$' "${deploy_dir}/backend/.env"
grep -q '^AGENT_PROVIDER_BURST=6$' "${deploy_dir}/backend/.env"
grep -q '^PERPLEXITY_API_KEY=perplexity-secret$' "${deploy_dir}/backend/.env"
grep -q '^GEMINI_API_KEY=existing-provider-key$' "${deploy_dir}/backend/.env"
[[ "$(find "${backup_root}" -name backend.env -type f | wc -l | tr -d ' ')" == 1 ]]

cp "${deploy_dir}/backend/.env" "${TEST_DIR}/before-invalid.env"
printf 'UNAPPROVED_SECRET=never-write\n' >>"${payload_dir}/backend.env"
if PATH="${fake_bin}:${PATH}" \
  DEPLOY_DIR="${deploy_dir}" PAYLOAD_DIR="${payload_dir}" BACKUP_ROOT="${backup_root}" \
  ENV_OWNER="$(id -un)" ENV_GROUP="$(id -gn)" \
    bash "${SCRIPT_DIR}/apply-agent-env-remote.sh" >/dev/null 2>&1; then
  echo "unapproved agent key should fail" >&2
  exit 1
fi
cmp "${TEST_DIR}/before-invalid.env" "${deploy_dir}/backend/.env"

echo "apply-agent-env-remote tests passed"
