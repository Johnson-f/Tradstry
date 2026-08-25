#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY_SCRIPT="${SCRIPT_DIR}/apply-oauth-env-remote.sh"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

deploy_dir="${TEST_DIR}/deploy"
payload_dir="${TEST_DIR}/payload"
fake_bin="${TEST_DIR}/bin"
mkdir -p \
  "${deploy_dir}/backend" \
  "${deploy_dir}/microservice/snaptrade-service" \
  "${deploy_dir}/devops" \
  "${payload_dir}" \
  "${fake_bin}"

cat >"${deploy_dir}/backend/.env" <<'ENV'
KEEP_BACKEND=yes
SNAPTRADE_OAUTH_REDIRECT_URI=https://old.example/callback
ENV

cat >"${deploy_dir}/microservice/snaptrade-service/.env" <<'ENV'
KEEP_ADAPTER=yes
SNAPTRADE_OAUTH_CLIENT_ID=old-client
ENV

cp "${SCRIPT_DIR}/merge-env-file.sh" "${payload_dir}/merge-env-file.sh"
cat >"${payload_dir}/backend.env" <<'ENV'
SNAPTRADE_OAUTH_REDIRECT_URI=https://backend.tradstry.com/oauth/snaptrade/callback
SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=https://tradstry.com/dashboard/brokerage/oauth/callback
ENV
cat >"${payload_dir}/snaptrade.env" <<'ENV'
SNAPTRADE_OAUTH_CLIENT_ID=new-client
SNAPTRADE_OAUTH_CLIENT_SECRET=new-secret
ENV

cat >"${fake_bin}/docker" <<'SH'
#!/usr/bin/env bash
set -eu
if [[ "${FAIL_HEALTH:-0}" == "1" && "$*" == *"exec -T backend"* ]]; then
  exit 1
fi
exit 0
SH
chmod 755 "${fake_bin}/docker"

test_user="$(id -un)"
test_group="$(id -gn)"

PATH="${fake_bin}:${PATH}" \
  DEPLOY_DIR="${deploy_dir}" \
  PAYLOAD_DIR="${payload_dir}" \
  BACKUP_ROOT="${TEST_DIR}/backups" \
  ENV_OWNER="${test_user}" \
  ENV_GROUP="${test_group}" \
  "${APPLY_SCRIPT}"

grep -qx 'KEEP_BACKEND=yes' "${deploy_dir}/backend/.env"
grep -qx 'SNAPTRADE_OAUTH_FRONTEND_RETURN_URL=https://tradstry.com/dashboard/brokerage/oauth/callback' \
  "${deploy_dir}/backend/.env"
grep -qx 'KEEP_ADAPTER=yes' "${deploy_dir}/microservice/snaptrade-service/.env"
grep -qx 'SNAPTRADE_OAUTH_CLIENT_SECRET=new-secret' \
  "${deploy_dir}/microservice/snaptrade-service/.env"

cp "${deploy_dir}/backend/.env" "${TEST_DIR}/before-failure-backend.env"
cp "${deploy_dir}/microservice/snaptrade-service/.env" \
  "${TEST_DIR}/before-failure-snaptrade.env"
sed -i.bak 's#https://backend.tradstry.com#https://changed.tradstry.com#' \
  "${payload_dir}/backend.env"

if PATH="${fake_bin}:${PATH}" \
  FAIL_HEALTH=1 \
  DEPLOY_DIR="${deploy_dir}" \
  PAYLOAD_DIR="${payload_dir}" \
  BACKUP_ROOT="${TEST_DIR}/backups" \
  ENV_OWNER="${test_user}" \
  ENV_GROUP="${test_group}" \
  "${APPLY_SCRIPT}" >/dev/null 2>&1; then
  echo "expected failed health verification to roll back" >&2
  exit 1
fi

cmp "${TEST_DIR}/before-failure-backend.env" "${deploy_dir}/backend/.env"
cmp "${TEST_DIR}/before-failure-snaptrade.env" \
  "${deploy_dir}/microservice/snaptrade-service/.env"

echo "apply-oauth-env-remote tests passed"
