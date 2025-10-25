#!/bin/bash

# Deployment Script for Tradistry
# Run this script to deploy updates to your VPS

set -e

# Configuration
VPS_IP="37.27.200.227"
VPS_USER="root"  # Change this to your VPS username
APP_DIR="/opt/tradstry"
LOCAL_DIR="$(pwd)"

echo "🚀 Deploying Tradistry to Hetzner VPS..."

# Check if we're in the right directory
if [ ! -f "docker-compose.yaml" ]; then
    echo "❌ Error: docker-compose.yaml not found. Please run this script from the project root."
    exit 1
fi

# Build images locally (optional - you can also build on VPS)
echo "🔨 Building Docker images..."
docker-compose build

# Copy files to VPS
echo "📤 Copying files to VPS..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.next' \
    --exclude 'target' \
    --exclude '*.log' \
    "$LOCAL_DIR/" "$VPS_USER@$VPS_IP:$APP_DIR/"

# Copy environment files
echo "📋 Copying environment files..."
scp env-templates/frontend.env.production "$VPS_USER@$VPS_IP:$APP_DIR/.env.production"
scp env-templates/backend.env.production "$VPS_USER@$VPS_IP:$APP_DIR/backend/.env.production"

# Deploy on VPS
echo "🚀 Deploying on VPS..."
ssh "$VPS_USER@$VPS_IP" << EOF
    cd $APP_DIR
    
    # Stop existing containers
    echo "🛑 Stopping existing containers..."
    docker-compose down
    
    # Pull latest images (if using registry)
    # docker-compose pull
    
    # Build images on VPS
    echo "🔨 Building images on VPS..."
    docker-compose build --no-cache
    
    # Start services
    echo "▶️ Starting services..."
    docker-compose up -d
    
    # Wait for services to be healthy
    echo "⏳ Waiting for services to be healthy..."
    sleep 30
    
    # Check health
    echo "🏥 Checking service health..."
    docker-compose ps
    
    # Show logs
    echo "📋 Recent logs:"
    docker-compose logs --tail=20
EOF

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your application should now be available at:"
echo "   Frontend: https://tradstry.com"
echo "   Backend: https://tradstry.com/api"
echo ""
echo "🔍 To check logs: ssh $VPS_USER@$VPS_IP 'cd $APP_DIR && docker-compose logs -f'"
echo "🛑 To stop: ssh $VPS_USER@$VPS_IP 'cd $APP_DIR && docker-compose down'"
