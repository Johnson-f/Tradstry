#!/usr/bin/env bash
# The forced command for the CI deploy key. It is installed root-owned as
# /usr/local/sbin/tradstry-deploy, so no commit can change it:
#   restrict,command="/usr/local/sbin/tradstry-deploy" ssh-ed25519 AAAA... tradstry-semaphore
# The key can only run `deploy <commit> sha-<commit>`. The deploy script is
# taken from that commit once it is confirmed to be on master. Registry
# credentials arrive on stdin and pass through to it.

set -Eeuo pipefail

readonly DEPLOY_DIR="/srv/tradstry"
readonly REQUESTED_COMMAND="${SSH_ORIGINAL_COMMAND:-}"

deny() {
  echo "Access denied: $1" >&2
  exit 64
}

if [[ ! "${REQUESTED_COMMAND}" =~ ^deploy[[:space:]]([0-9a-f]{40})[[:space:]](sha-[0-9a-f]{40})$ ]]; then
  deny "this key can only deploy an exact commit from master."
fi
readonly COMMIT_SHA="${BASH_REMATCH[1]}"
readonly IMAGE_TAG="${BASH_REMATCH[2]}"
if [[ "${IMAGE_TAG}" != "sha-${COMMIT_SHA}" ]]; then
  deny "the image tag must be sha-<commit>."
fi

# v1 uses the same Compose project name, so deploying beside it would remove
# its containers as orphans. It has to be stopped first (docs/deploy.md).
others="$(docker ps -a --filter label=com.docker.compose.project=tradstry \
  --format '{{.Label "com.docker.compose.project.working_dir"}}' </dev/null |
  grep -vx "${DEPLOY_DIR}/deploy" | sort -u | paste -sd, - || true)"
if [[ -n "${others}" ]]; then
  deny "another tradstry stack has containers here (${others}). Stop v1 first."
fi

cd "${DEPLOY_DIR}"
git fetch --quiet origin master:refs/remotes/origin/master </dev/null
if ! git merge-base --is-ancestor "${COMMIT_SHA}" origin/master; then
  deny "${COMMIT_SHA} is not on master."
fi

script="$(mktemp)"
trap 'rm -f "${script}"' EXIT
git show "${COMMIT_SHA}:deploy/scripts/deploy.sh" >"${script}"

status=0
env -i \
  HOME="${HOME}" \
  LOGNAME="${LOGNAME:-$(id -un)}" \
  USER="${USER:-$(id -un)}" \
  PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  DEPLOY_DIR="${DEPLOY_DIR}" \
  bash "${script}" "${COMMIT_SHA}" "${IMAGE_TAG}" || status=$?
exit "${status}"
