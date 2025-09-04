# Celery & Redis Integration for Market Data Scheduler

This document describes the Celery & Redis setup for distributed task processing and cron job scheduling in the Tradistry market data scheduler.

## Overview

The scheduler now supports both APScheduler (for simple scheduling) and Celery + Redis (for distributed, scalable task processing) with the following benefits:

- **Distributed Processing**: Tasks can run across multiple workers
- **Reliability**: Redis provides persistent task queues and result storage
- **Scalability**: Easy horizontal scaling of workers
- **Monitoring**: Built-in monitoring with Flower
- **Queue Management**: Separate queues for different task types

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   FastAPI App   │    │   Celery Beat   │    │ Celery Workers  │
│                 │    │   (Scheduler)   │    │                 │
│ ┌─────────────┐ │    │                 │    │ ┌─────────────┐ │
│ │   Celery    │ │    │ ┌─────────────┐ │    │ │    Queue    │ │
│ │   Router    │◄┼────┼►│   Cron Jobs │ │    │ │  Consumers  │ │
│ │             │ │    │ │             │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │      Redis      │
                    │                 │
                    │ ┌─────────────┐ │
                    │ │   Broker    │ │
                    │ │   Queues    │ │
                    │ │   Results   │ │
                    │ └─────────────┘ │
                    └─────────────────┘
```

## Queue Structure

| Queue | Purpose | Jobs |
|-------|---------|------|
| `market_hours` | Real-time data during market hours | stock_quotes, options_chain |
| `daily` | End-of-day processing | historical_prices, fundamentals, dividends |
| `periodic` | Regular updates | news, earnings, economic data |
| `default` | Manual triggers and misc tasks | health_check, manual jobs |

## Installation & Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Start Redis

**Option A: Local Redis**
```bash
redis-server
```

**Option B: Docker**
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**Option C: Docker Compose**
```bash
docker-compose -f docker-compose.celery.yml up -d
```

### 3. Configure Environment

Copy and update the environment file:
```bash
cp .env.example .env
```

Update Redis connection settings in `.env`:
```env
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

### 4. Start Celery Services

**Option A: Using Scripts**
```bash
# Start all services
./scripts/start_celery.sh

# Stop all services
./scripts/stop_celery.sh
```

**Option B: Manual Start**
```bash
# Start worker
celery -A scheduler.celery_app worker --loglevel=info --concurrency=4

# Start beat scheduler (in another terminal)
celery -A scheduler.celery_app beat --loglevel=info

# Start Flower monitoring (optional)
celery -A scheduler.celery_app flower --port=5555
```

## Usage

### Management Commands

```bash
# Check system health
python scripts/celery_management.py health

# Inspect workers
python scripts/celery_management.py inspect

# Trigger a job manually
python scripts/celery_management.py trigger stock_quotes

# Start services
python scripts/celery_management.py worker --concurrency=4
python scripts/celery_management.py beat
python scripts/celery_management.py flower --port=5555
```

### API Endpoints

The Celery integration adds new REST endpoints:

```bash
# Get Celery system status
GET /api/scheduler/celery/status

# Get worker information
GET /api/scheduler/celery/workers

# Get scheduled tasks
GET /api/scheduler/celery/tasks/scheduled

# Trigger a job
POST /api/scheduler/celery/tasks/trigger
{
  "job_name": "stock_quotes"
}

# Get task status
GET /api/scheduler/celery/tasks/{task_id}/status

# Health check
GET /api/scheduler/celery/health

# Get available jobs
GET /api/scheduler/celery/jobs/available
```

### Monitoring

**Flower Web UI**: http://localhost:5555
- Real-time worker monitoring
- Task history and results
- Queue lengths and statistics
- Worker management

**Redis CLI Monitoring**:
```bash
# Connect to Redis
redis-cli

# Monitor commands
MONITOR

# Check queue lengths
LLEN celery
LLEN market_hours
LLEN daily
LLEN periodic
```

## Cron Schedule

| Job | Schedule | Queue | Market Hours Only |
|-----|----------|-------|-------------------|
| Stock Quotes | Every minute | market_hours | Yes |
| Options Chain | Every 5 minutes | market_hours | Yes |
| Historical Prices | Daily at 5:30 PM EST | daily | No |
| Fundamental Data | Daily at 6:00 PM EST | daily | No |
| Dividend Data | Daily at 7:00 PM EST | daily | No |
| Earnings Transcripts | Daily at 8:00 PM EST | daily | No |
| Economic Indicators | Daily at 9:00 PM EST | daily | No |
| Earnings Data | Every 6 hours | periodic | No |
| Earnings Calendar | Every 12 hours | periodic | No |
| News Data | Every 30 minutes | periodic | No |
| Economic Events | Every 12 hours | periodic | No |
| Company Info | Weekly on Sunday 10 PM | periodic | No |

## Scaling

### Horizontal Scaling

```bash
# Start multiple workers
celery -A scheduler.celery_app worker --concurrency=4 --hostname=worker1@%h
celery -A scheduler.celery_app worker --concurrency=4 --hostname=worker2@%h

# Queue-specific workers
celery -A scheduler.celery_app worker --queues=market_hours --concurrency=2
celery -A scheduler.celery_app worker --queues=daily,periodic --concurrency=4
```

### Vertical Scaling

```bash
# Increase worker concurrency
celery -A scheduler.celery_app worker --concurrency=8

# Optimize for I/O bound tasks
celery -A scheduler.celery_app worker --pool=gevent --concurrency=100
```

## Troubleshooting

### Common Issues

**Redis Connection Failed**
```bash
# Check Redis status
redis-cli ping

# Check Redis logs
docker logs redis  # if using Docker
```

**No Workers Available**
```bash
# Check worker status
python scripts/celery_management.py inspect

# Restart workers
./scripts/stop_celery.sh
./scripts/start_celery.sh
```

**Tasks Not Executing**
```bash
# Check queue lengths
python scripts/celery_management.py inspect

# Purge queues if needed
celery -A scheduler.celery_app purge
```

### Logs

```bash
# Worker logs
tail -f logs/celery_worker.log

# Beat logs
tail -f logs/celery_beat.log

# Flower logs
tail -f logs/celery_flower.log
```

## Migration from APScheduler

The system maintains backward compatibility with existing APScheduler endpoints. To migrate:

1. **Keep APScheduler running** during transition
2. **Start Celery services** alongside APScheduler
3. **Test Celery endpoints** to ensure functionality
4. **Gradually shift traffic** to Celery endpoints
5. **Disable APScheduler** once confident in Celery setup

Legacy endpoints automatically redirect to Celery equivalents where possible.

## Performance Tuning

### Redis Configuration

```redis
# /etc/redis/redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

### Celery Configuration

```python
# Optimize for your workload
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # For long-running tasks
CELERY_WORKER_MAX_TASKS_PER_CHILD = 1000  # Prevent memory leaks
CELERY_TASK_ACKS_LATE = True  # Ensure task completion
```

## Security

### Redis Security

```bash
# Set Redis password
redis-cli CONFIG SET requirepass "your_secure_password"

# Update connection string
REDIS_URL=redis://:your_secure_password@localhost:6379/0
```

### Network Security

- Use Redis AUTH for authentication
- Configure firewall rules for Redis port (6379)
- Use SSL/TLS for Redis connections in production
- Restrict Redis bind address to localhost in development

## Production Deployment

### Docker Deployment

```bash
# Build and start all services
docker-compose -f docker-compose.celery.yml up -d

# Scale workers
docker-compose -f docker-compose.celery.yml up -d --scale celery_worker=3
```

### Systemd Services

Create systemd service files for production deployment:

```ini
# /etc/systemd/system/celery-worker.service
[Unit]
Description=Celery Worker Service
After=network.target redis.service

[Service]
Type=forking
User=celery
Group=celery
WorkingDirectory=/opt/tradistry/backend
ExecStart=/opt/tradistry/venv/bin/celery -A scheduler.celery_app worker --detach
ExecStop=/opt/tradistry/venv/bin/celery -A scheduler.celery_app control shutdown
ExecReload=/bin/kill -s HUP $MAINPID

[Install]
WantedBy=multi-user.target
```
