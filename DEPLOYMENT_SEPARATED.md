# Separated Frontend & Backend Deployment Guide

This guide shows how to deploy the Tradistry frontend and backend as separate services.

## Architecture

- **Frontend**: Next.js app running on port 3000
- **Backend**: Rust API running on port 8080
- **Deployment**: Separate docker-compose files for independent scaling

## Prerequisites

- Same as main deployment (see DEPLOYMENT.md)
- Docker and Docker Compose installed
- Environment variables configured

## Environment Configuration

### Frontend Environment (.env.production)

```bash
NODE_ENV=production
NEXT_PUBLIC_API_URL=http://localhost:8080  # Change to backend URL if on different server
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=your-key
NEXT_TELEMETRY_DISABLED=1
```

### Backend Environment (backend/.env.production)

```bash
RUST_ENV=production
RUST_LOG=info
PORT=8080
HOST=0.0.0.0

# CORS Configuration (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:3000,https://tradstry.com,https://your-frontend-domain.com

# Add your other backend environment variables...
```

## Deployment Options

### Option 1: Separate Containers on Same Server

This is the most common setup for testing and small deployments.

#### Deploy Backend

```bash
cd /opt/tradstry

# Build and start backend
docker-compose -f docker-compose.backend.yml up -d --build

# Check logs
docker-compose -f docker-compose.backend.yml logs -f

# Verify backend is running
curl http://localhost:8080/api/health
```

#### Deploy Frontend

```bash
# Build and start frontend
docker-compose -f docker-compose.frontend.yml up -d --build

# Check logs
docker-compose -f docker-compose.frontend.yml logs -f

# Verify frontend is running
curl http://localhost:3000/api/health
```

### Option 2: Separate Servers

Deploy frontend and backend on different VPS servers for better scaling.

#### Backend Server Setup

```bash
# On backend server (e.g., api.tradstry.com)
cd /opt/tradstry-backend

# Copy only backend files
scp -r backend/ root@your-backend-server:/opt/tradstry-backend/
scp docker-compose.backend.yml root@your-backend-server:/opt/tradstry-backend/
scp backend/.env.production root@your-backend-server:/opt/tradstry-backend/

# Deploy backend
docker-compose -f docker-compose.backend.yml up -d --build
```

#### Frontend Server Setup

```bash
# On frontend server (e.g., tradstry.com)
cd /opt/tradstry-frontend

# Copy frontend files (exclude backend)
rsync -avz --exclude 'backend' --exclude 'target' \
  ./ root@your-frontend-server:/opt/tradstry-frontend/

# Update .env.production to point to backend URL
echo "NEXT_PUBLIC_API_URL=https://api.tradstry.com" >> .env.production

# Deploy frontend
docker-compose -f docker-compose.frontend.yml up -d --build
```

## CORS Configuration

The backend is configured to accept requests from multiple origins.

### Update Backend Environment

In `backend/.env.production`, add all allowed origins:

```bash
ALLOWED_ORIGINS=http://localhost:3000,https://tradstry.com,https://www.tradstry.com
```

### Origins are separated by commas, supports:
- Development: `http://localhost:3000`
- Production: `https://tradstry.com`
- Multiple domains
- WebSocket origins (for SSE/WebSocket connections)

## Networking

### Same Server Deployment

If frontend and backend run on the same server:

- **Frontend**: Accessible at `http://your-server:3000`
- **Backend**: Accessible at `http://your-server:8080`
- Frontend can call backend using `http://backend:8080` (Docker internal network)

### Different Servers Deployment

If they're on different servers:

- **Frontend**: Accessible at `https://tradstry.com`
- **Backend**: Accessible at `https://api.tradstry.com`
- Frontend calls backend via public URL: `https://api.tradstry.com/api`

Update frontend `.env.production`:
```bash
NEXT_PUBLIC_API_URL=https://api.tradstry.com
```

## Scaling

### Scale Backend Only

```bash
# Scale backend to 3 instances
docker-compose -f docker-compose.backend.yml up -d --scale backend=3

# Use a load balancer (nginx/traefik) to distribute traffic
```

### Scale Frontend Only

```bash
# Scale frontend to 2 instances
docker-compose -f docker-compose.frontend.yml up -d --scale frontend=2

# Use a load balancer to distribute traffic
```

## Management Commands

### View Logs

```bash
# Backend logs
docker-compose -f docker-compose.backend.yml logs -f backend

# Frontend logs
docker-compose -f docker-compose.frontend.yml logs -f frontend
```

### Stop Services

```bash
# Stop backend
docker-compose -f docker-compose.backend.yml down

# Stop frontend
docker-compose -f docker-compose.frontend.yml down
```

### Restart Services

```bash
# Restart backend
docker-compose -f docker-compose.backend.yml restart backend

# Restart frontend
docker-compose -f docker-compose.frontend.yml restart frontend
```

### View Resource Usage

```bash
# Backend resources
docker stats tradstry-backend

# Frontend resources
docker stats tradstry-frontend
```

## Health Checks

Both services include health check endpoints:

### Backend Health

```bash
curl http://localhost:8080/api/health
# or
curl http://your-backend-server:8080/api/health
```

### Frontend Health

```bash
curl http://localhost:3000/api/health
# or
curl http://your-frontend-server:3000/api/health
```

## Troubleshooting

### CORS Errors

If you see CORS errors:

1. Check `ALLOWED_ORIGINS` in backend environment
2. Verify frontend URL is in the comma-separated list
3. Ensure `NEXT_PUBLIC_API_URL` points to correct backend URL
4. Check browser console for actual origin being used

### Connection Refused

If backend is unreachable:

1. Verify backend is running: `docker ps`
2. Check backend logs: `docker-compose -f docker-compose.backend.yml logs backend`
3. Verify port 8080 is open: `netstat -tlnp | grep 8080`
4. Check firewall rules: `ufw status`

### 401 Unauthorized

If authentication fails:

1. Check JWT token is being sent
2. Verify Supabase credentials in backend environment
3. Check backend logs for auth errors
4. Ensure token hasn't expired

## Best Practices

1. **Environment Variables**: Never commit `.env.production` files
2. **Security**: Use HTTPS in production
3. **Monitoring**: Set up health check monitoring
4. **Logging**: Centralize logs with a logging service
5. **Scaling**: Start with one instance, scale as needed
6. **Backups**: Regular database backups
7. **Updates**: Use blue-green deployment for zero-downtime updates

## Production Deployment Example

```bash
# 1. Deploy backend first
cd /opt/tradstry-backend
docker-compose -f docker-compose.backend.yml up -d --build

# 2. Wait for backend to be healthy
curl http://localhost:8080/api/health

# 3. Deploy frontend
cd /opt/tradstry-frontend
docker-compose -f docker-compose.frontend.yml up -d --build

# 4. Verify both are running
docker ps | grep tradstry

# 5. Test integration
curl http://localhost:3000/api/health
```

## Rollback

If something goes wrong:

```bash
# Rollback backend
docker-compose -f docker-compose.backend.yml down
docker-compose -f docker-compose.backend.yml up -d

# Rollback frontend
docker-compose -f docker-compose.frontend.yml down
docker-compose -f docker-compose.frontend.yml up -d
```

## Advantages of Separated Deployment

1. **Independent Scaling**: Scale frontend and backend independently
2. **Resource Optimization**: Allocate resources based on actual need
3. **Faster Updates**: Update one service without affecting the other
4. **Better Isolation**: Issues in one service don't affect the other
5. **Flexibility**: Deploy services to different servers/regions

## Security Considerations

1. **CORS**: Configure allowed origins carefully
2. **Authentication**: Use JWT tokens with expiration
3. **Rate Limiting**: Implement rate limiting on backend
4. **HTTPS**: Always use HTTPS in production
5. **Secrets**: Store secrets in environment variables, never in code
6. **Firewall**: Only expose necessary ports

