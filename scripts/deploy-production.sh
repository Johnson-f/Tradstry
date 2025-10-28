#!/bin/bash

################################################################################
# Production Deployment Script for Tradistry Backend
#
# This script deploys the backend and Nginx services to the VPS.
# Frontend is hosted separately on Vercel.
#
# Usage:
#   ./scripts/deploy-production.sh [OPTIONS]
#
# Options:
#   -h HOST       VPS hostname or IP (default: 95.216.219.131)
#   -u USER       SSH user (default: root)
#   -k KEY        SSH key path (default: ~/.ssh/id_ed25519_vps)
#   -d DIR        Deployment directory on VPS (default: /opt/tradstry)
#   --skip-backup Skip backing up current deployment
#   --verbose     Enable verbose output
#
################################################################################

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default configuration
VPS_HOST="${VPS_HOST:-95.216.219.131}"
VPS_USER="${VPS_USER:-root}"
VPS_KEY="${VPS_KEY:-$HOME/.ssh/id_ed25519_vps}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/tradstry}"
SKIP_BACKUP="${SKIP_BACKUP:-false}"
VERBOSE="${VERBOSE:-false}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--host)
            VPS_HOST="$2"
            shift 2
            ;;
        -u|--user)
            VPS_USER="$2"
            shift 2
            ;;
        -k|--key)
            VPS_KEY="$2"
            shift 2
            ;;
        -d|--directory)
            DEPLOY_DIR="$2"
            shift 2
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            shift
            ;;
        --verbose)
            VERBOSE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "[DEBUG] $1"
    fi
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if SSH key exists
    if [[ ! -f "$VPS_KEY" ]]; then
        log_error "SSH key not found: $VPS_KEY"
        exit 1
    fi
    
    # Check if required files exist
    if [[ ! -f "docker-compose.production.yaml" ]]; then
        log_error "docker-compose.production.yaml not found"
        exit 1
    fi
    
    if [[ ! -f "backend/dockerfile" ]]; then
        log_error "backend/dockerfile not found"
        exit 1
    fi
    
    if [[ ! -f "nginx/nginx.conf" ]]; then
        log_error "nginx/nginx.conf not found"
        exit 1
    fi
    
    if [[ ! -f "nginx/tradstry.conf" ]]; then
        log_error "nginx/tradstry.conf not found"
        exit 1
    fi
    
    # Test SSH connection
    log_info "Testing SSH connection to $VPS_USER@$VPS_HOST..."
    if ! ssh -i "$VPS_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$VPS_USER@$VPS_HOST" "echo 'Connection successful'" 2>/dev/null; then
        log_error "Failed to connect to VPS. Check SSH key and network."
        exit 1
    fi
    
    log_info "Prerequisites check passed ✓"
}

# Backup current deployment
backup_deployment() {
    if [[ "$SKIP_BACKUP" == "true" ]]; then
        log_warn "Skipping backup..."
        return
    fi
    
    log_info "Creating backup of current deployment..."
    
    ssh -i "$VPS_KEY" "$VPS_USER@$VPS_HOST" << 'EOF'
        cd /opt/tradstry
        BACKUP_DIR="/opt/tradstry-backups/$(date +%Y%m%d_%H%M%S)"
        mkdir -p "$BACKUP_DIR"
        
        if [ -f docker-compose.yaml ]; then
            cp docker-compose.yaml "$BACKUP_DIR/"
        fi
        
        if [ -f docker-compose.production.yaml ]; then
            cp docker-compose.production.yaml "$BACKUP_DIR/"
        fi
        
        echo "Backup created at: $BACKUP_DIR"
EOF
    
    log_info "Backup created ✓"
}

# Deploy files to VPS
deploy_files() {
    log_info "Deploying files to VPS..."
    
    # Create deployment directory if it doesn't exist
    ssh -i "$VPS_KEY" "$VPS_USER@$VPS_HOST" "mkdir -p $DEPLOY_DIR/{nginx/ssl,nginx/logs,backend}"
    
    # Copy docker-compose file
    scp -i "$VPS_KEY" docker-compose.production.yaml "$VPS_USER@$VPS_HOST:$DEPLOY_DIR/"
    log_debug "Copied docker-compose.production.yaml"
    
    # Copy nginx configuration files
    scp -i "$VPS_KEY" nginx/nginx.conf "$VPS_USER@$VPS_HOST:$DEPLOY_DIR/nginx/"
    scp -i "$VPS_KEY" nginx/tradstry.conf "$VPS_USER@$VPS_HOST:$DEPLOY_DIR/nginx/"
    log_debug "Copied nginx configuration files"
    
    # Copy entire backend directory (exclude unnecessary files)
    log_info "Copying backend files..."
    rsync -avz --delete \
        -e "ssh -i $VPS_KEY" \
        --exclude 'target' \
        --exclude '.git' \
        --exclude 'build-docs' \
        --exclude 'training-data' \
        backend/ "$VPS_USER@$VPS_HOST:$DEPLOY_DIR/backend/"
    
    log_debug "Copied backend files"
    
    log_info "Files deployed ✓"
}

# Build and start services
start_services() {
    log_info "Building and starting services..."
    
    ssh -i "$VPS_KEY" "$VPS_USER@$VPS_HOST" << EOF
        set -e
        cd $DEPLOY_DIR
        
        # Stop existing containers
        echo "Stopping existing containers..."
        docker-compose -f docker-compose.production.yaml down || true
        
        # Build and start services
        echo "Building and starting services..."
        docker-compose -f docker-compose.production.yaml up -d --build
        
        # Wait for services to be healthy
        echo "Waiting for services to be healthy..."
        sleep 30
        
        # Check service status
        echo "Service status:"
        docker-compose -f docker-compose.production.yaml ps
        
        # Show recent logs
        echo "Recent logs:"
        docker-compose -f docker-compose.production.yaml logs --tail=50
EOF
    
    log_info "Services started ✓"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check if containers are running
    log_info "Checking container status..."
    ssh -i "$VPS_KEY" "$VPS_USER@$VPS_HOST" << 'EOF'
        cd /opt/tradstry
        echo "=== Container Status ==="
        docker-compose -f docker-compose.production.yaml ps
        
        echo ""
        echo "=== Health Check Results ==="
        
        # Check backend health
        if docker exec tradstry-backend curl -f http://localhost:8080/api/health > /dev/null 2>&1; then
            echo "✓ Backend health check passed"
        else
            echo "✗ Backend health check failed"
        fi
        
        # Check nginx config
        if docker exec tradstry-nginx nginx -t > /dev/null 2>&1; then
            echo "✓ Nginx configuration is valid"
        else
            echo "✗ Nginx configuration has errors"
        fi
EOF
    
    # Test API endpoint
    log_info "Testing API endpoint..."
    if curl -f "https://app.tradstry.com/api/health" > /dev/null 2>&1; then
        log_info "✓ API endpoint is accessible"
        curl -s "https://app.tradstry.com/api/health" | jq . || true
    else
        log_warn "⚠ API endpoint test failed (this might be expected if DNS hasn't propagated)"
    fi
    
    log_info "Verification complete ✓"
}

# Show logs
show_logs() {
    log_info "Showing recent logs..."
    
    ssh -i "$VPS_KEY" "$VPS_USER@$VPS_HOST" << 'EOF'
        cd /opt/tradstry
        echo "=== Backend Logs ==="
        docker-compose -f docker-compose.production.yaml logs --tail=30 backend
        
        echo ""
        echo "=== Nginx Logs ==="
        docker-compose -f docker-compose.production.yaml logs --tail=30 nginx
EOF
}

# Main deployment flow
main() {
    log_info "Starting production deployment..."
    log_info "Target: $VPS_USER@$VPS_HOST"
    log_info "Deployment directory: $DEPLOY_DIR"
    
    check_prerequisites
    backup_deployment
    deploy_files
    start_services
    verify_deployment
    
    log_info ""
    log_info "=========================================="
    log_info "🎉 Deployment completed successfully!"
    log_info "=========================================="
    log_info ""
    log_info "Useful commands:"
    log_info "  View logs:   ssh $VPS_USER@$VPS_HOST 'cd $DEPLOY_DIR && docker-compose -f docker-compose.production.yaml logs -f'"
    log_info "  Stop:        ssh $VPS_USER@$VPS_HOST 'cd $DEPLOY_DIR && docker-compose -f docker-compose.production.yaml down'"
    log_info "  Restart:     ssh $VPS_USER@$VPS_HOST 'cd $DEPLOY_DIR && docker-compose -f docker-compose.production.yaml restart'"
    log_info "  Shell:       ssh $VPS_USER@$VPS_HOST 'cd $DEPLOY_DIR && docker-compose -f docker-compose.production.yaml exec backend sh'"
    log_info ""
}

# Run main function
main "$@"

