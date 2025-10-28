# Tradstry Production Deployment Guide

## Overview

This guide covers deploying the Tradstry backend to production. The frontend is hosted separately on Vercel.

### Architecture

- **Frontend**: Deployed on Vercel at `https://app.tradstry.com`
- **Backend**: Rust API running on VPS at `95.216.219.131`
- **Nginx**: Reverse proxy handling SSL termination and request routing
- **Domain**: `https://app.tradstry.com/api/*` → Backend API

## Prerequisites

- VPS with Ubuntu/Debian and Docker installed
- Domain name (app.tradstry.com) pointing to VPS IP (95.216.219.131)
- SSL certificates in `nginx/ssl/` directory
- SSH access to VPS with key-based authentication
- Backend environment file configured

## DNS Configuration

Ensure the following DNS records are configured:

```
Type: A
Name: app
Value: 95.216.219.131
TTL: 3600
```

Verify DNS resolution:
```bash
dig app.tradstry.com
```

## Quick Start

### 1. Prepare Environment

Create the backend environment file on the VPS:

```bash
# On VPS
cd /opt/tradstry
nano backend/.env.production
```

Required environment variables:
```bash
RUST_ENV=production
RUST_LOG=info
REGISTRY_DB_URL=libsql://your-registry-db.turso.io
REGISTRY_DB_TOKEN=your-token
TURSO_API_TOKEN=your-token
TURSO_ORG=your-org
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# ... other required variables
```

### 2. Deploy with Script

From your local machine:

```bash
# Make script executable (if not already)
chmod +x scripts/deploy-production.sh

# Deploy to production
./scripts/deploy-production.sh
```

### 3. Verify Deployment

```bash
# Check container status
ssh root@95.216.219.131 "docker ps | grep tradstry"

# Test API endpoint
curl https://app.tradstry.com/api/health

# View logs
ssh root@95.216.219.131 "cd /opt/tradstry && docker-compose -f docker-compose.production.yaml logs -f"
```

## Manual Deployment

If you prefer to deploy manually:

### 1. Copy Files to VPS

```bash
# From your local machine
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude 'target' \
  ./ root@95.216.219.131:/opt/tradstry/
```

### 2. Start Services

```bash
# SSH into VPS
ssh root@95.216.219.131

# Navigate to deployment directory
cd /opt/tradstry

# Stop any existing containers
docker-compose -f docker-compose.production.yaml down

# Build and start services
docker-compose -f docker-compose.production.yaml up -d --build

# Check status
docker-compose -f docker-compose.production.yaml ps

# View logs
docker-compose -f docker-compose.production.yaml logs -f
```

## Deployment Script Options

The `deploy-production.sh` script supports various options:

```bash
# Basic usage (uses defaults)
./scripts/deploy-production.sh

# Custom VPS host
./scripts/deploy-production.sh -h 95.216.219.131

# Custom SSH user and key
./scripts/deploy-production.sh -u root -k ~/.ssh/my_key

# Custom deployment directory
./scripts/deploy-production.sh -d /opt/tradstry

# Skip backup (for quick deployments)
./scripts/deploy-production.sh --skip-backup

# Verbose output
./scripts/deploy-production.sh --verbose

# Combined options
./scripts/deploy-production.sh \
  -h 95.216.219.131 \
  -u root \
  -k ~/.ssh/id_ed25519_vps \
  -d /opt/tradstry \
  --verbose
```

## Service Management

### View Logs

```bash
# All services
ssh root@95.216.219.131 "cd /opt/tradstry && docker-compose -f docker-compose.production.yaml logs -f"

# Backend only
ssh root@95.216.219.131 "docker logs -f tradstry-backend"

# Nginx only
ssh root@95.216.219.131 "docker logs -f tradstry-nginx"
```

### Restart Services

```bash
ssh root@95.216.219.131 << 'EOF'
cd /opt/tradstry
docker-compose -f docker-compose.production.yaml restart backend
docker-compose -f docker-compose.production.yaml restart nginx
EOF
```

### Stop Services

```bash
ssh root@95.216.219.131 "cd /opt/tradstry && docker-compose -f docker-compose.production.yaml down"
```

### Check Container Health

```bash
# Container status
ssh root@95.216.219.131 "docker-compose -f docker-compose.production.yaml ps"

# Resource usage
ssh root@95.216.219.131 "docker stats tradstry-backend tradstry-nginx"

# Health checks
ssh root@95.216.219.131 "docker inspect tradstry-backend | grep -A 10 Health"
```

## Health Checks

### Test API Endpoints

```bash
# Health check (public endpoint)
curl https://app.tradstry.com/api/health

# Expected response: {"success":true,"data":{"status":"healthy",...}}

# Test with authentication (should return 401)
curl https://app.tradstry.com/api/options/test
# Expected: 401 Unauthorized (not 404 Not Found)
```

### Internal Health Checks

```bash
# Backend health (internal)
ssh root@95.216.219.131 "docker exec tradstry-backend curl -f http://localhost:8080/api/health"

# Nginx config test
ssh root@95.216.219.131 "docker exec tradstry-nginx nginx -t"
```

## Troubleshooting

### 404 Errors on API Endpoints

**Symptom**: Getting 404 errors when accessing `https://app.tradstry.com/api/*`

**Causes**:
- Nginx not running
- Incorrect proxy configuration
- Backend not listening on expected port

**Solution**:
```bash
# Check if containers are running
ssh root@95.216.219.131 "docker ps | grep tradstry"

# Check Nginx logs
ssh root@95.216.219.131 "docker logs tradstry-nginx"

# Test Nginx config
ssh root@95.216.219.131 "docker exec tradstry-nginx nginx -t"

# Restart services
ssh root@95.216.219.131 "cd /opt/tradstry && docker-compose -f docker-compose.production.yaml restart"
```

### Backend Not Starting

**Symptom**: Backend container exits or crashes

**Solution**:
```bash
# View backend logs
ssh root@95.216.219.131 "docker logs tradstry-backend"

# Check backend health
ssh root@95.216.219.131 "docker exec tradstry-backend curl http://localhost:8080/api/health"

# Rebuild backend
ssh root@95.216.219.131 "cd /opt/tradstry && docker-compose -f docker-compose.production.yaml build --no-cache backend && docker-compose -f docker-compose.production.yaml up -d backend"
```

### CORS Errors

**Symptom**: Frontend on Vercel cannot make API requests

**Solution**:
1. Check CORS headers in Nginx configuration
2. Verify `Access-Control-Allow-Origin` header is set correctly
3. Test with browser dev tools Network tab
4. Check browser console for specific CORS error messages

### SSL Certificate Issues

**Symptom**: "Connection not secure" or SSL errors

**Solution**:
```bash
# Check SSL certificates exist
ssh root@95.216.219.131 "ls -la /opt/tradstry/nginx/ssl/"

# Test SSL certificate
openssl s_client -connect app.tradstry.com:443 -servername app.tradstry.com

# Renew certificates (if using Let's Encrypt)
certbot renew --dry-run
```

## Updating the Application

### Quick Update

```bash
# On local machine
git pull origin main
./scripts/deploy-production.sh
```

### Manual Update

```bash
# 1. Pull latest code to VPS
ssh root@95.216.219.131 "cd /opt/tradstry && git pull origin main"

# 2. Rebuild and restart
ssh root@95.216.219.131 << 'EOF'
cd /opt/tradstry
docker-compose -f docker-compose.production.yaml down
docker-compose -f docker-compose.production.yaml up -d --build
docker-compose -f docker-compose.production.yaml logs -f
EOF
```

## Rollback

If deployment fails, you can rollback to a previous version:

```bash
ssh root@95.216.219.131 << 'EOF'
cd /opt/tradstry

# List backups
ls -la /opt/tradstry-backups/

# Restore previous docker-compose file
cp /opt/tradstry-backups/YYYYMMDD_HHMMSS/docker-compose.production.yaml .

# Restart with previous config
docker-compose -f docker-compose.production.yaml up -d
EOF
```

## Monitoring

### Check Service Status

```bash
# Quick status check
ssh root@95.216.219.131 "docker-compose -f docker-compose.production.yaml ps"

# Resource usage
ssh root@95.216.219.131 "docker stats --no-stream tradstry-backend tradstry-nginx"
```

### Set Up Monitoring

Create a monitoring script that checks service health:

```bash
#!/bin/bash
# check-health.sh

# Check backend health
if ! curl -f https://app.tradstry.com/api/health > /dev/null 2>&1; then
    echo "Backend health check FAILED" | mail -s "Tradstry Alert" admin@example.com
fi

# Check if containers are running
if ! docker ps | grep -q tradstry-backend; then
    echo "Backend container is DOWN" | mail -s "Tradstry Alert" admin@example.com
fi
```

Add to crontab:
```bash
*/5 * * * * /opt/tradstry/scripts/check-health.sh
```

## Backup Strategy

### Environment Files

```bash
# Backup environment files
ssh root@95.216.219.131 "cp /opt/tradstry/backend/.env.production /opt/tradstry-backups/env-backup-$(date +%Y%m%d).env"
```

### SSL Certificates

```bash
# Backup SSL certificates
ssh root@95.216.219.131 "tar -czf /opt/tradstry-backups/ssl-backup-$(date +%Y%m%d).tar.gz /opt/tradstry/nginx/ssl"
```

## Security Checklist

- ✅ Nginx handles SSL termination
- ✅ Backend not exposed directly to internet
- ✅ Non-root containers
- ✅ Resource limits configured
- ✅ Health checks enabled
- ✅ Logging enabled
- ✅ CORS properly configured
- ✅ Rate limiting enabled in Nginx
- ✅ Security headers set
- ✅ Environment variables secured (not in git)

## Network Architecture

```
Internet → Nginx (443) → Backend (8080)
              ↓
          SSL Termination
          Rate Limiting
          CORS Headers
```

## File Structure on VPS

```
/opt/tradstry/
├── docker-compose.production.yaml
├── backend/
│   ├── dockerfile
│   ├── .env.production
│   ├── src/
│   ├── Cargo.toml
│   └── Cargo.lock
├── nginx/
│   ├── nginx.conf
│   ├── tradstry.conf
│   ├── ssl/
│   │   ├── tradstry.com.crt
│   │   └── tradstry.com.key
│   └── logs/
└── scripts/
    └── deploy-production.sh
```

## Support

For deployment issues:

1. Check deployment logs: `./scripts/deploy-production.sh --verbose`
2. SSH to VPS and check logs: `docker logs tradstry-backend`
3. Verify DNS: `dig app.tradstry.com`
4. Test connectivity: `curl https://app.tradstry.com/api/health`
5. Review this document for common issues

