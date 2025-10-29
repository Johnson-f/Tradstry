# GitHub Secrets Setup for Automated Deployment

## Required GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these secrets one by one:

### 1. VPS_HOST
```
95.216.219.131
```

### 2. VPS_USER
```
root
```

### 3. SSH_PRIVATE_KEY
Copy the entire SSH private key (including the header and footer):
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDhPJlOILFivDBW7raUI7bz8xHBxxpZNqSxnK3QdiPNmgAAAKCWP9ywlj/c
sAAAAAtzc2gtZWQyNTUxOQAAACDhPJlOILFivDBW7raUI7bz8xHBxxpZNqSxnK3QdiPNmg
AAAEC4ejEO2m3YFxK5zj2d1Pw7g3+3F5NFeMN/icp0FIH7aeE8mU4gsWK8MFbutpQjtvPz
EcHHGlk2pLGcrdB2I82aAAAAGmpvaG5zb25uaWZlbWk1NkBAZ21haWwuY29tAQID
-----END OPENSSH PRIVATE KEY-----
```

### 4. DOCKERHUB_USERNAME
```
johnsonf
```

### 5. DOCKERHUB_TOKEN
You need to create a Docker Hub access token:
1. Go to [Docker Hub](https://hub.docker.com)
2. Sign in to your account
3. Go to **Account Settings** → **Security** → **New Access Token**
4. Create a token with **Read, Write, Delete** permissions
5. Copy the generated token and add it as this secret

## How to Add Secrets

1. Go to your GitHub repository
2. Click **Settings** (top menu)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Enter the **Name** and **Value** for each secret above
6. Click **Add secret**

## Verification

After adding all secrets, you should see:
- ✅ VPS_HOST
- ✅ VPS_USER  
- ✅ SSH_PRIVATE_KEY
- ✅ DOCKERHUB_USERNAME
- ✅ DOCKERHUB_TOKEN

## Test the Pipeline

Once all secrets are set up, you can trigger deployment by creating a release tag:

### Option 1: Using the test script (Recommended)
```bash
./test-deployment.sh
```
This script will guide you through creating a proper version tag.

### Option 2: Manual tag creation
```bash
# Create and push a version tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### What happens next:
1. Go to **Actions** tab in your GitHub repository
2. Watch the "CD Pipeline - Tagged Releases" workflow run
3. It should build the Docker image with your version tag and deploy to your VPS automatically!

## Troubleshooting

If the deployment fails:
1. Check the **Actions** tab for error logs
2. Verify all secrets are correctly set
3. Make sure your Docker Hub token has the right permissions
4. Check VPS connectivity: `ssh root@95.216.219.131`
