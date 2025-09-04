#!/bin/bash
# Stop Celery services for Tradistry scheduler

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping Tradistry Celery Services${NC}"

# Function to stop service by PID file
stop_service() {
    local service_name=$1
    local pid_file="logs/celery_${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}🔄 Stopping $service_name (PID: $pid)...${NC}"
            kill "$pid"
            sleep 2
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${YELLOW}⚡ Force killing $service_name...${NC}"
                kill -9 "$pid"
            fi
            
            echo -e "${GREEN}✅ $service_name stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  $service_name was not running${NC}"
        fi
        rm -f "$pid_file"
    else
        echo -e "${YELLOW}⚠️  No PID file found for $service_name${NC}"
    fi
}

# Load environment variables to get NUM_WORKERS
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

NUM_WORKERS=${CELERY_NUM_WORKERS:-2}

# Stop multiple workers
echo -e "${YELLOW}🔄 Stopping $NUM_WORKERS workers...${NC}"
for i in $(seq 1 $NUM_WORKERS); do
    stop_service "worker_$i"
done

# Stop other services
stop_service "beat"
stop_service "flower"

# Clean up any remaining Celery processes
echo -e "${YELLOW}🧹 Cleaning up remaining processes...${NC}"
pkill -f "celery.*scheduler.celery_app" || true

echo -e "${GREEN}🎉 All Celery services stopped successfully!${NC}"
