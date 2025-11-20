#!/bin/bash

set -e

VPS_IP="95.216.219.131"
VPS_USER="root"
SSH_KEY="$HOME/.ssh/id_ed25519_vps"
COMPOSE_DIR="/opt/qdrant"
SERVICE_NAME="qdrant"

echo "🚀 Deploying Qdrant to VPS..."
echo "Target: $VPS_USER@$VPS_IP"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Check SSH key
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}❌ SSH key not found at $SSH_KEY${NC}"
    exit 1
fi

# Create docker-compose.yml locally
cat > docker-compose.qdrant.yml << 'EOF'
services:
  qdrant:
    image: qdrant/qdrant:latest
    restart: always
    ports:
      - "6333:6333"
    volumes:
      - ./qdrant_storage:/qdrant/storage:z
EOF

echo -e "${BLUE}📋 Copying docker-compose.yml to VPS...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "mkdir -p $COMPOSE_DIR"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no docker-compose.qdrant.yml "$VPS_USER@$VPS_IP:$COMPOSE_DIR/docker-compose.yml"

echo -e "${GREEN}🚀 Starting Qdrant on VPS...${NC}"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" << 'ENDSSH'
set -e

cd /opt/qdrant

# Pull latest Qdrant image
echo "📥 Pulling Qdrant image..."
docker compose pull qdrant

# Stop existing container
echo "🛑 Stopping existing container..."
docker compose stop qdrant 2>/dev/null || true
docker compose rm -f qdrant 2>/dev/null || true

# Start Qdrant
echo "🔄 Starting Qdrant..."
docker compose up -d qdrant

# Wait for startup
sleep 3

# Check status
echo ""
echo "📊 Service status:"
docker compose ps qdrant

echo ""
echo "📋 Recent logs:"
docker compose logs --tail 20 qdrant

ENDSSH

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Qdrant deployed successfully!${NC}"
    echo ""
    echo "🔗 Access Qdrant at: http://$VPS_IP:6333"
    echo ""
    echo "📋 Useful commands:"
    echo "  View logs: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose logs -f qdrant'"
    echo "  Check status: ssh -i $SSH_KEY $VPS_USER@$VPS_IP 'cd $COMPOSE_DIR && docker compose ps'"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

# Cleanup local temp file
rm -f docker-compose.qdrant.yml