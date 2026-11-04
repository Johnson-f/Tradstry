#!/usr/bin/env bash
# Deploys one commit of master with its image, on the VPS. Run through
# ssh-deploy-command.sh by the release workflow. On any failure it restores the
# previous commit and image.

set -Eeuo pipefail
umask 077

DEPLOY_DIR="${DEPLOY_DIR:-/srv/tradstry}"
COMMIT_SHA="${1:-}"
IMAGE_TAG="${2:-}"
LOCK_FILE="${DEPLOY_DIR}/.deploy.lock"
DEPLOY_ENV="${DEPLOY_DIR}/deploy/deploy.env"
PREVIOUS_ENV="${DEPLOY_DIR}/deploy/deploy.env.previous"

compose() {
  docker compose \
    --env-file deploy/.env \
    --env-file deploy/deploy.env \
    -f deploy/compose.yml \
    "$@"
}

# Keeps this release's image and the previous one (the rollback target).
prune_old_images() {
  local keep_previous="$1" repo tag
  repo="$(compose config --images | grep ":${IMAGE_TAG}\$" | sed 's/:[^:]*$//')"
  docker image ls "${repo}" --format '{{.Tag}}' | while read -r tag; do
    if [[ "${tag}" == "${IMAGE_TAG}" || "${tag}" == "${keep_previous}" || "${tag}" == "<none>" ]]; then
      continue
    fi
    docker image rm "${repo}:${tag}" >/dev/null 2>&1 || echo "Kept ${repo}:${tag}; it is still in use."
  done
  docker image prune --force >/dev/null
}

if [[ ! "${COMMIT_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Error: the commit must be a full 40-character Git SHA." >&2
  exit 2
fi
if [[ "${IMAGE_TAG}" != "sha-${COMMIT_SHA}" ]]; then
  echo "Error: the image tag must be sha-<commit>." >&2
  exit 2
fi

cd "${DEPLOY_DIR}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Error: another deployment is running." >&2
  exit 3
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: tracked files on the server checkout have local changes." >&2
  exit 4
fi

echo "Fetching ${COMMIT_SHA}..."
git fetch --quiet origin master:refs/remotes/origin/master
git cat-file -e "${COMMIT_SHA}^{commit}"
if ! git merge-base --is-ancestor "${COMMIT_SHA}" origin/master; then
  echo "Error: ${COMMIT_SHA} is not on origin/master." >&2
  exit 5
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"
PREVIOUS_TAG=""
if [[ -f "${DEPLOY_ENV}" ]]; then
  PREVIOUS_TAG="$(sed -n 's/^DEPLOY_TAG=//p' "${DEPLOY_ENV}" | tail -1)"
  cp "${DEPLOY_ENV}" "${PREVIOUS_ENV}"
fi

rollback() {
  local status=$?
  trap - ERR
  if [[ -z "${PREVIOUS_TAG}" ]]; then
    echo "Deployment failed. This was the first deployment, so there is nothing to restore." >&2
    exit "${status}"
  fi
  echo "Deployment failed; restoring ${PREVIOUS_COMMIT} with ${PREVIOUS_TAG}..." >&2
  git checkout --quiet --detach "${PREVIOUS_COMMIT}" || true
  cp "${PREVIOUS_ENV}" "${DEPLOY_ENV}" || true
  compose up -d --remove-orphans --wait --wait-timeout 180 || true
  compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || true
  exit "${status}"
}
trap rollback ERR

git checkout --quiet --detach "${COMMIT_SHA}"
printf 'DEPLOY_TAG=%s\n' "${IMAGE_TAG}" >"${DEPLOY_ENV}"

echo "Validating configuration..."
compose config --quiet

echo "Pulling ${IMAGE_TAG}..."
compose pull backend

echo "Starting services..."
compose up -d --remove-orphans --wait --wait-timeout 180

echo "Reloading Caddy..."
compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile

echo "Checking the backend..."
compose exec -T backend /tradstry healthcheck

trap - ERR

echo "Removing images older than the previous release..."
if ! prune_old_images "${PREVIOUS_TAG}"; then
  echo "Warning: old image cleanup failed; the deployment itself succeeded." >&2
fi

echo "Deployed ${COMMIT_SHA} (${IMAGE_TAG})."
compose ps
