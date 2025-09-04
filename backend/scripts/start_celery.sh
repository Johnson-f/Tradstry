#!/bin/bash
# Celery startup script for Tradistry scheduler

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Tradistry Celery Services${NC}"

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo -e "${YELLOW}📋 Loading environment variables from .env file...${NC}"
    set -a  # automatically export all variables
    source .env
    set +a  # stop automatically exporting
else
    echo -e "${YELLOW}⚠️  No .env file found, using system environment variables${NC}"
fi

# Default values after loading .env
CONCURRENCY=${CELERY_WORKER_CONCURRENCY:-2}
LOG_LEVEL=${CELERY_LOG_LEVEL:-"info"}
NUM_WORKERS=${CELERY_NUM_WORKERS:-2}

# Check if Redis Cloud connection is configured
echo -e "${YELLOW}📡 Checking Redis Cloud connection...${NC}"
echo -e "${YELLOW}Current REDIS_URL: ${REDIS_URL:0:50}...${NC}"

if [ -z "$REDIS_URL" ] || [ "$REDIS_URL" = "redis://localhost:6379/0" ]; then
    echo -e "${RED}❌ Redis Cloud URL not configured${NC}"
    echo -e "${YELLOW}💡 Set REDIS_URL in your .env file with your Redis Cloud connection string${NC}"
    echo -e "${YELLOW}💡 Format: redis://default:password@endpoint.redis.cloud:port${NC}"
    exit 1
fi

# Test Redis Cloud connection (optional - requires redis-py)
python3 -c "
import os
import sys
try:
    import redis
    r = redis.from_url(os.getenv('REDIS_URL'))
    r.ping()
    print('✅ Redis Cloud connection successful')
except ImportError:
    print('⚠️  redis-py not available for connection test, proceeding anyway')
except Exception as e:
    print(f'❌ Redis Cloud connection failed: {e}')
    sys.exit(1)
" 2>/dev/null || echo -e "${YELLOW}⚠️  Skipping Redis connection test${NC}"

# Function to start service in background
start_service() {
    local service_name=$1
    local command=$2
    local log_file="logs/celery_${service_name}.log"
    
    mkdir -p logs
    
    echo -e "${YELLOW}🔄 Starting $service_name...${NC}"
    nohup $command > $log_file 2>&1 &
    local pid=$!
    echo $pid > "logs/celery_${service_name}.pid"
    echo -e "${GREEN}✅ $service_name started (PID: $pid)${NC}"
    echo -e "${YELLOW}📋 Logs: tail -f $log_file${NC}"
}

# Start multiple Celery Workers
echo -e "${YELLOW}🔄 Starting $NUM_WORKERS workers...${NC}"
for i in $(seq 1 $NUM_WORKERS); do
    worker_name="worker_$i"
    start_service "$worker_name" "celery -A scheduler.celery_app worker --loglevel=$LOG_LEVEL --concurrency=$CONCURRENCY --hostname=$worker_name@%h"
    sleep 1  # Small delay to avoid startup conflicts
done

# Start Celery Beat
start_service "beat" "celery -A scheduler.celery_app beat --loglevel=$LOG_LEVEL"

# Start Flower (optional)
if [ "$START_FLOWER" = "true" ]; then
    start_service "flower" "celery -A scheduler.celery_app flower --port=5555"
    echo -e "${GREEN}🌸 Flower UI available at: http://localhost:5555${NC}"
fi

echo -e "${GREEN}🎉 All Celery services started successfully!${NC}"
echo -e "${YELLOW}📊 Monitor with: python scripts/celery_management.py inspect${NC}"
echo -e "${YELLOW}🔍 Health check: python scripts/celery_management.py health${NC}"
echo -e "${YELLOW}🛑 Stop services: ./scripts/stop_celery.sh${NC}"
