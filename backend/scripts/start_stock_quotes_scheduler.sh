#!/bin/bash

# Start Stock Quotes Scheduler with Celery
# This script starts the Celery worker and beat scheduler for automatic stock quotes fetching

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
CELERY_APP="scheduler.celery_app"

echo -e "${BLUE}🚀 Starting Tradistry Stock Quotes Scheduler${NC}"
echo "Backend directory: $BACKEND_DIR"
echo "Log directory: $LOG_DIR"

# Create logs directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Change to backend directory
cd "$BACKEND_DIR"

# Check if Redis is accessible using Python environment loading
echo -e "${YELLOW}📡 Checking Redis connection and environment...${NC}"
if python scripts/check_env.py > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Redis connection successful${NC}"
else
    echo -e "${RED}❌ Redis connection failed. Please check your Redis setup and REDIS_URL environment variable.${NC}"
    exit 1
fi

# Function to start Celery worker
start_worker() {
    echo -e "${YELLOW}🔧 Starting Celery worker...${NC}"
    celery -A "$CELERY_APP" worker \
        --loglevel=info \
        --concurrency=4 \
        --queues=market_hours,daily,periodic,default \
        --logfile="$LOG_DIR/celery_worker.log" \
        --pidfile="$LOG_DIR/celery_worker.pid" \
        --detach
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Celery worker started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start Celery worker${NC}"
        exit 1
    fi
}

# Function to start Celery beat scheduler
start_beat() {
    echo -e "${YELLOW}⏰ Starting Celery beat scheduler...${NC}"
    celery -A "$CELERY_APP" beat \
        --loglevel=info \
        --logfile="$LOG_DIR/celery_beat.log" \
        --pidfile="$LOG_DIR/celery_beat.pid" \
        --detach
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Celery beat scheduler started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start Celery beat scheduler${NC}"
        exit 1
    fi
}

# Function to start Flower monitoring (optional)
start_flower() {
    echo -e "${YELLOW}🌸 Starting Flower monitoring...${NC}"
    celery -A "$CELERY_APP" flower \
        --port=5555 \
        --logfile="$LOG_DIR/celery_flower.log" \
        --pidfile="$LOG_DIR/celery_flower.pid" \
        --detach
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Flower monitoring started on http://localhost:5555${NC}"
    else
        echo -e "${YELLOW}⚠️  Flower monitoring failed to start (optional)${NC}"
    fi
}

# Check if services are already running
check_running() {
    if [ -f "$LOG_DIR/celery_worker.pid" ]; then
        WORKER_PID=$(cat "$LOG_DIR/celery_worker.pid" 2>/dev/null)
        if ps -p "$WORKER_PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Celery worker is already running (PID: $WORKER_PID)${NC}"
            return 1
        fi
    fi
    
    if [ -f "$LOG_DIR/celery_beat.pid" ]; then
        BEAT_PID=$(cat "$LOG_DIR/celery_beat.pid" 2>/dev/null)
        if ps -p "$BEAT_PID" > /dev/null 2>&1; then
            echo -e "${YELLOW}⚠️  Celery beat is already running (PID: $BEAT_PID)${NC}"
            return 1
        fi
    fi
    
    return 0
}

# Main execution
main() {
    # Check if already running
    if ! check_running; then
        echo -e "${BLUE}ℹ️  Use './scripts/stop_celery.sh' to stop existing services first${NC}"
        exit 1
    fi
    
    # Start services
    start_worker
    sleep 2
    start_beat
    sleep 2
    start_flower
    
    echo ""
    echo -e "${GREEN}🎉 Stock Quotes Scheduler started successfully!${NC}"
    echo ""
    echo -e "${BLUE}📊 Monitoring:${NC}"
    echo "  • Flower UI: http://localhost:5555"
    echo "  • Worker logs: $LOG_DIR/celery_worker.log"
    echo "  • Beat logs: $LOG_DIR/celery_beat.log"
    echo ""
    echo -e "${BLUE}📅 Schedule:${NC}"
    echo "  • Stock quotes: Every 5 minutes"
    echo "  • Options chain: Every 15 minutes"
    echo "  • Historical data: Daily at 5:30 PM EST"
    echo "  • Fundamental data: Daily at 6:00 PM EST"
    echo ""
    echo -e "${BLUE}🔧 Management:${NC}"
    echo "  • Stop services: ./scripts/stop_celery.sh"
    echo "  • Check status: python scripts/celery_management.py inspect"
    echo "  • Manual trigger: python scripts/celery_management.py trigger stock_quotes"
    echo ""
}

# Handle command line arguments
case "${1:-start}" in
    "start")
        main
        ;;
    "worker-only")
        check_running
        start_worker
        echo -e "${GREEN}✅ Worker started (beat scheduler not started)${NC}"
        ;;
    "beat-only")
        check_running
        start_beat
        echo -e "${GREEN}✅ Beat scheduler started (worker not started)${NC}"
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [start|worker-only|beat-only|help]"
        echo ""
        echo "Commands:"
        echo "  start       Start both worker and beat scheduler (default)"
        echo "  worker-only Start only the Celery worker"
        echo "  beat-only   Start only the beat scheduler"
        echo "  help        Show this help message"
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac
