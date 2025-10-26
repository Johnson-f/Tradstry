# CD Pipeline Documentation

## Overview

The Continuous Deployment (CD) pipeline for Tradstry automatically builds Docker images and deploys to production whenever a tagged release is pushed to GitHub.

## How It Works

1. **Developer creates a release tag** (e.g., `v1.0.0`)
2. **GitHub Actions triggers** the CD pipeline
3. **Build and push** separate Docker images for frontend and backend to Docker Hub
4. **Deploy to VPS** by pulling latest images and restarting containers

## Creating a Release

### Standard Release Process

```bash
# 1. Commit all changes
git add .
git commit -m "Your release message"

# 2. Create and push the tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### Release Tag Format

Use semantic versioning: `vMAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

Examples:
- `v1.0.0` - Initial release
- `v1.1.0` - New features added
- `v1.0.1` - Bug fix
- `v2.0.0` - Major release with breaking changes

## Deployment Flow

```
Developer creates tag (v1.0.0)
    ↓
git push origin v1.0.0
    ↓
GitHub Actions triggered (.github/workflows/cd-release.yml)
    ↓
├─→ Build frontend image
│   → Push to docker.io/johnsonf/tradstry-frontend:v1.0.0
│   → Push to docker.io/johnsonf/tradstry-frontend:latest
│
├─→ Build backend image
│   → Push to docker.io/johnsonf/tradstry-backend:v1.0.0
│   → Push to docker.io/johnsonf/tradstry-backend:latest
│
└─→ Deploy to VPS
    → SSH to production server
    → docker-compose pull (fetch latest images)
    → docker-compose down
    → docker-compose up -d
    → Health checks
    → Deployment complete
```

## Infrastructure Components

### Docker Images

- **Frontend**: `docker.io/johnsonf/tradstry-frontend`
- **Backend**: `docker.io/johnsonf/tradstry-backend`

Both images are tagged with:
- Version tag: `v1.0.0` (specific version)
- Latest tag: `latest` (always points to most recent)

### VPS Configuration

- **Host**: `37.27.200.227`
- **User**: `root`
- **App Directory**: `/opt/tradstry`
- **Docker Compose**: Uses pre-built images from Docker Hub

### Required GitHub Secrets

Configure these in: `GitHub Repository → Settings → Secrets and variables → Actions`

```
DOCKERHUB_USERNAME      # Your Docker Hub username (johnsonf)
DOCKERHUB_TOKEN         # Docker Hub access token
VPS_HOST                # Production server IP (37.27.200.227)
VPS_USER                # SSH user (root)
SSH_PRIVATE_KEY         # SSH private key for VPS access
```

## Monitoring Deployment

### GitHub Actions

Monitor the workflow run in: `GitHub → Actions → CD Pipeline - Tagged Releases`

### Check Deployment Status

```bash
# SSH into VPS
ssh root@37.27.200.227

# Check running containers
cd /opt/tradstry
docker-compose ps

# View logs
docker-compose logs -f

# Check specific service
docker-compose logs -f frontend
docker-compose logs -f backend
```

### Verify Application

- **Frontend**: https://tradstry.com
- **Backend API**: https://tradstry.com/api
- **Health Check**: https://tradstry.com/api/health

## Rollback Procedures

### Quick Rollback (Latest Image Issue)

If the latest image has issues, you can rollback to a previous version:

```bash
# SSH into VPS
ssh root@37.27.200.227

# Edit docker-compose.yaml to use specific version
cd /opt/tradstry
# Change image tags to previous version (e.g., v1.0.1)

# Restart services
docker-compose down
docker-compose up -d
```

### Rollback via Docker Hub

```bash
# Pull a specific version
docker pull johnsonf/tradstry-frontend:v1.0.0
docker pull johnsonf/tradstry-backend:v1.0.0

# Tag as latest locally
docker tag johnsonf/tradstry-frontend:v1.0.0 johnsonf/tradstry-frontend:latest
docker tag johnsonf/tradstry-backend:v1.0.0 johnsonf/tradstry-backend:latest

# Restart services
cd /opt/tradstry
docker-compose down
docker-compose up -d
```

## Manual Deployment Options

### 1. Registry-Based Manual Deployment

Pull latest images from Docker Hub:

```bash
./scripts/deploy-registry.sh
```

### 2. Development Deployment

Build and deploy from local codebase:

```bash
./scripts/deploy.sh
```

**Note**: This builds images on the VPS and is slower. Use for development/debugging.

## Troubleshooting

### Deployment Fails

**Check GitHub Actions logs:**
- Go to Actions tab in GitHub
- Click on the failed workflow run
- Check individual job logs for errors

**Common Issues:**
1. **Authentication failed**: Check Docker Hub credentials in GitHub Secrets
2. **SSH connection failed**: Verify SSH_PRIVATE_KEY and VPS_HOST
3. **Image push failed**: Check Docker Hub account permissions

### Services Not Starting

**Check container status:**
```bash
ssh root@37.27.200.227
cd /opt/tradstry
docker-compose ps
```

**View logs:**
```bash
docker-compose logs --tail=100
```

**Common Issues:**
1. **Environment variables missing**: Check `.env.production` files
2. **Port conflicts**: Check if ports 80/443 are already in use
3. **Health check failing**: Wait for services to fully start (30-60 seconds)

### Health Check Failures

Check individual service health:

```bash
# Check frontend health
curl http://localhost:3000/api/health

# Check backend health
curl http://localhost:8080/health
```

### Disk Space Issues

Clean up old Docker images:

```bash
# On VPS
docker system prune -a
docker volume prune
```

### Rebuild from Scratch

If everything fails, rebuild from scratch:

```bash
ssh root@37.27.200.227
cd /opt/tradstry

# Pull latest code
git pull origin main

# Stop and remove all containers
docker-compose down -v

# Remove all images
docker rmi -f $(docker images -q)

# Pull latest images
docker-compose pull

# Start services
docker-compose up -d
```

## Best Practices

1. **Test Locally First**: Always test your changes locally before creating a release
2. **Version Appropriately**: Use semantic versioning for all releases
3. **Monitor Deployments**: Keep GitHub Actions open during deployment
4. **Review Logs**: Check VPS logs after deployment to ensure services are healthy
5. **Rollback Plan**: Always have a rollback plan before deploying breaking changes
6. **Database Migrations**: Ensure database migrations are backward compatible
7. **Environment Variables**: Keep sensitive data in GitHub Secrets, never commit
8. **Documentation**: Update this documentation when changing deployment processes

## Additional Resources

- **Docker Hub**: https://hub.docker.com/u/johnsonf
- **GitHub Actions**: https://github.com/johnsonf/tradstry/actions
- **Docker Documentation**: https://docs.docker.com/
- **GitHub Actions Documentation**: https://docs.github.com/en/actions

## Support

For deployment issues, contact the DevOps team or create an issue in the GitHub repository.

