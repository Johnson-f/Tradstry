# GitHub Secrets Setup Guide

This guide walks you through setting up all required secrets for the CD pipeline.

## Prerequisites

- GitHub account with access to the repository
- Docker Hub account (`johnsonf`)
- SSH access to VPS (37.27.200.227)

## Step-by-Step Instructions

### 1. Navigate to GitHub Secrets

1. Go to your repository on GitHub
2. Click **Settings** in the top menu
3. Click **Secrets and variables** in the left sidebar
4. Click **Actions**
5. Click **New repository secret**

### 2. Add Docker Hub Credentials

#### DOCKERHUB_USERNAME

```
Name: DOCKERHUB_USERNAME
Value: johnsonf
```

#### DOCKERHUB_TOKEN

1. Go to https://hub.docker.com/settings/security
2. Click **New Access Token** button
3. Token description: `GitHub Actions CD Pipeline`
4. Access permissions: **Read, Write, Delete**
5. Click **Generate**
6. **Important**: Copy the token immediately (you won't see it again!)
7. Add to GitHub Secrets:

```
Name: DOCKERHUB_TOKEN
Value: <paste your token here>
```

### 3. Add VPS Configuration

#### VPS_HOST

```
Name: VPS_HOST
Value: 37.27.200.227
```

#### VPS_USER

```
Name: VPS_USER
Value: root
```

#### SSH_PRIVATE_KEY

To get your SSH private key:

**On macOS/Linux:**

```bash
# Display your SSH private key
cat ~/.ssh/id_rsa

# Or if you use a different key type
cat ~/.ssh/id_ed25519
```

**Important**: Copy the entire output, including:
- `-----BEGIN OPENSSH PRIVATE KEY-----`
- The key content
- `-----END OPENSSH PRIVATE KEY-----`

Add to GitHub Secrets:

```
Name: SSH_PRIVATE_KEY
Value: <paste your entire SSH private key, including BEGIN and END lines>
```

**Alternative**: If you don't have an SSH key yet, generate one:

```bash
# Generate a new SSH key
ssh-keygen -t ed25519 -C "github-actions@tradstry.com"

# Display the private key
cat ~/.ssh/id_ed25519

# Display the public key (add this to your VPS)
cat ~/.ssh/id_ed25519.pub
```

### 4. Add Supabase Credentials (Optional - for CI checks)

These are already in your codebase but may be needed for CI:

#### NEXT_PUBLIC_SUPABASE_URL

```
Name: NEXT_PUBLIC_SUPABASE_URL
Value: https://bnavjgbowcekeppwgnxc.supabase.co
```

#### NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY

```
Name: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuYXZqZ2Jvd2Nla2VwcHdnbnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwODk1OTAsImV4cCI6MjA3NDY2NTU5MH0.AK7v9ofCWWgjsj4fUfr4nsRRcVwFQMeaNt1zNs6bjN0
```

## Verify SSH Access

Before running the pipeline, verify SSH access works:

```bash
# Test SSH connection from your local machine
ssh -i ~/.ssh/id_rsa root@37.27.200.227 "echo 'Connection successful'"
```

If the connection fails, you may need to add your public key to the VPS:

```bash
# Display your public key
cat ~/.ssh/id_ed25519.pub

# SSH into VPS and add the key (replace with your actual public key)
ssh root@37.27.200.227
mkdir -p ~/.ssh
echo "YOUR_PUBLIC_KEY_HERE" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

## Verify Docker Hub Access

Test Docker Hub login locally:

```bash
# Login to Docker Hub
docker login

# Try pushing a test image
docker tag hello-world:latest johnsonf/test:latest
docker push johnsonf/test:latest
```

## Summary of Required Secrets

After completing all steps, you should have these secrets configured:

- [x] `DOCKERHUB_USERNAME`
- [x] `DOCKERHUB_TOKEN`
- [x] `VPS_HOST`
- [x] `VPS_USER`
- [x] `SSH_PRIVATE_KEY`

## Testing the Setup

Once all secrets are configured, test the pipeline:

```bash
# Create a test release tag
git tag -a v0.0.1 -m "Test CD Pipeline"
git push origin v0.0.1
```

Monitor the workflow in: **GitHub → Actions → CD Pipeline - Tagged Releases**

## Troubleshooting

### "Workflow run failed" Error

1. Check GitHub Actions logs for specific errors
2. Verify all secrets are correctly set
3. Check Docker Hub credentials
4. Verify SSH key is correct

### "Authentication failed" Docker Error

1. Re-generate Docker Hub access token
2. Update `DOCKERHUB_TOKEN` secret
3. Ensure token has **Read, Write, Delete** permissions

### "Connection refused" SSH Error

1. Verify `VPS_HOST` is correct
2. Test SSH connection locally
3. Check SSH key is added to VPS authorized_keys
4. Ensure VPS firewall allows SSH (port 22)

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use environment-specific secrets** when possible
3. **Rotate secrets regularly** (every 90 days)
4. **Limit Docker Hub token scope** to minimum required permissions
5. **Use SSH key passphrases** for production deployments
6. **Monitor secret usage** in GitHub audit logs

## Additional Resources

- [GitHub Secrets Documentation](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Docker Hub Access Tokens](https://docs.docker.com/docker-hub/access-tokens/)
- [SSH Key Management](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

