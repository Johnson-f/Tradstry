#!/bin/bash

# Stop Celery services for Tradistry scheduler

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$BACKEND_DIR/logs"

echo -e "${BLUE}🛑 Stopping Tradistry Celery Services${NC}"

# Change to backend directory
cd "$BACKEND_DIR"

# Function to stop a service by PID file
stop_service() {
    local service_name=$1
    local pid_file="$LOG_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file" 2>/dev/null)
        if [ -n "$pid" ] && ps -p "$pid" > /dev/null 2>&1; then
            echo -e "${YELLOW}🔄 Stopping $service_name (PID: $pid)...${NC}"
            kill "$pid"
            sleep 2
            
            # Force kill if still running
            if ps -p "$pid" > /dev/null 2>&1; then
                echo -e "${YELLOW}⚡ Force stopping $service_name...${NC}"
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$pid_file"
            echo -e "${GREEN}✅ $service_name stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  $service_name not running${NC}"
            rm -f "$pid_file"
        fi
    else
        echo -e "${YELLOW}⚠️  No PID file found for $service_name${NC}"
    fi
}

# Stop services
stop_service "celery_worker"
stop_service "celery_beat"
stop_service "celery_flower"

# Also try to kill any remaining celery processes
echo -e "${YELLOW}🔍 Checking for remaining Celery processes...${NC}"
celery_pids=$(pgrep -f "celery.*scheduler.celery_app" 2>/dev/null || true)
if [ -n "$celery_pids" ]; then
    echo -e "${YELLOW}⚡ Killing remaining Celery processes: $celery_pids${NC}"
    echo "$celery_pids" | xargs kill -9 2>/dev/null || true
fi

echo -e "${GREEN}🎉 All Celery services stopped${NC}"
