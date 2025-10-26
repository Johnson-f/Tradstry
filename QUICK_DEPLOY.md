# Quick Deployment Reference

## Separated Deployment Commands

### Deploy Backend Only

```bash
# Build and start
docker-compose -f docker-compose.backend.yml up -d --build

# View logs
docker-compose -f docker-compose.backend.yml logs -f

# Stop
docker-compose -f docker-compose.backend.yml down
```

### Deploy Frontend Only

```bash
# Build and start
docker-compose -f docker-compose.frontend.yml up -d --build

# View logs
docker-compose -f docker-compose.frontend.yml logs -f

# Stop
docker-compose -f docker-compose.frontend.yml down
```

### Deploy Both Separately

```bash
# Terminal 1 - Backend
docker-compose -f docker-compose.backend.yml up -d --build

# Terminal 2 - Frontend
docker-compose -f docker-compose.frontend.yml up -d --build
```

## Environment Setup

### Frontend (.env.production)
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080  # Point to backend
```

### Backend (backend/.env.production)
```bash
ALLOWED_ORIGINS=http://localhost:3000,https://tradstry.com
```

## Quick Health Checks

```bash
# Backend
curl http://localhost:8080/api/health

# Frontend
curl http://localhost:3000/api/health
```

## For More Details

See `DEPLOYMENT_SEPARATED.md` for complete documentation.

