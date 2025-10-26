#!/bin/bash

# Manual/Development Deployment Script for Tradistry
# 
# This script uses rsync to copy the codebase and builds images on the VPS.
# This is suitable for manual deployments or quick development iterations.
#
# For production deployments, use:
#   1. Registry-based CD pipeline (automatic on tagged releases)
#      - Git tag: git tag -a v1.0.0 -m "Release" && git push origin v1.0.0
#      - See: .github/workflows/cd-release.yml
#
#   2. Registry-based manual deployment:
#      - ./scripts/deploy-registry.sh
#      - Pulls pre-built images from Docker Hub
#
# This script (deploy.sh) is kept for development/debugging scenarios.

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

# Build frontend (optional - can be done on VPS instead)
echo "🔨 Building frontend..."
NODE_ENV=production \
NEXT_PUBLIC_SUPABASE_URL=$(grep NEXT_PUBLIC_SUPABASE_URL env-templates/frontend.env.production | cut -d '=' -f2) \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY=$(grep NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY env-templates/frontend.env.production | cut -d '=' -f2) \
NEXT_PUBLIC_API_URL=https://tradstry.com/api \
NEXT_PUBLIC_USE_REPLICACHE_JOURNAL=true \
NEXT_PUBLIC_USE_REPLICACHE_NOTES=true \
NEXT_PUBLIC_USE_REPLICACHE_PLAYBOOK=true \
NEXT_TELEMETRY_DISABLED=1 \
pnpm build || echo "⚠️ Local build failed, will build on VPS"

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
    
    # Start services (images already built locally)
    echo "▶️ Starting services..."
    docker-compose up -d --build
    
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
