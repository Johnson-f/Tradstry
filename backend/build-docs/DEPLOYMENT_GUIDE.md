# Tradstry Backend - VPS Deployment Guide

This guide will help you deploy your Rust backend to a VPS running on Ubuntu/Debian.

## 📋 Prerequisites

- VPS with Ubuntu/Debian OS
- SSH access configured
- Rust installed on your local machine
- All environment variables ready

## 🚀 Quick Deployment

### Method 1: Using the Deployment Script (Recommended)

1. **Make the script executable:**
```bash
chmod +x backend/deploy.sh
```

2. **Run the deployment:**
```bash
cd /Users/johnsonnifemi/Production-code
./backend/deploy.sh production
```

3. **SSH into your VPS and configure environment:**
```bash
ssh root@95.216.219.131
cd /opt/tradstry-backend
nano .env  # Create and configure your .env file
```

4. **Start the service:**
```bash
sudo systemctl start tradstry-backend
sudo systemctl status tradstry-backend
```

### Method 2: Manual Deployment

#### Step 1: Build Locally

```bash
cd backend
cargo build --release
```

#### Step 2: Transfer to VPS

```bash
scp target/release/tradstry-backend root@95.216.219.131:/opt/tradstry-backend/
scp tradstry-backend.service root@95.216.219.131:/tmp/
```

#### Step 3: SSH into VPS

```bash
ssh root@95.216.219.131
```

#### Step 4: Setup on VPS

```bash
# Create application directory
mkdir -p /opt/tradstry-backend
cd /opt/tradstry-backend

# Make binary executable
chmod +x tradstry-backend

# Install systemd service
sudo cp /tmp/tradstry-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tradstry-backend
```

#### Step 5: Configure Environment

```bash
cd /opt/tradstry-backend
nano .env
```

Copy the contents from `env.template` and fill in your actual values:

```bash
# Server Configuration
RUST_LOG=info
PORT=9000
RUST_ENV=production
ALLOWED_ORIGINS=https://tradstry.com,http://localhost:3000

# Turso Database Configuration
REGISTRY_DB_URL=libsql://your-database.turso.io
REGISTRY_DB_TOKEN=your-token
TURSO_API_TOKEN=your-api-token
TURSO_ORG=your-org-name

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Add all other required environment variables...
```

#### Step 6: Start the Service

```bash
sudo systemctl start tradstry-backend
sudo systemctl status tradstry-backend
```

## 🔍 Monitoring & Logs

### View Logs

```bash
# Real-time logs
sudo journalctl -u tradstry-backend -f

# Last 100 lines
sudo journalctl -u tradstry-backend -n 100

# Logs since today
sudo journalctl -u tradstry-backend --since today
```

### Check Service Status

```bash
sudo systemctl status tradstry-backend
```

### Health Check

```bash
curl http://localhost:9000/health
```

## 🔄 Updating the Application

### Using the Deployment Script

```bash
./backend/deploy.sh production
```

Then restart the service:

```bash
ssh root@95.216.219.131
sudo systemctl restart tradstry-backend
```

### Manual Update

```bash
# On local machine
cd backend
cargo build --release

# Copy to VPS
scp target/release/tradstry-backend root@95.216.219.131:/opt/tradstry-backend/

# On VPS
ssh root@95.216.219.131
sudo systemctl restart tradstry-backend
```

## 🛠️ Troubleshooting

### Service Won't Start

```bash
# Check status
sudo systemctl status tradstry-backend

# View logs
sudo journalctl -u tradstry-backend -n 50

# Check if port is in use
sudo lsof -i :9000

# Check permissions
ls -la /opt/tradstry-backend/tradstry-backend
```

### Common Issues

1. **Binary not found**: Make sure the binary is in `/opt/tradstry-backend/`
2. **Permission denied**: Run `chmod +x /opt/tradstry-backend/tradstry-backend`
3. **Environment variables missing**: Check `.env` file exists and has correct values
4. **Port already in use**: Change `PORT` in `.env` or kill the process using port 9000

### Database Connection Issues

```bash
# Test Turso connection
curl -H "Authorization: Bearer $REGISTRY_DB_TOKEN" \
     "$REGISTRY_DB_URL/version"

# Check network connectivity
ping your-database.turso.io
```

## 🔒 Security Considerations

### Firewall Setup

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow application port (if exposing directly)
sudo ufw allow 9000/tcp

# Enable firewall
sudo ufw enable
```

### Nginx Reverse Proxy (Recommended)

Create `/etc/nginx/sites-available/tradstry-backend`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:9000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/tradstry-backend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 📊 Performance Tuning

### Optimize Systemd Service

Edit `/etc/systemd/system/tradstry-backend.service`:

```ini
[Service]
# Increase limits
LimitNOFILE=65536
LimitNPROC=4096

# CPU and memory limits (optional)
CPUQuota=200%
MemoryLimit=2G
```

Reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart tradstry-backend
```

## 🗑️ Uninstall

```bash
sudo systemctl stop tradstry-backend
sudo systemctl disable tradstry-backend
sudo rm /etc/systemd/system/tradstry-backend.service
sudo systemctl daemon-reload
sudo rm -rf /opt/tradstry-backend
```

## 📝 Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Server port (default: 9000) |
| `RUST_LOG` | No | Log level (default: info) |
| `RUST_ENV` | No | Environment (production/development) |
| `ALLOWED_ORIGINS` | No | CORS origins (comma-separated) |
| `REGISTRY_DB_URL` | Yes | Turso registry database URL |
| `REGISTRY_DB_TOKEN` | Yes | Turso registry database token |
| `TURSO_API_TOKEN` | Yes | Turso API token |
| `TURSO_ORG` | Yes | Turso organization name |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `UPSTASH_VECTOR_REST_URL` | Yes | Upstash Vector REST URL |
| `UPSTASH_VECTOR_REST_TOKEN` | Yes | Upstash Vector token |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | Google OAuth redirect URI |
| `CRON_SECRET` | Yes | Secret for cron webhooks |
| `CLERK_WEBHOOK_SECRET` | No | Clerk webhook secret (legacy) |

## 🔗 Useful Commands

```bash
# Restart service
sudo systemctl restart tradstry-backend

# Stop service
sudo systemctl stop tradstry-backend

# Start service
sudo systemctl start tradstry-backend

# View logs in real-time
sudo journalctl -u tradstry-backend -f

# Check if service is running
systemctl is-active tradstry-backend

# Enable auto-start on boot
sudo systemctl enable tradstry-backend

# Disable auto-start on boot
sudo systemctl disable tradstry-backend

# Reload configuration
sudo systemctl daemon-reload
sudo systemctl restart tradstry-backend
```

