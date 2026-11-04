# Deploying

Every push to `master` deploys the backend to the VPS. The website deploys separately, through Vercel.

## How a release runs

`.github/workflows/release.yml`:

1. **Checks** (`checks.yml`, also run on pull requests). Backend: format, clippy with warnings as errors, and the tests against a Postgres service. Website: lint, tests and build.
2. **Build.** Builds the root `Dockerfile` and pushes `ghcr.io/johnson-f/tradstry-backend:sha-<commit>`. The package is private.
   - Only the compiled dependencies are cached, in the repository's Actions cache.
   - They're rebuilt only when `Cargo.lock` changes.
3. **Deploy.** SSHes to the VPS with a key that can only run `deploy <commit> sha-<commit>`. On the server, `deploy/scripts/deploy.sh`:
   - checks that the commit is on `origin/master`, and takes a lock so deploys never overlap;
   - checks out that commit, pulls its image and starts `deploy/compose.yml`;
   - waits for every health check, reloads Caddy and checks the backend once more.
   If any step fails, it restores the previous commit and image.
4. **Promote.** Tags the deployed image `latest`.

## Production layout

`deploy/compose.yml` runs as Compose project `tradstry` in `/srv/tradstry`:

| Service | Notes |
| --- | --- |
| `postgres` | Postgres 18.6. No published port. Data in volume `tradstry-postgres-data`. |
| `backend` | The image above, on the private `tradstry-network`. It reaches the database as `postgres:5432` and keeps its tables in the `prod` schema. |
| `caddy` | TLS for `backend.tradstry.com` and `mcp.tradstry.com`, both proxied to `backend:7900`. Reuses v1's `tradstry_caddy_*` volumes, so the certificates carry over. |

Secrets live only on the server, in two files next to `deploy/compose.yml`. Both are ignored by Git and have examples in the repo:
- `deploy/.env` holds `POSTGRES_PASSWORD`;
- `deploy/backend.env` holds the backend's keys.

## One-time setup

**GitHub (the v2 repository):**
- Repository secrets:
  - `DEPLOY_HOST` and `DEPLOY_USER`;
  - `DEPLOY_SSH_KEY`, a new private key used only for deploys;
  - `DEPLOY_KNOWN_HOSTS`, the server's pinned host key (`ssh-keyscan <host>`).
- The `production` environment is created on the first run. Add required reviewers there if a deploy should wait for approval.

**Server, as the deploy user:**
1. Clone the repository to `/srv/tradstry` with a read-only GitHub deploy key.
2. Create the secrets files from their examples:
   ```bash
   cp deploy/.env.example deploy/.env
   cp deploy/backend.env.example deploy/backend.env
   chmod 600 deploy/.env deploy/backend.env
   ```
   Then fill them in.
3. Let Docker pull the private image. Use a classic personal access token with only `read:packages`:
   ```bash
   docker login ghcr.io -u Johnson-f
   ```
4. Restrict the new deploy key in `~/.ssh/authorized_keys`:
   ```
   command="/srv/tradstry/deploy/scripts/ssh-deploy-command.sh",restrict ssh-ed25519 AAAA... tradstry-deploy
   ```

## Replacing v1

v1 runs from `/opt/tradstry` under the same Compose project name and holds ports 80 and 443, so it has to stop before v2's first deploy.
1. Finish the one-time setup above.
2. Stop v1. Its containers are removed, but its volumes stay, including `postgres_data`:
   ```bash
   cd /opt/tradstry
   docker compose --project-name tradstry --env-file devops/.env -f devops/compose.yml down
   ```
3. Run the Release workflow from the Actions tab, or push to `master`.
4. Remove v1's line from `authorized_keys`, so its key can no longer deploy.

To go back to v1:
```bash
cd /srv/tradstry
docker compose --env-file deploy/.env --env-file deploy/deploy.env -f deploy/compose.yml down
cd /opt/tradstry
docker compose --project-name tradstry --env-file devops/.env --env-file devops/deploy.env -f devops/compose.yml up -d
```

## Running the image locally

`make docker` builds the image and runs it with Postgres from the root `compose.yml` on `localhost:7900`. `make backend` is the faster loop for development.
