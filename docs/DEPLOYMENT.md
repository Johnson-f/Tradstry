# Tradistry Deployment Guide

## Overview

This guide covers deploying the Tradistry full-stack application to Hetzner VPS with Docker, Nginx reverse proxy, and SSL certificates.

## Architecture

- **Frontend**: Next.js app (port 3000 internal)
- **Backend**: Rust API (port 8080 internal)  
- **Nginx**: Reverse proxy (ports 80/443 public)
- **SSL**: Let's Encrypt certificates
- **Domain**: https://tradstry.com

## Prerequisites

- Hetzner VPS with Ubuntu/Debian
- Domain name (tradstry.com) pointing to VPS IP
- Supabase project with credentials
- Turso database with credentials

## Step 1: DNS Configuration

### Configure Hostinger DNS

1. Login to [hpanel.hostinger.com](https://hpanel.hostinger.com)
2. Go to **DNS Zone Editor**
3. Add/Update these records:

```
Type: A
Name: @
Value: 37.27.200.227
TTL: 3600

Type: A  
Name: www
Value: 37.27.200.227
TTL: 3600
```

4. Wait for DNS propagation (5-60 minutes)
5. Verify with: `dig tradstry.com`

## Step 2: Server Setup

### Initial Server Configuration

1. **Connect to your VPS:**
   ```bash
   ssh root@37.27.200.227
   ```

2. **Run the setup script:**
   ```bash
   # Upload and run setup script
   curl -o setup-server.sh https://raw.githubusercontent.com/your-repo/setup-server.sh
   chmod +x setup-server.sh
   ./setup-server.sh
   ```

3. **Reboot the server:**
   ```bash
   reboot
   ```

## Step 3: Environment Configuration

### Create Environment Files

1. **Frontend environment:**
   ```bash
   # Copy template and edit
   cp env-templates/frontend.env.production .env.production
   nano .env.production
   ```

   Fill in your values:
   ```bash
   NODE_ENV=production
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_API_URL=https://tradstry.com/api
   NEXT_TELEMETRY_DISABLED=1
   ```

2. **Backend environment:**
   ```bash
   # Copy template and edit
   cp env-templates/backend.env.production backend/.env.production
   nano backend/.env.production
   ```

   Fill in your values:
   ```bash
   RUST_ENV=production
   RUST_LOG=info
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   TURSO_DATABASE_URL=libsql://your-database.turso.io
   TURSO_AUTH_TOKEN=your-turso-token
   PORT=8080
   HOST=0.0.0.0
   ALLOWED_ORIGINS=https://tradstry.com
   ```

## Step 4: Deploy Application

### Upload Application Files

1. **Upload files to VPS:**
   ```bash
   # From your local machine
   rsync -avz --delete \
     --exclude 'node_modules' \
     --exclude '.git' \
     --exclude '.next' \
     --exclude 'target' \
     ./ root@37.27.200.227:/opt/tradstry/
   ```

2. **Deploy with Docker Compose:**
   ```bash
   # On VPS
   cd /opt/tradstry
   docker-compose up -d
   ```

## Step 5: SSL Certificate Setup

### Obtain SSL Certificates

1. **Run SSL setup script:**
   ```bash
   cd /opt/tradstry
   ./scripts/setup-ssl.sh
   ```

2. **Verify SSL is working:**
   ```bash
   curl -I https://tradstry.com
   ```

## Step 6: Verification

### Test All Services

1. **Frontend Health Check:**
   ```bash
   curl https://tradstry.com/api/health
   ```

2. **Backend Health Check:**
   ```bash
   curl https://tradstry.com/api/health
   ```

3. **SSL Certificate Check:**
   ```bash
   openssl s_client -connect tradstry.com:443 -servername tradstry.com
   ```

## Step 7: Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f frontend
docker-compose logs -f backend
docker-compose logs -f nginx
```

### Check Service Status

```bash
# Container status
docker-compose ps

# Resource usage
docker stats

# Health checks
docker-compose exec frontend curl localhost:3000/api/health
docker-compose exec backend curl localhost:8080/api/health
```

## Maintenance

### Updating Application

1. **Pull latest changes:**
   ```bash
   cd /opt/tradstry
   git pull origin main
   ```

2. **Rebuild and restart:**
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

### SSL Certificate Renewal

Certificates auto-renew via cron job. Manual renewal:

```bash
certbot renew --dry-run  # Test renewal
certbot renew            # Actual renewal
docker-compose restart nginx
```

### Backup

```bash
# Backup environment files
tar -czf backup-$(date +%Y%m%d).tar.gz .env.production backend/.env.production

# Backup SSL certificates
cp -r nginx/ssl backup-ssl-$(date +%Y%m%d)/
```

## Troubleshooting

### Common Issues

1. **DNS not resolving:**
   ```bash
   dig tradstry.com
   nslookup tradstry.com
   ```

2. **SSL certificate issues:**
   ```bash
   certbot certificates
   certbot renew --force-renewal
   ```

3. **Container not starting:**
   ```bash
   docker-compose logs [service-name]
   docker-compose config  # Validate config
   ```

4. **CORS errors:**
   - Check `ALLOWED_ORIGINS` in backend environment
   - Verify Nginx CORS headers

### Performance Optimization

1. **Enable HTTP/2:**
   - Already configured in nginx.conf

2. **Enable Gzip:**
   - Already configured in nginx.conf

3. **Resource Limits:**
   - Already configured in docker-compose.yaml

## Security Checklist

- ✅ SSL certificates installed and auto-renewing
- ✅ Firewall configured (ports 22, 80, 443 only)
- ✅ CORS restricted to https://tradstry.com
- ✅ Non-root containers
- ✅ Security headers enabled
- ✅ Rate limiting configured
- ✅ Environment variables secured

## Support

For issues:
1. Check logs: `docker-compose logs -f`
2. Verify DNS: `dig tradstry.com`
3. Test SSL: `curl -I https://tradstry.com`
4. Check health: `curl https://tradstry.com/api/health`

## File Structure

```
/opt/tradstry/
├── docker-compose.yaml
├── dockerfile
├── backend/
│   ├── dockerfile
│   └── .env.production
├── nginx/
│   ├── nginx.conf
│   ├── tradstry.conf
│   └── ssl/
├── scripts/
│   ├── setup-server.sh
│   ├── setup-ssl.sh
│   └── deploy.sh
└── .env.production
```
