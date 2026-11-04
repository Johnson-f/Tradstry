# Deploying

CI and deploys run on Semaphore. Every push to `master` that passes deploys the backend to the VPS. The website deploys separately, through Vercel.

## How a release runs

`.semaphore/semaphore.yml` runs on every push and pull request. Its three blocks start at the same time:

1. **Backend**, on a 4-core machine: format, clippy with warnings as errors, and the tests against Postgres 18.
   - It installs the Rust version that the `Dockerfile` pins.
   - On `master`, it saves the compiled dependencies to Semaphore's cache, keyed on `Cargo.lock`.
2. **Website**, on a 2-core machine: lint, tests and build.
3. **Image**, on `master` only: builds the root `Dockerfile` and pushes `ghcr.io/johnson-f/tradstry-backend:sha-<commit>`. The package is private.
   - Only the compiled dependencies are cached, as `cache-deps` in that package.
   - They're rebuilt only when `Cargo.lock` changes.

When all three pass on `master`, the pipeline promotes itself to `.semaphore/deploy.yml`. Deploys run one at a time in the `production` queue.

1. **Deploy.** SSHes to the VPS as `tradstry-deploy`, with a key that can only run `deploy <commit> sha-<commit>`.
   - That key's forced command is `/usr/local/sbin/tradstry-deploy`, a root-owned copy of `deploy/scripts/ssh-deploy-command.sh`, so no commit can change it.
   - It refuses while v1's containers exist, because v1 shares the Compose project name and would be removed as orphans.
   - It confirms that the commit is on `master`, then runs `deploy/scripts/deploy.sh` from that commit.

   `deploy.sh`:
   - takes a lock so deploys never overlap;
   - checks out the commit;
   - pulls its image in a throwaway Docker config, using a read-only token passed on stdin, so no registry credential stays on the server;
   - starts `deploy/compose.yml`, waits for every health check, reloads Caddy and checks the backend once more.

   If any step fails, it restores the previous commit and image.
2. **Tag as latest.** Tags the deployed image `latest`.

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

**Semaphore secrets:**

| Secret | Holds | Used by |
| --- | --- | --- |
| `ghcr-push` | `GHCR_USER`, and `GHCR_TOKEN`: a classic GitHub token with `write:packages` | the Image block and Tag as latest |
| `ghcr-pull` | `GHCR_PULL_USER`, and `GHCR_PULL_TOKEN`: a classic token with only `read:packages` | the deploy, which passes it to the server |
| `tradstry-deploy` | `DEPLOY_HOST`, `DEPLOY_USER` (`tradstry-deploy`), the file `~/.ssh/tradstry_deploy` (a key used only for deploys), and the file `~/.ssh/tradstry_known_hosts` | the deploy |

The known-hosts file holds the server's host keys, read from `/etc/ssh/ssh_host_*_key.pub` on the server rather than scanned over the network.

**GitHub:** a read-only deploy key on the repository, so the server can fetch it. A deploy key works for one repository only, so it's separate from v1's.

The forced command's v1 check is what keeps a deploy from running too early.

**Server:**
1. Give `tradstry-deploy` its own key for this repository, and an SSH host alias that uses it. That keeps v1's key for `Tradstry/Tradstry` working:
   ```
   Host github-tradstry-v2
     HostName github.com
     User git
     IdentityFile ~/.ssh/tradstry_v2_github_deploy
     IdentitiesOnly yes
   ```
2. Clone into `/srv/tradstry` as `tradstry-deploy`:
   ```bash
   git clone git@github-tradstry-v2:Johnson-f/Tradstry-v2-.git /srv/tradstry
   ```
3. Put `deploy/.env` and `deploy/backend.env` in `/srv/tradstry/deploy/`, mode 600, owned by `tradstry-deploy`. They have examples in the repo.
4. Install the forced command, root-owned:
   ```bash
   install -o root -g root -m 755 deploy/scripts/ssh-deploy-command.sh /usr/local/sbin/tradstry-deploy
   ```
   Then add the deploy key's public half to `~tradstry-deploy/.ssh/authorized_keys`:
   ```
   restrict,command="/usr/local/sbin/tradstry-deploy" ssh-ed25519 AAAA... tradstry-semaphore
   ```

## Replacing v1

v1 runs from `/opt/tradstry` under the same Compose project name and holds ports 80 and 443, so it has to stop before v2's first deploy.
1. Finish the one-time setup above.
2. Stop v1. This removes all its containers, including the Postgres, Redis and autoheal ones that were started from `/root/tradstry`. Its volumes stay, including `postgres_data`:
   ```bash
   cd /opt/tradstry
   docker compose --project-name tradstry --env-file devops/.env -f devops/compose.yml down
   ```
3. Push to `master`, or rerun the latest `master` workflow's "Deploy to production" promotion in Semaphore.
4. Remove v1's `github-actions-tradstry` line from `authorized_keys`, so its key can no longer deploy.

To go back to v1:
```bash
cd /srv/tradstry
docker compose --env-file deploy/.env --env-file deploy/deploy.env -f deploy/compose.yml down
cd /opt/tradstry
docker compose --project-name tradstry --env-file devops/.env --env-file devops/deploy.env -f devops/compose.yml up -d
```

## Running the image locally

`make docker` builds the image and runs it with Postgres from the root `compose.yml` on `localhost:7900`. `make backend` is the faster loop for development.
