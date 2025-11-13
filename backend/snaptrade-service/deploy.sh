#!/bin/bash

# Deployment script for SnapTrade service to VPS using Docker
# This script pulls the latest image from Docker Hub (already built by CI/CD)
# and updates the snaptrade-service on the VPS
# Usage: ./deploy.sh [production|staging]

set -e

ENV=${1:-production}
VPS_IP="95.216.219.131"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/id_ed25519_vps"
DOCKER_IMAGE="johnsonf/snaptrade-service:latest"
COMPOSE_DIR="/opt/tradstry"
SERVICE_NAME="snaptrade-service"

echo "🚀 Starting Docker deployment to VPS..."
echo "Environment: $ENV"
echo "Target: $VPS_USER@$VPS_IP"
echo "Image: $DOCKER_IMAGE"
echo ""
echo "Note: Docker image should already be built and pushed to Docker Hub via CI/CD"

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

# Deploy to VPS
echo -e "${GREEN}🚀 Deploying SnapTrade service to VPS...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" << ENDSSH
set -e

echo "📥 Pulling latest Docker image from Docker Hub..."
cd $COMPOSE_DIR

# Pull latest image
docker compose pull $SERVICE_NAME

if [ \$? -ne 0 ]; then
    echo "❌ Failed to pull Docker image"
    exit 1
fi

echo "✅ Image pulled successfully"

# Restart snaptrade-service with new image
echo "🔄 Restarting SnapTrade service..."
docker compose up -d $SERVICE_NAME

if [ \$? -ne 0 ]; then
    echo "❌ Failed to restart service"
    exit 1
fi

echo "✅ SnapTrade service restarted"

# Wait a moment for service to start
sleep 2

# Check service status
echo ""
echo "📊 Checking service status..."
docker compose ps $SERVICE_NAME

# Show recent logs
echo ""
echo "📋 Recent logs (last 20 lines):"
docker compose logs --tail 20 $SERVICE_NAME

# Health check
echo ""
echo "🏥 Checking health endpoint..."
sleep 3
curl -f http://localhost:8080/health || echo "⚠️  Health check failed (service may still be starting)"

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment complete!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Useful commands:${NC}"
    echo "  View logs: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose logs -f $SERVICE_NAME'"
    echo "  Check status: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose ps'"
    echo "  Restart: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose restart $SERVICE_NAME'"
    echo "  Health check: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'curl http://localhost:8080/health'"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

