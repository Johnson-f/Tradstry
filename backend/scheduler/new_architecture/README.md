# New Scheduler Architecture

## Overview

This folder contains the redesigned scheduler system that separates data fetching from data processing for better modularity and reliability.

## Folder Structure

```
new_architecture/
├── core/                    # Core scheduler services
│   ├── cron_scheduler.py   # Cron-based data fetching scheduler
│   ├── main_scheduler.py   # Main service coordinator
│   └── scheduler_factory.py # Factory for creating scheduler instances
├── jobs/                   # Data processing jobs
│   ├── base_job.py        # Base class for processing jobs
│   ├── data_processor.py  # Central data processor
│   └── company_info_job.py # Example job implementation
├── example_usage.py       # Usage examples
└── README_NEW_ARCHITECTURE.md # Detailed documentation
```

## Quick Start

```python
from scheduler.new_architecture import create_and_start_scheduler_system

# Start the complete system
scheduler = await create_and_start_scheduler_system()
```

## Key Components

1. **CronDataScheduler**: Fetches data from market_data at intervals
2. **DataProcessor**: Transforms and stores data in database
3. **MainSchedulerService**: Coordinates the entire system

## Migration

To use the new architecture, update your imports:

```python
# Old
from scheduler.scheduler_factory import SchedulerFactory

# New
from scheduler.new_architecture import SchedulerFactory
```

See `README_NEW_ARCHITECTURE.md` for complete documentation.
