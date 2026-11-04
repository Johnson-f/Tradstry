#!/usr/bin/env bash
# The forced command for the deploy key in authorized_keys:
#   command="/srv/tradstry/deploy/scripts/ssh-deploy-command.sh",restrict ssh-ed25519 ...
# The key can only run `deploy <commit> sha-<commit>`, nothing else.

set -Eeuo pipefail

readonly DEPLOY_DIR="/srv/tradstry"
readonly REQUESTED_COMMAND="${SSH_ORIGINAL_COMMAND:-}"

deny() {
  echo "Access denied: this key can only deploy an exact commit from master." >&2
  exit 64
}

if [[ ! "${REQUESTED_COMMAND}" =~ ^deploy[[:space:]]([0-9a-f]{40})[[:space:]](sha-[0-9a-f]{40})$ ]]; then
  deny
fi
readonly COMMIT_SHA="${BASH_REMATCH[1]}"
readonly IMAGE_TAG="${BASH_REMATCH[2]}"
if [[ "${IMAGE_TAG}" != "sha-${COMMIT_SHA}" ]]; then
  deny
fi

exec env -i \
  HOME="${HOME}" \
  LOGNAME="${LOGNAME:-$(id -un)}" \
  USER="${USER:-$(id -un)}" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  DEPLOY_DIR="${DEPLOY_DIR}" \
  "${DEPLOY_DIR}/deploy/scripts/deploy.sh" \
  "${COMMIT_SHA}" \
  "${IMAGE_TAG}"
