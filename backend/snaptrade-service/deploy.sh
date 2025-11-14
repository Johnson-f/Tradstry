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

# Check if docker-compose.yml exists locally
COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"
if [ ! -f "$COMPOSE_FILE" ]; then
    echo -e "${RED}❌ docker-compose.yml not found at $COMPOSE_FILE${NC}"
    exit 1
fi

# Check if docker-compose.yml exists on VPS, copy/update it
echo -e "${BLUE}📋 Checking for docker-compose.yml on VPS...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "mkdir -p $COMPOSE_DIR"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$COMPOSE_FILE" "$VPS_USER@$VPS_IP:$COMPOSE_DIR/docker-compose.yml"
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ docker-compose.yml updated on VPS${NC}"
else
    echo -e "${RED}❌ Failed to copy docker-compose.yml${NC}"
    exit 1
fi

# Check if .env file exists on VPS
echo -e "${BLUE}📋 Checking for .env file on VPS...${NC}"
if ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "[ ! -f $COMPOSE_DIR/.env ]"; then
    echo -e "${YELLOW}⚠️  .env file not found on VPS${NC}"
    echo -e "${YELLOW}📝 You need to create a .env file on the VPS with the following variables:${NC}"
    echo -e "${BLUE}   SNAPTRADE_CLIENT_ID=your_client_id${NC}"
    echo -e "${BLUE}   SNAPTRADE_CONSUMER_KEY=your_consumer_key${NC}"
    echo -e "${BLUE}   PORT=8080${NC}"
    echo ""
    echo -e "${YELLOW}To set environment variables on the VPS, run:${NC}"
    echo -e "${BLUE}  ssh -i $SSH_KEY $VPS_USER@$VPS_IP${NC}"
    echo -e "${BLUE}  cd $COMPOSE_DIR${NC}"
    echo -e "${BLUE}  nano .env${NC}"
    echo ""
    echo -e "${YELLOW}Or create it directly with:${NC}"
    echo -e "${BLUE}  ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && cat > .env << \"ENVEOF\"${NC}"
    echo -e "${BLUE}  SNAPTRADE_CLIENT_ID=your_client_id${NC}"
    echo -e "${BLUE}  SNAPTRADE_CONSUMER_KEY=your_consumer_key${NC}"
    echo -e "${BLUE}  PORT=8080${NC}"
    echo -e "${BLUE}  ENVEOF'${NC}"
    echo ""
    echo -e "${RED}⚠️  Deployment will continue but service may fail to start without .env file${NC}"
    echo -e "${YELLOW}   Please create the .env file on the VPS before the service starts.${NC}"
else
    echo -e "${GREEN}✅ .env file already exists on VPS${NC}"
fi

# Deploy to VPS
echo -e "${GREEN}🚀 Deploying SnapTrade service to VPS...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" << ENDSSH
set -e

# Ensure directory exists
mkdir -p $COMPOSE_DIR
cd $COMPOSE_DIR

# Verify docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in $COMPOSE_DIR"
    exit 1
fi

# Pull latest image (this may fail if service doesn't exist yet, which is okay)
echo "📥 Pulling latest Docker image from Docker Hub..."
if docker compose -f docker-compose.yml pull $SERVICE_NAME 2>/dev/null; then
    echo "✅ Image pulled successfully"
else
    echo "⚠️  Could not pull image (service may not exist yet, will create on first up)"
    # Try to pull the image directly
    docker pull $DOCKER_IMAGE || echo "⚠️  Could not pull image directly"
fi

# Remove conflicting docker-compose.yaml if it exists (to avoid conflicts)
if [ -f "docker-compose.yaml" ]; then
    echo "⚠️  Found docker-compose.yaml, removing it to avoid conflicts with docker-compose.yml"
    rm -f docker-compose.yaml
fi

# Also check for and remove/rename any other compose files that might conflict
# This handles cases where there are multiple compose files that docker compose might auto-detect
for compose_file in docker-compose.*.yml docker-compose.*.yaml; do
    if [ -f "$compose_file" ] && [ "$compose_file" != "docker-compose.yml" ]; then
        echo "⚠️  Found additional compose file: $compose_file, backing it up to avoid conflicts"
        mv "$compose_file" "${compose_file}.backup" 2>/dev/null || true
    fi
done

# Check if docker-compose.yml still has version field and remove it
if grep -q "^version:" docker-compose.yml; then
    echo "🔧 Removing obsolete 'version' field from docker-compose.yml..."
    sed -i '/^version:/d' docker-compose.yml
fi

# Stop and remove existing container if it exists (to avoid port conflicts)
echo "🛑 Stopping existing container if running..."
docker compose -f docker-compose.yml stop $SERVICE_NAME 2>/dev/null || true
docker compose -f docker-compose.yml rm -f $SERVICE_NAME 2>/dev/null || true

# Also check for any container using port 8080 and stop it
echo "🔍 Checking for containers using port 8080..."
PORT_CONTAINERS=\$(docker ps -a --filter "publish=8080" --format "{{.ID}}" 2>/dev/null | tr '\n' ' ' || true)
if [ ! -z "\$PORT_CONTAINERS" ]; then
    echo "⚠️  Found containers using port 8080, stopping and removing them..."
    for container_id in \$PORT_CONTAINERS; do
        if [ ! -z "\$container_id" ]; then
            docker stop \$container_id 2>/dev/null || true
            docker rm \$container_id 2>/dev/null || true
        fi
    done
fi

# Start/restart snaptrade-service with new image
# This will create the service if it doesn't exist
# Use explicit file to avoid conflicts with other compose files
echo "🔄 Starting/restarting SnapTrade service..."
docker compose -f docker-compose.yml up -d $SERVICE_NAME

if [ \$? -ne 0 ]; then
    echo "❌ Failed to start/restart service"
    echo "💡 Make sure docker-compose.yml exists in $COMPOSE_DIR"
    exit 1
fi

echo "✅ SnapTrade service started/restarted"

# Wait a moment for service to start
sleep 2

# Check service status
echo ""
echo "📊 Checking service status..."
docker compose -f docker-compose.yml ps $SERVICE_NAME

# Show recent logs
echo ""
echo "📋 Recent logs (last 20 lines):"
docker compose -f docker-compose.yml logs --tail 20 $SERVICE_NAME

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
    echo "  View logs: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose -f docker-compose.yml logs -f $SERVICE_NAME'"
    echo "  Check status: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose -f docker-compose.yml ps'"
    echo "  Restart: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose -f docker-compose.yml restart $SERVICE_NAME'"
    echo "  Health check: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'curl http://localhost:8080/health'"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

