#!/bin/bash

# Registry-based Deployment Script for Tradstry
# This script deploys by pulling pre-built images from Docker Hub
# Usage: ./scripts/deploy-registry.sh

set -e

# Configuration
VPS_HOST="${VPS_HOST:-37.27.200.227}"
VPS_USER="${VPS_USER:-root}"
APP_DIR="/opt/tradstry"

echo "🚀 Deploying Tradstry from Docker Hub Registry..."

# Check SSH access
echo "Checking SSH connection..."
if ! ssh -o ConnectTimeout=5 "${VPS_USER}@${VPS_HOST}" "echo 'SSH connection successful'" 2>/dev/null; then
    echo "❌ Error: Cannot connect to VPS. Please check:"
    echo "   - SSH key is properly configured"
    echo "   - VPS_HOST and VPS_USER are correct"
    exit 1
fi

# Deploy on VPS
echo "📦 Pulling latest images from Docker Hub..."
ssh "${VPS_USER}@${VPS_HOST}" bash << EOF
    set -e
    
    cd ${APP_DIR}
    
    echo "🛑 Stopping existing containers..."
    docker-compose down || true
    
    echo "📥 Pulling latest images..."
    docker-compose pull
    
    echo "▶️ Starting services..."
    docker-compose up -d
    
    echo "⏳ Waiting for services to be healthy..."
    sleep 20
    
    echo "🏥 Checking service health..."
    docker-compose ps
    
    echo "📋 Recent logs:"
    docker-compose logs --tail=30
    
    echo "✅ Deployment complete!"
EOF

echo ""
echo "🌐 Your application should now be available at:"
echo "   Frontend: https://tradstry.com"
echo "   Backend: https://tradstry.com/api"
echo ""
echo "🔍 To check logs: ssh ${VPS_USER}@${VPS_HOST} 'cd ${APP_DIR} && docker-compose logs -f'"
echo "🛑 To stop: ssh ${VPS_USER}@${VPS_HOST} 'cd ${APP_DIR} && docker-compose down'"
echo "🔄 To restart: ssh ${VPS_USER}@${VPS_HOST} 'cd ${APP_DIR} && docker-compose restart'"

