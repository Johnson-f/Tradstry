# CI/CD Setup Guide

This guide will help you set up continuous integration and deployment for your Tradstry application.

## Overview

Your CI/CD pipeline:
1. **CI (Continuous Integration)**: Runs tests on every push
   - Frontend: Lint, type-check, build
   - Backend: Format check, lint, build
2. **CD (Continuous Deployment)**: Deploys to VPS when tests pass and code is pushed to `main` branch

## GitHub Secrets Setup

You need to configure these secrets in your GitHub repository:

### Required Secrets

1. **NEXT_PUBLIC_SUPABASE_URL** - Your Supabase project URL
2. **NEXT_PUBLIC_SUPABASE_ANON_KEY** - Your Supabase anon key
3. **SSH_PRIVATE_KEY** - SSH private key for VPS access
4. **VPS_HOST** - Your VPS IP address (e.g., `37.27.200.227`)
5. **VPS_USER** - SSH user (usually `root`)

### How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:

```bash
# SSH_PRIVATE_KEY - Copy your SSH private key
cat ~/.ssh/id_rsa | pbcopy  # On Mac
cat ~/.ssh/id_rsa | xclip -selection clipboard  # On Linux

# VPS_HOST - Your VPS IP
37.27.200.227

# VPS_USER - SSH user
root

# NEXT_PUBLIC_SUPABASE_URL - Your Supabase URL
https://your-project.supabase.co

# NEXT_PUBLIC_SUPABASE_ANON_KEY - Your Supabase anon key
your-anon-key
```

## Generate SSH Key for GitHub Actions

If you don't have an SSH key, generate one:

```bash
# Generate a new SSH key (don't add a passphrase for CI/CD)
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions

# Copy the public key to your VPS
ssh-copy-id -i ~/.ssh/github_actions.pub root@37.27.200.227

# Copy the private key to add as GitHub secret
cat ~/.ssh/github_actions
```

**Important**: The private key output should be added as `SSH_PRIVATE_KEY` secret in GitHub.

## Workflow Details

### CI Pipeline (on every push)

**Frontend CI**:
- Checks out code
- Sets up Node.js 20
- Installs dependencies with pnpm
- Runs linting
- Runs type checking
- Builds the application

**Backend CI**:
- Checks out code
- Sets up Rust
- Caches Cargo dependencies
- Checks code formatting
- Runs Clippy lints
- Builds release version

### CD Pipeline (on main branch push, if CI passes)

- Checks out code
- Sets up Node.js and pnpm
- Builds frontend
- Connects to VPS via SSH
- Copies files to VPS
- Deploys with Docker Compose

## Testing the Pipeline

### Test on a Branch First

1. Create a feature branch:
   ```bash
   git checkout -b test-ci
   ```

2. Make a small change and commit:
   ```bash
   echo "# Test CI" >> README.md
   git add README.md
   git commit -m "Test CI pipeline"
   git push origin test-ci
   ```

3. Check the Actions tab in GitHub to see CI running

### Deploy to Main

Once CI passes on your feature branch:

1. Merge to main:
   ```bash
   git checkout main
   git merge test-ci
   git push origin main
   ```

2. Watch the Actions tab - CD will deploy to your VPS after CI passes

## Manual Deployment (Alternative)

If you prefer to deploy manually instead of automatic CD:

### Edit the Workflow

Open `.github/workflows/ci-cd.yml` and change:

```yaml
deploy:
  name: Deploy to VPS
  needs: [frontend-ci, backend-ci]
  runs-on: ubuntu-latest
  if: github.event_name == 'push' && github.ref == 'refs/heads/main' # Make this false
```

Or remove the entire `deploy` job.

## Troubleshooting

### CI Fails

**Common Issues:**
1. **Linting errors**: Fix the code or configure ESLint rules
2. **Type errors**: Fix TypeScript errors
3. **Build errors**: Check environment variables

**Solution**: Fix the code and push again

### CD Fails

**Common Issues:**
1. **SSH connection failed**: Check SSH_PRIVATE_KEY secret
2. **Permission denied**: Check VPS_USER has permission
3. **Docker build fails**: Check Docker is installed on VPS
4. **File sync fails**: Check rsync is available

**Solution**: Check the workflow logs in GitHub Actions

### SSH Connection Issues

If you get SSH connection errors:

```bash
# Test SSH connection manually
ssh -i ~/.ssh/github_actions root@37.27.200.227

# Check known_hosts
ssh-keyscan -H 37.27.200.227 >> ~/.ssh/known_hosts
```

### Docker Issues on VPS

If deployment fails due to Docker:

```bash
# SSH into VPS
ssh root@37.27.200.227

# Check Docker status
systemctl status docker

# Check Docker Compose
docker-compose --version

# Manually test deployment
cd /opt/tradstry
docker-compose up -d --build
```

## Customizing the Pipeline

### Add Tests

If you add tests later, update the workflow:

```yaml
# In frontend-ci job
- name: Run tests
  run: pnpm test

# In backend-ci job  
- name: Run tests
  working-directory: backend
  run: cargo test
```

### Change Deployment Strategy

The current workflow uses blue-green deployment with Docker. You can customize:

1. **Manual approval**: Add a manual approval step
2. **Rolling deployment**: Keep old containers running during deployment
3. **Health checks**: Add health check verification

## Best Practices

1. ✅ Keep secrets secure - never commit them
2. ✅ Use branch protection on main
3. ✅ Require PR approvals
4. ✅ Test changes on branches first
5. ✅ Monitor deployment logs
6. ✅ Have rollback plan
7. ✅ Keep VPS updated with security patches

## Rollback Procedure

If deployment breaks production:

```bash
# SSH into VPS
ssh root@37.27.200.227

cd /opt/tradstry

# Stop containers
docker-compose down

# Restore from backup or previous version
git checkout <previous-commit-hash>

# Restart services
docker-compose up -d --build
```

## Next Steps

1. Add secrets to GitHub
2. Test CI on a feature branch
3. Merge to main to trigger CD
4. Monitor the deployment
5. Verify the application is working

## Support

If you encounter issues:
1. Check GitHub Actions logs
2. Check VPS logs: `docker-compose logs -f`
3. Test SSH connection manually
4. Verify all secrets are set correctly

