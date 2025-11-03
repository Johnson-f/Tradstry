# Vercel Tagged Release Setup Guide

This guide walks you through setting up Vercel to deploy only on tagged Git releases (e.g., `v1.0.0`).

## Current Configuration Status

✅ Your project is already configured for tagged releases:
- `vercel.json` disables auto-deploy on `main` branch
- GitHub Actions workflow (`.github/workflows/cd-release.yml`) deploys to Vercel on tag pushes
- The workflow uses Vercel CLI for deployments

## Step-by-Step Setup

### Step 1: Get Vercel Credentials

You need to get three values from Vercel:

#### A. Vercel API Token

1. Go to [Vercel Dashboard](https://vercel.com/account/tokens)
2. Click **"Create Token"**
3. Give it a name (e.g., "GitHub Actions Deployment")
4. Set expiration (or leave as "No expiration" for CI/CD)
5. Copy the token (you'll only see it once!)

#### B. Organization ID

1. Go to [Vercel Dashboard](https://vercel.com/account/general)
2. Navigate to your organization
3. Go to **Settings** → **General**
4. Find **"Organization ID"** in the details section
5. Copy the Organization ID

#### C. Project ID

1. Go to your project in [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on **Settings** → **General**
3. Scroll down to find **"Project ID"**
4. Copy the Project ID

**Alternative method (via Vercel CLI):**
```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Link your project (if not already linked)
vercel link

# Pull project configuration (this will create .vercel/project.json)
vercel pull

# Check the IDs in .vercel/project.json
cat .vercel/project.json
```

### Step 2: Add GitHub Secrets

Add the following secrets to your GitHub repository:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Add each secret:

```
VERCEL_TOKEN = <your-vercel-api-token>
VERCEL_ORG_ID = <your-organization-id>
VERCEL_PROJECT_ID = <your-project-id>
```

**Also add your environment variables:**
```
NEXT_PUBLIC_SUPABASE_URL = <your-supabase-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY = <your-supabase-key>
NEXT_PUBLIC_API_URL = <your-backend-api-url>
NEXT_PUBLIC_USE_REPLICACHE_JOURNAL = <true/false>
NEXT_PUBLIC_USE_REPLICACHE_NOTES = <true/false>
NEXT_PUBLIC_USE_REPLICACHE_PLAYBOOK = <true/false>
```

### Step 3: Configure Vercel Dashboard Settings

1. Go to your project in Vercel Dashboard
2. Navigate to **Settings** → **Git**
3. **Ensure automatic deployments are disabled** (or rely on `vercel.json`):
   - Under **"Production Branch"**, uncheck **"Automatic deployments from Git"** for `main` branch
   - Or leave it enabled - the `vercel.json` file will override it

4. **Set Build & Development Settings:**
   - Go to **Settings** → **General**
   - Verify:
     - Framework Preset: **Next.js**
     - Build Command: `bun run build`
     - Install Command: `bun install`
     - Root Directory: `/` (or your frontend directory if different)

### Step 4: Verify Configuration Files

#### `vercel.json` ✅
Already configured correctly:
```json
{
  "git": {
    "deploymentEnabled": {
      "main": false
    }
  },
  "buildCommand": "bun run build",
  "devCommand": "bun run dev",
  "installCommand": "bun install",
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

#### `.github/workflows/cd-release.yml` ✅
Already configured to deploy on tags:
- Triggers on tags matching `v*.*.*` (e.g., `v1.0.0`)
- Builds frontend and deploys to Vercel Production

### Step 5: Test the Setup

#### Create a Test Release:

```bash
# Create a new tag
git tag -a v0.1.0-test -m "Test release"

# Push the tag (this triggers the workflow)
git push origin v0.1.0-test
```

#### Monitor the Deployment:

1. Go to **Actions** tab in your GitHub repository
2. Watch the `CD Pipeline - Tagged Releases` workflow run
3. Check the `deploy-frontend` job logs
4. Once complete, go to Vercel Dashboard to see the deployment

#### Verify in Vercel:

1. Open your project in Vercel Dashboard
2. Go to **Deployments** tab
3. You should see a new deployment triggered by the tag
4. The deployment should show "Production" environment

## How It Works

### Current Workflow:

1. **You create a tag:**
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

2. **GitHub Actions triggers:**
   - Detects tag push matching pattern `v*.*.*`
   - Runs `CD Pipeline - Tagged Releases` workflow

3. **Workflow executes:**
   - Builds backend Docker image → Pushes to Docker Hub
   - Installs frontend dependencies
   - Builds frontend with production environment variables
   - Deploys to Vercel Production using `vercel --prod`

4. **Result:**
   - Backend image available on Docker Hub
   - Frontend live on Vercel Production URL

### Why Tagged Releases?

- **Control**: You decide when to deploy to production
- **Stability**: Only tested, versioned code goes to production
- **Traceability**: Each deployment is tied to a specific version tag
- **Rollback**: Easy to rollback by redeploying a previous tag

## Troubleshooting

### Issue: Deployment fails with "Invalid token"

**Solution:**
- Verify `VERCEL_TOKEN` is correct in GitHub Secrets
- Regenerate token if it expired
- Ensure token has proper permissions

### Issue: Deployment fails with "Project not found"

**Solution:**
- Verify `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are correct
- Ensure project exists in the specified organization
- Check that the token has access to the project

### Issue: Build fails during deployment

**Solution:**
- Check build logs in GitHub Actions
- Verify all environment variables are set correctly
- Test build locally: `bun run build`
- Check `vercel.json` configuration matches your project

### Issue: Vercel auto-deploys on every commit

**Solution:**
- Check `vercel.json` has `"main": false` in `deploymentEnabled`
- Disable auto-deploy in Vercel Dashboard: Settings → Git → Production Branch
- Ensure GitHub Actions workflow is using `vercel --prod` (not automatic)

## Manual Deployment (Alternative)

If you need to deploy manually without a tag:

```bash
# Using the deploy script
./frontend/deploy.sh production

# Or using Vercel CLI directly
vercel --prod --yes
```

## Best Practices

1. **Semantic Versioning**: Use semantic version tags (e.g., `v1.0.0`, `v1.1.0`, `v2.0.0`)
2. **Release Notes**: Always include meaningful messages with tags
3. **Test First**: Test deployments on preview/staging before production
4. **Monitor**: Watch deployment logs and verify functionality after each release
5. **Document**: Keep a changelog of what each release includes

## Next Steps

- ✅ Configured for tagged releases
- ✅ Add GitHub Secrets (VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID)
- ✅ Add environment variables to GitHub Secrets
- ✅ Test with a tag push
- ✅ Monitor first deployment

---

**Need Help?**
- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [GitHub Actions for Vercel](https://vercel.com/docs/integrations/github)

