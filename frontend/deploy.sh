#!/bin/bash

# Deployment script for Tradstry frontend to Vercel
# This script deploys the frontend to Vercel using the Vercel CLI
# Usage: ./frontend/deploy.sh [production|preview]

set -e

ENV=${1:-production}

echo "🚀 Starting frontend deployment to Vercel..."
echo "Environment: $ENV"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${RED}❌ Vercel CLI not found!${NC}"
    echo -e "${YELLOW}Install it with: npm i -g vercel${NC}"
    exit 1
fi

# Check if logged in to Vercel
if ! vercel whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Vercel. Please run: vercel login${NC}"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Deploy to Vercel
if [ "$ENV" = "production" ]; then
    echo -e "${GREEN}📤 Deploying to Vercel Production...${NC}"
    vercel --prod --yes
else
    echo -e "${BLUE}📤 Deploying to Vercel Preview...${NC}"
    vercel --yes
fi

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Frontend deployment complete!${NC}"
    echo ""
    echo -e "${YELLOW}📋 Useful commands:${NC}"
    echo "  View deployments: vercel ls"
    echo "  View logs: vercel logs"
    echo "  Open dashboard: vercel"
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi
