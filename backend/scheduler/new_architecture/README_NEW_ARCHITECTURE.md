# New Scheduler Architecture

## Overview

The scheduler system has been completely redesigned with a new architecture that separates data fetching from data processing. This provides better reliability, scalability, and maintainability.

## Architecture Components

### 1. CronDataScheduler
- **Purpose**: Fetches data directly from `market_data` module at specified intervals
- **Location**: `scheduler/cron_scheduler.py`
- **Responsibilities**:
  - Runs cron jobs based on configuration
  - Fetches raw data from market data providers
  - Sends data to processors for transformation and storage

### 2. DataProcessor
- **Purpose**: Transforms and stores data received from cron jobs
- **Location**: `scheduler/jobs/data_processor.py`
- **Responsibilities**:
  - Processes raw data from market_data providers
  - Transforms data to match database schema
  - Stores data using database upsert functions

### 3. MainSchedulerService
- **Purpose**: Coordinates the entire scheduler system
- **Location**: `scheduler/main_scheduler.py`
- **Responsibilities**:
  - Manages CronDataScheduler and DataProcessor
  - Provides system status and health checks
  - Handles service lifecycle (start/stop)

### 4. SchedulerFactory
- **Purpose**: Factory for creating and managing scheduler components
- **Location**: `scheduler/scheduler_factory.py`
- **Responsibilities**:
  - Creates MainSchedulerService instances
  - Provides convenience methods for system management

## Data Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  CronScheduler  │───▶│  market_data     │───▶│  DataProcessor  │
│  (Fetch Timer)  │    │  (Data Sources)  │    │  (Transform)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │    Database     │
                                               │   (Storage)     │
                                               └─────────────────┘
```

## Usage Examples

### Basic Usage

```python
from scheduler.scheduler_factory import create_and_start_scheduler_system

# Create and start the complete scheduler system
scheduler = await create_and_start_scheduler_system()

# The system will now run automatically based on configuration
# Check status
status = scheduler.get_system_status()
print(f"Scheduler running: {status['main_service_running']}")
```

### Using Factory Pattern

```python
from scheduler.scheduler_factory import SchedulerFactory
from market_data.config import MarketDataConfig

# Create custom configuration
config = MarketDataConfig.from_env()

# Use factory with context manager
async with SchedulerFactory(config) as factory:
    # Start the scheduler
    scheduler = await factory.start_scheduler()
    
    # Manually trigger a job for testing
    success = await factory.trigger_job_manually("stock_quotes")
    
    # Get health check
    health = await factory.health_check()
    print(f"System health: {health['status']}")
    
    # Factory will automatically clean up on exit
```

### Manual Job Triggering

```python
from scheduler.main_scheduler import MainSchedulerService

scheduler = MainSchedulerService()
await scheduler.start()

# Trigger specific jobs manually
await scheduler.trigger_job_manually("company_info")
await scheduler.trigger_job_manually("stock_quotes")
await scheduler.trigger_job_manually("earnings_calendar")

await scheduler.stop()
```

### Health Monitoring

```python
# Get comprehensive system status
status = await scheduler.health_check()

if status["status"] == "healthy":
    print("✅ All systems operational")
elif status["status"] == "degraded":
    print("⚠️ System running with issues:")
    for issue in status["issues"]:
        print(f"  - {issue}")
else:
    print("❌ System unhealthy:")
    for issue in status["issues"]:
        print(f"  - {issue}")
```

## Configuration

### Job Schedules

Jobs are configured in `scheduler/config.py`:

```python
JOBS: Dict[str, JobConfig] = {
    "stock_quotes": JobConfig(
        name="Stock Quotes",
        interval_seconds=60,  # Every minute
        market_hours_only=True,
        description="Real-time stock price quotes"
    ),
    
    "company_info": JobConfig(
        name="Company Information",
        interval_seconds=604800,  # Weekly
        market_hours_only=False,
        description="Company profile and basic information"
    ),
    
    # ... more jobs
}
```

### Market Data Providers

Configure providers in environment variables or `MarketDataConfig`:

```python
from market_data.config import MarketDataConfig

config = MarketDataConfig(
    alpha_vantage=ProviderConfig(
        enabled=True,
        api_key="your_api_key",
        priority=1
    ),
    finnhub=ProviderConfig(
        enabled=True,
        api_key="your_api_key",
        priority=2
    )
)
```

## Job Types and Schedules

| Job Type | Interval | Market Hours Only | Description |
|----------|----------|-------------------|-------------|
| stock_quotes | 1 minute | Yes | Real-time stock prices |
| options_chain | 5 minutes | Yes | Options chain data |
| historical_prices | Daily | No | End-of-day historical data |
| company_info | Weekly | No | Company profiles |
| earnings_data | 6 hours | No | Quarterly earnings |
| news_data | 30 minutes | No | Financial news |
| economic_events | 12 hours | No | Economic calendar |

## Monitoring and Debugging

### System Status

```python
# Get detailed system status
status = scheduler.get_system_status()

print(f"Main service: {status['main_service_running']}")
print(f"Cron scheduler: {status['cron_scheduler_running']}")
print(f"Enabled providers: {status['available_providers']}")

# Check individual jobs
for job in status['scheduled_jobs']:
    print(f"Job: {job['name']} - Next run: {job['next_run_time']}")
```

### Logs

The system uses structured logging. Key log messages:

- `✅ Main scheduler service started successfully`
- `📊 System Status: Enabled providers: 3 (alpha_vantage, finnhub, polygon)`
- `Starting cron job: stock_quotes`
- `Processed 150 stock quotes`

### Error Handling

The system includes comprehensive error handling:

- Provider fallback when one fails
- Graceful degradation with partial data
- Automatic retry for failed operations
- Detailed error logging with context

## Migration from Old Architecture

### Key Changes

1. **Data Fetching**: Moved from individual job classes to centralized CronDataScheduler
2. **Data Processing**: Separated into dedicated DataProcessor
3. **Job Classes**: Now handle only data transformation and storage
4. **Coordination**: MainSchedulerService manages the entire system

### Migration Steps

1. Update imports to use new factory pattern
2. Replace direct job instantiation with MainSchedulerService
3. Update any custom job classes to use new base class methods
4. Test the new system with existing data

### Backward Compatibility

The new system maintains compatibility with existing:
- Database schema and upsert functions
- Configuration format
- Environment variables
- Logging patterns

## Troubleshooting

### Common Issues

1. **No providers enabled**
   - Check environment variables for API keys
   - Verify provider configuration in MarketDataConfig

2. **Jobs not running**
   - Check if MainSchedulerService is started
   - Verify job configuration in SchedulerConfig

3. **Database connection errors**
   - Check database credentials and connectivity
   - Verify database service is running

4. **Rate limiting**
   - System automatically handles provider rate limits
   - Check logs for rate limit warnings

### Debug Mode

Enable debug logging for detailed information:

```python
import logging
logging.getLogger('scheduler').setLevel(logging.DEBUG)
logging.getLogger('market_data').setLevel(logging.DEBUG)
```

## Performance Considerations

### Scalability

- Cron jobs run independently and can be scaled horizontally
- Data processing is batched for efficiency
- Provider fallback reduces single points of failure

### Resource Usage

- Memory: ~50-100MB for typical operation
- CPU: Low, mostly I/O bound operations
- Network: Depends on provider API limits

### Optimization Tips

1. Adjust job intervals based on data freshness needs
2. Use market hours scheduling for real-time data
3. Monitor provider rate limits and adjust accordingly
4. Batch database operations for better performance

## Future Enhancements

Planned improvements:

1. **Distributed Processing**: Support for multiple worker nodes
2. **Advanced Retry Logic**: Exponential backoff and circuit breakers
3. **Real-time Streaming**: WebSocket support for live data
4. **Machine Learning Integration**: Predictive data fetching
5. **Enhanced Monitoring**: Metrics dashboard and alerting
