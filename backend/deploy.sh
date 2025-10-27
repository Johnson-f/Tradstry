#!/bin/bash

# Deployment script for Tradstry backend to VPS
# Usage: ./deploy.sh [production|staging]

set -e

ENV=${1:-production}
VPS_IP="95.216.219.131"
VPS_USER="root"  # Change this to your VPS username
APP_DIR="/opt/tradstry-backend"
SERVICE_NAME="tradstry-backend"

echo "🚀 Starting deployment to VPS..."
echo "Environment: $ENV"
echo "Target: $VPS_USER@$VPS_IP"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Build the release binary locally
echo -e "${GREEN}📦 Building release binary...${NC}"
cd backend
cargo build --release

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful!${NC}"

# Create deployment package
echo -e "${GREEN}📦 Creating deployment package...${NC}"
cd ..
mkdir -p /tmp/tradstry-deploy
cp backend/target/release/tradstry-backend /tmp/tradstry-deploy/
cp backend/deploy.sh /tmp/tradstry-deploy/
cp backend/tradstry-backend.service /tmp/tradstry-deploy/
cp -r backend/database /tmp/tradstry-deploy/ 2>/dev/null || true

# Transfer files to VPS
echo -e "${GREEN}📤 Uploading files to VPS...${NC}"
ssh $VPS_USER@$VPS_IP "mkdir -p $APP_DIR"
scp -r /tmp/tradstry-deploy/* $VPS_USER@$VPS_IP:$APP_DIR/

# Setup on VPS
echo -e "${GREEN}🔧 Setting up on VPS...${NC}"
ssh $VPS_USER@$VPS_IP << 'ENDSSH'
cd /opt/tradstry-backend

# Make binary executable
chmod +x tradstry-backend

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found. Please create it manually."
fi

# Install systemd service
if [ -f tradstry-backend.service ]; then
    sudo cp tradstry-backend.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable $SERVICE_NAME
    echo "✅ Systemd service installed"
fi

ENDSSH

# Cleanup
rm -rf /tmp/tradstry-deploy

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo "1. SSH into the VPS: ssh $VPS_USER@$VPS_IP"
echo "2. Create .env file at $APP_DIR/.env with your environment variables"
echo "3. Start the service: sudo systemctl start $SERVICE_NAME"
echo "4. Check status: sudo systemctl status $SERVICE_NAME"
echo "5. View logs: sudo journalctl -u $SERVICE_NAME -f"

