# Frontend Deployment Setup

## Overview

Frontend is now deployed to **Vercel** and configured to deploy only on **tagged releases**, not on every commit to main.

## Deployment Methods

### 1. Automatic Deployment (Recommended)
When you create a Git tag (e.g., `v1.0.0`), GitHub Actions automatically:
- Builds the frontend
- Deploys to Vercel Production

**To deploy:**
```bash
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 2. Manual Deployment
Use the deploy script:
```bash
./frontend/deploy.sh production
```

## Configuration

### Vercel Auto-Deploy Disabled
The `vercel.json` file disables automatic deployments on commits to main:
```json
{
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  }
}
```

### Required GitHub Secrets
Add these secrets to your GitHub repository:
- `VERCEL_TOKEN` - Your Vercel API token
- `VERCEL_ORG_ID` - Your Vercel Organization ID
- `VERCEL_PROJECT_ID` - Your Vercel Project ID
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` - Supabase key
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_USE_REPLICACHE_JOURNAL` - Replicache flag
- `NEXT_PUBLIC_USE_REPLICACHE_NOTES` - Replicache flag
- `NEXT_PUBLIC_USE_REPLICACHE_PLAYBOOK` - Replicache flag

## Workflow

1. **Development**: Push to `main` branch → No deployment (only CI runs)
2. **Release**: Create tag → Both frontend (Vercel) and backend (VPS) deploy automatically
3. **Manual**: Run `./frontend/deploy.sh` → Deploys to Vercel immediately

## Files Changed

- `frontend/deploy.sh` - New deployment script
- `vercel.json` - Disables auto-deploy on main branch
- `.github/workflows/cd-release.yml` - Added frontend deployment job
- `scripts/deploy.sh` - Marked as deprecated (legacy Docker script)
