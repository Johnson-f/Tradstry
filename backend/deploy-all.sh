#!/bin/bash

# Combined deployment script for both backend and snaptrade-service
# This script deploys both services to the VPS
# Usage: ./deploy-all.sh [production|staging]

set -e

ENV=${1:-production}
VPS_IP="95.216.219.131"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/id_ed25519_vps"
COMPOSE_DIR="/opt/tradstry"

echo "🚀 Starting combined deployment to VPS..."
echo "Environment: $ENV"
echo "Target: $VPS_USER@$VPS_IP"
echo "Services: backend, snaptrade-service"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}❌ SSH key not found at $SSH_KEY${NC}"
    exit 1
fi

# Deploy both services
echo -e "${GREEN}🚀 Deploying all services to VPS...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" << ENDSSH
set -e

echo "📥 Pulling latest Docker images from Docker Hub..."
cd $COMPOSE_DIR

# Pull latest images for both services
echo "Pulling backend image..."
docker compose pull backend

echo "Pulling snaptrade-service image..."
docker compose pull snaptrade-service

if [ \$? -ne 0 ]; then
    echo "❌ Failed to pull Docker images"
    exit 1
fi

echo "✅ Images pulled successfully"

# Restart both services with new images
echo "🔄 Restarting services..."
docker compose up -d backend snaptrade-service

if [ \$? -ne 0 ]; then
    echo "❌ Failed to restart services"
    exit 1
fi

echo "✅ Services restarted"

# Wait a moment for services to start
sleep 3

# Check service status
echo ""
echo "📊 Checking service status..."
docker compose ps

# Show recent logs
echo ""
echo "📋 Recent logs (last 20 lines):"
echo "=== Backend logs ==="
docker compose logs --tail 20 backend
echo ""
echo "=== SnapTrade service logs ==="
docker compose logs --tail 20 snaptrade-service

# Health checks
echo ""
echo "🏥 Checking health endpoints..."
sleep 3
echo "Backend health:"
curl -f http://localhost:3000/health || echo "⚠️  Backend health check failed"
echo ""
echo "SnapTrade service health:"
curl -f http://localhost:8080/health || echo "⚠️  SnapTrade health check failed"

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment complete!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Useful commands:${NC}"
    echo "  View all logs: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose logs -f'"
    echo "  View backend logs: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose logs -f backend'"
    echo "  View snaptrade logs: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose logs -f snaptrade-service'"
    echo "  Check status: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose ps'"
    echo "  Restart all: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose restart'"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

